/**
 * Integration tests against a real PostgreSQL database (use a dedicated test DB):
 *   DATABASE_URL=postgres://.../lapone_test node dist/seed.js --reset && DATABASE_URL=... node --test dist/tests/
 */
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { db, one, many } from '../../src/server/db';
import { createBuyNowCart, getCart } from '../../src/server/services/cart';
import { placeOrder, cancelOrder, expireReservations, changeOrderStatus, CheckoutError, type CheckoutInput } from '../../src/server/services/orders';
import { getSettings } from '../../src/server/services/settings';
import { handlePaymobCallback, mockTransaction } from '../../src/server/services/payments/paymob';
import { invalidateCatalog } from '../../src/server/services/catalog';

if (!process.env.DATABASE_URL?.includes('test')) { console.error('Refusing to run integration tests on a non-test database'); process.exit(1); }

const fakeCtx = () => ({ cookies: {}, visitorId: crypto.randomBytes(12).toString('base64url'), setCookies: [] } as any);
const input = (over: Partial<CheckoutInput> = {}): CheckoutInput => ({
  idempotency_key: crypto.randomBytes(16).toString('base64url'), name: 'Test Customer', phone: '010' + String(Math.floor(Math.random() * 1e8)).padStart(8, '0'),
  delivery_method: 'delivery', governorate: 'CAI', city: 'Nasr City', street: '12 Test Street', payment_method: 'cod', ...over,
} as CheckoutInput);
async function uniqueAvailableVariant() {
  invalidateCatalog();
  return one<any>(db, `SELECT v.id, v.title FROM product_variants v WHERE v.inventory_mode = 'unique' AND v.published
     AND (SELECT count(*) FROM inventory_units u WHERE u.variant_id = v.id AND u.status = 'available') = 1 ORDER BY v.id LIMIT 1`);
}
async function batchVariant(minAvail = 3) {
  return one<any>(db, `SELECT v.id FROM product_variants v WHERE v.inventory_mode = 'batch' AND v.published
     AND (SELECT count(*) FROM inventory_units u WHERE u.variant_id = v.id AND u.status = 'available') >= $1 ORDER BY v.id LIMIT 1`, [minAvail]);
}
async function cartFor(variantId: number) { const ctx = fakeCtx(); const r = await createBuyNowCart(ctx, variantId, []); assert.ok(r.id, r.error ?? "no cart"); return { ctx, cart: await getCart(ctx, r.id) }; }
const settings = async () => { const s = structuredClone(await getSettings()); s.payments.paymob_card.enabled = true; s.payments.manual_transfer.enabled = true; return s; };

after(async () => { await db.end(); });

test('a unique unit cannot be sold twice under concurrent checkouts', async () => {
  const v = await uniqueAvailableVariant(); assert.ok(v, 'need a unique in-stock variant');
  const a = await cartFor(v.id); const b = await cartFor(v.id);
  const s = await settings();
  const results = await Promise.allSettled([placeOrder(input(), a.cart, s, { visitorId: a.ctx.visitorId, locale: 'ar', ip: '1' }), placeOrder(input(), b.cart, s, { visitorId: b.ctx.visitorId, locale: 'ar', ip: '1' })]);
  const ok = results.filter((r) => r.status === 'fulfilled'); const failed = results.filter((r) => r.status === 'rejected') as PromiseRejectedResult[];
  assert.equal(ok.length, 1, 'exactly one order succeeds');
  assert.equal(failed.length, 1); assert.ok(failed[0].reason instanceof CheckoutError && failed[0].reason.code === 'out_of_stock');
  const units = await many<any>(db, `SELECT status FROM inventory_units WHERE variant_id = $1`, [v.id]);
  assert.deepEqual(units.map((u) => u.status), ['reserved']);
  const order = (ok[0] as PromiseFulfilledResult<any>).value;
  await db.tx((q) => cancelOrder(q, order.id, null, 'test cleanup'));
  assert.equal((await one<any>(db, 'SELECT status FROM inventory_units WHERE variant_id = $1', [v.id])).status, 'available', 'cancel returns unit to stock');
});

test('idempotency: the same submission twice returns the same order', async () => {
  const v = await batchVariant(); const { ctx, cart } = await cartFor(v.id); const s = await settings();
  const inp = input();
  const [o1, o2] = await Promise.all([placeOrder(inp, cart, s, { visitorId: ctx.visitorId, locale: 'ar', ip: '1' }), placeOrder(inp, cart, s, { visitorId: ctx.visitorId, locale: 'ar', ip: '1' })]);
  assert.equal(o1.number, o2.number);
  const o3 = await placeOrder(inp, cart, s, { visitorId: ctx.visitorId, locale: 'ar', ip: '1' });
  assert.equal(o3.number, o1.number); assert.equal(o3.existing, true);
  const n = await one<any>(db, 'SELECT count(*)::int AS n FROM orders WHERE idempotency_key = $1', [inp.idempotency_key]); assert.equal(n.n, 1);
  await db.tx((q) => cancelOrder(q, o1.id, null, 'test cleanup'));
});

test('server recalculates totals: price, upgrades, shipping, coupon', async () => {
  const v = await one<any>(db, `SELECT v.id, v.price FROM product_variants v WHERE EXISTS (SELECT 1 FROM upgrade_options o WHERE o.variant_id = v.id AND o.active)
     AND (SELECT count(*) FROM inventory_units u WHERE u.variant_id = v.id AND u.status = 'available') > 0 ORDER BY v.price DESC LIMIT 1`);
  const opt = await one<any>(db, 'SELECT id, price FROM upgrade_options WHERE variant_id = $1 AND active ORDER BY id LIMIT 1', [v.id]);
  const ctx = fakeCtx(); const r = await createBuyNowCart(ctx, v.id, [opt.id, 999999]);  // bogus option id must be ignored
  const cart = await getCart(ctx, r.id); assert.deepEqual(cart.lines[0].option_ids, [opt.id]);
  const zone = await one<any>(db, `SELECT fee, free_threshold FROM shipping_zones WHERE 'CAI' = ANY(governorates)`);
  const o = await placeOrder(input({ coupon: 'DEMO5' }), cart, await settings(), { visitorId: ctx.visitorId, locale: 'ar', ip: '1' });
  const row = await one<any>(db, 'SELECT * FROM orders WHERE id = $1', [o.id]);
  const merch = v.price + opt.price; const discount = Math.floor(merch * 5 / 100);
  const ship = zone.free_threshold !== null && merch - discount >= zone.free_threshold ? 0 : zone.fee;
  assert.equal(row.discount, discount); assert.equal(row.shipping_fee, ship); assert.equal(row.total, merch - discount + ship);
  await db.tx((q) => cancelOrder(q, o.id, null, 'test cleanup'));
});

test('unconfigured governorate is rejected instead of inventing a fee', async () => {
  const v = await batchVariant(); const { ctx, cart } = await cartFor(v.id);
  await assert.rejects(placeOrder(input({ governorate: 'WAD' }), cart, await settings(), { visitorId: ctx.visitorId, locale: 'ar', ip: '1' }), (e: any) => e.code === 'zone_not_configured');
});

test('Paymob callback: invalid signature rejected, success confirms once, replay ignored, amount mismatch flagged', async () => {
  const v = await batchVariant(); const { ctx, cart } = await cartFor(v.id);
  const o = await placeOrder(input({ payment_method: 'card' }), cart, await settings(), { visitorId: ctx.visitorId, locale: 'en', ip: '1' });
  let row = await one<any>(db, 'SELECT status, payment_status FROM orders WHERE id = $1', [o.id]);
  assert.equal(row.status, 'awaiting_payment'); assert.equal(row.payment_status, 'pending');
  const p = { id: o.payment_id, amount: o.total, number: o.number };
  const forged = mockTransaction(p, true);
  assert.equal(await handlePaymobCallback({ type: 'TRANSACTION', obj: forged.obj }, 'a'.repeat(128)), 'invalid_signature');
  row = await one<any>(db, 'SELECT payment_status FROM orders WHERE id = $1', [o.id]); assert.equal(row.payment_status, 'pending', 'forged callback changes nothing');
  const bad = mockTransaction({ ...p, amount: p.amount - 100 }, true);
  assert.equal(await handlePaymobCallback({ type: 'TRANSACTION', obj: bad.obj }, bad.hmac), 'amount_mismatch');
  const good = mockTransaction(p, true);
  assert.equal(await handlePaymobCallback({ type: 'TRANSACTION', obj: good.obj }, good.hmac), 'paid');
  assert.equal(await handlePaymobCallback({ type: 'TRANSACTION', obj: good.obj }, good.hmac), 'duplicate');
  row = await one<any>(db, 'SELECT status, payment_status FROM orders WHERE id = $1', [o.id]);
  assert.equal(row.status, 'confirmed'); assert.equal(row.payment_status, 'paid');
  const units = await many<any>(db, 'SELECT u.status FROM order_items oi JOIN inventory_units u ON u.id = oi.unit_id WHERE oi.order_id = $1', [o.id]);
  assert.ok(units.every((u) => u.status === 'sold'));
  const purchases = await one<any>(db, `SELECT count(*)::int AS n FROM analytics_events WHERE name = 'purchase' AND order_id = $1`, [o.id]); assert.equal(purchases.n, 1);
  // cleanup: return the units
  await db.query(`UPDATE inventory_units SET status = 'available' WHERE id IN (SELECT unit_id FROM order_items WHERE order_id = $1)`, [o.id]);
});

test('failed card payment does not confirm; units stay reserved until expiry, then are released', async () => {
  const v = await batchVariant(); const { ctx, cart } = await cartFor(v.id);
  const o = await placeOrder(input({ payment_method: 'card' }), cart, await settings(), { visitorId: ctx.visitorId, locale: 'en', ip: '1' });
  const fail = mockTransaction({ id: o.payment_id, amount: o.total, number: o.number }, false);
  assert.equal(await handlePaymobCallback({ type: 'TRANSACTION', obj: fail.obj }, fail.hmac), 'failed');
  let row = await one<any>(db, 'SELECT status, payment_status FROM orders WHERE id = $1', [o.id]);
  assert.equal(row.status, 'awaiting_payment'); assert.equal(row.payment_status, 'failed');
  await db.query(`UPDATE stock_reservations SET expires_at = now() - interval '1 minute' WHERE order_id = $1`, [o.id]);
  assert.ok((await expireReservations()) >= 1);
  row = await one<any>(db, 'SELECT status, cancel_reason FROM orders WHERE id = $1', [o.id]);
  assert.equal(row.status, 'cancelled'); assert.equal(row.cancel_reason, 'reservation_expired');
  const units = await many<any>(db, 'SELECT u.status FROM order_items oi JOIN inventory_units u ON u.id = oi.unit_id WHERE oi.order_id = $1', [o.id]);
  assert.ok(units.every((u) => u.status === 'available'));
});

test('order status transitions are enforced and COD delivery records payment', async () => {
  const v = await batchVariant(); const { ctx, cart } = await cartFor(v.id);
  const o = await placeOrder(input(), cart, await settings(), { visitorId: ctx.visitorId, locale: 'ar', ip: '1' });
  const admin = await one<any>(db, `SELECT id FROM users WHERE role_key = 'super_admin' LIMIT 1`);
  await assert.rejects(changeOrderStatus(o.id, 'shipped', admin.id), /not allowed/);
  await changeOrderStatus(o.id, 'confirmed', admin.id); await changeOrderStatus(o.id, 'preparing', admin.id);
  await changeOrderStatus(o.id, 'shipped', admin.id); await changeOrderStatus(o.id, 'delivered', admin.id);
  const row = await one<any>(db, 'SELECT status, payment_status FROM orders WHERE id = $1', [o.id]);
  assert.equal(row.status, 'delivered'); assert.equal(row.payment_status, 'paid');
  await assert.rejects(db.tx((q) => cancelOrder(q, o.id, admin.id, 'x')), /shipped/);
  const logs = await one<any>(db, `SELECT count(*)::int AS n FROM audit_logs WHERE entity = 'order' AND entity_id = $1`, [String(o.id)]); assert.ok(logs.n >= 4);
});

test('coupon usage limit holds under concurrency', async () => {
  await db.query(`INSERT INTO coupons(code, kind, value, max_uses) VALUES ('ONCE', 'fixed', 10000, 1) ON CONFLICT (code) DO UPDATE SET used_count = 0, max_uses = 1, active = TRUE`);
  const v = await batchVariant(4); const a = await cartFor(v.id); const b = await cartFor(v.id); const s = await settings();
  const r = await Promise.allSettled([placeOrder(input({ coupon: 'ONCE' }), a.cart, s, { visitorId: a.ctx.visitorId, locale: 'ar', ip: '1' }), placeOrder(input({ coupon: 'ONCE' }), b.cart, s, { visitorId: b.ctx.visitorId, locale: 'ar', ip: '1' })]);
  assert.equal(r.filter((x) => x.status === 'fulfilled').length, 1);
  for (const x of r) if (x.status === 'fulfilled') await db.tx((q) => cancelOrder(q, x.value.id, null, 'cleanup'));
});
