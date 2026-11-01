import { createRequire } from 'node:module';
import { PgClient, parseDatabaseUrl, type QueryResult } from './pgwire';
import { env } from '../env';

export interface Queryable { query<T = any>(text: string, params?: any[]): Promise<QueryResult<T>> }

/**
 * Connection pool. Uses the official `pg` driver when DB_DRIVER=pg and it is installed,
 * otherwise the bundled wire client. Both expose query(text, params).
 */
class Pool implements Queryable {
  private idle: PgClient[] = [];
  private all = new Set<any>();
  private waiters: ((c: any) => void)[] = [];
  private pgPool: any = null;

  constructor(private url: string, private max: number) {
    if (env.DB_DRIVER === 'pg') {
      const req = createRequire(import.meta.url);
      const pg = req('pg');
      // Match the bundled client's parsing: bigint/numeric -> number
      pg.types.setTypeParser(20, Number); pg.types.setTypeParser(1700, Number);
      pg.types.setTypeParser(1082, (v: string) => v);
      this.pgPool = new pg.Pool({ connectionString: url, max });
    }
  }

  private async acquire(): Promise<any> {
    if (this.pgPool) return this.pgPool.connect();
    const c = this.idle.pop();
    if (c && !c.closed) return c;
    if (this.all.size < this.max) {
      const client = new PgClient(parseDatabaseUrl(this.url));
      await client.connect();
      this.all.add(client);
      return client;
    }
    return new Promise((res) => this.waiters.push(res));
  }

  private release(c: any, broken = false) {
    if (this.pgPool) return c.release(broken);
    if (broken || c.closed) { this.all.delete(c); c.end?.(); return; }
    const w = this.waiters.shift();
    if (w) w(c); else this.idle.push(c);
  }

  async query<T = any>(text: string, params: any[] = []): Promise<QueryResult<T>> {
    const c = await this.acquire();
    try { return await c.query(text, params); }
    catch (e: any) { if (!e.code) { this.release(c, true); throw e; } throw e; }
    finally { if (!c.closed && (this.pgPool || this.all.has(c))) this.release(c); }
  }

  /** Runs fn inside BEGIN/COMMIT on a single connection; ROLLBACK on any error. */
  async tx<T>(fn: (q: Queryable) => Promise<T>, isolation: 'READ COMMITTED' | 'SERIALIZABLE' = 'READ COMMITTED'): Promise<T> {
    const c = await this.acquire();
    let broken = false;
    try {
      await c.query(`BEGIN ISOLATION LEVEL ${isolation}`);
      const out = await fn({ query: (t: string, p?: any[]) => c.query(t, p) });
      await c.query('COMMIT');
      return out;
    } catch (e: any) {
      try { await c.query('ROLLBACK'); } catch { broken = true; }
      throw e;
    } finally { this.release(c, broken); }
  }

  async end() {
    if (this.pgPool) return this.pgPool.end();
    for (const c of this.all) c.end();
    this.all.clear(); this.idle = [];
  }
}

export const db = new Pool(env.DATABASE_URL, env.DB_POOL_MAX);

export async function one<T = any>(q: Queryable, text: string, params: any[] = []): Promise<T | null> {
  const r = await q.query<T>(text, params);
  return r.rows[0] ?? null;
}
export async function many<T = any>(q: Queryable, text: string, params: any[] = []): Promise<T[]> {
  return (await q.query<T>(text, params)).rows;
}
