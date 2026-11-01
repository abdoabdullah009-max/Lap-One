import crypto from 'node:crypto';
import { renderToStaticMarkup } from 'react-dom/server';
import { db, one, many } from '../db';
import { env } from '../env';
import { brand } from '../../config/brand';
import { USAGES } from '../../config/catalog';
import { type Ctx, HttpError, sendHtml, sendJson, sendText, redirect, rateLimit, wantsJson, setCookie } from '../http';
import { loadCatalog, searchCatalog, filtersFromParams, suggest, valueScore, getItemsByIds, type CatalogItem } from '../services/catalog';
import { getProduct, relatedProducts } from '../services/product';
import { addToCart, createBuyNowCart, getCart, updateLine, cartCount, wishlistIds, toggleWishlist, compareIds, setCompare } from '../services/cart';
import { checkoutSchema, placeOrder, afterPlaced, enabledMethods, CheckoutError, normalizePhone } from '../services/orders';
import { shippingQuote, validateCoupon } from '../services/pricing';
import { createPaymentSession, handlePaymobCallback, mockTransaction, mockSignatureValid } from '../services/payments/paymob';
import { recommend, type WizardAnswers } from '../services/recommend';
import { trackEvent } from '../services/audit';
import { formatEGP } from '../money';
import type { View } from '../../views/ui';
import { ProductCard } from '../../views/ui';
import { HomePage } from '../../views/pages/Home';
import { CatalogPage } from '../../views/pages/Catalog';
import { ProductPage, QuickView } from '../../views/pages/Product';
import { ComparePage, WishlistPage, WizardPage, CartPage, CheckoutPage, OrderPage, TrackPage, PolicyPage, ContactPage, FaqPage, NotFoundPage, LandingPage, CAMPAIGNS, SandboxPayPage, type OrderView } from '../../views/pages/Shop';
import { POLICY_TITLES } from '../../views/Layout';

export async function makeView(ctx: Ctx): Promise<View> {
  return {
    locale: ctx.locale, t: ctx.t, settings: ctx.settings, path: ctx.path, search: ctx.url.search, nonce: ctx.nonce, v: ctx.assetVersion,
    baseUrl: env.PUBLIC_BASE_URL.replace(/\/$/, ''), cartCount: await cartCount(ctx), wishIds: await wishlistIds(ctx), compareIds: compareIds(ctx),
  };
}

type Handler = (ctx: Ctx) => Promise<void>;
export const storeRoutes: [string, RegExp, Handler][] = [];
const route = (method: string, pattern: string, h: Handler) => {
  const re = new RegExp('^' + pattern.replace(/:l\b/, '(?<l>ar|en)').replace(/:(\w+)/g, '(?<$1>[^/]+)') + '/?$');
  storeRoutes.push([method, re, h]);
};

// ---------------------------------------------------------------- pages
route('GET', '/:l', async (ctx) => {
  const all = await loadCatalog();
  const laptops = all.filter((i) => !i.is_accessory);
  const inStock = laptops.filter((i) => i.available > 0);
  const ar = ctx.locale === 'ar';
  const order = (a: CatalogItem, b: CatalogItem) => Number(b.available > 0) - Number(a.available > 0) || valueScore(b) - valueScore(a);
  const brands = new Map<string, { slug: string; name: string; count: number }>();
  for (const i of laptops) { const b = brands.get(i.brand_slug) || { slug: i.brand_slug, name: i.brand_name, count: 0 }; b.count++; brands.set(i.brand_slug, b); }
  // Featured: fully-specified, in stock, one per model family, premium first
  const hero = [...inStock].filter((i) => i.ram_gb && i.storage_gb && i.cpu_model).sort((a, b) => b.available - a.available || valueScore(b) - valueScore(a))[0] || null;
  const seen = new Set<number>(hero ? [hero.family_id] : []);
  const featured = [...inStock].filter((i) => i.ram_gb && i.storage_gb && i.cpu_model).sort((a, b) => b.price - a.price)
    .filter((i) => (seen.has(i.family_id) ? false : (seen.add(i.family_id), true))).slice(0, 6);
  const defs: { key: string; title: [string, string]; tagline: string; match: (i: CatalogItem) => boolean; q: string }[] = [
    { key: 'workstation', title: ar ? ['محطات', 'العمل'] : ['Workstation', 'laptops'], tagline: ar ? 'قوة تشتغل عليها بثقة — هندسة، تصميم، ومونتاج' : 'Power you can rely on — engineering, design and editing', match: (i) => i.usages.includes('workstation'), q: 'usage=workstation' },
    { key: 'business', title: ar ? ['أجهزة', 'البيزنس'] : ['Business', 'laptops'], tagline: ar ? 'أداء ثابت واعتمادية لشغل كل يوم' : 'Steady performance for everyday work', match: (i) => i.usages.includes('office'), q: 'usage=office' },
    { key: 'touch', title: ar ? ['تاتش و', '2 في 1'] : ['Touch &', '2-in-1'], tagline: ar ? 'خفة ومرونة في إيدك' : 'Light and flexible', match: (i) => !!i.touch || !!i.convertible, q: 'touch=1' },
    { key: 'study', title: ar ? ['أجهزة', 'الدراسة'] : ['Laptops for', 'study'], tagline: ar ? 'رفيقك في المحاضرات والمذاكرة والمشاريع' : 'For lectures, studying and projects', match: (i) => i.usages.includes('study'), q: 'usage=study' },
    { key: 'budget', title: ar ? ['أجهزة', 'اقتصادية'] : ['Budget', 'picks'], tagline: ar ? 'أفضل قيمة بأقل تكلفة' : 'Best value for less', match: (i) => i.usages.includes('budget'), q: 'usage=budget' },
  ];
  const sections = defs.map((d) => { const items = laptops.filter(d.match).sort(order); return { key: d.key, title: d.title, tagline: d.tagline, href: `/${ctx.locale}/laptops?${d.q}`, items: items.slice(0, 10), count: items.length }; })
    .filter((s) => s.count > 0);
  const reviews = await many<any>(db, `SELECT r.display_name, r.rating, r.body, v.title FROM reviews r JOIN product_variants v ON v.id = r.variant_id
                                      WHERE r.approved AND r.verified ORDER BY r.created_at DESC LIMIT 6`);
  sendHtml(ctx, <HomePage v={await makeView(ctx)} d={{
    hero, featured,
    sections, brands: [...brands.values()].sort((a, b) => b.count - a.count), reviews,
  }} />);
});

route('GET', '/:l/laptops', async (ctx) => {
  const filters = filtersFromParams(ctx.url.searchParams);
  const pageSize = 24;
  const res = await searchCatalog(filters, pageSize);
  if (filters.q) {
    await trackEvent('search', { visitorId: ctx.visitorId, payload: { q: filters.q.slice(0, 120), results: res.total } });
    if (res.total === 1 && res.items[0] && (filters.page || 1) === 1 && !ctx.url.searchParams.has('noredirect')) {
      // exact model hit — still show the list (customers may want alternatives); no auto redirect
    }
  }
  const all = await loadCatalog();
  const brandNames = Object.fromEntries(all.map((i) => [i.brand_slug, i.brand_name]));
  const familyNames = Object.fromEntries(all.map((i) => [i.family_slug, `${i.brand_name} ${i.family_name}`]));
  sendHtml(ctx, <CatalogPage v={await makeView(ctx)} d={{ res, filters: res.effective.q ? { ...filters } : filters, brandNames, familyNames, pageSize }} />);
});

route('GET', '/:l/p/:slug', async (ctx) => {
  const p = await getProduct(decodeURIComponent(ctx.params.slug));
  if (!p) throw new HttpError(404, 'product not found');
  const related = p.item.is_accessory ? [] : await relatedProducts(p.item);
  const z = await one<any>(db, 'SELECT min(fee) AS min, min(free_threshold) AS free FROM shipping_zones WHERE active AND fee IS NOT NULL');
  await trackEvent('view_item', { visitorId: ctx.visitorId, variantId: p.item.id, value: p.item.price });
  sendHtml(ctx, <ProductPage v={await makeView(ctx)} d={{ p, related, zoneSummary: { min: z?.min ?? null, freeFrom: z?.free ?? null } }} />);
});

route('GET', '/:l/compare', async (ctx) => {
  sendHtml(ctx, <ComparePage v={await makeView(ctx)} items={await getItemsByIds(compareIds(ctx))} />);
});
route('GET', '/:l/wishlist', async (ctx) => {
  sendHtml(ctx, <WishlistPage v={await makeView(ctx)} items={await getItemsByIds(await wishlistIds(ctx))} />);
});

route('GET', '/:l/help-me-choose', async (ctx) => {
  const sp = ctx.url.searchParams;
  const answers: Partial<WizardAnswers> & { budget?: string } = {
    usage: sp.get('usage') || undefined, budget: sp.get('budget') || undefined, apps: sp.getAll('apps').slice(0, 10),
    pref: (['portable', 'performance', 'balanced'].includes(sp.get('pref') || '') ? sp.get('pref') : 'balanced') as any, reqs: sp.getAll('reqs').slice(0, 8),
  };
  let result = null;
  if (sp.get('go') && answers.usage) {
    const r = ctx.settings.budget_ranges[Number(answers.budget)];
    const out = await recommend({ usage: answers.usage, budgetMin: r ? r.min : null, budgetMax: r ? r.max : null, apps: answers.apps || [], pref: answers.pref || 'balanced', reqs: answers.reqs || [] });
    result = out.recs;
  }
  sendHtml(ctx, <WizardPage v={await makeView(ctx)} answers={answers} result={result} />);
});

// ---------------------------------------------------------------- cart
const toInt = (x: any) => { const n = Number(x); return Number.isInteger(n) && n > 0 ? n : null; };
const optionIdsFrom = (body: Record<string, any>) => Object.entries(body).filter(([k]) => k.startsWith('opt_')).map(([, v]) => toInt(v)).filter(Boolean) as number[];

route('GET', '/:l/cart', async (ctx) => {
  const err = ctx.url.searchParams.get('err');
  const title = ctx.url.searchParams.get('title') || '';
  const msg = err === 'stock' ? ctx.t('err_stock', { title: title.slice(0, 120) }) : err === 'empty' ? ctx.t('err_cart_empty') : err ? ctx.t('err_generic') : null;
  sendHtml(ctx, <CartPage v={await makeView(ctx)} cart={await getCart(ctx)} error={msg} />);
});

route('POST', '/:l/cart/add', async (ctx) => {
  if (!rateLimit(`cart:${ctx.ip}`, 60)) throw new HttpError(429, 'rate', ctx.t('err_rate'));
  const vid = toInt(ctx.body.variant_id); if (!vid) throw new HttpError(400, 'bad variant');
  const qty = Math.min(toInt(ctx.body.qty) || 1, 20);
  const r = await addToCart(ctx, vid, qty, optionIdsFrom(ctx.body));
  if (r.ok) await trackEvent('add_to_cart', { visitorId: ctx.visitorId, variantId: vid });
  if (wantsJson(ctx)) return sendJson(ctx, { ok: r.ok, error: r.error, count: await cartCount(ctx), message: r.ok ? ctx.t('added_to_cart') : ctx.t('out_of_stock') }, r.ok ? 200 : 409);
  redirect(ctx, `/${ctx.locale}/cart${r.ok ? '' : '?err=stock'}`);
});

route('POST', '/:l/cart/update', async (ctx) => {
  const line = toInt(ctx.body.line); const qty = Number(ctx.body.qty);
  if (line && Number.isInteger(qty)) await updateLine(ctx, line, qty);
  if (wantsJson(ctx)) return sendJson(ctx, { ok: true, count: await cartCount(ctx) });
  redirect(ctx, `/${ctx.locale}/cart`);
});

route('POST', '/:l/buy-now', async (ctx) => {
  const vid = toInt(ctx.body.variant_id); if (!vid) throw new HttpError(400, 'bad variant');
  const r = await createBuyNowCart(ctx, vid, optionIdsFrom(ctx.body));
  if (!r.id) return redirect(ctx, `/${ctx.locale}/cart?err=stock`);
  await trackEvent('add_to_cart', { visitorId: ctx.visitorId, variantId: vid });
  redirect(ctx, `/${ctx.locale}/checkout?cart=${r.id}`);
});

// ---------------------------------------------------------------- checkout
const newIdem = () => crypto.randomBytes(18).toString('base64url');

async function renderCheckout(ctx: Ctx, cartId: string | undefined, values: Record<string, string>, errors: Record<string, string>, formError: string | null, idem: string, status = 200) {
  const cart = await getCart(ctx, cartId);
  if (!cart.lines.length) return redirect(ctx, `/${ctx.locale}/cart?err=empty`);
  if (cart.issues.length) return redirect(ctx, `/${ctx.locale}/cart`);
  const started = await db.query('UPDATE carts SET checkout_started_at = now() WHERE id = $1 AND checkout_started_at IS NULL RETURNING id', [cart.id]);
  if (started.rows.length) await trackEvent('begin_checkout', { visitorId: ctx.visitorId, value: cart.subtotal + cart.options_total });
  const methods = enabledMethods(ctx.settings, true, cart.subtotal + cart.options_total);
  sendHtml(ctx, <CheckoutPage v={await makeView(ctx)} d={{ cart, methods, idem, values, errors, formError, buyNow: cart.kind === 'buy_now' }} />, status);
}

route('GET', '/:l/checkout', async (ctx) => {
  const cid = ctx.url.searchParams.get('cart') || undefined;
  await renderCheckout(ctx, cid, {}, {}, null, newIdem());
});

route('POST', '/:l/checkout', async (ctx) => {
  if (!rateLimit(`checkout:${ctx.ip}`, 12)) throw new HttpError(429, 'rate', ctx.t('err_rate'));
  const body = Object.fromEntries(Object.entries(ctx.body).map(([k, v]) => [k, Array.isArray(v) ? String(v[0]) : String(v ?? '')]));
  const cartId = body.cart_id || undefined;
  const parsed = checkoutSchema.safeParse(body);
  if (!parsed.success) {
    const errors: Record<string, string> = {};
    for (const i of parsed.error.issues) {
      const k = String(i.path[0]);
      errors[k] = k === 'phone' ? ctx.t('err_phone') : k === 'email' ? ctx.t('err_email') : k === 'idempotency_key' ? ctx.t('err_csrf') : ctx.t('err_required');
    }
    return renderCheckout(ctx, cartId, body, errors, null, body.idempotency_key || newIdem(), 422);
  }
  const cart = await getCart(ctx, cartId);
  try {
    const order = await placeOrder(parsed.data, cart, ctx.settings, { visitorId: ctx.visitorId, locale: ctx.locale, ip: ctx.ip });
    await afterPlaced(order, ctx.visitorId);
    if (cart.kind === 'cart' && !order.existing) setCookie(ctx, 'lo_cart', '', { maxAge: 0 });
    const orderUrl = `/${ctx.locale}/order/${order.number}?t=${order.public_token}`;
    if ((order.payment_method === 'card' || order.payment_method === 'wallet')) {
      const pay = await one<any>(db, 'SELECT status FROM payments WHERE id = $1', [order.payment_id]);
      if (pay?.status === 'pending') {
        try {
          const s = await createPaymentSession(order.payment_id);
          return redirectAny(ctx, s.redirectUrl);
        } catch (e) { console.error('payment session failed', e); return redirect(ctx, `${orderUrl}&payerr=1`); }
      }
    }
    redirect(ctx, orderUrl);
  } catch (e) {
    if (e instanceof CheckoutError) {
      if (e.code === 'out_of_stock') return redirect(ctx, `/${ctx.locale}/cart?err=stock&title=${encodeURIComponent(e.detail?.title || '')}`);
      if (e.code === 'cart_empty') return redirect(ctx, `/${ctx.locale}/cart?err=empty`);
      const msg = e.code === 'zone_not_configured' ? ctx.t('zone_not_configured') : e.code === 'payment_method' ? ctx.t('err_payment_method') : e.code === 'coupon' ? ctx.t('err_coupon') : ctx.t('err_generic');
      const errors: Record<string, string> = e.code === 'coupon' ? { coupon: msg } : e.code === 'zone_not_configured' ? { governorate: msg } : {};
      return renderCheckout(ctx, cartId, body, errors, msg, newIdem(), 409);
    }
    throw e;
  }
});

function redirectAny(ctx: Ctx, url: string) {
  // Allows the configured Paymob host in addition to same-site paths
  if (url.startsWith('/') || url.startsWith(env.PAYMOB_API_BASE + '/')) {
    ctx.res.writeHead(303, { Location: url, ...(ctx.setCookies.length ? { 'Set-Cookie': ctx.setCookies } : {}) }); ctx.res.end(); return;
  }
  redirect(ctx, '/');
}

// ---------------------------------------------------------------- orders
async function loadOrderForToken(number: string, token: string | null) {
  const o = await one<any>(db, 'SELECT * FROM orders WHERE number = $1', [number]);
  if (!o || !token) return null;
  const a = Buffer.from(o.public_token); const b = Buffer.from(token);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  return o;
}

route('GET', '/:l/order/:number', async (ctx) => {
  const o = await loadOrderForToken(ctx.params.number, ctx.url.searchParams.get('t'));
  if (!o) throw new HttpError(404, 'order not found');
  const items = await many<any>(db, `SELECT oi.title, oi.unit_price, oi.options, oi.options_total, v.slug FROM order_items oi JOIN product_variants v ON v.id = oi.variant_id WHERE oi.order_id = $1 ORDER BY oi.id`, [o.id]);
  const events = await many<any>(db, `SELECT kind, to_value, body, created_at FROM order_events WHERE order_id = $1 AND NOT internal ORDER BY id`, [o.id]);
  // Purchase analytics fires once per order, and only after a recorded purchase (COD/transfer on placement, card after verified payment)
  const hasPurchase = await one(db, `SELECT 1 FROM analytics_events WHERE name = 'purchase' AND order_id = $1`, [o.id]);
  const fire = hasPurchase ? (await db.query('UPDATE orders SET purchase_event_sent = TRUE WHERE id = $1 AND NOT purchase_event_sent RETURNING id', [o.id])).rows.length > 0 : false;
  const canRetry = ['card', 'wallet'].includes(o.payment_method) && o.status === 'awaiting_payment' && ['pending', 'failed'].includes(o.payment_status)
    && o.reservation_expires_at && new Date(o.reservation_expires_at) > new Date();
  const view: OrderView = {
    id: o.id, number: o.number, status: o.status, payment_status: o.payment_status, payment_method: o.payment_method, total: o.total, subtotal: o.subtotal,
    options_total: o.options_total, discount: o.discount, shipping_fee: o.shipping_fee, created_at: o.created_at, reservation_expires_at: o.reservation_expires_at,
    address: o.address, customer: o.customer_snapshot, items, token: o.public_token, canRetry, firePurchase: fire, events,
  };
  if (wantsJson(ctx)) return sendJson(ctx, { status: o.status, payment_status: o.payment_status });
  sendHtml(ctx, <OrderPage v={await makeView(ctx)} o={view} payError={ctx.url.searchParams.has('payerr')} />);
});

route('POST', '/:l/order/:number/pay', async (ctx) => {
  if (!rateLimit(`pay:${ctx.ip}`, 10)) throw new HttpError(429, 'rate', ctx.t('err_rate'));
  const token = ctx.url.searchParams.get('t');
  const o = await loadOrderForToken(ctx.params.number, token);
  if (!o) throw new HttpError(404, 'order not found');
  const orderUrl = `/${ctx.locale}/order/${o.number}?t=${o.public_token}`;
  if (!(['card', 'wallet'].includes(o.payment_method) && o.status === 'awaiting_payment' && o.payment_status !== 'paid' && new Date(o.reservation_expires_at) > new Date())) return redirect(ctx, orderUrl);
  const pay = await db.tx(async (q) => {
    await q.query('SELECT id FROM orders WHERE id = $1 FOR UPDATE', [o.id]);
    const paid = await one(q, `SELECT 1 FROM payments WHERE order_id = $1 AND status = 'paid'`, [o.id]);
    if (paid) return null;
    await q.query(`UPDATE payments SET status = 'cancelled', updated_at = now() WHERE order_id = $1 AND status = 'pending'`, [o.id]);
    await q.query(`UPDATE orders SET payment_status = 'pending', updated_at = now() WHERE id = $1`, [o.id]);
    return one<any>(q, `INSERT INTO payments(order_id, provider, method, amount, status) VALUES ($1,'paymob',$2,$3,'pending') RETURNING id`, [o.id, o.payment_method, o.total]);
  });
  if (!pay) return redirect(ctx, orderUrl);
  try { const s = await createPaymentSession(pay.id); redirectAny(ctx, s.redirectUrl); }
  catch (e) { console.error(e); redirect(ctx, `${orderUrl}&payerr=1`); }
});

route('GET', '/:l/track', async (ctx) => { sendHtml(ctx, <TrackPage v={await makeView(ctx)} notFound={false} values={{}} />); });
route('POST', '/:l/track', async (ctx) => {
  if (!rateLimit(`track:${ctx.ip}`, 10)) throw new HttpError(429, 'rate', ctx.t('err_rate'));
  const number = String(ctx.body.number || '').trim().toUpperCase(); const phone = normalizePhone(String(ctx.body.phone || ''));
  const o = phone ? await one<any>(db, `SELECT number, public_token FROM orders WHERE number = $1 AND customer_snapshot->>'phone' = $2`, [number, phone]) : null;
  if (!o) return sendHtml(ctx, <TrackPage v={await makeView(ctx)} notFound values={{ number, phone: String(ctx.body.phone || '') }} />, 404);
  redirect(ctx, `/${ctx.locale}/order/${o.number}?t=${o.public_token}`);
});

// ---------------------------------------------------------------- content
route('GET', '/:l/pages/:slug', async (ctx) => {
  const slug = ctx.params.slug as keyof typeof POLICY_TITLES['ar'];
  if (!(slug in POLICY_TITLES.ar)) throw new HttpError(404, 'no page');
  sendHtml(ctx, <PolicyPage v={await makeView(ctx)} slug={slug} />);
});
route('GET', '/:l/faq', async (ctx) => { sendHtml(ctx, <FaqPage v={await makeView(ctx)} />); });
route('GET', '/:l/contact', async (ctx) => { sendHtml(ctx, <ContactPage v={await makeView(ctx)} sent={ctx.url.searchParams.has('sent')} />); });
route('POST', '/:l/contact', async (ctx) => {
  if (!rateLimit(`contact:${ctx.ip}`, 5)) throw new HttpError(429, 'rate', ctx.t('err_rate'));
  if (ctx.body.website) return redirect(ctx, `/${ctx.locale}/contact?sent=1`); // honeypot
  const name = String(ctx.body.name || '').trim().slice(0, 80); const phone = normalizePhone(String(ctx.body.phone || '')); const message = String(ctx.body.message || '').trim().slice(0, 1000);
  if (name.length < 2 || !phone || message.length < 2) throw new HttpError(422, 'invalid', ctx.t('err_phone'));
  await db.query(`INSERT INTO customer_leads(source, name, phone, message, page_url) VALUES ('contact_form',$1,$2,$3,$4)`, [name, phone, message, ctx.req.headers.referer?.slice(0, 300) || null]);
  redirect(ctx, `/${ctx.locale}/contact?sent=1`);
});
route('GET', '/:l/lp/:campaign', async (ctx) => {
  const c = CAMPAIGNS[ctx.params.campaign]; if (!c) throw new HttpError(404, 'no campaign');
  const res = await searchCatalog(filtersFromParams(new URLSearchParams(c.filters)), 48);
  sendHtml(ctx, <LandingPage v={await makeView(ctx)} key_={ctx.params.campaign} items={res.items} />);
});
route('GET', '/:l/brand/:slug', async (ctx) => {
  const res = await searchCatalog({ brand: [ctx.params.slug], in_stock: true }, 48);
  if (!res.items.length) throw new HttpError(404, 'no brand');
  sendHtml(ctx, <LandingPage v={await makeView(ctx)} key_="students" brandSlug={ctx.params.slug} items={res.items} />);
});

// ---------------------------------------------------------------- JSON / fragment APIs
route('GET', '/api/search/suggest', async (ctx) => {
  const q = (ctx.url.searchParams.get('q') || '').slice(0, 120);
  if (q.trim().length < 2) return sendJson(ctx, { items: [], families: [], understood: [] });
  if (!rateLimit(`sugg:${ctx.ip}`, 120)) return sendJson(ctx, { items: [], families: [], understood: [] }, 429);
  const l = ctx.url.searchParams.get('l') === 'en' ? 'en' : 'ar';
  const r = await suggest(q);
  sendJson(ctx, { total: r.total, understood: r.understood, families: r.families,
    items: r.items.map((i) => ({ title: i.title, url: `/${l}/p/${i.slug}`, price: formatEGP(i.price, l), image: i.image, grade: i.grade, available: i.available })) });
});
route('GET', '/api/quick/:slug', async (ctx) => {
  const it = (await loadCatalog()).find((i) => i.slug === ctx.params.slug); if (!it) throw new HttpError(404, 'nf');
  sendText(ctx, renderToStaticMarkup(<QuickView v={await makeView(ctx)} it={it} />), 'text/html; charset=utf-8');
});
route('GET', '/api/cards', async (ctx) => {
  const ids = (ctx.url.searchParams.get('ids') || '').split(',').map(Number).filter((n) => Number.isInteger(n) && n > 0).slice(0, 8);
  const items = (await getItemsByIds(ids)).filter((i) => i.available > 0 || true);
  const v = await makeView(ctx);
  sendText(ctx, items.map((it) => `<div role="listitem">${renderToStaticMarkup(<ProductCard v={v} it={it} list="recently_viewed" />)}</div>`).join(''), 'text/html; charset=utf-8');
});
route('POST', '/api/wishlist', async (ctx) => {
  const id = toInt(ctx.body.id); if (!id) throw new HttpError(400, 'bad id');
  const on = await toggleWishlist(ctx, id);
  sendJson(ctx, { on, count: (await wishlistIds(ctx)).length });
});
route('POST', '/api/compare', async (ctx) => {
  const id = toInt(ctx.body.id); let ids = compareIds(ctx);
  if (ctx.body.clear) ids = [];
  else if (id) {
    if (ids.includes(id)) ids = ids.filter((x) => x !== id);
    else { if (ids.length >= 4) return sendJson(ctx, { ok: false, error: ctx.t('compare_full'), ids }); ids = [...ids, id]; }
  }
  setCompare(ctx, ids);
  sendJson(ctx, { ok: true, ids, on: id ? ids.includes(id) : false, label: ctx.t('compare_bar', { n: ids.length }) });
});
route('GET', '/api/shipping', async (ctx) => {
  const cartId = ctx.url.searchParams.get('cart') || undefined;
  const cart = await getCart(ctx, cartId);
  const merch = cart.subtotal + cart.options_total;
  const coupon = ctx.url.searchParams.get('coupon') || '';
  let discount = 0;
  if (coupon) { const c = await validateCoupon(db, coupon, cart.lines.map((l) => ({ variant_id: l.variant_id, unit_price: l.price + l.options_total, qty: l.qty })), null); if (c.ok) discount = c.discount; }
  const method = ctx.url.searchParams.get('method') === 'pickup' ? 'pickup' : 'delivery';
  const q = await shippingQuote(db, ctx.url.searchParams.get('gov') || '', merch - discount, method, ctx.settings.pickup.enabled);
  const l = ctx.locale;
  sendJson(ctx, {
    ok: q.ok, fee: q.fee, feeText: q.ok ? (q.fee === 0 ? (l === 'ar' ? 'مجاني' : 'Free') : formatEGP(q.fee, l)) : null,
    message: !q.ok ? ctx.t('zone_not_configured') : q.etaMin && q.etaMax ? ctx.t('eta_days', { min: q.etaMin, max: q.etaMax }) : ctx.t('eta_unset'),
    free: q.free, freeThresholdText: q.freeThreshold ? ctx.t('free_shipping_over', { amount: formatEGP(q.freeThreshold, l) }) : null,
    discount, discountText: discount ? `−${formatEGP(discount, l)}` : null, total: merch - discount + (q.ok ? q.fee : 0), totalText: formatEGP(merch - discount + (q.ok ? q.fee : 0), l),
    methods: enabledMethods(ctx.settings, q.ok ? q.codAllowed : true, merch - discount + q.fee),
  });
});
route('POST', '/api/coupon', async (ctx) => {
  if (!rateLimit(`coupon:${ctx.ip}`, 15)) return sendJson(ctx, { ok: false, message: ctx.t('err_rate') }, 429);
  const cart = await getCart(ctx, ctx.body.cart || undefined);
  const r = await validateCoupon(db, String(ctx.body.code || ''), cart.lines.map((l) => ({ variant_id: l.variant_id, unit_price: l.price + l.options_total, qty: l.qty })), null);
  const l = ctx.locale;
  const msg = r.ok ? (l === 'ar' ? `تم تطبيق الخصم: ${formatEGP(r.discount, l)}` : `Discount applied: ${formatEGP(r.discount, l)}`)
    : r.error === 'min_order' ? (l === 'ar' ? `الحد الأدنى للطلب ${formatEGP(r.minOrder!, l)}` : `Minimum order ${formatEGP(r.minOrder!, l)}`) : ctx.t('err_coupon');
  sendJson(ctx, { ok: r.ok, discount: r.discount, message: msg });
});
route('POST', '/api/lead', async (ctx) => {
  if (!rateLimit(`lead:${ctx.ip}`, 20)) return sendJson(ctx, { ok: false }, 429);
  const source = ['whatsapp_product', 'whatsapp_cart', 'whatsapp_general'].includes(ctx.body.source) ? ctx.body.source : 'whatsapp_general';
  const variant = toInt(ctx.body.variant_id);
  const page = String(ctx.body.page || '').slice(0, 300);
  // A WhatsApp click is logged as an (anonymous) sales lead — not an order.
  await db.query('INSERT INTO customer_leads(source, variant_id, page_url) VALUES ($1, $2, $3)', [source, variant && (await one(db, 'SELECT 1 FROM product_variants WHERE id=$1', [variant])) ? variant : null, page]);
  await trackEvent('generate_lead', { visitorId: ctx.visitorId, variantId: variant, payload: { source } });
  sendJson(ctx, { ok: true });
});
const CLIENT_EVENTS = new Set(['view_item_list', 'add_payment_info', 'select_item']);
route('POST', '/api/events', async (ctx) => {
  if (!rateLimit(`ev:${ctx.ip}`, 60) || !CLIENT_EVENTS.has(ctx.body.name)) return sendJson(ctx, { ok: false }, 202);
  await trackEvent(ctx.body.name, { visitorId: ctx.visitorId, variantId: toInt(ctx.body.variant_id), payload: { list: String(ctx.body.list || '').slice(0, 40) } });
  sendJson(ctx, { ok: true });
});

// ---------------------------------------------------------------- payments
route('POST', '/webhooks/paymob', async (ctx) => {
  if (!rateLimit(`wh:${ctx.ip}`, 300)) return sendJson(ctx, { ok: false }, 429);
  const outcome = await handlePaymobCallback(ctx.body, ctx.url.searchParams.get('hmac'));
  if (outcome === 'invalid_signature') return sendJson(ctx, { ok: false, outcome }, 401);
  sendJson(ctx, { ok: true, outcome });
});
route('GET', '/pay/sandbox/:id', async (ctx) => {
  if (env.PAYMOB_MODE !== 'sandbox_mock') throw new HttpError(404, 'disabled');
  const id = toInt(ctx.params.id); const sig = ctx.url.searchParams.get('s');
  if (!id || !mockSignatureValid(id, sig)) throw new HttpError(403, 'bad signature');
  const p = await one<any>(db, 'SELECT p.id, p.amount, p.status, o.number FROM payments p JOIN orders o ON o.id = p.order_id WHERE p.id = $1', [id]);
  if (!p) throw new HttpError(404, 'no payment');
  ctx.locale = 'en';
  sendHtml(ctx, <SandboxPayPage v={await makeView(ctx)} payment={p} sig={sig!} />);
});
route('POST', '/pay/sandbox/:id', async (ctx) => {
  if (env.PAYMOB_MODE !== 'sandbox_mock') throw new HttpError(404, 'disabled');
  const id = toInt(ctx.params.id); const sig = ctx.url.searchParams.get('s');
  if (!id || !mockSignatureValid(id, sig)) throw new HttpError(403, 'bad signature');
  const p = await one<any>(db, 'SELECT p.id, p.amount, o.number, o.public_token, o.locale FROM payments p JOIN orders o ON o.id = p.order_id WHERE p.id = $1', [id]);
  if (!p) throw new HttpError(404, 'no payment');
  const tx = mockTransaction(p, ctx.body.outcome === 'success');
  // Deliver the callback server-to-server, exactly like Paymob would
  await fetch(`http://127.0.0.1:${env.PORT}/webhooks/paymob?hmac=${tx.hmac}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type: tx.type, obj: tx.obj }) });
  redirect(ctx, `/${p.locale}/order/${p.number}?t=${p.public_token}`);
});

// ---------------------------------------------------------------- SEO files
route('GET', '/robots.txt', async (ctx) => {
  const base = env.PUBLIC_BASE_URL.replace(/\/$/, '');
  sendText(ctx, `User-agent: *\nDisallow: /admin\nDisallow: /api/\nDisallow: /pay/\nDisallow: /webhooks/\nDisallow: /*/cart\nDisallow: /*/checkout\nDisallow: /*/order/\nDisallow: /*/compare\nDisallow: /*/wishlist\nAllow: /\n\nSitemap: ${base}/sitemap.xml\n`, 'text/plain; charset=utf-8', 200, { 'Cache-Control': 'public, max-age=3600' });
});
route('GET', '/sitemap.xml', async (ctx) => {
  const base = env.PUBLIC_BASE_URL.replace(/\/$/, '');
  const all = await loadCatalog();
  const paths = ['', '/laptops', '/help-me-choose', '/faq', '/contact', ...USAGES.map((u) => `/laptops?usage=${u}`), ...Object.keys(CAMPAIGNS).map((c) => `/lp/${c}`),
    ...Object.keys(POLICY_TITLES.ar).map((p) => `/pages/${p}`), ...all.map((i) => `/p/${i.slug}`)];
  const esc = (s: string) => s.replace(/&/g, '&amp;');
  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">\n` +
    paths.flatMap((p) => brand.locales.map((l) => `<url><loc>${esc(`${base}/${l}${p}`)}</loc>${brand.locales.map((a) => `<xhtml:link rel="alternate" hreflang="${a === 'ar' ? 'ar-EG' : 'en'}" href="${esc(`${base}/${a}${p}`)}"/>`).join('')}</url>`)).join('\n') + '\n</urlset>';
  sendText(ctx, xml, 'application/xml; charset=utf-8', 200, { 'Cache-Control': 'public, max-age=900' });
});

export async function renderNotFound(ctx: Ctx) {
  sendHtml(ctx, <NotFoundPage v={await makeView(ctx)} />, 404);
}
