import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { env, isProd } from './env';
import { db } from './db';
import { migrate } from './db/migrate';
import { brand, type Locale } from '../config/brand';
import { type Ctx, HttpError, parseCookies, parseBody, serveStatic, securityHeaders, checkSameOrigin, clientIp, newNonce, newId, setCookie, makeT, sendJson, sendHtml, redirect, wantsJson } from './http';
import { getSettings } from './services/settings';
import { getSessionUser } from './auth';
import { storeRoutes, renderNotFound, makeView } from './routes/store';
import { adminRoutes } from './routes/admin';
import { expireReservations } from './services/orders';
import { ErrorPage } from '../views/pages/Shop';
import { createElement } from 'react';

const PUBLIC = path.resolve(process.cwd(), 'public');
const UPLOADS = path.resolve(process.cwd(), env.UPLOAD_DIR);
let assetVersion = 'dev';
const readVersion = () => { try { assetVersion = JSON.parse(fs.readFileSync(path.join(PUBLIC, 'assets/version.json'), 'utf8')).v; } catch { /* dev */ } };
readVersion();
if (!isProd) setInterval(readVersion, 2000).unref();

const NO_ORIGIN_CHECK = [/^\/webhooks\//];

async function handle(req: http.IncomingMessage, res: http.ServerResponse) {
  const url = new URL(req.url || '/', 'http://localhost');
  const pathname = decodeURIComponent(url.pathname).replace(/\/{2,}/g, '/');
  const cookies = parseCookies(req.headers.cookie);
  const locale: Locale = (pathname.match(/^\/(ar|en)(\/|$)/)?.[1] as Locale) || (url.searchParams.get('l') === 'en' ? 'en' : brand.defaultLocale);
  const ctx: Ctx = {
    req, res, url, method: req.method || 'GET', path: pathname, params: {}, locale, t: makeT(locale), cookies,
    visitorId: /^[A-Za-z0-9_-]{16,40}$/.test(cookies.lo_vid || '') ? cookies.lo_vid : '', ip: clientIp(req), nonce: newNonce(),
    settings: null as any, user: null, body: {}, files: [], setCookies: [], assetVersion,
  };

  // static assets first (no DB work)
  if (ctx.method === 'GET' || ctx.method === 'HEAD') {
    if (pathname.startsWith('/assets/') && serveStatic(ctx, path.join(PUBLIC, 'assets'), pathname.slice(8), url.searchParams.has('v'))) return;
    if (pathname.startsWith('/img/') && serveStatic(ctx, path.join(PUBLIC, 'img'), pathname.slice(5), false)) return;
    if (pathname.startsWith('/uploads/') && serveStatic(ctx, UPLOADS, pathname.slice(9), true)) return;
    if (pathname === '/favicon.svg' && serveStatic(ctx, PUBLIC, 'favicon.svg')) return;
    if (pathname === '/healthz') { res.writeHead(200, { 'Content-Type': 'text/plain' }); res.end('ok'); return; }
  }

  ctx.settings = await getSettings();
  if (!ctx.visitorId) { ctx.visitorId = newId(); setCookie(ctx, 'lo_vid', ctx.visitorId, { maxAge: 60 * 60 * 24 * 365 }); }
  securityHeaders(ctx);

  if (ctx.method !== 'GET' && ctx.method !== 'HEAD') {
    if (!NO_ORIGIN_CHECK.some((r) => r.test(pathname)) && !checkSameOrigin(ctx)) throw new HttpError(403, 'Cross-origin request blocked', ctx.t('err_csrf'));
    await parseBody(ctx);
  }

  if (pathname === '/' ) return redirect(ctx, `/${brand.defaultLocale}`, 302);

  if (pathname === '/admin' || pathname.startsWith('/admin/')) {
    ctx.user = await getSessionUser(cookies.lo_admin);
    for (const [m, re, h] of adminRoutes) {
      if (m !== ctx.method && !(m === 'GET' && ctx.method === 'HEAD')) continue;
      const mt = pathname.match(re); if (!mt) continue;
      ctx.params = mt.groups || {}; return h(ctx);
    }
    throw new HttpError(404, 'admin route not found');
  }

  for (const [m, re, h] of storeRoutes) {
    if (m !== ctx.method && !(m === 'GET' && ctx.method === 'HEAD')) continue;
    const mt = pathname.match(re); if (!mt) continue;
    ctx.params = mt.groups || {};
    return h(ctx);
  }
  // legacy / locale-less paths -> default locale
  if (ctx.method === 'GET' && !/^\/(ar|en|api|admin)(\/|$)/.test(pathname) && /^\/[a-z-]+/.test(pathname)) return redirect(ctx, `/${brand.defaultLocale}${pathname}${url.search}`, 302);
  throw new HttpError(404, 'not found');
}

const server = http.createServer(async (req, res) => {
  const started = Date.now();
  let ctxForError: Partial<Ctx> = {};
  try {
    await handle(req, res);
  } catch (e: any) {
    const status = e instanceof HttpError ? e.status : 500;
    if (status >= 500) console.error(`[${new Date().toISOString()}] ${req.method} ${req.url}`, e);
    if (res.headersSent) { res.end(); return; }
    try {
      const url = new URL(req.url || '/', 'http://localhost');
      const locale: Locale = url.pathname.startsWith('/en') ? 'en' : 'ar';
      const ctx: Ctx = { req, res, url, method: req.method || 'GET', path: url.pathname, params: {}, locale, t: makeT(locale), cookies: parseCookies(req.headers.cookie),
        visitorId: parseCookies(req.headers.cookie).lo_vid || '', ip: clientIp(req), nonce: newNonce(), settings: await getSettings(), user: null, body: {}, files: [], setCookies: [], assetVersion };
      ctxForError = ctx;
      const isApi = /^\/(api|webhooks)\//.test(url.pathname) || wantsJson(ctx);
      const message = e instanceof HttpError ? (e.publicMessage || (status === 404 ? ctx.t('page_not_found') : ctx.t('err_generic'))) : ctx.t('err_generic');
      if (isApi) return sendJson(ctx, { ok: false, error: message }, status);
      if (url.pathname.startsWith('/admin')) { res.writeHead(status, { 'Content-Type': 'text/html; charset=utf-8' }); res.end(`<!doctype html><meta charset=utf-8><title>${status}</title><p style="font-family:sans-serif;padding:2rem">${status} — ${String(e.message).replace(/[<>&]/g, '')} · <a href="/admin">Admin</a>`); return; }
      if (status === 404) return renderNotFound(ctx);
      sendHtml(ctx, createElement(ErrorPage, { v: await makeView(ctx), message }), status);
    } catch (inner) {
      console.error('error page failed', inner);
      if (!res.headersSent) { res.writeHead(500, { 'Content-Type': 'text/plain' }); res.end('Internal error'); }
    }
  } finally {
    if (!isProd && !req.url?.startsWith('/assets')) console.log(`${req.method} ${req.url} ${res.statusCode} ${Date.now() - started}ms`);
    void ctxForError;
  }
});

async function main() {
  await migrate();
  server.listen(env.PORT, () => console.log(`${brand.name} listening on ${env.PUBLIC_BASE_URL} (port ${env.PORT}, payments: ${env.PAYMOB_MODE})`));
  const sweep = async () => { try { const n = await expireReservations(); if (n) console.log(`released ${n} expired reservation(s)`); } catch (e) { console.error('reservation sweep failed', e); } };
  setInterval(sweep, 60_000).unref(); sweep();
}

const shutdown = () => { server.close(() => db.end().then(() => process.exit(0))); setTimeout(() => process.exit(0), 5000).unref(); };
process.on('SIGTERM', shutdown); process.on('SIGINT', shutdown);
main().catch((e) => { console.error(e); process.exit(1); });
