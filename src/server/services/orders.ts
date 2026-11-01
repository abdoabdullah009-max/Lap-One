/**
 * Order lifecycle: placement with transactional stock reservation, confirmation, cancellation,
 * returns and reservation expiry. All stock changes happen inside DB transactions with row locks.
 */
import crypto from 'node:crypto';
import { z } from 'zod';
import { db, one, many, type Queryable } from '../db';
import { GOV_CODES, ORDER_TRANSITIONS, type OrderStatus } from '../../config/catalog';
import { brand } from '../../config/brand';
import { toLatinDigits } from '../money';
import { shippingQuote, validateCoupon } from './pricing';
import { invalidateCatalog } from './catalog';
import { audit, trackEvent } from './audit';
import type { Settings } from './settings';
import type { CartView } from './cart';

export const PAYMENT_METHODS = ['cod', 'card', 'wallet', 'transfer'] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export function normalizePhone(raw: string): string | null {
  let p = toLatinDigits(raw || '').replace(/[\s\-()]/g, '');
  p = p.replace(/^(\+20|0020|20)(?=1)/, '0');
  return /^01[0125]\d{8}$/.test(p) ? p : null;
}

export const checkoutSchema = z.object({
  idempotency_key: z.string().regex(/^[A-Za-z0-9_-]{16,64}$/),
  cart_id: z.string().uuid().optional(),
  name: z.string().trim().min(3).max(80),
  phone: z.string().trim().transform((v, c) => { const p = normalizePhone(v); if (!p) { c.addIssue({ code: 'custom', message: 'phone' }); return z.NEVER; } return p; }),
  email: z.string().trim().max(120).email().optional().or(z.literal('').transform(() => undefined)),
  delivery_method: z.enum(['delivery', 'pickup']).default('delivery'),
  governorate: z.string().optional(),
  city: z.string().trim().max(80).optional(),
  street: z.string().trim().max(200).optional(),
  building: z.string().trim().max(120).optional(),
  instructions: z.string().trim().max(300).optional(),
  payment_method: z.enum(PAYMENT_METHODS),
  coupon: z.string().trim().max(40).optional(),
  marketing_consent: z.string().optional(),
  recovery_consent: z.string().optional(),
}).superRefine((v, c) => {
  if (v.delivery_method === 'delivery') {
    if (!v.governorate || !GOV_CODES.includes(v.governorate)) c.addIssue({ code: 'custom', path: ['governorate'], message: 'required' });
    if (!v.city || v.city.length < 2) c.addIssue({ code: 'custom', path: ['city'], message: 'required' });
    if (!v.street || v.street.length < 4) c.addIssue({ code: 'custom', path: ['street'], message: 'required' });
  }
});
export type CheckoutInput = z.infer<typeof checkoutSchema>;

export class CheckoutError extends Error {
  constructor(public code: 'out_of_stock' | 'cart_empty' | 'zone_not_configured' | 'payment_method' | 'coupon' | 'price_changed', public detail?: any) { super(code); }
}

export function enabledMethods(s: Settings, codAllowedInZone = true, total = 0): PaymentMethod[] {
  const m: PaymentMethod[] = [];
  if (s.payments.cod.enabled && codAllowedInZone && (s.payments.cod.max_order === null || total <= s.payments.cod.max_order)) m.push('cod');
  if (s.payments.paymob_card.enabled) m.push('card');
  if (s.payments.paymob_wallet.enabled) m.push('wallet');
  if (s.payments.manual_transfer.enabled) m.push('transfer');
  return m;
}

export interface PlacedOrder { id: number; number: string; public_token: string; payment_id: number; payment_method: PaymentMethod; total: number; existing: boolean }

export async function placeOrder(input: CheckoutInput, cart: CartView, settings: Settings, meta: { visitorId: string; locale: string; ip: string }): Promise<PlacedOrder> {
  // Idempotency: a repeated submit (double click, refresh, network retry) returns the same order.
  const prior = await one<any>(db, `SELECT o.id, o.number, o.public_token, o.payment_method, o.total, p.id AS payment_id FROM orders o
                                    LEFT JOIN LATERAL (SELECT id FROM payments WHERE order_id = o.id ORDER BY id DESC LIMIT 1) p ON TRUE
                                    WHERE o.idempotency_key = $1`, [input.idempotency_key]);
  if (prior) return { ...prior, existing: true };
  if (!cart.id || !cart.lines.length) throw new CheckoutError('cart_empty');

  try {
    return await db.tx(async (q) => {
      // Re-read authoritative prices & options inside the transaction
      const variantIds = cart.lines.map((l) => l.variant_id);
      const vrows = await many<any>(q, 'SELECT id, title, price, published, archived FROM product_variants WHERE id = ANY($1::int[]) FOR SHARE', [variantIds]);
      const vmap = new Map(vrows.map((v) => [v.id, v]));
      const optIds = cart.lines.flatMap((l) => l.option_ids);
      const orows = optIds.length ? await many<any>(q, 'SELECT id, variant_id, label_ar, label_en, price FROM upgrade_options WHERE id = ANY($1::int[]) AND active', [optIds]) : [];

      const lines = cart.lines.map((l) => {
        const v = vmap.get(l.variant_id);
        if (!v || !v.published || v.archived) throw new CheckoutError('out_of_stock', { title: l.title, lineId: l.id });
        const options = orows.filter((o) => o.variant_id === l.variant_id && l.option_ids.includes(o.id));
        const options_total = options.reduce((s, o) => s + o.price, 0);
        return { ...l, title: v.title, price: v.price, options, options_total };
      });
      const subtotal = lines.reduce((s, l) => s + l.price * l.qty, 0);
      const optionsTotal = lines.reduce((s, l) => s + l.options_total * l.qty, 0);
      const merch = subtotal + optionsTotal;

      let discount = 0; let couponId: number | null = null; let couponCode: string | null = null;
      if (input.coupon) {
        const c = await validateCoupon(q, input.coupon, lines.map((l) => ({ variant_id: l.variant_id, unit_price: l.price + l.options_total, qty: l.qty })), input.phone);
        if (!c.ok) throw new CheckoutError('coupon', c.error);
        discount = c.discount; couponId = c.couponId!; couponCode = c.code!;
        const upd = await q.query('UPDATE coupons SET used_count = used_count + 1 WHERE id = $1 AND (max_uses IS NULL OR used_count < max_uses) RETURNING id', [couponId]);
        if (!upd.rows.length) throw new CheckoutError('coupon', 'exhausted');
      }

      const ship = await shippingQuote(q, input.governorate || '', merch - discount, input.delivery_method, settings.pickup.enabled);
      if (!ship.ok) throw new CheckoutError('zone_not_configured');
      const total = merch - discount + ship.fee;
      if (!enabledMethods(settings, ship.codAllowed, total).includes(input.payment_method)) throw new CheckoutError('payment_method');

      // Customer (upsert by phone). Marketing consent is only recorded when explicitly given.
      const consent = input.marketing_consent === 'on' || input.marketing_consent === '1';
      const customer = await one<any>(q, `INSERT INTO customers(name, phone, email, marketing_consent, consent_at, source)
          VALUES ($1,$2,$3,$4, CASE WHEN $4 THEN now() END, 'web')
          ON CONFLICT (phone) DO UPDATE SET name = EXCLUDED.name, email = COALESCE(EXCLUDED.email, customers.email),
            marketing_consent = customers.marketing_consent OR EXCLUDED.marketing_consent,
            consent_at = CASE WHEN EXCLUDED.marketing_consent AND NOT customers.marketing_consent THEN now() ELSE customers.consent_at END
          RETURNING id`, [input.name, input.phone, input.email ?? null, consent]);
      const address = input.delivery_method === 'delivery'
        ? { governorate: input.governorate, city: input.city, street: input.street, building: input.building || null, instructions: input.instructions || null }
        : { pickup: true, instructions: input.instructions || null };
      if (input.delivery_method === 'delivery') {
        await q.query('INSERT INTO addresses(customer_id, governorate_code, city, street, building, instructions) VALUES ($1,$2,$3,$4,$5,$6)',
          [customer.id, input.governorate, input.city, input.street, input.building || null, input.instructions || null]);
      }

      const pm = input.payment_method;
      const status: OrderStatus = pm === 'cod' ? 'pending' : 'awaiting_payment';
      const paymentStatus = pm === 'cod' ? 'unpaid' : pm === 'transfer' ? 'awaiting_transfer' : 'pending';
      const holdMinutes = pm === 'cod' ? settings.reservation.cod_hours * 60 : pm === 'transfer' ? settings.reservation.manual_transfer_hours * 60 : settings.reservation.online_minutes;

      const order = await one<any>(q, `INSERT INTO orders(number, public_token, idempotency_key, customer_id, status, payment_status, payment_method,
            subtotal, options_total, discount, shipping_fee, total, coupon_id, coupon_code, shipping_zone_id, delivery_method, address,
            customer_snapshot, customer_notes, locale, cart_id, reservation_expires_at)
          VALUES ($1 || nextval('order_number_seq'), $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21,
                  now() + ($22 || ' minutes')::interval)
          RETURNING id, number, public_token, reservation_expires_at`,
        [brand.orderPrefix, crypto.randomBytes(18).toString('base64url'), input.idempotency_key, customer.id, status, paymentStatus, pm,
          subtotal, optionsTotal, discount, ship.fee, total, couponId, couponCode, ship.zoneId, input.delivery_method, JSON.stringify(address),
          JSON.stringify({ name: input.name, phone: input.phone, email: input.email ?? null }), input.instructions || null, meta.locale, cart.id, String(holdMinutes)]);

      // Reserve physical units. FOR UPDATE SKIP LOCKED means two concurrent checkouts can never grab the same unit;
      // the partial unique index on stock_reservations is a second, DB-level guard.
      for (const l of lines) {
        const units = await many<any>(q, `SELECT id, purchase_cost FROM inventory_units WHERE variant_id = $1 AND status = 'available'
                                          ORDER BY battery_health_pct DESC NULLS LAST, id LIMIT $2 FOR UPDATE SKIP LOCKED`, [l.variant_id, l.qty]);
        if (units.length < l.qty) throw new CheckoutError('out_of_stock', { title: l.title, lineId: l.id });
        for (const u of units) {
          await q.query(`INSERT INTO order_items(order_id, variant_id, unit_id, title, unit_price, options, options_total, line_total, unit_cost)
                         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
            [order.id, l.variant_id, u.id, l.title, l.price, JSON.stringify(l.options), l.options_total, l.price + l.options_total, u.purchase_cost]);
          await q.query(`UPDATE inventory_units SET status = 'reserved', updated_at = now() WHERE id = $1`, [u.id]);
          await q.query(`INSERT INTO inventory_movements(unit_id, from_status, to_status, reason, order_id) VALUES ($1,'available','reserved','order placed',$2)`, [u.id, order.id]);
          await q.query(`INSERT INTO stock_reservations(unit_id, order_id, status, expires_at) VALUES ($1,$2,'active',$3)`, [u.id, order.id, order.reservation_expires_at]);
        }
      }
      if (couponId) await q.query('INSERT INTO coupon_redemptions(coupon_id, order_id, phone, amount) VALUES ($1,$2,$3,$4)', [couponId, order.id, input.phone, discount]);

      const provider = pm === 'cod' ? 'cod' : pm === 'transfer' ? 'manual_transfer' : 'paymob';
      const payment = await one<any>(q, `INSERT INTO payments(order_id, provider, method, amount, status) VALUES ($1,$2,$3,$4,'pending') RETURNING id`,
        [order.id, provider, pm === 'transfer' ? 'instapay' : pm, total]);
      await q.query(`UPDATE carts SET converted_order_id = $2, updated_at = now() WHERE id = $1`, [cart.id, order.id]);
      await q.query(`INSERT INTO order_events(order_id, kind, to_value, body, internal) VALUES ($1,'status_change',$2,'Order placed on website',FALSE)`, [order.id, status]);
      return { id: order.id, number: order.number, public_token: order.public_token, payment_id: payment.id, payment_method: pm, total, existing: false };
    });
  } catch (e: any) {
    if (e?.code === '23505' && String(e.constraint || '').includes('idempotency')) {
      const again = await one<any>(db, `SELECT o.id, o.number, o.public_token, o.payment_method, o.total,
          (SELECT id FROM payments WHERE order_id = o.id ORDER BY id DESC LIMIT 1) AS payment_id FROM orders o WHERE idempotency_key = $1`, [input.idempotency_key]);
      if (again) return { ...again, existing: true };
    }
    throw e;
  } finally {
    invalidateCatalog();
  }
}

/** After a placed order: analytics purchase event (deduped by a unique index) for COD/transfer orders. */
export async function afterPlaced(o: PlacedOrder, visitorId: string) {
  if (o.existing) return;
  if (o.payment_method === 'cod' || o.payment_method === 'transfer') await trackEvent('purchase', { visitorId, orderId: o.id, value: o.total });
}

// ---- state transitions -------------------------------------------------------------------------

async function lockOrder(q: Queryable, orderId: number) {
  return one<any>(q, 'SELECT * FROM orders WHERE id = $1 FOR UPDATE', [orderId]);
}

/** Converts active reservations into sold units. Used by payment success and by staff confirming a COD order. */
export async function confirmOrder(q: Queryable, orderId: number, userId: number | null, reason: string): Promise<'confirmed' | 'already' | 'stock_lost'> {
  const o = await lockOrder(q, orderId);
  if (!o) throw new Error('order not found');
  if (['confirmed', 'preparing', 'shipped', 'delivered'].includes(o.status)) return 'already';
  let units = await many<any>(q, `SELECT r.id, r.unit_id, r.status FROM stock_reservations r WHERE r.order_id = $1`, [orderId]);
  const active = units.filter((u) => u.status === 'active');
  if (o.status === 'cancelled' || active.length === 0) {
    // Late confirmation (e.g. payment arrived after the reservation expired): try to re-take the same units.
    const items = await many<any>(q, 'SELECT unit_id FROM order_items WHERE order_id = $1', [orderId]);
    const free = await many<any>(q, `SELECT id FROM inventory_units WHERE id = ANY($1::int[]) AND status = 'available' FOR UPDATE`, [items.map((i) => i.unit_id)]);
    if (free.length !== items.length) {
      await q.query(`INSERT INTO order_events(order_id, kind, body) VALUES ($1,'alert','Payment/confirmation received but reserved units were released and are no longer all available. Manual action required (refund or substitute).')`, [orderId]);
      return 'stock_lost';
    }
    for (const u of free) await q.query(`INSERT INTO stock_reservations(unit_id, order_id, status, expires_at) VALUES ($1,$2,'active', now())`, [u.id, orderId]);
    units = await many<any>(q, `SELECT id, unit_id, status FROM stock_reservations WHERE order_id = $1 AND status = 'active'`, [orderId]);
  }
  for (const r of units.filter((u) => u.status === 'active')) {
    await q.query(`UPDATE stock_reservations SET status = 'converted', updated_at = now() WHERE id = $1`, [r.id]);
    const prev = await one<any>(q, 'SELECT status FROM inventory_units WHERE id = $1 FOR UPDATE', [r.unit_id]);
    await q.query(`UPDATE inventory_units SET status = 'sold', updated_at = now() WHERE id = $1`, [r.unit_id]);
    await q.query(`INSERT INTO inventory_movements(unit_id, from_status, to_status, reason, order_id, user_id) VALUES ($1,$2,'sold',$3,$4,$5)`,
      [r.unit_id, prev.status, reason, orderId, userId]);
  }
  await q.query(`UPDATE orders SET status = 'confirmed', cancel_reason = NULL, updated_at = now() WHERE id = $1`, [orderId]);
  await q.query(`INSERT INTO order_events(order_id, kind, from_value, to_value, body, user_id, internal) VALUES ($1,'status_change',$2,'confirmed',$3,$4,FALSE)`,
    [orderId, o.status, reason, userId]);
  return 'confirmed';
}

/** Cancels an order and returns its units to stock (unless already shipped). */
export async function cancelOrder(q: Queryable, orderId: number, userId: number | null, reason: string) {
  const o = await lockOrder(q, orderId);
  if (!o || o.status === 'cancelled') return false;
  if (['shipped', 'delivered', 'returned', 'refunded'].includes(o.status)) throw new Error('Cannot cancel a shipped order — use a return instead');
  const items = await many<any>(q, 'SELECT unit_id FROM order_items WHERE order_id = $1 AND unit_id IS NOT NULL', [orderId]);
  for (const it of items) {
    const u = await one<any>(q, 'SELECT status FROM inventory_units WHERE id = $1 FOR UPDATE', [it.unit_id]);
    const ownedByThisOrder = await one(q, `SELECT 1 FROM stock_reservations WHERE unit_id = $1 AND order_id = $2 AND status IN ('active','converted')`, [it.unit_id, orderId]);
    if (u && ownedByThisOrder && (u.status === 'reserved' || u.status === 'sold')) {
      await q.query(`UPDATE inventory_units SET status = 'available', updated_at = now() WHERE id = $1`, [it.unit_id]);
      await q.query(`INSERT INTO inventory_movements(unit_id, from_status, to_status, reason, order_id, user_id) VALUES ($1,$2,'available',$3,$4,$5)`,
        [it.unit_id, u.status, `order cancelled: ${reason}`, orderId, userId]);
    }
  }
  await q.query(`UPDATE stock_reservations SET status = 'released', released_reason = $2, updated_at = now() WHERE order_id = $1 AND status IN ('active','converted')`, [orderId, reason]);
  await q.query(`UPDATE payments SET status = 'cancelled', updated_at = now() WHERE order_id = $1 AND status = 'pending'`, [orderId]);
  if (o.coupon_id) await q.query('UPDATE coupons SET used_count = GREATEST(used_count - 1, 0) WHERE id = $1', [o.coupon_id]);
  await q.query(`UPDATE orders SET status = 'cancelled', cancel_reason = $2, updated_at = now() WHERE id = $1`, [orderId, reason]);
  await q.query(`INSERT INTO order_events(order_id, kind, from_value, to_value, body, user_id, internal) VALUES ($1,'status_change',$2,'cancelled',$3,$4,FALSE)`, [orderId, o.status, reason, userId]);
  if (userId) await audit(q, userId, 'order.cancel', 'order', orderId, { status: o.status }, { status: 'cancelled', reason });
  return true;
}

/** Staff status change with transition rules. Confirm/cancel route through the dedicated functions. */
export async function changeOrderStatus(orderId: number, to: OrderStatus, userId: number, note?: string) {
  return db.tx(async (q) => {
    const o = await lockOrder(q, orderId);
    if (!o) throw new Error('not found');
    if (!ORDER_TRANSITIONS[o.status as OrderStatus].includes(to)) throw new Error(`Transition ${o.status} → ${to} not allowed`);
    if (to === 'confirmed') { const r = await confirmOrder(q, orderId, userId, note || 'confirmed by staff'); if (r === 'stock_lost') throw new Error('Units no longer available'); }
    else if (to === 'cancelled') await cancelOrder(q, orderId, userId, note || 'cancelled by staff');
    else {
      await q.query('UPDATE orders SET status = $2, updated_at = now() WHERE id = $1', [orderId, to]);
      await q.query(`INSERT INTO order_events(order_id, kind, from_value, to_value, body, user_id, internal) VALUES ($1,'status_change',$2,$3,$4,$5,FALSE)`, [orderId, o.status, to, note || null, userId]);
      if (to === 'shipped') await q.query(`UPDATE shipments SET status = 'shipped', shipped_at = COALESCE(shipped_at, now()) WHERE order_id = $1`, [orderId]);
      if (to === 'delivered') {
        await q.query(`UPDATE shipments SET status = 'delivered', delivered_at = now() WHERE order_id = $1`, [orderId]);
        if (o.payment_method === 'cod') {
          // Cash collected on delivery: record it so revenue reports reflect actual payment
          await q.query(`UPDATE payments SET status = 'paid', paid_at = now(), recorded_by = $2, updated_at = now() WHERE order_id = $1 AND provider = 'cod' AND status = 'pending'`, [orderId, userId]);
          await q.query(`UPDATE orders SET payment_status = 'paid' WHERE id = $1`, [orderId]);
        }
      }
      if (to === 'returned') {
        const items = await many<any>(q, 'SELECT unit_id FROM order_items WHERE order_id = $1', [orderId]);
        for (const it of items) {
          await q.query(`UPDATE inventory_units SET status = 'returned', updated_at = now() WHERE id = $1`, [it.unit_id]);
          await q.query(`INSERT INTO inventory_movements(unit_id, from_status, to_status, reason, order_id, user_id) VALUES ($1,'sold','returned','order returned',$2,$3)`, [it.unit_id, orderId, userId]);
        }
      }
      if (to === 'refunded') {
        await q.query(`UPDATE payments SET status = 'refunded', updated_at = now() WHERE order_id = $1 AND status = 'paid'`, [orderId]);
        await q.query(`UPDATE orders SET payment_status = 'refunded' WHERE id = $1`, [orderId]);
      }
    }
    await audit(q, userId, 'order.status_change', 'order', orderId, { status: o.status }, { status: to, note: note || null });
    invalidateCatalog();
  });
}

/** Releases expired reservations and cancels unpaid orders. Runs every minute. */
export async function expireReservations(): Promise<number> {
  const due = await many<any>(db, `SELECT DISTINCT r.order_id FROM stock_reservations r WHERE r.status = 'active' AND r.expires_at < now() LIMIT 200`);
  let n = 0;
  for (const { order_id } of due) {
    await db.tx(async (q) => {
      const o = await one<any>(q, 'SELECT id, status, payment_status FROM orders WHERE id = $1 FOR UPDATE SKIP LOCKED', [order_id]);
      if (!o) return; // being processed (e.g. a payment webhook) — try next run
      if (o.payment_status === 'paid' || !['pending', 'awaiting_payment'].includes(o.status)) {
        await q.query(`UPDATE stock_reservations SET status = 'converted', updated_at = now() WHERE order_id = $1 AND status = 'active'`, [order_id]);
        return;
      }
      await cancelOrder(q, order_id, null, 'reservation_expired');
      n++;
    });
  }
  if (n) invalidateCatalog();
  return n;
}
