import type { ReactNode } from 'react';
import type { AdminUser, Permission } from '../../server/auth';
import { formatEGP } from '../../server/money';

export interface AV { user: AdminUser; path: string; v: string; nonce: string; flash?: string | null; flashErr?: string | null }
export const egp = (p: number | null | undefined) => (p === null || p === undefined ? '—' : formatEGP(p, 'en'));
export const egpInput = (p: number | null | undefined) => (p === null || p === undefined ? '' : String(p / 100));
export const dt = (d: Date | string | null | undefined) => (d ? new Date(d).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Africa/Cairo' }) : '—');
export const dOnly = (d: Date | string | null | undefined) => (d ? new Date(d).toLocaleDateString('en-GB', { timeZone: 'Africa/Cairo' }) : '—');
export const maskPhone = (p: string | null | undefined) => (p ? p.replace(/^(\d{3})\d{5}(\d{3})$/, '$1•••••$2') : '—');

const NAV: [string, string, Permission][] = [
  ['/admin', 'Dashboard', 'dashboard.view'], ['/admin/orders', 'Orders', 'orders.view'], ['/admin/products', 'Products', 'products.view'],
  ['/admin/inventory', 'Inventory', 'inventory.view'], ['/admin/customers', 'Customers', 'customers.view'], ['/admin/leads', 'Leads', 'leads.manage'],
  ['/admin/abandoned', 'Abandoned checkouts', 'orders.view'], ['/admin/coupons', 'Coupons', 'coupons.manage'], ['/admin/shipping', 'Shipping', 'shipping.manage'],
  ['/admin/import', 'Import / Export', 'import'], ['/admin/settings', 'Settings', 'settings.manage'], ['/admin/users', 'Staff & roles', 'users.manage'], ['/admin/audit', 'Audit log', 'audit.view'],
];

export function AdminLayout({ a, title, children, actions }: { a: AV; title: string; children: ReactNode; actions?: ReactNode }) {
  return (
    <html lang="en" dir="ltr">
      <head>
        <meta charSet="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="robots" content="noindex, nofollow" /><title>{`${title} · LAP ONE Admin`}</title>
        <link rel="icon" href="/favicon.svg" /><link rel="stylesheet" href={`/assets/admin.css?v=${a.v}`} />
      </head>
      <body>
        <div className="shell">
          <aside className="side">
            <a href="/admin" className="brand">LAP<b>ONE</b> <small>Admin</small></a>
            <nav>{NAV.filter(([, , p]) => a.user.perms.has(p)).map(([href, label]) => (
              <a key={href} href={href} className={(href === '/admin' ? a.path === '/admin' : a.path.startsWith(href)) ? 'on' : ''}>{label}</a>
            ))}</nav>
            <div className="side__me">
              <b>{a.user.name}</b><small>{a.user.role_key.replace('_', ' ')}</small>
              <form method="post" action="/admin/logout"><input type="hidden" name="_csrf" value={a.user.csrf} /><button className="linkbtn">Sign out</button></form>
              <a href="/ar" target="_blank">View store ↗</a>
            </div>
          </aside>
          <main className="main">
            <header className="top"><h1>{title}</h1><div className="top__actions">{actions}</div></header>
            {a.flash ? <p className="flash">{a.flash}</p> : null}
            {a.flashErr ? <p className="flash flash--err">{a.flashErr}</p> : null}
            {children}
          </main>
        </div>
        <script src={`/assets/admin.js?v=${a.v}`} defer nonce={a.nonce} />
      </body>
    </html>
  );
}

export const Csrf = ({ a }: { a: AV }) => <input type="hidden" name="_csrf" value={a.user.csrf} />;

export function F({ label, name, value, type = 'text', hint, required, options, step, wide, placeholder, disabled, dir }: {
  label: string; name: string; value?: any; type?: string; hint?: string; required?: boolean; options?: [string, string][]; step?: string; wide?: boolean; placeholder?: string; disabled?: boolean; dir?: string;
}) {
  const v = value === null || value === undefined ? '' : value;
  return (
    <label className={`f${wide ? ' f--wide' : ''}`}>
      <span>{label}{required ? ' *' : ''}</span>
      {type === 'select' ? <select name={name} defaultValue={String(v)} required={required} disabled={disabled}>{options!.map(([val, l]) => <option key={val} value={val}>{l}</option>)}</select>
        : type === 'textarea' ? <textarea name={name} defaultValue={String(v)} rows={3} required={required} placeholder={placeholder} disabled={disabled} dir={dir} />
        : type === 'checkbox' ? <input type="checkbox" name={name} value="1" defaultChecked={!!value} disabled={disabled} />
        : <input type={type} name={name} defaultValue={String(v)} required={required} step={step} placeholder={placeholder} disabled={disabled} dir={dir} />}
      {hint ? <small>{hint}</small> : null}
    </label>
  );
}

export function Stat({ label, value, sub, tone }: { label: string; value: ReactNode; sub?: ReactNode; tone?: 'ok' | 'warn' | 'bad' }) {
  return <div className={`stat${tone ? ` stat--${tone}` : ''}`}><small>{label}</small><b>{value}</b>{sub ? <span>{sub}</span> : null}</div>;
}

export const Pill = ({ s }: { s: string }) => <span className={`pill pill--${s}`}>{s.replace(/_/g, ' ')}</span>;

export function Pager({ page, pages, base }: { page: number; pages: number; base: string }) {
  if (pages <= 1) return null;
  const sep = base.includes('?') ? '&' : '?';
  return <nav className="pager">{page > 1 ? <a href={`${base}${sep}page=${page - 1}`}>← Prev</a> : null}<span>Page {page} / {pages}</span>{page < pages ? <a href={`${base}${sep}page=${page + 1}`}>Next →</a> : null}</nav>;
}
