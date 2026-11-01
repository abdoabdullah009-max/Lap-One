import crypto from 'node:crypto';
import { db, one, many } from '../db';
import { env } from '../env';
import { HttpError } from '../http';
import { hashPassword, ROLES, ROLE_PERMISSIONS } from '../auth';
import { audit } from '../services/audit';
import { getSettings, saveSetting, type Settings } from '../services/settings';
import { invalidateCatalog } from '../services/catalog';
import { parseEGP } from '../money';
import { GOVERNORATES } from '../../config/catalog';
import { aroute, av, back, page, s, nOrNull, bool, arr } from './adminCore';
import { AdminLayout, Csrf, F, Pill, egp, egpInput, dt } from '../../views/admin/ui';

// ---------------------------------------------------------------- coupons
aroute('GET', '/admin/coupons', 'coupons.manage', async (ctx) => {
  const a = av(ctx);
  const rows = await many<any>(db, 'SELECT c.*, u.name AS creator FROM coupons c LEFT JOIN users u ON u.id = c.created_by ORDER BY c.id DESC');
  page(ctx, (
    <AdminLayout a={a} title="Coupons & discounts">
      <table className="t t--rows"><thead><tr><th>Code</th><th>Discount</th><th>Rules</th><th>Window</th><th>Used</th><th>State</th><th></th></tr></thead>
        <tbody>{rows.map((c) => (
          <tr key={c.id}><td><b>{c.code}</b></td><td>{c.kind === 'percent' ? `${c.value}%${c.max_discount ? ` (max ${egp(c.max_discount)})` : ''}` : egp(c.value)}</td>
            <td className="small">{c.min_order ? `min ${egp(c.min_order)}` : 'no minimum'}{c.per_phone_limit ? ` · ${c.per_phone_limit}/customer` : ''}{c.variant_ids.length ? ` · ${c.variant_ids.length} products` : ' · all products'}</td>
            <td className="small">{c.starts_at ? dt(c.starts_at) : 'now'} → {c.ends_at ? dt(c.ends_at) : 'no end'}</td><td>{c.used_count}{c.max_uses ? ` / ${c.max_uses}` : ''}</td>
            <td><Pill s={c.active ? 'active' : 'inactive'} /></td>
            <td><form method="post" action={`/admin/coupons/${c.id}/toggle`} className="inline"><Csrf a={a} /><button className="linkbtn">{c.active ? 'deactivate' : 'activate'}</button></form></td></tr>
        ))}</tbody></table>
      <form method="post" action="/admin/coupons" className="card stack"><Csrf a={a} />
        <h3>New coupon</h3>
        <div className="grid">
          <F label="Code" name="code" required /><F label="Type" name="kind" type="select" options={[['percent', 'Percentage'], ['fixed', 'Fixed amount (EGP)']]} />
          <F label="Value (% or EGP)" name="value" type="number" step="0.01" required /><F label="Max discount (EGP, for %)" name="max_discount" type="number" step="0.01" />
          <F label="Minimum order (EGP)" name="min_order" type="number" step="0.01" /><F label="Total uses limit" name="max_uses" type="number" />
          <F label="Uses per customer (phone)" name="per_phone_limit" type="number" /><F label="Starts" name="starts_at" type="datetime-local" /><F label="Ends" name="ends_at" type="datetime-local" />
          <F label="Limit to product IDs (comma separated, empty = all)" name="variant_ids" wide />
        </div>
        <p className="muted small">Discounts are validated and calculated on the server at checkout. Every coupon creation is audit-logged.</p>
        <button className="btn btn--primary">Create coupon</button>
      </form>
    </AdminLayout>
  ));
});
aroute('POST', '/admin/coupons', 'coupons.manage', async (ctx) => {
  const code = s(ctx.body.code).toUpperCase().replace(/[^A-Z0-9_-]/g, '').slice(0, 40); const kind = s(ctx.body.kind) === 'fixed' ? 'fixed' : 'percent';
  const raw = s(ctx.body.value); const value = kind === 'fixed' ? parseEGP(raw) : Math.round(Number(raw));
  if (!code || !value || value <= 0 || (kind === 'percent' && value > 100)) return back(ctx, '/admin/coupons', undefined, 'Invalid code or value (percent must be 1–100)');
  const money = (k: string) => (s(ctx.body[k]) ? parseEGP(s(ctx.body[k])) : null);
  const ts = (k: string) => (s(ctx.body[k]) ? new Date(`${s(ctx.body[k])}:00+02:00`) : null);
  const ids = s(ctx.body.variant_ids).split(',').map((x) => Number(x.trim())).filter((n) => Number.isInteger(n) && n > 0);
  try {
    const c = await one<any>(db, `INSERT INTO coupons(code, kind, value, max_discount, min_order, starts_at, ends_at, max_uses, per_phone_limit, variant_ids, created_by)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id`, [code, kind, value, money('max_discount'), money('min_order'), ts('starts_at'), ts('ends_at'), nOrNull(ctx.body.max_uses), nOrNull(ctx.body.per_phone_limit), ids, ctx.user!.id]);
    await audit(null, ctx.user!.id, 'coupon.create', 'coupon', c.id, null, { code, kind, value }, ctx.ip);
    back(ctx, '/admin/coupons', `Coupon ${code} created`);
  } catch (e: any) { back(ctx, '/admin/coupons', undefined, e.code === '23505' ? 'Code already exists' : e.message); }
});
aroute('POST', '/admin/coupons/:id/toggle', 'coupons.manage', async (ctx) => {
  const c = await one<any>(db, 'UPDATE coupons SET active = NOT active WHERE id = $1 RETURNING code, active', [Number(ctx.params.id)]);
  if (c) await audit(null, ctx.user!.id, c.active ? 'coupon.activate' : 'coupon.deactivate', 'coupon', ctx.params.id, null, null, ctx.ip);
  back(ctx, '/admin/coupons', 'Updated');
});

// ---------------------------------------------------------------- shipping zones
aroute('GET', '/admin/shipping', 'shipping.manage', async (ctx) => {
  const a = av(ctx); const zones = await many<any>(db, 'SELECT * FROM shipping_zones ORDER BY sort, id'); const st = await getSettings();
  const used = new Set(zones.filter((z) => z.active).flatMap((z) => z.governorates));
  const uncovered = GOVERNORATES.filter((g) => !used.has(g[0]));
  const ZoneForm = ({ z }: { z: any }) => (
    <form method="post" action={z.id ? `/admin/shipping/${z.id}` : '/admin/shipping'} className="card stack"><Csrf a={a} />
      <h3>{z.id ? z.name_en : 'New zone'}</h3>
      <div className="grid">
        <F label="Name (Arabic)" name="name_ar" value={z.name_ar} required dir="rtl" /><F label="Name (English)" name="name_en" value={z.name_en} required />
        <F label="Delivery fee (EGP)" name="fee" type="number" step="0.01" value={egpInput(z.fee)} hint="Empty = not configured; checkout will ask customers to contact you" />
        <F label="Free shipping from (EGP)" name="free_threshold" type="number" step="0.01" value={egpInput(z.free_threshold)} />
        <F label="ETA min (business days)" name="eta_min_days" type="number" value={z.eta_min_days} hint="Leave empty unless you have confirmed operating rules" /><F label="ETA max" name="eta_max_days" type="number" value={z.eta_max_days} />
        <F label="Cash on delivery allowed" name="cod_allowed" type="checkbox" value={z.cod_allowed ?? true} /><F label="Active" name="active" type="checkbox" value={z.active ?? true} />
      </div>
      <fieldset className="usages"><legend>Governorates</legend>{GOVERNORATES.map(([c, , en]) => <label key={c}><input type="checkbox" name="governorates" value={c} defaultChecked={(z.governorates || []).includes(c)} /> {en}</label>)}</fieldset>
      <button className="btn btn--primary btn--sm">Save zone</button>
    </form>
  );
  page(ctx, (
    <AdminLayout a={a} title="Shipping zones & delivery">
      {uncovered.length ? <p className="flash flash--err">No active zone for: {uncovered.map((g) => g[2]).join(', ')}. Customers there are asked to contact you instead of being quoted a fee.</p> : null}
      <p className="muted">Store pickup: {st.pickup.enabled ? 'enabled' : 'disabled'} (Settings → Pickup).</p>
      {zones.map((z) => <ZoneForm key={z.id} z={z} />)}
      <ZoneForm z={{ governorates: [] }} />
    </AdminLayout>
  ));
});
async function saveZone(ctx: any, id: number | null) {
  const money = (k: string) => (s(ctx.body[k]) ? parseEGP(s(ctx.body[k])) : null);
  const govs = arr(ctx.body.governorates).filter((g) => GOVERNORATES.some((x) => x[0] === g));
  const vals = [s(ctx.body.name_ar), s(ctx.body.name_en), govs, money('fee'), money('free_threshold'), nOrNull(ctx.body.eta_min_days), nOrNull(ctx.body.eta_max_days), bool(ctx.body.cod_allowed), bool(ctx.body.active)];
  if (!vals[0] || !vals[1] || !govs.length) return back(ctx, '/admin/shipping', undefined, 'Name and at least one governorate are required');
  const before = id ? await one<any>(db, 'SELECT * FROM shipping_zones WHERE id = $1', [id]) : null;
  if (id) await db.query('UPDATE shipping_zones SET name_ar=$2, name_en=$3, governorates=$4, fee=$5, free_threshold=$6, eta_min_days=$7, eta_max_days=$8, cod_allowed=$9, active=$10 WHERE id=$1', [id, ...vals]);
  else await db.query('INSERT INTO shipping_zones(name_ar,name_en,governorates,fee,free_threshold,eta_min_days,eta_max_days,cod_allowed,active) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)', vals);
  await audit(null, ctx.user.id, 'shipping.zone_save', 'shipping_zone', id, before ? { fee: before.fee, free_threshold: before.free_threshold } : null, { fee: vals[3], free_threshold: vals[4] }, ctx.ip);
  back(ctx, '/admin/shipping', 'Zone saved');
}
aroute('POST', '/admin/shipping', 'shipping.manage', (ctx) => saveZone(ctx, null));
aroute('POST', '/admin/shipping/:id', 'shipping.manage', (ctx) => saveZone(ctx, Number(ctx.params.id)));

// ---------------------------------------------------------------- settings
const BI = (st: Settings, path: string, label: string) => {
  const v = path.split('.').reduce((o: any, k) => o?.[k], st) || { ar: '', en: '' };
  return <><F key={path + 'ar'} label={`${label} (Arabic)`} name={`${path}.ar`} value={v.ar} type="textarea" dir="rtl" /><F key={path + 'en'} label={`${label} (English)`} name={`${path}.en`} value={v.en} type="textarea" /></>;
};
const egpRange = (p: number | null) => (p === null ? '' : String(p / 100));

aroute('GET', '/admin/settings', 'settings.manage', async (ctx) => {
  const a = av(ctx); const st = await getSettings();
  const section = (key: string, title: string, body: any, note?: string) => (
    <form method="post" action={`/admin/settings/${key}`} className="card stack" id={key}><Csrf a={a} /><h3>{title}</h3>{note ? <p className="muted small">{note}</p> : null}<div className="grid">{body}</div><button className="btn btn--primary btn--sm">Save {title.toLowerCase()}</button></form>
  );
  page(ctx, (
    <AdminLayout a={a} title="Store settings">
      <nav className="chips">{['general', 'contact', 'payments', 'reservation', 'pickup', 'budgets', 'trust', 'grades', 'policies', 'faq', 'analytics', 'invoice'].map((k) => <a key={k} className="chip" href={`#${k}`}>{k}</a>)}</nav>
      {section('general', 'General', <>
        <F label="Demo mode (shows the sample-data banner)" name="demo_mode" type="checkbox" value={st.demo_mode} />
        <F label="Announcement bar — one per line: Arabic | English" name="announcements" type="textarea" wide value={st.announcements.filter((x) => x.enabled).map((x) => `${x.ar} | ${x.en}`).join('\n')} />
        <F label="Facebook URL" name="social.facebook" value={st.social.facebook} /><F label="Instagram URL" name="social.instagram" value={st.social.instagram} />
        <F label="TikTok URL" name="social.tiktok" value={st.social.tiktok} /><F label="YouTube URL" name="social.youtube" value={st.social.youtube} />
      </>, 'Only publish announcements that are true and currently in force.')}
      {section('contact', 'Contact', <>
        <F label="Phone" name="contact.phone" value={st.contact.phone} dir="ltr" /><F label="WhatsApp number (international, e.g. 2010xxxxxxxx)" name="contact.whatsapp" value={st.contact.whatsapp} dir="ltr" />
        <F label="Email" name="contact.email" value={st.contact.email} /><F label="Map URL" name="contact.map_url" value={st.contact.map_url} />
        {BI(st, 'contact.address', 'Address')}{BI(st, 'contact.hours', 'Working hours')}
      </>)}
      {section('payments', 'Payments', <>
        <F label="Cash on delivery" name="payments.cod.enabled" type="checkbox" value={st.payments.cod.enabled} />
        <F label="COD maximum order (EGP, empty = no limit)" name="payments.cod.max_order" type="number" value={egpRange(st.payments.cod.max_order)} />
        <F label={`Card via Paymob (mode: ${env.PAYMOB_MODE})`} name="payments.paymob_card.enabled" type="checkbox" value={st.payments.paymob_card.enabled} />
        <F label="Mobile wallets via Paymob" name="payments.paymob_wallet.enabled" type="checkbox" value={st.payments.paymob_wallet.enabled} />
        <F label="Manual bank transfer / InstaPay" name="payments.manual_transfer.enabled" type="checkbox" value={st.payments.manual_transfer.enabled} />
        <F label="InstaPay address" name="payments.manual_transfer.instapay_handle" value={st.payments.manual_transfer.instapay_handle} dir="ltr" />
        {BI(st, 'payments.manual_transfer.bank_details', 'Bank transfer details')}
        <F label="Installments / BNPL (requires a contracted provider — not integrated yet)" name="payments.bnpl.enabled" type="checkbox" value={false} disabled />
      </>, 'Only enabled methods are shown at checkout. Paymob API keys are set in environment variables, never here.')}
      {section('reservation', 'Stock reservation', <>
        <F label="Online payment hold (minutes)" name="reservation.online_minutes" type="number" value={st.reservation.online_minutes} />
        <F label="COD hold until staff confirms (hours)" name="reservation.cod_hours" type="number" value={st.reservation.cod_hours} />
        <F label="Bank transfer hold (hours)" name="reservation.manual_transfer_hours" type="number" value={st.reservation.manual_transfer_hours} />
      </>, 'When a hold expires the order is cancelled automatically and the units return to stock (checked every minute).')}
      {section('pickup', 'Store pickup', <><F label="Enable store pickup" name="pickup.enabled" type="checkbox" value={st.pickup.enabled} />{BI(st, 'pickup.address', 'Pickup address')}{BI(st, 'pickup.hours', 'Pickup hours')}</>)}
      {section('budgets', 'Budget ranges', <F label="One range per line in EGP: min-max (e.g. -10000, 10000-15000, 40000-)" name="budget_ranges" type="textarea" wide value={st.budget_ranges.map((r) => `${egpRange(r.min)}-${egpRange(r.max)}`).join('\n')} />)}
      {section('trust', 'Trust claims', <>{Object.entries(st.trust).map(([k, x]) => <div key={k} className="f--wide subgrid">
        <F label={`Show "${k}"`} name={`trust.${k}.enabled`} type="checkbox" value={x.enabled} />{BI(st, `trust.${k}.title`, 'Title')}{BI(st, `trust.${k}.body`, 'Text')}</div>)}</>, 'Only enable claims that are documented and true for every order.')}
      {section('grades', 'Condition grade definitions', <>{(['excellent', 'very_good', 'good', 'fair'] as const).map((g) => BI(st, `grade_definitions.${g}`, g))}</>)}
      {section('policies', 'Policies', <>{(['warranty', 'returns', 'shipping', 'inspection', 'privacy', 'terms', 'about'] as const).map((p) => BI(st, `policies.${p}`, p))}</>, 'Separate paragraphs with a blank line.')}
      {section('faq', 'FAQ', <F label="One per line: question AR | answer AR | question EN | answer EN" name="faq" type="textarea" wide value={st.faq.map((f) => [f.q.ar, f.a.ar, f.q.en, f.a.en].join(' | ')).join('\n')} />)}
      {section('analytics', 'Analytics', <>
        <F label="GA4 measurement ID" name="analytics.ga4_id" value={st.analytics.ga4_id} placeholder="G-XXXXXXX" /><F label="Google Tag Manager ID" name="analytics.gtm_id" value={st.analytics.gtm_id} placeholder="GTM-XXXX" />
        <F label="Meta Pixel ID" name="analytics.meta_pixel_id" value={st.analytics.meta_pixel_id} /><F label="Require cookie consent before loading trackers" name="analytics.require_consent" type="checkbox" value={st.analytics.require_consent} />
      </>, 'Trackers load only when an ID is set (and consent is given when required). Search Console: verify the domain via DNS.')}
      {section('invoice', 'Invoice details', <>
        <F label="Legal company name" name="invoice.legal_name" value={st.invoice.legal_name} /><F label="Tax ID" name="invoice.tax_id" value={st.invoice.tax_id} />
        <F label="Commercial register" name="invoice.commercial_register" value={st.invoice.commercial_register} /><F label="Address" name="invoice.address" value={st.invoice.address} />
      </>)}
    </AdminLayout>
  ));
});

function getPath(body: Record<string, any>, p: string) { return s(body[p]); }
aroute('POST', '/admin/settings/:section', 'settings.manage', async (ctx) => {
  const st = await getSettings(); const b = ctx.body; const sec = ctx.params.section;
  const bi = (p: string) => ({ ar: getPath(b, `${p}.ar`).slice(0, 8000), en: getPath(b, `${p}.en`).slice(0, 8000) });
  const updates: Partial<Settings> = {};
  switch (sec) {
    case 'general':
      updates.demo_mode = bool(b.demo_mode);
      updates.announcements = s(b.announcements) ? String(b.announcements).split('\n').map((l) => l.split('|').map((x) => x.trim())).filter((x) => x[0] || x[1]).slice(0, 5).map(([ar, en]) => ({ ar: ar || '', en: en || ar || '', enabled: true })) : [];
      updates.social = { facebook: getPath(b, 'social.facebook'), instagram: getPath(b, 'social.instagram'), tiktok: getPath(b, 'social.tiktok'), youtube: getPath(b, 'social.youtube') };
      for (const u of Object.values(updates.social)) if (u && !/^https:\/\//.test(u)) return back(ctx, '/admin/settings#general', undefined, 'Social links must start with https://');
      break;
    case 'contact':
      updates.contact = { phone: getPath(b, 'contact.phone'), whatsapp: getPath(b, 'contact.whatsapp').replace(/[^\d]/g, ''), email: getPath(b, 'contact.email'), map_url: getPath(b, 'contact.map_url'), address: bi('contact.address'), hours: bi('contact.hours') };
      if (updates.contact.whatsapp && !/^20\d{10}$/.test(updates.contact.whatsapp)) return back(ctx, '/admin/settings#contact', undefined, 'WhatsApp number must be in international format: 20 + 10 digits (e.g. 201012345678)');
      break;
    case 'payments': {
      const max = getPath(b, 'payments.cod.max_order');
      updates.payments = { cod: { enabled: bool(b['payments.cod.enabled']), max_order: max ? parseEGP(max) : null }, paymob_card: { enabled: bool(b['payments.paymob_card.enabled']) },
        paymob_wallet: { enabled: bool(b['payments.paymob_wallet.enabled']) }, manual_transfer: { enabled: bool(b['payments.manual_transfer.enabled']), instapay_handle: getPath(b, 'payments.manual_transfer.instapay_handle'), bank_details: bi('payments.manual_transfer.bank_details') },
        bnpl: { enabled: false, provider_name: '' } };
      if (updates.payments.manual_transfer.enabled && !updates.payments.manual_transfer.instapay_handle && !updates.payments.manual_transfer.bank_details.ar) return back(ctx, '/admin/settings#payments', undefined, 'Add InstaPay or bank details before enabling transfers');
      if ((updates.payments.paymob_card.enabled || updates.payments.paymob_wallet.enabled) && env.PAYMOB_MODE !== 'sandbox_mock' && !env.PAYMOB_SECRET_KEY) return back(ctx, '/admin/settings#payments', undefined, 'Paymob keys are missing in the server environment');
      break;
    }
    case 'reservation': {
      const n = (k: string, min: number, max: number) => Math.min(max, Math.max(min, Number(getPath(b, k)) || min));
      updates.reservation = { online_minutes: n('reservation.online_minutes', 10, 1440), cod_hours: n('reservation.cod_hours', 1, 240), manual_transfer_hours: n('reservation.manual_transfer_hours', 1, 240) };
      break;
    }
    case 'pickup': updates.pickup = { enabled: bool(b['pickup.enabled']), address: bi('pickup.address'), hours: bi('pickup.hours') }; break;
    case 'budgets':
      updates.budget_ranges = String(b.budget_ranges || '').split('\n').map((l) => l.trim()).filter(Boolean).slice(0, 8).map((l) => {
        const [mn, mx] = l.split('-').map((x) => x.trim()); return { min: mn ? parseEGP(mn) : null, max: mx ? parseEGP(mx) : null };
      }).filter((r) => r.min !== null || r.max !== null);
      break;
    case 'trust':
      updates.trust = Object.fromEntries(Object.keys(st.trust).map((k) => [k, { enabled: bool(b[`trust.${k}.enabled`]), title: bi(`trust.${k}.title`), body: bi(`trust.${k}.body`) }])) as any;
      break;
    case 'grades': updates.grade_definitions = Object.fromEntries((['excellent', 'very_good', 'good', 'fair']).map((g) => [g, bi(`grade_definitions.${g}`)])) as any; break;
    case 'policies': updates.policies = Object.fromEntries(Object.keys(st.policies).map((p) => [p, bi(`policies.${p}`)])) as any; break;
    case 'faq':
      updates.faq = String(b.faq || '').split('\n').map((l) => l.split('|').map((x) => x.trim())).filter((x) => x[0] && x[1]).slice(0, 30)
        .map(([qa, aa, qe, ae]) => ({ q: { ar: qa, en: qe || qa }, a: { ar: aa, en: ae || aa } }));
      break;
    case 'analytics':
      updates.analytics = { ga4_id: getPath(b, 'analytics.ga4_id').replace(/[^A-Z0-9-]/gi, ''), gtm_id: getPath(b, 'analytics.gtm_id').replace(/[^A-Z0-9-]/gi, ''), meta_pixel_id: getPath(b, 'analytics.meta_pixel_id').replace(/\D/g, ''), require_consent: bool(b['analytics.require_consent']) };
      break;
    case 'invoice': updates.invoice = { legal_name: getPath(b, 'invoice.legal_name'), tax_id: getPath(b, 'invoice.tax_id'), commercial_register: getPath(b, 'invoice.commercial_register'), address: getPath(b, 'invoice.address') }; break;
    default: throw new HttpError(404, 'Unknown section');
  }
  for (const [k, v] of Object.entries(updates)) {
    await saveSetting(k as keyof Settings, v as any, ctx.user!.id);
    await audit(null, ctx.user!.id, 'settings.update', 'settings', k, (st as any)[k], v, ctx.ip);
  }
  invalidateCatalog();
  back(ctx, `/admin/settings#${sec}`, 'Settings saved');
});

// ---------------------------------------------------------------- staff & roles
aroute('GET', '/admin/users', 'users.manage', async (ctx) => {
  const a = av(ctx); const users = await many<any>(db, 'SELECT id, email, name, role_key, active, last_login_at FROM users ORDER BY id');
  page(ctx, (
    <AdminLayout a={a} title="Staff & roles">
      <table className="t t--rows"><thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Last sign-in</th><th>Update</th></tr></thead>
        <tbody>{users.map((u) => (
          <tr key={u.id}><td>{u.name}</td><td>{u.email}</td><td><Pill s={u.role_key} /> {u.active ? '' : <Pill s="inactive" />}</td><td>{dt(u.last_login_at)}</td>
            <td><form method="post" action={`/admin/users/${u.id}`} className="inline"><Csrf a={a} />
              <select name="role_key" defaultValue={u.role_key}>{ROLES.map(([k, , en]) => <option key={k} value={k}>{en}</option>)}</select>
              <label><input type="checkbox" name="active" value="1" defaultChecked={u.active} /> active</label>
              <input name="password" type="password" placeholder="new password (optional)" autoComplete="new-password" minLength={10} />
              <button className="btn btn--sm" data-confirm="Update this staff account?">Save</button></form></td></tr>
        ))}</tbody></table>
      <form method="post" action="/admin/users" className="card stack"><Csrf a={a} /><h3>Add staff member</h3>
        <div className="grid"><F label="Name" name="name" required /><F label="Email" name="email" type="email" required />
          <F label="Role" name="role_key" type="select" options={ROLES.map(([k, , en]) => [k, en])} /><F label="Initial password (min 10 chars)" name="password" type="password" required /></div>
        <button className="btn btn--primary btn--sm">Create</button></form>
      <section className="card"><h3>Role permissions</h3>
        <table className="t"><tbody>{ROLES.map(([k, , en]) => <tr key={k}><th>{en}</th><td className="small">{ROLE_PERMISSIONS[k].join(', ')}</td></tr>)}</tbody></table></section>
    </AdminLayout>
  ));
});
aroute('POST', '/admin/users', 'users.manage', async (ctx) => {
  const email = s(ctx.body.email).toLowerCase(); const pw = s(ctx.body.password); const role = s(ctx.body.role_key);
  if (!/^\S+@\S+\.\S+$/.test(email) || pw.length < 10 || !ROLE_PERMISSIONS[role]) return back(ctx, '/admin/users', undefined, 'Valid email, role and a 10+ character password are required');
  try {
    const u = await one<any>(db, 'INSERT INTO users(email, name, password_hash, role_key) VALUES ($1,$2,$3,$4) RETURNING id', [email, s(ctx.body.name).slice(0, 80), hashPassword(pw), role]);
    await audit(null, ctx.user!.id, 'user.create', 'user', u.id, null, { email, role }, ctx.ip); back(ctx, '/admin/users', 'Staff member created');
  } catch (e: any) { back(ctx, '/admin/users', undefined, e.code === '23505' ? 'Email already exists' : e.message); }
});
aroute('POST', '/admin/users/:id', 'users.manage', async (ctx) => {
  const id = Number(ctx.params.id); const role = s(ctx.body.role_key); const active = bool(ctx.body.active); const pw = s(ctx.body.password);
  if (!ROLE_PERMISSIONS[role]) return back(ctx, '/admin/users', undefined, 'Unknown role');
  if (id === ctx.user!.id && (!active || role !== 'super_admin')) return back(ctx, '/admin/users', undefined, 'You cannot demote or deactivate your own account');
  if (pw && pw.length < 10) return back(ctx, '/admin/users', undefined, 'Password must be at least 10 characters');
  const before = await one<any>(db, 'SELECT role_key, active FROM users WHERE id = $1', [id]);
  await db.query(`UPDATE users SET role_key = $2, active = $3 ${pw ? ', password_hash = $4' : ''} WHERE id = $1`, pw ? [id, role, active, hashPassword(pw)] : [id, role, active]);
  if (!active || pw || before?.role_key !== role) await db.query('DELETE FROM sessions WHERE user_id = $1', [id]); // force re-login
  await audit(null, ctx.user!.id, 'user.update', 'user', id, before, { role_key: role, active, password_reset: !!pw }, ctx.ip);
  back(ctx, '/admin/users', 'Staff account updated');
});

// ---------------------------------------------------------------- audit log
aroute('GET', '/admin/audit', 'audit.view', async (ctx) => {
  const a = av(ctx); const act = ctx.url.searchParams.get('action') || '';
  const rows = await many<any>(db, `SELECT l.*, u.name FROM audit_logs l LEFT JOIN users u ON u.id = l.user_id ${act ? 'WHERE l.action LIKE $1' : ''} ORDER BY l.id DESC LIMIT 300`, act ? [`${act}%`] : []);
  page(ctx, (
    <AdminLayout a={a} title="Audit log">
      <form method="get" className="filters"><select name="action" defaultValue={act}><option value="">All actions</option>{['product.price_change', 'unit.status_change', 'unit.cost_change', 'inventory.receive', 'order.cancel', 'order.status_change', 'payment.record', 'coupon', 'settings', 'user', 'auth', 'export', 'import'].map((x) => <option key={x}>{x}</option>)}</select><button className="btn btn--sm">Filter</button></form>
      <table className="t t--rows"><thead><tr><th>When</th><th>Who</th><th>Action</th><th>Entity</th><th>Before</th><th>After</th></tr></thead>
        <tbody>{rows.map((r) => <tr key={r.id}><td>{dt(r.created_at)}</td><td>{r.name || 'system'}<div className="muted small">{r.ip}</div></td><td><b>{r.action}</b></td><td>{r.entity} {r.entity_id}</td>
          <td className="json">{r.before ? JSON.stringify(r.before).slice(0, 300) : ''}</td><td className="json">{r.after ? JSON.stringify(r.after).slice(0, 300) : ''}</td></tr>)}</tbody></table>
    </AdminLayout>
  ));
});
void crypto;
