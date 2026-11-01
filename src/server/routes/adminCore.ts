import crypto from 'node:crypto';
import { type Ctx, HttpError, redirect, sendHtml } from '../http';
import type { Permission } from '../auth';
import type { AV } from '../../views/admin/ui';
import type { ReactElement } from 'react';

type Handler = (ctx: Ctx) => Promise<void>;
export const adminRoutes: [string, RegExp, Handler][] = [];

/** Registers an admin route. Every route except login requires a session; POSTs require the session CSRF token. */
export function aroute(method: string, pattern: string, perm: Permission | null, h: Handler) {
  const re = new RegExp('^' + pattern.replace(/:(\w+)/g, '(?<$1>[^/]+)') + '/?$');
  adminRoutes.push([method, re, async (ctx) => {
    if (perm !== null || pattern !== '/admin/login') {
      if (!ctx.user) {
        if (method === 'GET') return redirect(ctx, `/admin/login?next=${encodeURIComponent(ctx.url.pathname + ctx.url.search)}`);
        throw new HttpError(401, 'Not signed in');
      }
      if (method === 'POST') {
        const tok = String(ctx.body._csrf || ctx.req.headers['x-csrf-token'] || '');
        const a = Buffer.from(tok); const b = Buffer.from(ctx.user.csrf);
        if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) throw new HttpError(403, 'Invalid CSRF token — reload the page');
      }
      if (perm && !ctx.user.perms.has(perm)) throw new HttpError(403, `Your role (${ctx.user.role_key}) does not have permission: ${perm}`);
    }
    ctx.res.setHeader('X-Robots-Tag', 'noindex, nofollow');
    return h(ctx);
  }]);
}

export function av(ctx: Ctx): AV {
  return { user: ctx.user!, path: ctx.url.pathname, v: ctx.assetVersion, nonce: ctx.nonce, flash: ctx.url.searchParams.get('ok'), flashErr: ctx.url.searchParams.get('err') };
}
export const back = (ctx: Ctx, to: string, msg?: string, err?: string) => {
  const sep = to.includes('?') ? '&' : '?';
  redirect(ctx, `${to}${msg ? `${sep}ok=${encodeURIComponent(msg)}` : err ? `${sep}err=${encodeURIComponent(err)}` : ''}`);
};
export const page = (ctx: Ctx, el: ReactElement, status = 200) => sendHtml(ctx, el, status, { 'X-Robots-Tag': 'noindex' });
export const s = (v: any) => (v === undefined || v === null ? '' : String(Array.isArray(v) ? v[0] : v).trim());
export const nOrNull = (v: any) => { const x = s(v); if (!x) return null; const n = Number(x); return Number.isFinite(n) ? n : null; };
export const bool = (v: any) => s(v) === '1' || s(v) === 'on' || s(v) === 'true';
export const arr = (v: any): string[] => (Array.isArray(v) ? v : v ? [v] : []).map(String);

export function csvEscape(v: any) { const t = v === null || v === undefined ? '' : String(v); return /[",\n\r]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t; }
export function toCsv(rows: Record<string, any>[], cols: string[]) { return '﻿' + [cols.join(','), ...rows.map((r) => cols.map((c) => csvEscape(r[c])).join(','))].join('\r\n'); }
export function parseCsv(text: string): Record<string, string>[] {
  const rows: string[][] = []; let row: string[] = []; let cur = ''; let q = false;
  const t = text.replace(/^﻿/, '');
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (q) { if (c === '"') { if (t[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += c; continue; }
    if (c === '"') q = true; else if (c === ',') { row.push(cur); cur = ''; } else if (c === '\n' || c === '\r') { if (c === '\r' && t[i + 1] === '\n') i++; row.push(cur); rows.push(row); row = []; cur = ''; } else cur += c;
  }
  if (cur || row.length) { row.push(cur); rows.push(row); }
  const [head, ...rest] = rows.filter((r) => r.some((x) => x.trim()));
  if (!head) return [];
  return rest.map((r) => Object.fromEntries(head.map((h, i) => [h.trim(), (r[i] ?? '').trim()])));
}
