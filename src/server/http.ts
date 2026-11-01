import type { IncomingMessage, ServerResponse } from 'node:http';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { renderToStaticMarkup } from 'react-dom/server';
import type { ReactElement } from 'react';
import { env, isProd } from './env';
import { brand, type Locale } from '../config/brand';
import { translator, type T } from './i18n';
import type { Settings } from './services/settings';
import type { AdminUser } from './auth';

export interface Ctx {
  req: IncomingMessage; res: ServerResponse; url: URL; method: string; path: string; params: Record<string, string>;
  locale: Locale; t: T; cookies: Record<string, string>; visitorId: string; ip: string; nonce: string;
  settings: Settings; user: AdminUser | null; body: Record<string, any>; files: UploadedFile[];
  setCookies: string[]; assetVersion: string;
}
export interface UploadedFile { field: string; filename: string; mime: string; data: Buffer }

export class HttpError extends Error { constructor(public status: number, message: string, public publicMessage?: string) { super(message); } }

// ---- cookies -----------------------------------------------------------------------------
export function parseCookies(header?: string): Record<string, string> {
  const out: Record<string, string> = {};
  if (!header) return out;
  for (const part of header.split(';')) {
    const i = part.indexOf('='); if (i < 0) continue;
    const k = part.slice(0, i).trim(); const v = part.slice(i + 1).trim();
    try { out[k] = decodeURIComponent(v); } catch { out[k] = v; }
  }
  return out;
}
export function setCookie(ctx: Ctx, name: string, value: string, opts: { maxAge?: number; httpOnly?: boolean; path?: string } = {}) {
  const parts = [`${name}=${encodeURIComponent(value)}`, `Path=${opts.path || '/'}`, 'SameSite=Lax'];
  if (opts.maxAge !== undefined) parts.push(`Max-Age=${opts.maxAge}`);
  if (opts.httpOnly !== false) parts.push('HttpOnly');
  if (isProd) parts.push('Secure');
  ctx.setCookies.push(parts.join('; '));
}

// ---- body parsing --------------------------------------------------------------------------
const MAX_BODY = 1024 * 1024;
export async function readBody(req: IncomingMessage, limit = MAX_BODY): Promise<Buffer> {
  const chunks: Buffer[] = []; let size = 0;
  for await (const c of req) {
    size += (c as Buffer).length;
    if (size > limit) throw new HttpError(413, 'Payload too large');
    chunks.push(c as Buffer);
  }
  return Buffer.concat(chunks);
}

function addField(obj: Record<string, any>, k: string, v: string) {
  if (k.endsWith('[]')) { const key = k.slice(0, -2); (obj[key] ||= []).push(v); }
  else if (k in obj) obj[k] = Array.isArray(obj[k]) ? [...obj[k], v] : [obj[k], v];
  else obj[k] = v;
}

export async function parseBody(ctx: Ctx) {
  const type = ctx.req.headers['content-type'] || '';
  if (ctx.method === 'GET' || ctx.method === 'HEAD') return;
  if (type.startsWith('multipart/form-data')) {
    const boundary = type.match(/boundary=(?:"([^"]+)"|([^;]+))/)?.slice(1).find(Boolean);
    if (!boundary) throw new HttpError(400, 'Bad multipart');
    const buf = await readBody(ctx.req, env.MAX_UPLOAD_MB * 1024 * 1024 * 6);
    const delim = Buffer.from(`--${boundary}`);
    let pos = buf.indexOf(delim);
    while (pos !== -1) {
      const start = pos + delim.length;
      if (buf.slice(start, start + 2).toString() === '--') break;
      const next = buf.indexOf(delim, start);
      if (next === -1) break;
      const part = buf.subarray(start + 2, next - 2); // strip CRLFs
      const headerEnd = part.indexOf('\r\n\r\n');
      const headers = part.subarray(0, headerEnd).toString('utf8');
      const data = part.subarray(headerEnd + 4);
      const name = headers.match(/name="([^"]*)"/)?.[1] || '';
      const filename = headers.match(/filename="([^"]*)"/)?.[1];
      if (filename !== undefined) {
        if (filename && data.length) {
          if (data.length > env.MAX_UPLOAD_MB * 1024 * 1024) throw new HttpError(413, 'File too large');
          ctx.files.push({ field: name, filename: path.basename(filename), mime: headers.match(/Content-Type:\s*(\S+)/i)?.[1] || '', data: Buffer.from(data) });
        }
      } else addField(ctx.body, name, data.toString('utf8'));
      pos = next;
    }
    return;
  }
  const raw = (await readBody(ctx.req)).toString('utf8');
  if (type.startsWith('application/json')) {
    try { ctx.body = raw ? JSON.parse(raw) : {}; } catch { throw new HttpError(400, 'Invalid JSON'); }
  } else {
    for (const [k, v] of new URLSearchParams(raw)) addField(ctx.body, k, v);
  }
}

// ---- responses -----------------------------------------------------------------------------
function baseHeaders(ctx: Ctx, extra: Record<string, string> = {}) {
  const h: Record<string, string | string[]> = { ...extra };
  if (ctx.setCookies.length) h['Set-Cookie'] = ctx.setCookies;
  return h;
}

export function sendHtml(ctx: Ctx, body: ReactElement | string, status = 200, extraHeaders: Record<string, string> = {}) {
  const html = typeof body === 'string' ? body : '<!DOCTYPE html>' + renderToStaticMarkup(body);
  ctx.res.writeHead(status, baseHeaders(ctx, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', ...extraHeaders }));
  ctx.res.end(ctx.method === 'HEAD' ? undefined : html);
}
export function sendJson(ctx: Ctx, data: unknown, status = 200) {
  ctx.res.writeHead(status, baseHeaders(ctx, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }));
  ctx.res.end(JSON.stringify(data));
}
export function sendText(ctx: Ctx, text: string, type = 'text/plain; charset=utf-8', status = 200, extra: Record<string, string> = {}) {
  ctx.res.writeHead(status, baseHeaders(ctx, { 'Content-Type': type, ...extra }));
  ctx.res.end(text);
}
export function redirect(ctx: Ctx, location: string, status = 303) {
  // Only allow same-site relative redirects
  const safe = location.startsWith('/') && !location.startsWith('//') ? location : '/';
  ctx.res.writeHead(status, baseHeaders(ctx, { Location: safe }));
  ctx.res.end();
}
export const wantsJson = (ctx: Ctx) => (ctx.req.headers.accept || '').includes('application/json') || ctx.req.headers['x-requested-with'] === 'fetch';

// ---- static files --------------------------------------------------------------------------
const MIME: Record<string, string> = {
  '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png',
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.avif': 'image/avif', '.ico': 'image/x-icon',
  '.json': 'application/json', '.woff2': 'font/woff2', '.map': 'application/json', '.txt': 'text/plain', '.webmanifest': 'application/manifest+json',
};
export function serveStatic(ctx: Ctx, root: string, rel: string, immutable = false): boolean {
  const file = path.resolve(root, '.' + path.posix.normalize('/' + rel));
  if (!file.startsWith(path.resolve(root) + path.sep)) return false;
  let st: fs.Stats; try { st = fs.statSync(file); } catch { return false; }
  if (!st.isFile()) return false;
  const etag = `"${st.size.toString(16)}-${st.mtimeMs.toString(16)}"`;
  if (ctx.req.headers['if-none-match'] === etag) { ctx.res.writeHead(304); ctx.res.end(); return true; }
  const ext = path.extname(file).toLowerCase();
  ctx.res.writeHead(200, {
    'Content-Type': MIME[ext] || 'application/octet-stream', 'Content-Length': st.size, ETag: etag,
    'Cache-Control': immutable ? 'public, max-age=31536000, immutable' : 'public, max-age=3600',
    'X-Content-Type-Options': 'nosniff',
    ...(ext === '.svg' ? { 'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'" } : {}),
  });
  if (ctx.method === 'HEAD') { ctx.res.end(); return true; }
  fs.createReadStream(file).pipe(ctx.res);
  return true;
}

// ---- security --------------------------------------------------------------------------------
export function securityHeaders(ctx: Ctx) {
  const a = ctx.settings.analytics;
  const consent = ctx.cookies.lo_consent === 'yes' || !a.require_consent;
  const extScripts = consent ? [a.gtm_id || a.ga4_id ? 'https://www.googletagmanager.com https://www.google-analytics.com' : '', a.meta_pixel_id ? 'https://connect.facebook.net' : ''].filter(Boolean).join(' ') : '';
  const csp = [
    "default-src 'self'",
    `script-src 'self' 'nonce-${ctx.nonce}' ${extScripts}`.trim(),
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com",
    "img-src 'self' data: https:",
    `connect-src 'self' ${consent ? 'https://www.google-analytics.com https://*.analytics.google.com https://www.facebook.com' : ''}`.trim(),
    "frame-ancestors 'none'", "base-uri 'self'", `form-action 'self' ${env.PAYMOB_API_BASE}`,
  ].join('; ');
  ctx.res.setHeader('Content-Security-Policy', csp);
  ctx.res.setHeader('X-Content-Type-Options', 'nosniff');
  ctx.res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  ctx.res.setHeader('X-Frame-Options', 'DENY');
  ctx.res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  if (isProd) ctx.res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
}

/** CSRF defence for cookie-authenticated requests: same-origin check on every state-changing request. */
export function checkSameOrigin(ctx: Ctx): boolean {
  const origin = ctx.req.headers.origin || ctx.req.headers.referer;
  if (!origin) return !isProd; // non-browser clients in dev; browsers always send Origin on POST
  try {
    const o = new URL(origin);
    const expected = new URL(env.PUBLIC_BASE_URL);
    return o.host === expected.host || o.host === ctx.req.headers.host;
  } catch { return false; }
}

// Token-bucket rate limiter (in-memory; use Redis when running several instances)
const buckets = new Map<string, { tokens: number; at: number }>();
export function rateLimit(key: string, perMinute: number): boolean {
  const now = Date.now(); const b = buckets.get(key) || { tokens: perMinute, at: now };
  b.tokens = Math.min(perMinute, b.tokens + ((now - b.at) / 60000) * perMinute); b.at = now;
  if (b.tokens < 1) { buckets.set(key, b); return false; }
  b.tokens -= 1; buckets.set(key, b); return true;
}
setInterval(() => { const cut = Date.now() - 10 * 60000; for (const [k, b] of buckets) if (b.at < cut) buckets.delete(k); }, 60000).unref();

export function clientIp(req: IncomingMessage): string {
  if (env.TRUST_PROXY) { const xf = req.headers['x-forwarded-for']; if (typeof xf === 'string') return xf.split(',')[0].trim(); }
  return req.socket.remoteAddress || '0.0.0.0';
}

export const newNonce = () => crypto.randomBytes(16).toString('base64');
export const newId = () => crypto.randomBytes(16).toString('base64url');

export function localePath(locale: Locale, p = '') { return `/${locale}${p}`; }
export function makeT(locale: Locale) { return translator(locale); }
export { brand };
