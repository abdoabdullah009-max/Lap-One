import { db, one, many } from '../db';
import { env } from '../env';
import { type Ctx, HttpError, redirect, setCookie, rateLimit, sendText } from '../http';
import { attemptLogin, createSession, destroySession, can } from '../auth';
import { audit } from '../services/audit';
import { changeOrderStatus, confirmOrder } from '../services/orders';
import { invalidateCatalog } from '../services/catalog';
import { getSettings } from '../services/settings';
import { ORDER_STATUSES, ORDER_TRANSITIONS, CONFIRMED_SALE_STATUSES, GOVERNORATES, type OrderStatus } from '../../config/catalog';
import { adminRoutes, aroute, av, back, page, s, nOrNull, toCsv } from './adminCore';
import { AdminLayout, Csrf, Stat, Pill, Pager, egp, dt, dOnly, maskPhone, F } from '../../views/admin/ui';
import './adminCatalog';
import './adminSettings';

export { adminRoutes };

// ---------------------------------------------------------------- auth
aroute('GET', '/admin/login', null, async (ctx) => {
  if (ctx.user) return redirect(ctx, '/admin');
  const err = ctx.url.searchParams.get('err');
  page(ctx, (
    <html lang="en"><head><meta charSet="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" /><meta name="robots" content="noindex" /><title>Sign in · LAP ONE Admin</title><link rel="stylesheet" href={`/assets/admin.css?v=${ctx.assetVersion}`} /></head>
      <body className="login"><form method="post" action="/admin/login" className="login__box">
        <div className="brand">LAP<b>ONE</b> <small>Admin</small></div>
        {err ? <p className="flash flash--err">{err === 'locked' ? 'Too many failed attempts. Account locked for 15 minutes.' : err === 'rate' ? 'Too many attempts. Wait a minute.' : 'Email or password is incorrect.'}</p> : null}
        <input type="hidden" name="next" value={ctx.url.searchParams.get('next') || '/admin'} />
        <label className="f"><span>Email</span><input name="email" type="email" required autoComplete="username" autoFocus /></label>
        <label className="f"><span>Password</span><input name="password" type="password" required autoComplete="current-password" /></label>
        <button className="btn btn--primary">Sign in</button>
      </form></body></html>
  ));
});

aroute('POST', '/admin/login', null, async (ctx) => {
  if (!rateLimit(`login:${ctx.ip}`, 8)) return redirect(ctx, '/admin/login?err=rate');
  const r = await attemptLogin(s(ctx.body.email), s(ctx.body.password));
  if (!r.userId) { await audit(null, null, 'auth.login_failed', 'user', null, null, { email: s(ctx.body.email).slice(0, 120) }, ctx.ip); return redirect(ctx, `/admin/login?err=${r.error}`); }
  const { token } = await createSession(r.userId, ctx.ip, String(ctx.req.headers['user-agent'] || ''));
  setCookie(ctx, 'lo_admin', token, { maxAge: 12 * 3600, path: '/admin' });
  await audit(null, r.userId, 'auth.login', 'user', r.userId, null, null, ctx.ip);
  const next = s(ctx.body.next); redirect(ctx, next.startsWith('/admin') ? next : '/admin');
});

aroute('POST', '/admin/logout', 'dashboard.view', async (ctx) => {
  await destroySession(ctx.cookies.lo_admin); setCookie(ctx, 'lo_admin', '', { maxAge: 0, path: '/admin' }); redirect(ctx, '/admin/login');
});

// ---------------------------------------------------------------- dashboard
function range(ctx: Ctx) {
  const today = new Date(); const def = new Date(today.getTime() - 29 * 86400000);
  const from = ctx.url.searchParams.get('from') || def.toISOString().slice(0, 10);
  const to = ctx.url.searchParams.get('to') || today.toISOString().slice(0, 10);
  return { from, to };
}

aroute('GET', '/admin', 'dashboard.view', async (ctx) => {
  const a = av(ctx); const { from, to } = range(ctx);
  const R = [from, to];
  const W = `o.created_at >= ($1::date::timestamp AT TIME ZONE 'Africa/Cairo') AND o.created_at < (($2::date + 1)::timestamp AT TIME ZONE 'Africa/Cairo')`;
  const byStatus = await many<any>(db, `SELECT status, count(*)::int AS n, COALESCE(sum(total),0)::bigint AS v FROM orders o WHERE ${W} GROUP BY status`, R);
  const st = (ss: string[]) => byStatus.filter((x) => ss.includes(x.status)).reduce((acc, x) => ({ n: acc.n + x.n, v: acc.v + Number(x.v) }), { n: 0, v: 0 });
  const confirmed = st(CONFIRMED_SALE_STATUSES); const pending = st(['pending', 'awaiting_payment']); const cancelled = st(['cancelled']); const refunded = st(['returned', 'refunded']);
  const total = byStatus.reduce((acc, x) => acc + x.n, 0);
  const paid = await one<any>(db, `SELECT COALESCE(sum(p.amount),0)::bigint AS v, count(*)::int AS n FROM payments p JOIN orders o ON o.id = p.order_id WHERE p.status = 'paid' AND ${W}`, R);
  const unpaidConfirmed = await one<any>(db, `SELECT count(*)::int AS n, COALESCE(sum(total),0)::bigint AS v FROM orders o WHERE status IN ('confirmed','preparing','shipped','delivered') AND payment_status <> 'paid' AND ${W}`, R);
  const items = await one<any>(db, `SELECT count(*)::int AS n, COALESCE(sum(oi.line_total),0)::bigint AS rev, COALESCE(sum(oi.unit_cost),0)::bigint AS cost,
      count(*) FILTER (WHERE oi.unit_cost IS NULL)::int AS no_cost FROM order_items oi JOIN orders o ON o.id = oi.order_id WHERE o.status IN ('confirmed','preparing','shipped','delivered') AND ${W}`, R);
  const top = await many<any>(db, `SELECT v.title, v.id, count(*)::int AS n, sum(oi.line_total)::bigint AS v FROM order_items oi JOIN orders o ON o.id = oi.order_id JOIN product_variants v ON v.id = oi.variant_id
      WHERE o.status IN ('confirmed','preparing','shipped','delivered') AND ${W} GROUP BY v.id, v.title ORDER BY n DESC LIMIT 8`, R);
  const channels = await many<any>(db, `SELECT payment_method, count(*)::int AS n, COALESCE(sum(total),0)::bigint AS v FROM orders o WHERE status IN ('confirmed','preparing','shipped','delivered') AND ${W} GROUP BY 1 ORDER BY n DESC`, R);
  const low = await many<any>(db, `SELECT v.id, v.title, v.low_stock_threshold, v.inventory_mode, (SELECT count(*) FROM inventory_units u WHERE u.variant_id = v.id AND u.status = 'available')::int AS avail
      FROM product_variants v WHERE v.published AND NOT v.archived ORDER BY avail, v.title`);
  const lowStock = low.filter((x) => x.avail === 0 || (x.inventory_mode === 'batch' && x.avail <= x.low_stock_threshold)); // a one-off unique laptop selling is not 'low stock'
  const leads = await many<any>(db, `SELECT source, count(*)::int AS n FROM customer_leads WHERE created_at >= ($1::date::timestamp AT TIME ZONE 'Africa/Cairo') AND created_at < (($2::date + 1)::timestamp AT TIME ZONE 'Africa/Cairo') GROUP BY 1`, R);
  const funnel = await many<any>(db, `SELECT name, count(DISTINCT COALESCE(visitor_id, id::text))::int AS n FROM analytics_events WHERE name IN ('view_item','add_to_cart','begin_checkout','purchase')
      AND created_at >= ($1::date::timestamp AT TIME ZONE 'Africa/Cairo') AND created_at < (($2::date + 1)::timestamp AT TIME ZONE 'Africa/Cairo') GROUP BY 1`, R);
  const fn = (k: string) => funnel.find((x) => x.name === k)?.n || 0;
  const alerts = await many<any>(db, `SELECT e.body, e.created_at, o.number, o.id FROM order_events e JOIN orders o ON o.id = e.order_id WHERE e.kind = 'alert' ORDER BY e.id DESC LIMIT 5`);
  const settings = await getSettings();
  const zonesNoFee = await one<any>(db, `SELECT count(*)::int AS n FROM shipping_zones WHERE active AND fee IS NULL`);
  const coveredGovs = new Set((await many<any>(db, 'SELECT unnest(governorates) AS g FROM shipping_zones WHERE active AND fee IS NOT NULL')).map((x) => x.g));
  const setup: [boolean, string][] = [
    [!settings.demo_mode, 'Turn off demo mode (Settings → General) after replacing sample data'],
    [!!settings.contact.whatsapp, 'Add the WhatsApp sales number (Settings → Contact)'],
    [!!settings.contact.phone, 'Add the customer service phone number'],
    [!!settings.policies.warranty.ar && !settings.demo_mode, 'Publish the approved warranty, returns and shipping policies'],
    [env.PAYMOB_MODE === 'live', `Paymob is in "${env.PAYMOB_MODE}" mode — add live keys to go live with card payments`],
    [coveredGovs.size === GOVERNORATES.length, `${GOVERNORATES.length - coveredGovs.size} governorates have no delivery fee configured (checkout asks them to contact you)`],
    [zonesNoFee.n === 0, 'All active shipping zones have fees'],
    [!!settings.invoice.legal_name, 'Add legal name / tax ID for invoices (Settings → Invoice)'],
  ];
  const fin = can(ctx.user, 'finance.view'); const costs = can(ctx.user, 'costs.view');
  const profitKnown = items.n > 0 && items.no_cost === 0;
  page(ctx, (
    <AdminLayout a={a} title="Dashboard" actions={
      <form method="get" className="inline"><label>From <input type="date" name="from" defaultValue={from} /></label><label>To <input type="date" name="to" defaultValue={to} /></label><button className="btn btn--sm">Apply</button></form>
    }>
      {alerts.length ? <div className="card card--alert"><h3>Needs attention</h3><ul>{alerts.map((x, i) => <li key={i}><a href={`/admin/orders/${x.id}`}>{x.number}</a> — {x.body} <small>{dt(x.created_at)}</small></li>)}</ul></div> : null}
      <div className="stats">
        <Stat label="Orders placed" value={total} sub={`${dOnly(from)} – ${dOnly(to)}`} />
        {fin ? <Stat label="Confirmed sales" value={egp(confirmed.v)} sub={`${confirmed.n} orders (confirmed → delivered)`} tone="ok" /> : <Stat label="Confirmed orders" value={confirmed.n} tone="ok" />}
        {fin ? <Stat label="Payments received" value={egp(Number(paid.v))} sub={`${paid.n} paid payments (provider-confirmed or recorded)`} /> : null}
        {fin ? <Stat label="Average order value" value={confirmed.n ? egp(Math.round(confirmed.v / confirmed.n)) : '—'} sub="confirmed orders" /> : null}
        {fin && costs ? <Stat label="Gross profit" value={profitKnown ? egp(Number(items.rev) - Number(items.cost)) : '—'} sub={items.n === 0 ? 'no confirmed sales' : profitKnown ? 'line revenue − unit purchase cost' : `${items.no_cost} sold units missing cost data`} /> : null}
        <Stat label="Units sold" value={items.n} />
        <Stat label="Pending / awaiting payment" value={pending.n} sub={fin ? `${egp(pending.v)} — not revenue` : 'not revenue'} tone={pending.n ? 'warn' : undefined} />
        {fin ? <Stat label="Confirmed but unpaid" value={unpaidConfirmed.n} sub={`${egp(Number(unpaidConfirmed.v))} (e.g. COD not yet collected)`} /> : null}
        <Stat label="Cancelled" value={cancelled.n} tone={cancelled.n ? 'bad' : undefined} />
        <Stat label="Returned / refunded" value={refunded.n} sub={fin ? egp(refunded.v) : undefined} />
        <Stat label="Low-stock listings" value={lowStock.length} tone={lowStock.length ? 'warn' : undefined} />
        <Stat label="Inquiries / leads" value={leads.reduce((acc, x) => acc + x.n, 0)} sub={leads.map((x) => `${x.source.replace('whatsapp_', 'WA ')}: ${x.n}`).join(' · ') || '—'} />
      </div>
      <div className="cols">
        <section className="card"><h3>Top-selling laptops</h3>
          {top.length ? <table className="t"><thead><tr><th>Product</th><th>Units</th>{fin ? <th>Revenue</th> : null}</tr></thead><tbody>{top.map((x) => <tr key={x.id}><td><a href={`/admin/products/${x.id}`}>{x.title}</a></td><td>{x.n}</td>{fin ? <td>{egp(Number(x.v))}</td> : null}</tr>)}</tbody></table> : <p className="muted">No confirmed sales in this period.</p>}
        </section>
        <section className="card"><h3>Sales by channel (payment method)</h3>
          {channels.length ? <table className="t"><tbody>{channels.map((x) => <tr key={x.payment_method}><td>{x.payment_method}</td><td>{x.n} orders</td>{fin ? <td>{egp(Number(x.v))}</td> : null}</tr>)}</tbody></table> : <p className="muted">No confirmed sales in this period.</p>}
          <h3>Conversion funnel (unique visitors)</h3>
          {fn('view_item') ? <table className="t"><tbody>
            {[['Viewed a product', fn('view_item')], ['Added to cart', fn('add_to_cart')], ['Started checkout', fn('begin_checkout')], ['Purchased', fn('purchase')]].map(([l, n]) => <tr key={l as string}><td>{l}</td><td>{n}</td><td className="muted">{fn('view_item') ? `${Math.round((Number(n) / fn('view_item')) * 1000) / 10}%` : ''}</td></tr>)}
          </tbody></table> : <p className="muted">No analytics events recorded in this period.</p>}
        </section>
        <section className="card"><h3>Low stock</h3>
          {lowStock.length ? <table className="t"><tbody>{lowStock.slice(0, 12).map((x) => <tr key={x.id}><td><a href={`/admin/products/${x.id}`}>{x.title}</a></td><td className={x.avail === 0 ? 'bad' : 'warn'}>{x.avail} available</td></tr>)}</tbody></table> : <p className="muted">All published listings are above their thresholds.</p>}
        </section>
        <section className="card"><h3>Go-live checklist</h3>
          <ul className="checks">{setup.map(([ok, label], i) => <li key={i} className={ok ? 'ok' : 'todo'}>{ok ? '✓' : '•'} {label}</li>)}</ul>
        </section>
      </div>
    </AdminLayout>
  ));
});

// ---------------------------------------------------------------- orders
aroute('GET', '/admin/orders', 'orders.view', async (ctx) => {
  const a = av(ctx); const sp = ctx.url.searchParams;
  const status = sp.get('status') || ''; const q = (sp.get('q') || '').trim(); const pageN = Math.max(1, Number(sp.get('page')) || 1);
  const cond: string[] = []; const params: any[] = [];
  if (status && (ORDER_STATUSES as readonly string[]).includes(status)) { params.push(status); cond.push(`o.status = $${params.length}`); }
  if (q) { params.push(`%${q}%`); cond.push(`(o.number ILIKE $${params.length} OR o.customer_snapshot->>'name' ILIKE $${params.length} OR o.customer_snapshot->>'phone' ILIKE $${params.length})`); }
  const where = cond.length ? `WHERE ${cond.join(' AND ')}` : '';
  const count = (await one<any>(db, `SELECT count(*)::int AS n FROM orders o ${where}`, params)).n;
  const rows = await many<any>(db, `SELECT o.*, u.name AS assignee, (SELECT count(*) FROM order_items WHERE order_id = o.id)::int AS units FROM orders o LEFT JOIN users u ON u.id = o.assigned_to ${where} ORDER BY o.id DESC LIMIT 30 OFFSET ${(pageN - 1) * 30}`, params);
  const pii = can(ctx.user, 'customers.pii');
  page(ctx, (
    <AdminLayout a={a} title="Orders" actions={can(ctx.user, 'export') ? <a className="btn btn--sm" href="/admin/export/orders.csv">Export CSV</a> : null}>
      <form method="get" className="filters">
        <input name="q" placeholder="Order #, name or phone" defaultValue={q} />
        <select name="status" defaultValue={status}><option value="">All statuses</option>{ORDER_STATUSES.map((x) => <option key={x} value={x}>{x.replace('_', ' ')}</option>)}</select>
        <button className="btn btn--sm">Filter</button>
      </form>
      <table className="t t--rows"><thead><tr><th>Order</th><th>Date</th><th>Customer</th><th>Units</th><th>Total</th><th>Payment</th><th>Status</th><th>Assigned</th></tr></thead>
        <tbody>{rows.map((o) => (
          <tr key={o.id}><td><a href={`/admin/orders/${o.id}`}><b>{o.number}</b></a></td><td>{dt(o.created_at)}</td>
            <td>{o.customer_snapshot.name}<br /><small className="muted">{pii ? o.customer_snapshot.phone : maskPhone(o.customer_snapshot.phone)}</small></td>
            <td>{o.units}</td><td>{egp(o.total)}</td><td>{o.payment_method} <Pill s={o.payment_status} /></td><td><Pill s={o.status} /></td><td>{o.assignee || <span className="muted">—</span>}</td></tr>
        ))}</tbody></table>
      {!rows.length ? <p className="muted">No orders found.</p> : null}
      <Pager page={pageN} pages={Math.ceil(count / 30)} base={`/admin/orders?status=${status}&q=${encodeURIComponent(q)}`} />
    </AdminLayout>
  ));
});

async function loadOrder(id: number) {
  const o = await one<any>(db, 'SELECT o.*, u.name AS assignee FROM orders o LEFT JOIN users u ON u.id = o.assigned_to WHERE o.id = $1', [id]);
  if (!o) throw new HttpError(404, 'Order not found');
  const items = await many<any>(db, `SELECT oi.*, u.unit_sku, u.internal_serial, u.status AS unit_status, v.slug FROM order_items oi LEFT JOIN inventory_units u ON u.id = oi.unit_id JOIN product_variants v ON v.id = oi.variant_id WHERE oi.order_id = $1 ORDER BY oi.id`, [id]);
  const payments = await many<any>(db, 'SELECT p.*, u.name AS recorder FROM payments p LEFT JOIN users u ON u.id = p.recorded_by WHERE order_id = $1 ORDER BY p.id', [id]);
  const events = await many<any>(db, 'SELECT e.*, u.name AS who FROM order_events e LEFT JOIN users u ON u.id = e.user_id WHERE order_id = $1 ORDER BY e.id DESC', [id]);
  const shipments = await many<any>(db, 'SELECT * FROM shipments WHERE order_id = $1 ORDER BY id', [id]);
  const reservations = await many<any>(db, 'SELECT * FROM stock_reservations WHERE order_id = $1 ORDER BY id', [id]);
  const returns = await many<any>(db, 'SELECT * FROM returns WHERE order_id = $1 ORDER BY id', [id]);
  return { o, items, payments, events, shipments, reservations, returns };
}

aroute('GET', '/admin/orders/:id', 'orders.view', async (ctx) => {
  const a = av(ctx); const d = await loadOrder(Number(ctx.params.id)); const { o } = d;
  const pii = can(ctx.user, 'customers.pii'); const costs = can(ctx.user, 'costs.view');
  const staff = await many<any>(db, `SELECT id, name, role_key FROM users WHERE active AND role_key IN ('sales','manager','super_admin','support') ORDER BY name`);
  const next = ORDER_TRANSITIONS[o.status as OrderStatus].filter((x) => x !== 'cancelled' || can(ctx.user, 'orders.cancel'));
  const gov = GOVERNORATES.find((g) => g[0] === o.address.governorate);
  page(ctx, (
    <AdminLayout a={a} title={`Order ${o.number}`} actions={<><a className="btn btn--sm" href={`/admin/orders/${o.id}/invoice`} target="_blank">Invoice / receipt</a><a className="btn btn--sm" href="/admin/orders">← All orders</a></>}>
      <div className="stats">
        <Stat label="Status" value={<Pill s={o.status} />} sub={o.cancel_reason ? `Reason: ${o.cancel_reason}` : undefined} />
        <Stat label="Payment" value={<Pill s={o.payment_status} />} sub={o.payment_method} />
        <Stat label="Total" value={egp(o.total)} sub={`subtotal ${egp(o.subtotal + o.options_total)} · discount ${egp(o.discount)} · shipping ${egp(o.shipping_fee)}`} />
        <Stat label="Placed" value={dt(o.created_at)} sub={o.reservation_expires_at && ['pending', 'awaiting_payment'].includes(o.status) ? `Stock held until ${dt(o.reservation_expires_at)}` : undefined} />
      </div>
      <div className="cols">
        <section className="card">
          <h3>Items (one row per physical unit)</h3>
          <table className="t"><thead><tr><th>Product</th><th>Unit</th><th>Price</th>{costs ? <th>Cost</th> : null}</tr></thead><tbody>
            {d.items.map((i) => <tr key={i.id}><td><a href={`/admin/products/${i.variant_id}`}>{i.title}</a>{i.options.length ? <div className="muted small">{i.options.map((x: any) => `+ ${x.label_en} (${egp(x.price)})`).join(', ')}</div> : null}</td>
              <td>{i.unit_id ? <a href={`/admin/inventory/${i.unit_id}`}>{i.unit_sku}</a> : '—'} <Pill s={i.unit_status || 'none'} /></td><td>{egp(i.line_total)}</td>{costs ? <td>{egp(i.unit_cost)}</td> : null}</tr>)}
          </tbody></table>
          <h3>Customer & delivery</h3>
          <p><b>{o.customer_snapshot.name}</b> · {pii ? <a href={`tel:${o.customer_snapshot.phone}`}>{o.customer_snapshot.phone}</a> : maskPhone(o.customer_snapshot.phone)}{pii && o.customer_snapshot.email ? ` · ${o.customer_snapshot.email}` : ''}
            {can(ctx.user, 'customers.view') ? <> · <a href={`/admin/customers/${o.customer_id}`}>Profile</a></> : null}</p>
          <p>{o.address.pickup ? 'Store pickup' : pii ? `${gov?.[2] || o.address.governorate} — ${o.address.city}, ${o.address.street}${o.address.building ? `, ${o.address.building}` : ''}` : `${gov?.[2] || o.address.governorate} — ${o.address.city} (address hidden for your role)`}</p>
          {o.customer_notes ? <p className="muted">Note: {o.customer_notes}</p> : null}
          <h3>Payments</h3>
          <table className="t"><tbody>{d.payments.map((p) => <tr key={p.id}><td>#{p.id} {p.provider}/{p.method}</td><td>{egp(p.amount)}</td><td><Pill s={p.status} /></td><td className="small">{p.provider_ref ? `ref ${p.provider_ref}` : ''}{p.manual_reference ? `ref ${p.manual_reference}` : ''}{p.recorder ? ` · by ${p.recorder}` : ''}{p.paid_at ? ` · ${dt(p.paid_at)}` : ''}</td></tr>)}</tbody></table>
          <h3>Stock reservations</h3>
          <table className="t"><tbody>{d.reservations.map((r) => <tr key={r.id}><td>unit #{r.unit_id}</td><td><Pill s={r.status} /></td><td className="small">expires {dt(r.expires_at)}{r.released_reason ? ` · ${r.released_reason}` : ''}</td></tr>)}</tbody></table>
        </section>
        <section className="card">
          {can(ctx.user, 'orders.update') && next.length ? (
            <form method="post" action={`/admin/orders/${o.id}/status`} className="stack"><Csrf a={a} />
              <h3>Update status</h3>
              <F label="New status" name="status" type="select" options={next.map((x) => [x, x.replace('_', ' ')])} />
              <F label="Note (shown in timeline)" name="note" />
              <button className="btn btn--primary" data-confirm="Change order status?">Update</button>
              {o.payment_method !== 'cod' && o.payment_status !== 'paid' ? <p className="muted small">Card/wallet orders confirm automatically when Paymob confirms payment. Confirming manually here reserves the units as sold without a recorded payment.</p> : null}
            </form>
          ) : null}
          {can(ctx.user, 'payments.record') && o.payment_status !== 'paid' && o.status !== 'cancelled' ? (
            <form method="post" action={`/admin/orders/${o.id}/payment`} className="stack"><Csrf a={a} />
              <h3>Record a received payment</h3>
              <p className="muted small">Use for InstaPay / bank transfers or collected COD. Requires the transaction reference.</p>
              <F label="Reference" name="reference" required />
              <F label="Amount (EGP)" name="amount" type="number" step="0.01" value={o.total / 100} required />
              <button className="btn" data-confirm="Mark this payment as received?">Record payment</button>
            </form>
          ) : null}
          {can(ctx.user, 'orders.assign') ? (
            <form method="post" action={`/admin/orders/${o.id}/assign`} className="stack"><Csrf a={a} />
              <h3>Assign to</h3>
              <F label="Sales employee" name="user_id" type="select" value={o.assigned_to || ''} options={[['', '— unassigned —'], ...staff.map((u) => [String(u.id), `${u.name} (${u.role_key})`] as [string, string])]} />
              <button className="btn btn--sm">Save</button>
            </form>
          ) : null}
          {can(ctx.user, 'orders.update') ? (
            <form method="post" action={`/admin/orders/${o.id}/shipment`} className="stack"><Csrf a={a} />
              <h3>Shipping reference</h3>
              <F label="Carrier" name="carrier" value={d.shipments[0]?.carrier} /><F label="Tracking / waybill" name="tracking_ref" value={d.shipments[0]?.tracking_ref} />
              <button className="btn btn--sm">Save</button>
            </form>
          ) : null}
          {can(ctx.user, 'orders.update') && ['shipped', 'delivered'].includes(o.status) ? (
            <form method="post" action={`/admin/orders/${o.id}/return`} className="stack"><Csrf a={a} />
              <h3>Return request</h3>
              <F label="Reason" name="reason" required /><F label="Refund amount (EGP)" name="refund" type="number" step="0.01" />
              <button className="btn btn--sm" data-confirm="Register a return? Units move to 'returned' when you set the order status to Returned.">Register return</button>
              {d.returns.map((r) => <p key={r.id} className="small">Return #{r.id}: {r.reason} · <Pill s={r.status} /> {r.refund_amount ? egp(r.refund_amount) : ''}</p>)}
            </form>
          ) : null}
          <form method="post" action={`/admin/orders/${o.id}/note`} className="stack"><Csrf a={a} />
            <h3>Internal note</h3><F label="Note" name="body" type="textarea" required /><button className="btn btn--sm">Add note</button>
          </form>
          <h3>Timeline</h3>
          <ul className="timeline">{d.events.map((e) => <li key={e.id} className={e.kind === 'alert' ? 'bad' : ''}><small>{dt(e.created_at)} · {e.who || 'system'} · {e.internal ? 'internal' : 'customer-visible'}</small><div>{e.kind === 'status_change' ? <>Status {e.from_value ? <Pill s={e.from_value} /> : null} → <Pill s={e.to_value} /> </> : <b>{e.kind}: </b>}{e.body}</div></li>)}</ul>
        </section>
      </div>
    </AdminLayout>
  ));
});

aroute('POST', '/admin/orders/:id/status', 'orders.update', async (ctx) => {
  const id = Number(ctx.params.id); const to = s(ctx.body.status) as OrderStatus;
  if (to === 'cancelled' && !can(ctx.user, 'orders.cancel')) throw new HttpError(403, 'No permission to cancel orders');
  try { await changeOrderStatus(id, to, ctx.user!.id, s(ctx.body.note) || undefined); back(ctx, `/admin/orders/${id}`, `Status changed to ${to}`); }
  catch (e: any) { back(ctx, `/admin/orders/${id}`, undefined, e.message); }
});
aroute('POST', '/admin/orders/:id/payment', 'payments.record', async (ctx) => {
  const id = Number(ctx.params.id); const ref = s(ctx.body.reference).slice(0, 120); const amount = Math.round(Number(s(ctx.body.amount)) * 100);
  if (!ref || !Number.isSafeInteger(amount) || amount <= 0) return back(ctx, `/admin/orders/${id}`, undefined, 'Reference and amount are required');
  const msg = await db.tx(async (q) => {
    const o = await one<any>(q, 'SELECT * FROM orders WHERE id = $1 FOR UPDATE', [id]);
    if (!o || o.status === 'cancelled' || o.payment_status === 'paid') return 'Nothing to record';
    if (amount !== o.total) return `Amount must equal the order total (${egp(o.total)}). Record partial payments as an internal note.`;
    const p = await one<any>(q, `SELECT id FROM payments WHERE order_id = $1 AND status IN ('pending','failed') ORDER BY id DESC LIMIT 1`, [id]);
    if (p) await q.query(`UPDATE payments SET status = 'paid', manual_reference = $2, recorded_by = $3, paid_at = now(), updated_at = now() WHERE id = $1`, [p.id, ref, ctx.user!.id]);
    else await q.query(`INSERT INTO payments(order_id, provider, method, amount, status, manual_reference, recorded_by, paid_at) VALUES ($1,'manual_transfer',$2,$3,'paid',$4,$5,now())`, [id, o.payment_method, amount, ref, ctx.user!.id]);
    await q.query(`UPDATE orders SET payment_status = 'paid', updated_at = now() WHERE id = $1`, [id]);
    await q.query(`INSERT INTO order_events(order_id, kind, body, user_id, internal) VALUES ($1,'payment',$2,$3,FALSE)`, [id, `Payment received (ref ${ref})`, ctx.user!.id]);
    if (['pending', 'awaiting_payment'].includes(o.status)) await confirmOrder(q, id, ctx.user!.id, 'payment recorded by staff');
    await audit(q, ctx.user!.id, 'payment.record', 'order', id, { payment_status: o.payment_status }, { payment_status: 'paid', reference: ref, amount }, ctx.ip);
    return null;
  });
  invalidateCatalog();
  msg ? back(ctx, `/admin/orders/${id}`, undefined, msg) : back(ctx, `/admin/orders/${id}`, 'Payment recorded');
});
aroute('POST', '/admin/orders/:id/assign', 'orders.assign', async (ctx) => {
  const id = Number(ctx.params.id); const uid = nOrNull(ctx.body.user_id);
  const before = await one<any>(db, 'SELECT assigned_to FROM orders WHERE id = $1', [id]);
  await db.query('UPDATE orders SET assigned_to = $2, updated_at = now() WHERE id = $1', [id, uid]);
  await db.query(`INSERT INTO order_events(order_id, kind, to_value, user_id) VALUES ($1,'assignment',$2,$3)`, [id, uid ? String(uid) : 'none', ctx.user!.id]);
  await audit(null, ctx.user!.id, 'order.assign', 'order', id, before, { assigned_to: uid }, ctx.ip);
  back(ctx, `/admin/orders/${id}`, 'Assignment saved');
});
aroute('POST', '/admin/orders/:id/shipment', 'orders.update', async (ctx) => {
  const id = Number(ctx.params.id); const carrier = s(ctx.body.carrier).slice(0, 80) || null; const ref = s(ctx.body.tracking_ref).slice(0, 120) || null;
  const ex = await one<any>(db, 'SELECT id FROM shipments WHERE order_id = $1 ORDER BY id LIMIT 1', [id]);
  if (ex) await db.query('UPDATE shipments SET carrier = $2, tracking_ref = $3 WHERE id = $1', [ex.id, carrier, ref]);
  else await db.query('INSERT INTO shipments(order_id, carrier, tracking_ref) VALUES ($1,$2,$3)', [id, carrier, ref]);
  await db.query(`INSERT INTO order_events(order_id, kind, body, user_id) VALUES ($1,'shipment',$2,$3)`, [id, `${carrier || ''} ${ref || ''}`.trim(), ctx.user!.id]);
  back(ctx, `/admin/orders/${id}`, 'Shipping reference saved');
});
aroute('POST', '/admin/orders/:id/note', 'orders.view', async (ctx) => {
  const id = Number(ctx.params.id); const body = s(ctx.body.body).slice(0, 2000);
  if (body) await db.query(`INSERT INTO order_events(order_id, kind, body, user_id) VALUES ($1,'note',$2,$3)`, [id, body, ctx.user!.id]);
  back(ctx, `/admin/orders/${id}`, 'Note added');
});
aroute('POST', '/admin/orders/:id/return', 'orders.update', async (ctx) => {
  const id = Number(ctx.params.id); const reason = s(ctx.body.reason).slice(0, 500); const refund = nOrNull(ctx.body.refund);
  if (!reason) return back(ctx, `/admin/orders/${id}`, undefined, 'Reason required');
  await db.query('INSERT INTO returns(order_id, reason, refund_amount, created_by) VALUES ($1,$2,$3,$4)', [id, reason, refund === null ? null : Math.round(refund * 100), ctx.user!.id]);
  await db.query(`INSERT INTO order_events(order_id, kind, body, user_id) VALUES ($1,'return',$2,$3)`, [id, reason, ctx.user!.id]);
  await audit(null, ctx.user!.id, 'order.return_request', 'order', id, null, { reason, refund }, ctx.ip);
  back(ctx, `/admin/orders/${id}`, 'Return registered');
});

aroute('GET', '/admin/orders/:id/invoice', 'orders.view', async (ctx) => {
  const d = await loadOrder(Number(ctx.params.id)); const { o } = d; const st = await getSettings(); const pii = can(ctx.user, 'customers.pii');
  page(ctx, (
    <html lang="ar" dir="rtl"><head><meta charSet="utf-8" /><title>{`Invoice ${o.number}`}</title><meta name="robots" content="noindex" /><link rel="stylesheet" href={`/assets/admin.css?v=${ctx.assetVersion}`} /></head>
      <body className="invoice">
        <header><div><b className="brand">LAP<b>ONE</b></b><div>{st.invoice.legal_name || '[الاسم القانوني — يُضاف من الإعدادات]'}</div><div className="small">{st.invoice.address}{st.invoice.tax_id ? ` · الرقم الضريبي ${st.invoice.tax_id}` : ''}{st.invoice.commercial_register ? ` · س.ت ${st.invoice.commercial_register}` : ''}</div></div>
          <div><h1>{o.payment_status === 'paid' ? 'إيصال / فاتورة' : 'أمر بيع (غير مدفوع)'}</h1><div>رقم الطلب: <b>{o.number}</b></div><div>{dOnly(o.created_at)}</div></div></header>
        <p>العميل: <b>{o.customer_snapshot.name}</b> · {pii ? o.customer_snapshot.phone : maskPhone(o.customer_snapshot.phone)}</p>
        <table className="t"><thead><tr><th>الصنف</th><th>رقم الوحدة</th><th>السعر</th></tr></thead><tbody>
          {d.items.map((i) => <tr key={i.id}><td>{i.title}{i.options.map((x: any) => <div key={x.id} className="small">+ {x.label_ar}</div>)}</td><td>{i.unit_sku}</td><td>{egp(i.line_total)}</td></tr>)}
        </tbody></table>
        <table className="t totals"><tbody>
          <tr><td>المجموع</td><td>{egp(o.subtotal + o.options_total)}</td></tr>{o.discount ? <tr><td>خصم {o.coupon_code}</td><td>−{egp(o.discount)}</td></tr> : null}
          <tr><td>الشحن</td><td>{egp(o.shipping_fee)}</td></tr><tr><th>الإجمالي</th><th>{egp(o.total)}</th></tr>
          <tr><td>حالة الدفع</td><td>{o.payment_status} ({o.payment_method})</td></tr>
        </tbody></table>
        {st.demo_mode ? <p className="flash flash--err">نسخة تجريبية — ليست فاتورة ضريبية.</p> : null}
        <p className="small muted">This document is generated from the order record. Confirm tax-invoice requirements (e.g. ETA e-invoicing) with your accountant.</p>
        <button className="btn noprint" type="button" data-print="1">Print</button>
        <script src={`/assets/admin.js?v=${ctx.assetVersion}`} defer nonce={ctx.nonce} />
      </body></html>
  ));
});

aroute('GET', '/admin/export/orders.csv', 'export', async (ctx) => {
  const pii = can(ctx.user, 'customers.pii'); const fin = can(ctx.user, 'finance.view');
  const rows = await many<any>(db, `SELECT o.number, o.created_at, o.status, o.payment_status, o.payment_method, o.subtotal, o.options_total, o.discount, o.shipping_fee, o.total, o.coupon_code,
      o.customer_snapshot->>'name' AS customer, o.customer_snapshot->>'phone' AS phone, o.address->>'governorate' AS governorate, u.name AS assigned_to,
      (SELECT sum(unit_cost) FROM order_items WHERE order_id = o.id) AS cost FROM orders o LEFT JOIN users u ON u.id = o.assigned_to ORDER BY o.id`);
  const out = rows.map((r) => ({ ...r, created_at: new Date(r.created_at).toISOString(), phone: pii ? r.phone : maskPhone(r.phone), subtotal: r.subtotal / 100, options_total: r.options_total / 100,
    discount: r.discount / 100, shipping_fee: r.shipping_fee / 100, total: r.total / 100, cost: can(ctx.user, 'costs.view') && r.cost !== null ? r.cost / 100 : '' }));
  const cols = ['number', 'created_at', 'status', 'payment_status', 'payment_method', 'subtotal', 'options_total', 'discount', 'shipping_fee', 'total', 'coupon_code', 'customer', 'phone', 'governorate', 'assigned_to', ...(fin ? ['cost'] : [])];
  await audit(null, ctx.user!.id, 'export.orders', 'orders', null, null, { rows: rows.length }, ctx.ip);
  sendText(ctx, toCsv(out, cols), 'text/csv; charset=utf-8', 200, { 'Content-Disposition': 'attachment; filename="orders.csv"' });
});

// ---------------------------------------------------------------- customers & leads
aroute('GET', '/admin/customers', 'customers.view', async (ctx) => {
  const a = av(ctx); const q = (ctx.url.searchParams.get('q') || '').trim(); const pii = can(ctx.user, 'customers.pii');
  const rows = await many<any>(db, `SELECT c.*, u.name AS assignee, (SELECT count(*) FROM orders WHERE customer_id = c.id)::int AS orders,
      (SELECT COALESCE(sum(total),0) FROM orders WHERE customer_id = c.id AND status IN ('confirmed','preparing','shipped','delivered'))::bigint AS spent
      FROM customers c LEFT JOIN users u ON u.id = c.assigned_to ${q ? `WHERE c.name ILIKE $1 OR c.phone ILIKE $1` : ''} ORDER BY c.id DESC LIMIT 200`, q ? [`%${q}%`] : []);
  page(ctx, (
    <AdminLayout a={a} title="Customers">
      <form method="get" className="filters"><input name="q" placeholder="Name or phone" defaultValue={q} /><button className="btn btn--sm">Search</button></form>
      <table className="t t--rows"><thead><tr><th>Name</th><th>Phone</th><th>Orders</th><th>Confirmed spend</th><th>Marketing consent</th><th>Follow-up</th><th>Assigned</th></tr></thead>
        <tbody>{rows.map((c) => <tr key={c.id}><td><a href={`/admin/customers/${c.id}`}>{c.name}</a></td><td>{pii ? c.phone : maskPhone(c.phone)}</td><td>{c.orders}</td><td>{egp(Number(c.spent))}</td><td>{c.marketing_consent ? `yes (${dOnly(c.consent_at)})` : 'no'}</td><td><Pill s={c.follow_up_status} /></td><td>{c.assignee || '—'}</td></tr>)}</tbody></table>
      {!rows.length ? <p className="muted">No customers yet.</p> : null}
    </AdminLayout>
  ));
});
aroute('GET', '/admin/customers/:id', 'customers.view', async (ctx) => {
  const a = av(ctx); const id = Number(ctx.params.id); const pii = can(ctx.user, 'customers.pii');
  const c = await one<any>(db, 'SELECT * FROM customers WHERE id = $1', [id]); if (!c) throw new HttpError(404, 'Customer not found');
  const orders = await many<any>(db, 'SELECT id, number, status, payment_status, total, created_at FROM orders WHERE customer_id = $1 ORDER BY id DESC', [id]);
  const addresses = pii ? await many<any>(db, 'SELECT * FROM addresses WHERE customer_id = $1 ORDER BY id DESC LIMIT 5', [id]) : [];
  const staff = await many<any>(db, `SELECT id, name FROM users WHERE active ORDER BY name`);
  page(ctx, (
    <AdminLayout a={a} title={c.name}>
      <div className="cols">
        <section className="card">
          <p>Phone: {pii ? c.phone : maskPhone(c.phone)} {pii && c.email ? ` · ${c.email}` : ''}</p>
          <p>Marketing consent: <b>{c.marketing_consent ? `Yes — given ${dt(c.consent_at)}` : 'No — do not send marketing messages'}</b></p>
          <p className="muted small">Wishlists are stored per anonymous browser and are not linked to customer profiles (no account system / consent context in Phase 1).</p>
          {addresses.map((x) => <p key={x.id} className="small">{x.governorate_code} — {x.city}, {x.street}</p>)}
          <h3>Purchase history</h3>
          <table className="t"><tbody>{orders.map((o) => <tr key={o.id}><td><a href={`/admin/orders/${o.id}`}>{o.number}</a></td><td>{dOnly(o.created_at)}</td><td><Pill s={o.status} /></td><td>{egp(o.total)}</td></tr>)}</tbody></table>
        </section>
        <form method="post" action={`/admin/customers/${id}`} className="card stack"><Csrf a={a} />
          <h3>Sales follow-up</h3>
          <F label="Assigned to" name="assigned_to" type="select" value={c.assigned_to || ''} options={[['', '—'], ...staff.map((u) => [String(u.id), u.name] as [string, string])]} />
          <F label="Follow-up status" name="follow_up_status" type="select" value={c.follow_up_status} options={['none', 'to_contact', 'contacted', 'interested', 'not_interested'].map((x) => [x, x.replace('_', ' ')])} />
          <F label="Notes" name="notes" type="textarea" value={c.notes} />
          <button className="btn btn--primary">Save</button>
        </form>
      </div>
    </AdminLayout>
  ));
});
aroute('POST', '/admin/customers/:id', 'customers.view', async (ctx) => {
  const id = Number(ctx.params.id);
  await db.query('UPDATE customers SET assigned_to = $2, follow_up_status = $3, notes = $4 WHERE id = $1', [id, nOrNull(ctx.body.assigned_to), s(ctx.body.follow_up_status) || 'none', s(ctx.body.notes).slice(0, 4000) || null]);
  back(ctx, `/admin/customers/${id}`, 'Saved');
});

aroute('GET', '/admin/leads', 'leads.manage', async (ctx) => {
  const a = av(ctx); const st = ctx.url.searchParams.get('status') || ''; const pii = can(ctx.user, 'customers.pii');
  const rows = await many<any>(db, `SELECT l.*, v.title, u.name AS assignee FROM customer_leads l LEFT JOIN product_variants v ON v.id = l.variant_id LEFT JOIN users u ON u.id = l.assigned_to ${st ? 'WHERE l.status = $1' : ''} ORDER BY l.id DESC LIMIT 300`, st ? [st] : []);
  const staff = await many<any>(db, `SELECT id, name FROM users WHERE active ORDER BY name`);
  page(ctx, (
    <AdminLayout a={a} title="Leads & inquiries">
      <p className="muted">WhatsApp clicks are logged as anonymous leads (the conversation itself happens in WhatsApp). Contact-form messages include the customer’s details. A lead is not an order.</p>
      <form method="get" className="filters"><select name="status" defaultValue={st}><option value="">All</option>{['new', 'contacted', 'qualified', 'won', 'lost'].map((x) => <option key={x}>{x}</option>)}</select><button className="btn btn--sm">Filter</button></form>
      <table className="t t--rows"><thead><tr><th>Date</th><th>Source</th><th>Product / message</th><th>Contact</th><th>Status · assignee · notes</th></tr></thead>
        <tbody>{rows.map((l) => (
          <tr key={l.id}><td>{dt(l.created_at)}</td><td>{l.source}</td><td>{l.title ? <a href={`/admin/products/${l.variant_id}`}>{l.title}</a> : null}{l.message ? <div>{l.message}</div> : null}{l.page_url ? <div className="muted small">{l.page_url}</div> : null}</td>
            <td>{l.name || ''} {l.phone ? (pii ? l.phone : maskPhone(l.phone)) : <span className="muted">—</span>}</td>
            <td><form method="post" action={`/admin/leads/${l.id}`} className="inline"><Csrf a={a} />
              <select name="status" defaultValue={l.status}>{['new', 'contacted', 'qualified', 'won', 'lost'].map((x) => <option key={x}>{x}</option>)}</select>
              <select name="assigned_to" defaultValue={l.assigned_to || ''}><option value="">—</option>{staff.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</select>
              <input name="notes" defaultValue={l.notes || ''} placeholder="notes" /><button className="btn btn--sm">Save</button></form></td></tr>
        ))}</tbody></table>
    </AdminLayout>
  ));
});
aroute('POST', '/admin/leads/:id', 'leads.manage', async (ctx) => {
  await db.query('UPDATE customer_leads SET status = $2, assigned_to = $3, notes = $4, updated_at = now() WHERE id = $1',
    [Number(ctx.params.id), ['new', 'contacted', 'qualified', 'won', 'lost'].includes(s(ctx.body.status)) ? s(ctx.body.status) : 'new', nOrNull(ctx.body.assigned_to), s(ctx.body.notes).slice(0, 1000) || null]);
  back(ctx, '/admin/leads', 'Lead updated');
});

aroute('GET', '/admin/abandoned', 'orders.view', async (ctx) => {
  const a = av(ctx);
  const rows = await many<any>(db, `SELECT c.id, c.kind, c.checkout_started_at, c.updated_at, count(ci.id)::int AS lines, COALESCE(sum(ci.qty * v.price),0)::bigint AS value,
      string_agg(v.title, ' · ') AS titles FROM carts c JOIN cart_items ci ON ci.cart_id = c.id JOIN product_variants v ON v.id = ci.variant_id
      WHERE c.converted_order_id IS NULL AND c.checkout_started_at IS NOT NULL AND c.updated_at < now() - interval '30 minutes'
      GROUP BY c.id ORDER BY c.checkout_started_at DESC LIMIT 200`);
  page(ctx, (
    <AdminLayout a={a} title="Abandoned checkouts">
      <p className="muted">Carts where checkout was opened but no order was placed (30+ minutes ago). No personal data is stored before the customer submits the order, so these are anonymous.
        Recovery messages may only be sent through consented channels — the infrastructure (cart records, consent flags on customers) is in place; connect an approved messaging provider to automate it.</p>
      <table className="t t--rows"><thead><tr><th>Checkout started</th><th>Last activity</th><th>Items</th><th>Value</th></tr></thead>
        <tbody>{rows.map((r) => <tr key={r.id}><td>{dt(r.checkout_started_at)}</td><td>{dt(r.updated_at)}</td><td>{r.titles}</td><td>{egp(Number(r.value))}</td></tr>)}</tbody></table>
      {!rows.length ? <p className="muted">No abandoned checkouts.</p> : null}
    </AdminLayout>
  ));
});
