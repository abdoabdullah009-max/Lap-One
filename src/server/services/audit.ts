import { db, type Queryable } from '../db';

export async function audit(q: Queryable | null, userId: number | null, action: string, entity: string, entityId: string | number | null,
  before: unknown = null, after: unknown = null, ip: string | null = null) {
  await (q || db).query(
    'INSERT INTO audit_logs(user_id, action, entity, entity_id, before, after, ip) VALUES ($1,$2,$3,$4,$5,$6,$7)',
    [userId, action, entity, entityId === null ? null : String(entityId), before === null ? null : JSON.stringify(before), after === null ? null : JSON.stringify(after), ip],
  );
}

export async function trackEvent(name: string, data: { visitorId?: string | null; variantId?: number | null; orderId?: number | null; value?: number | null; payload?: unknown } = {}): Promise<boolean> {
  const r = await db.query(
    `INSERT INTO analytics_events(name, visitor_id, variant_id, order_id, value, payload) VALUES ($1,$2,$3,$4,$5,$6)
     ON CONFLICT DO NOTHING RETURNING id`,
    [name, data.visitorId ?? null, data.variantId ?? null, data.orderId ?? null, data.value ?? null, data.payload ? JSON.stringify(data.payload) : null],
  );
  return r.rows.length > 0;
}
