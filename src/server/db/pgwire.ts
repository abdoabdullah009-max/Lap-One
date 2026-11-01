/**
 * Minimal PostgreSQL wire-protocol client (protocol v3) with a `pg`-compatible surface:
 *   client.query(text, params) -> { rows, rowCount, command }
 *
 * Why this exists: the build environment this project was created in had no npm registry
 * access. In production you can install `pg` and src/server/db/index.ts will use it
 * automatically (see DB_DRIVER in .env.example). Both paths use parameterized queries
 * only (extended protocol: Parse/Bind/Execute) — values are never interpolated into SQL.
 *
 * Supports: cleartext, MD5 and SCRAM-SHA-256 auth, optional TLS, text-format results with
 * type parsing for the types this app uses.
 */
import net from 'node:net';
import tls from 'node:tls';
import crypto from 'node:crypto';

export interface QueryResult<T = any> { rows: T[]; rowCount: number; command: string }
export interface PgConfig { host: string; port: number; user: string; password: string; database: string; ssl?: boolean }

export class PgError extends Error {
  code?: string; detail?: string; constraint?: string; severity?: string;
  constructor(fields: Record<string, string>) {
    super(fields.M || 'PostgreSQL error');
    this.code = fields.C; this.detail = fields.D; this.constraint = fields.n; this.severity = fields.S;
  }
}

// ---- value (de)serialization -------------------------------------------------------------
function parseArray(s: string, conv: (x: string) => any): any[] {
  if (s === '{}') return [];
  const out: any[] = []; let i = 1; let cur = ''; let quoted = false; let wasQuoted = false;
  while (i < s.length) {
    const ch = s[i];
    if (quoted) {
      if (ch === '\\') { cur += s[i + 1]; i += 2; continue; }
      if (ch === '"') { quoted = false; i++; continue; }
      cur += ch; i++; continue;
    }
    if (ch === '"') { quoted = true; wasQuoted = true; i++; continue; }
    if (ch === ',' || ch === '}') {
      out.push(!wasQuoted && cur === 'NULL' ? null : conv(cur)); cur = ''; wasQuoted = false; i++; continue;
    }
    cur += ch; i++;
  }
  return out;
}
const toNum = (x: string) => Number(x);
function parseValue(oid: number, v: string): any {
  switch (oid) {
    case 16: return v === 't';
    case 20: case 21: case 23: case 26: case 700: case 701: case 1700: return Number(v);
    case 114: case 3802: return JSON.parse(v);
    case 1082: return v; // date as YYYY-MM-DD
    case 1114: return new Date(v.replace(' ', 'T') + 'Z');
    case 1184: return new Date(v.replace(' ', 'T').replace(/([+-]\d\d)$/, '$1:00'));
    case 1000: return parseArray(v, (x) => x === 't');
    case 1005: case 1007: case 1016: case 1231: case 1021: case 1022: return parseArray(v, toNum);
    case 1009: case 1015: return parseArray(v, (x) => x);
    default: return v;
  }
}
function serialize(v: any): string | null {
  if (v === null || v === undefined) return null;
  if (v instanceof Date) return v.toISOString();
  if (typeof v === 'boolean') return v ? 't' : 'f';
  if (Array.isArray(v)) {
    return '{' + v.map((x) => x === null || x === undefined ? 'NULL'
      : '"' + String(x).replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"').join(',') + '}';
  }
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}

// ---- message builders --------------------------------------------------------------------
function msg(type: string, body: Buffer): Buffer {
  const head = Buffer.alloc(5); head.write(type, 0, 'ascii'); head.writeInt32BE(body.length + 4, 1);
  return Buffer.concat([head, body]);
}
const cstr = (s: string) => Buffer.concat([Buffer.from(s, 'utf8'), Buffer.from([0])]);
const i16 = (n: number) => { const b = Buffer.alloc(2); b.writeInt16BE(n); return b; };
const i32 = (n: number) => { const b = Buffer.alloc(4); b.writeInt32BE(n); return b; };

interface Pending {
  resolve: (r: QueryResult) => void; reject: (e: any) => void;
  fields: { name: string; oid: number }[]; rows: any[]; command: string; error?: PgError;
}

export class PgClient {
  private sock!: net.Socket;
  private buf: Buffer = Buffer.alloc(0);
  private queue: { text: string; params: any[]; p: Pending }[] = [];
  private active: Pending | null = null;
  private readyCb: ((e?: any) => void) | null = null;
  private scram: { nonce: string; clientFirstBare: string; serverSig?: Buffer } | null = null;
  closed = false;

  constructor(private cfg: PgConfig) {}

  async connect(): Promise<void> {
    let sock: net.Socket = net.connect({ host: this.cfg.host, port: this.cfg.port });
    await new Promise<void>((res, rej) => { sock.once('connect', () => res()); sock.once('error', rej); });
    if (this.cfg.ssl) {
      sock.write(Buffer.concat([i32(8), i32(80877103)]));
      const answer: Buffer = await new Promise((res) => sock.once('data', (d: Buffer) => res(d)));
      if (answer.toString() !== 'S') throw new Error('Server refused TLS');
      sock = tls.connect({ socket: sock, servername: this.cfg.host });
      await new Promise<void>((res, rej) => { sock.once('secureConnect', () => res()); sock.once('error', rej); });
    }
    this.sock = sock;
    sock.on('data', (d: Buffer) => this.onData(d));
    sock.on('error', (e) => this.fail(e));
    sock.on('close', () => { this.closed = true; this.fail(new Error('Connection closed')); });
    const params = Buffer.concat([cstr('user'), cstr(this.cfg.user), cstr('database'), cstr(this.cfg.database),
      cstr('client_encoding'), cstr('UTF8'), cstr('application_name'), cstr('lapone'), Buffer.from([0])]);
    const body = Buffer.concat([i32(196608), params]);
    await new Promise<void>((resolve, reject) => {
      this.readyCb = (e) => (e ? reject(e) : resolve());
      sock.write(Buffer.concat([i32(body.length + 4), body]));
    });
  }

  private fail(e: any) {
    if (this.readyCb) { const cb = this.readyCb; this.readyCb = null; cb(e); }
    if (this.active) { this.active.reject(e); this.active = null; }
    for (const q of this.queue.splice(0)) q.p.reject(e);
  }

  query<T = any>(text: string, params: any[] = []): Promise<QueryResult<T>> {
    if (this.closed) return Promise.reject(new Error('Connection closed'));
    return new Promise((resolve, reject) => {
      const p: Pending = { resolve, reject, fields: [], rows: [], command: '' };
      this.queue.push({ text, params, p });
      this.pump();
    });
  }

  private pump() {
    if (this.active || this.readyCb || !this.queue.length) return;
    const { text, params, p } = this.queue.shift()!;
    this.active = p;
    const vals = params.map(serialize);
    const bindParts: Buffer[] = [cstr(''), cstr(''), i16(0), i16(vals.length)];
    for (const v of vals) {
      if (v === null) bindParts.push(i32(-1));
      else { const b = Buffer.from(v, 'utf8'); bindParts.push(i32(b.length), b); }
    }
    bindParts.push(i16(0));
    this.sock.write(Buffer.concat([
      msg('P', Buffer.concat([cstr(''), cstr(text), i16(0)])),
      msg('B', Buffer.concat(bindParts)),
      msg('D', Buffer.concat([Buffer.from('P'), cstr('')])),
      msg('E', Buffer.concat([cstr(''), i32(0)])),
      msg('S', Buffer.alloc(0)),
    ]));
  }

  private onData(d: Buffer) {
    this.buf = this.buf.length ? Buffer.concat([this.buf, d]) : d;
    while (this.buf.length >= 5) {
      const len = this.buf.readInt32BE(1);
      if (this.buf.length < len + 1) break;
      const type = String.fromCharCode(this.buf[0]);
      const body = this.buf.subarray(5, len + 1);
      this.buf = this.buf.subarray(len + 1);
      this.handle(type, body);
    }
  }

  private handle(type: string, body: Buffer) {
    switch (type) {
      case 'R': return this.handleAuth(body);
      case 'Z': {
        if (this.readyCb) { const cb = this.readyCb; this.readyCb = null; cb(); }
        else if (this.active) {
          const a = this.active; this.active = null;
          if (a.error) a.reject(a.error);
          else a.resolve({ rows: a.rows, rowCount: a.rows.length || this.rowCountFrom(a.command), command: a.command.split(' ')[0] });
        }
        return this.pump();
      }
      case 'T': {
        if (!this.active) return;
        const n = body.readInt16BE(0); let off = 2; const fields = [];
        for (let i = 0; i < n; i++) {
          const end = body.indexOf(0, off); const name = body.toString('utf8', off, end); off = end + 1;
          const oid = body.readInt32BE(off + 6); off += 18; fields.push({ name, oid });
        }
        this.active.fields = fields; return;
      }
      case 'D': {
        if (!this.active) return;
        const n = body.readInt16BE(0); let off = 2; const row: any = {};
        for (let i = 0; i < n; i++) {
          const l = body.readInt32BE(off); off += 4; const f = this.active.fields[i];
          if (l === -1) row[f.name] = null;
          else { row[f.name] = parseValue(f.oid, body.toString('utf8', off, off + l)); off += l; }
        }
        this.active.rows.push(row); return;
      }
      case 'C': if (this.active) this.active.command = body.toString('utf8', 0, body.length - 1); return;
      case 'E': {
        const fields: Record<string, string> = {}; let off = 0;
        while (off < body.length && body[off] !== 0) {
          const code = String.fromCharCode(body[off]); const end = body.indexOf(0, off + 1);
          fields[code] = body.toString('utf8', off + 1, end); off = end + 1;
        }
        const err = new PgError(fields);
        if (this.readyCb) { const cb = this.readyCb; this.readyCb = null; cb(err); }
        else if (this.active) this.active.error = err;
        return;
      }
      default: return; // S, K, N, 1, 2, n, s, t, I
    }
  }

  private rowCountFrom(cmd: string) { const m = cmd.match(/(\d+)$/); return m ? Number(m[1]) : 0; }

  private handleAuth(body: Buffer) {
    const code = body.readInt32BE(0);
    const { user, password } = this.cfg;
    if (code === 0) return; // AuthenticationOk
    if (code === 3) { this.sock.write(msg('p', cstr(password))); return; }
    if (code === 5) {
      const salt = body.subarray(4, 8);
      const inner = crypto.createHash('md5').update(password + user).digest('hex');
      const outer = crypto.createHash('md5').update(Buffer.concat([Buffer.from(inner), salt])).digest('hex');
      this.sock.write(msg('p', cstr('md5' + outer))); return;
    }
    if (code === 10) {
      const nonce = crypto.randomBytes(18).toString('base64');
      const clientFirstBare = `n=*,r=${nonce}`;
      this.scram = { nonce, clientFirstBare };
      const data = Buffer.from('n,,' + clientFirstBare);
      this.sock.write(msg('p', Buffer.concat([cstr('SCRAM-SHA-256'), i32(data.length), data]))); return;
    }
    if (code === 11 && this.scram) {
      const serverFirst = body.subarray(4).toString();
      const attrs = Object.fromEntries(serverFirst.split(',').map((kv) => [kv[0], kv.slice(2)]));
      if (!attrs.r.startsWith(this.scram.nonce)) return this.fail(new Error('SCRAM nonce mismatch'));
      const salted = crypto.pbkdf2Sync(password, Buffer.from(attrs.s, 'base64'), Number(attrs.i), 32, 'sha256');
      const clientKey = crypto.createHmac('sha256', salted).update('Client Key').digest();
      const storedKey = crypto.createHash('sha256').update(clientKey).digest();
      const finalNoProof = `c=biws,r=${attrs.r}`;
      const authMessage = `${this.scram.clientFirstBare},${serverFirst},${finalNoProof}`;
      const clientSig = crypto.createHmac('sha256', storedKey).update(authMessage).digest();
      const proof = Buffer.from(clientKey.map((b, i) => b ^ clientSig[i]));
      const serverKey = crypto.createHmac('sha256', salted).update('Server Key').digest();
      this.scram.serverSig = crypto.createHmac('sha256', serverKey).update(authMessage).digest();
      this.sock.write(msg('p', Buffer.from(`${finalNoProof},p=${proof.toString('base64')}`))); return;
    }
    if (code === 12 && this.scram) {
      const v = body.subarray(4).toString().split(',').find((x) => x.startsWith('v='))?.slice(2);
      if (!v || !this.scram.serverSig || !crypto.timingSafeEqual(Buffer.from(v, 'base64'), this.scram.serverSig)) {
        this.fail(new Error('SCRAM server signature mismatch'));
      }
      return;
    }
    this.fail(new Error(`Unsupported auth method ${code}`));
  }

  end() { this.closed = true; try { this.sock.write(msg('X', Buffer.alloc(0))); this.sock.end(); } catch { /* ignore */ } }
}

export function parseDatabaseUrl(url: string): PgConfig {
  const u = new URL(url);
  return {
    host: u.hostname, port: Number(u.port || 5432), user: decodeURIComponent(u.username),
    password: decodeURIComponent(u.password), database: u.pathname.slice(1),
    ssl: ['require', 'verify-full', 'verify-ca'].includes(u.searchParams.get('sslmode') || ''),
  };
}
