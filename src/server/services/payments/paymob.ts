/**
 * Paymob adapter (Intention API + Unified Checkout).
 *
 * Modes (PAYMOB_MODE):
 *  - sandbox_mock: no Paymob account needed. Redirects to a local simulated hosted-checkout page which
 *    sends a Paymob-shaped TRANSACTION callback, signed with PAYMOB_HMAC_SECRET, to our real webhook.
 *    This exercises exactly the same verification and order-confirmation code as production.
 *  - test / live: calls Paymob's API with your keys.
 *
 * Card data never touches this server: customers pay on Paymob's hosted page.
 * The order is only marked paid from an HMAC-verified server-to-server callback — never from the
 * customer's browser redirect.
 */
import crypto from 'node:crypto';
import { env } from '../../env';
import { db, one, type Queryable } from '../../db';
import { confirmOrder } from '../orders';
import { trackEvent } from '../audit';
import { invalidateCatalog } from '../catalog';

// Field order defined by Paymob for the transaction-processed callback HMAC
export const HMAC_FIELDS = ['amount_cents', 'created_at', 'currency', 'error_occured', 'has_parent_transaction', 'id', 'integration_id',
  'is_3d_secure', 'is_auth', 'is_capture', 'is_refunded', 'is_standalone_payment', 'is_voided', 'order.id', 'owner', 'pending',
  'source_data.pan', 'source_data.sub_type', 'source_data.type', 'success'] as const;

const get = (obj: any, p: string) => p.split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj);

export function computeHmac(obj: any, secret = env.PAYMOB_HMAC_SECRET): string {
  const concatenated = HMAC_FIELDS.map((f) => { const v = get(obj, f); return v === undefined || v === null ? '' : String(v); }).join('');
  return crypto.createHmac('sha512', secret).update(concatenated).digest('hex');
}

export function verifyHmac(obj: any, received: string | undefined | null, secret = env.PAYMOB_HMAC_SECRET): boolean {
  if (!received || !/^[a-f0-9]{128}$/i.test(received)) return false;
  const expected = Buffer.from(computeHmac(obj, secret), 'hex');
  return crypto.timingSafeEqual(expected, Buffer.from(received.toLowerCase(), 'hex'));
}

export interface IntentionResult { redirectUrl: string; intentionRef: string }

export async function createPaymentSession(paymentId: number): Promise<IntentionResult> {
  const p = await one<any>(db, `SELECT p.*, o.number, o.public_token, o.locale, o.customer_snapshot, o.address
                                FROM payments p JOIN orders o ON o.id = p.order_id WHERE p.id = $1`, [paymentId]);
  if (!p) throw new Error('payment not found');
  const specialRef = `${p.number}-P${p.id}`;

  if (env.PAYMOB_MODE === 'sandbox_mock') {
    const sig = crypto.createHmac('sha256', env.SESSION_SECRET).update(`mockpay:${p.id}`).digest('base64url');
    await db.query('UPDATE payments SET intention_ref = $2, updated_at = now() WHERE id = $1', [p.id, specialRef]);
    return { redirectUrl: `/pay/sandbox/${p.id}?s=${sig}`, intentionRef: specialRef };
  }

  if (!env.PAYMOB_SECRET_KEY || !env.PAYMOB_PUBLIC_KEY) throw new Error('Paymob keys are not configured');
  const integration = p.method === 'wallet' ? env.PAYMOB_WALLET_INTEGRATION_ID : env.PAYMOB_CARD_INTEGRATION_ID;
  if (!integration) throw new Error(`Paymob integration id for ${p.method} is not configured`);
  const [first, ...rest] = String(p.customer_snapshot.name).split(' ');
  const body = {
    amount: p.amount, currency: 'EGP', payment_methods: [Number(integration)],
    items: [{ name: `Order ${p.number}`, amount: p.amount, description: 'LAP ONE order', quantity: 1 }],
    billing_data: {
      first_name: first || 'NA', last_name: rest.join(' ') || 'NA', phone_number: p.customer_snapshot.phone,
      email: p.customer_snapshot.email || 'na@na.na', street: p.address.street || 'NA', building: p.address.building || 'NA',
      apartment: 'NA', floor: 'NA', city: p.address.city || 'NA', state: p.address.governorate || 'NA', country: 'EG',
    },
    special_reference: specialRef,
    notification_url: `${env.PUBLIC_BASE_URL}/webhooks/paymob`,
    redirection_url: `${env.PUBLIC_BASE_URL}/${p.locale}/order/${p.number}?t=${p.public_token}`,
  };
  const res = await fetch(`${env.PAYMOB_API_BASE}/v1/intention/`, {
    method: 'POST', headers: { Authorization: `Token ${env.PAYMOB_SECRET_KEY}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    signal: AbortSignal.timeout(15000),
  });
  const data: any = await res.json().catch(() => ({}));
  if (!res.ok || !data.client_secret) throw new Error(`Paymob intention failed (${res.status})`);
  await db.query('UPDATE payments SET intention_ref = $2, updated_at = now() WHERE id = $1', [p.id, String(data.id || specialRef)]);
  return { redirectUrl: `${env.PAYMOB_API_BASE}/unifiedcheckout/?publicKey=${encodeURIComponent(env.PAYMOB_PUBLIC_KEY)}&clientSecret=${encodeURIComponent(data.client_secret)}`, intentionRef: String(data.id) };
}

export type CallbackOutcome = 'invalid_signature' | 'duplicate' | 'unknown_payment' | 'amount_mismatch' | 'paid' | 'already_paid' | 'failed' | 'pending' | 'refunded' | 'stock_lost' | 'ignored';

/** Handles a Paymob TRANSACTION callback. Idempotent: replays of the same event are recorded once and ignored. */
export async function handlePaymobCallback(payload: any, hmac: string | null): Promise<CallbackOutcome> {
  const obj = payload?.obj;
  if (!obj || payload?.type !== 'TRANSACTION') return 'ignored';
  const valid = verifyHmac(obj, hmac);
  const eventId = `${obj.id}:${obj.success}:${obj.pending}:${obj.is_refunded}:${obj.is_voided}`;
  const merchantRef: string = String(obj.order?.merchant_order_id ?? obj.special_reference ?? '');
  const paymentId = Number(merchantRef.match(/-P(\d+)$/)?.[1]);

  const ins = await db.query(`INSERT INTO payment_events(payment_id, provider, provider_event_id, type, signature_valid, payload)
      VALUES ($1,'paymob',$2,'TRANSACTION',$3,$4) ON CONFLICT (provider, provider_event_id) DO NOTHING RETURNING id`,
    [Number.isFinite(paymentId) ? paymentId : null, eventId, valid, JSON.stringify(payload)]);
  if (!valid) return 'invalid_signature';
  if (!ins.rows.length) return 'duplicate';
  const eventRowId = ins.rows[0].id;
  const finish = async (q: Queryable, result: CallbackOutcome) => {
    await q.query('UPDATE payment_events SET processed = TRUE, result = $2 WHERE id = $1', [eventRowId, result]); return result;
  };

  const outcome = await db.tx(async (q) => {
    const p = await one<any>(q, 'SELECT * FROM payments WHERE id = $1 AND provider = $2 FOR UPDATE', [paymentId, 'paymob']);
    if (!p) return finish(q, 'unknown_payment');
    if (Number(obj.amount_cents) !== Number(p.amount) || (obj.currency && obj.currency !== 'EGP')) {
      await q.query(`INSERT INTO order_events(order_id, kind, body) VALUES ($1,'alert',$2)`, [p.order_id, `Paymob amount mismatch: got ${obj.amount_cents}, expected ${p.amount}`]);
      return finish(q, 'amount_mismatch');
    }
    if (obj.is_refunded || obj.is_voided) {
      await q.query(`UPDATE payments SET status = 'refunded', updated_at = now() WHERE id = $1`, [p.id]);
      await q.query(`UPDATE orders SET payment_status = 'refunded', updated_at = now() WHERE id = $1`, [p.order_id]);
      await q.query(`INSERT INTO order_events(order_id, kind, body) VALUES ($1,'payment','Paymob reported refund/void')`, [p.order_id]);
      return finish(q, 'refunded');
    }
    if (obj.success === true && obj.pending === false) {
      if (p.status === 'paid') return finish(q, 'already_paid');
      await q.query(`UPDATE payments SET status = 'paid', provider_ref = $2, paid_at = now(), updated_at = now() WHERE id = $1`, [p.id, String(obj.id)]);
      await q.query(`UPDATE orders SET payment_status = 'paid', updated_at = now() WHERE id = $1`, [p.order_id]);
      await q.query(`INSERT INTO order_events(order_id, kind, body, internal) VALUES ($1,'payment',$2,FALSE)`, [p.order_id, `Paid via Paymob (txn ${obj.id})`]);
      const r = await confirmOrder(q, p.order_id, null, 'payment confirmed by Paymob');
      return finish(q, r === 'stock_lost' ? 'stock_lost' : 'paid');
    }
    if (obj.pending === true) return finish(q, 'pending');
    if (p.status === 'pending') {
      await q.query(`UPDATE payments SET status = 'failed', provider_ref = $2, updated_at = now() WHERE id = $1`, [p.id, String(obj.id)]);
      await q.query(`UPDATE orders SET payment_status = 'failed', updated_at = now() WHERE id = $1 AND payment_status <> 'paid'`, [p.order_id]);
      await q.query(`INSERT INTO order_events(order_id, kind, body) VALUES ($1,'payment',$2)`, [p.order_id, `Paymob payment failed (txn ${obj.id})`]);
    }
    return finish(q, 'failed');
  });
  if (outcome === 'paid') {
    const p = await one<any>(db, 'SELECT order_id, amount FROM payments WHERE id = $1', [paymentId]);
    await trackEvent('purchase', { orderId: p.order_id, value: p.amount });
    invalidateCatalog();
  }
  return outcome;
}

/** Builds a Paymob-shaped transaction object for the local sandbox simulator. */
export function mockTransaction(payment: { id: number; amount: number; number: string }, success: boolean) {
  const obj = {
    id: Math.floor(Date.now() / 1000) * 100 + Math.floor(Math.random() * 100), pending: false, amount_cents: payment.amount, success,
    is_auth: false, is_capture: false, is_standalone_payment: true, is_voided: false, is_refunded: false, is_3d_secure: true,
    integration_id: 0, has_parent_transaction: false, owner: 0, currency: 'EGP', error_occured: !success,
    created_at: new Date().toISOString(), source_data: { pan: '2346', type: 'card', sub_type: 'MasterCard' },
    order: { id: 900000 + payment.id, merchant_order_id: `${payment.number}-P${payment.id}` },
  };
  return { type: 'TRANSACTION', obj, hmac: computeHmac(obj) };
}

export function mockSignatureValid(paymentId: number, sig: string | null): boolean {
  if (!sig) return false;
  const exp = crypto.createHmac('sha256', env.SESSION_SECRET).update(`mockpay:${paymentId}`).digest('base64url');
  return exp.length === sig.length && crypto.timingSafeEqual(Buffer.from(exp), Buffer.from(sig));
}
