/** Shipping quotes and coupon validation — always computed on the server. */
import { one, many, type Queryable } from '../db';
import { percentOf } from '../money';

export interface ShippingQuote { ok: boolean; zoneId: number | null; fee: number; free: boolean; etaMin: number | null; etaMax: number | null; codAllowed: boolean; freeThreshold: number | null; reason?: 'not_configured' }

export async function shippingQuote(q: Queryable, governorate: string, merchandiseTotal: number, method: 'delivery' | 'pickup', pickupEnabled: boolean): Promise<ShippingQuote> {
  if (method === 'pickup') {
    return pickupEnabled ? { ok: true, zoneId: null, fee: 0, free: true, etaMin: null, etaMax: null, codAllowed: true, freeThreshold: null }
      : { ok: false, zoneId: null, fee: 0, free: false, etaMin: null, etaMax: null, codAllowed: false, freeThreshold: null, reason: 'not_configured' };
  }
  const z = await one<any>(q, `SELECT id, fee, free_threshold, eta_min_days, eta_max_days, cod_allowed FROM shipping_zones
                               WHERE active AND $1 = ANY(governorates) ORDER BY sort, id LIMIT 1`, [governorate]);
  if (!z || z.fee === null) return { ok: false, zoneId: z?.id ?? null, fee: 0, free: false, etaMin: null, etaMax: null, codAllowed: false, freeThreshold: null, reason: 'not_configured' };
  const free = z.free_threshold !== null && merchandiseTotal >= z.free_threshold;
  return { ok: true, zoneId: z.id, fee: free ? 0 : z.fee, free, etaMin: z.eta_min_days, etaMax: z.eta_max_days, codAllowed: z.cod_allowed, freeThreshold: z.free_threshold };
}

export interface CouponLine { variant_id: number; unit_price: number; qty: number }
export interface CouponResult { ok: boolean; couponId?: number; code?: string; discount: number; error?: 'invalid' | 'expired' | 'min_order' | 'exhausted' | 'not_applicable' | 'phone_limit'; minOrder?: number }

export async function validateCoupon(q: Queryable, rawCode: string, lines: CouponLine[], phone: string | null): Promise<CouponResult> {
  const code = rawCode.trim().toUpperCase().slice(0, 40);
  if (!code) return { ok: false, discount: 0, error: 'invalid' };
  const c = await one<any>(q, 'SELECT * FROM coupons WHERE code = $1 AND active', [code]);
  if (!c) return { ok: false, discount: 0, error: 'invalid' };
  const now = new Date();
  if ((c.starts_at && new Date(c.starts_at) > now) || (c.ends_at && new Date(c.ends_at) < now)) return { ok: false, discount: 0, error: 'expired' };
  if (c.max_uses !== null && c.used_count >= c.max_uses) return { ok: false, discount: 0, error: 'exhausted' };
  const merch = lines.reduce((s, l) => s + l.unit_price * l.qty, 0);
  if (c.min_order !== null && merch < c.min_order) return { ok: false, discount: 0, error: 'min_order', minOrder: c.min_order };
  const eligible = lines.filter((l) => !c.variant_ids.length || c.variant_ids.includes(l.variant_id)).reduce((s, l) => s + l.unit_price * l.qty, 0);
  if (!eligible) return { ok: false, discount: 0, error: 'not_applicable' };
  if (phone && c.per_phone_limit) {
    const used = await one<any>(q, `SELECT count(*)::int AS n FROM coupon_redemptions r JOIN orders o ON o.id = r.order_id
                                    WHERE r.coupon_id = $1 AND r.phone = $2 AND o.status <> 'cancelled'`, [c.id, phone]);
    if (used.n >= c.per_phone_limit) return { ok: false, discount: 0, error: 'phone_limit' };
  }
  let discount = c.kind === 'percent' ? percentOf(eligible, Math.min(c.value, 100)) : Math.min(c.value, eligible);
  if (c.max_discount !== null) discount = Math.min(discount, c.max_discount);
  return { ok: true, couponId: c.id, code, discount };
}

export async function listZones(q: Queryable) {
  return many<any>(q, 'SELECT * FROM shipping_zones ORDER BY sort, id');
}
