import crypto from 'node:crypto';
import { db, one, many, type Queryable } from '../db';
import { setCookie, type Ctx } from '../http';

export interface CartLine {
  id: number; variant_id: number; qty: number; option_ids: number[]; slug: string; title: string; price: number; image: string | null;
  available: number; published: boolean; is_sample: boolean; grade: string | null; warranty_months: number | null;
  options: { id: number; label_ar: string; label_en: string; price: number }[]; options_total: number; line_total: number;
}
export interface CartView { id: string | null; kind: 'cart' | 'buy_now'; lines: CartLine[]; subtotal: number; options_total: number; count: number; issues: number[] }

const CART_COOKIE = 'lo_cart';

async function findCart(ctx: Ctx, id?: string): Promise<{ id: string; kind: 'cart' | 'buy_now' } | null> {
  const cid = id || ctx.cookies[CART_COOKIE];
  if (!cid || !/^[0-9a-f-]{36}$/.test(cid)) return null;
  return one(db, 'SELECT id, kind FROM carts WHERE id = $1 AND visitor_id = $2 AND converted_order_id IS NULL', [cid, ctx.visitorId]);
}

export async function getOrCreateCart(ctx: Ctx): Promise<string> {
  const c = await findCart(ctx);
  if (c && c.kind === 'cart') return c.id;
  const id = crypto.randomUUID();
  await db.query('INSERT INTO carts(id, visitor_id, kind) VALUES ($1, $2, $3)', [id, ctx.visitorId, 'cart']);
  setCookie(ctx, CART_COOKIE, id, { maxAge: 60 * 60 * 24 * 30 });
  ctx.cookies[CART_COOKIE] = id; // visible to the rest of this request (e.g. header count)
  return id;
}

/** Validate that option ids belong to the variant and are active (server-side compatibility check). */
async function validOptions(q: Queryable, variantId: number, optionIds: number[]): Promise<number[]> {
  if (!optionIds.length) return [];
  const rows = await many<any>(q, 'SELECT id, kind FROM upgrade_options WHERE variant_id = $1 AND active AND id = ANY($2::int[])', [variantId, optionIds]);
  // at most one option per kind (e.g. one RAM upgrade)
  const byKind = new Map<string, number>();
  for (const r of rows) if (!byKind.has(r.kind)) byKind.set(r.kind, r.id);
  return [...byKind.values()].sort((a, b) => a - b);
}

export async function addToCart(ctx: Ctx, variantId: number, qty: number, optionIds: number[], cartId?: string): Promise<{ ok: boolean; error?: string }> {
  const v = await one<any>(db, `SELECT v.id, v.inventory_mode, (SELECT count(*) FROM inventory_units u WHERE u.variant_id = v.id AND u.status = 'available')::int AS available
                                 FROM product_variants v WHERE v.id = $1 AND v.published AND NOT v.archived`, [variantId]);
  if (!v) return { ok: false, error: 'not_found' };
  if (v.available < 1) return { ok: false, error: 'out_of_stock' };
  const cid = cartId || await getOrCreateCart(ctx);
  const opts = await validOptions(db, variantId, optionIds);
  const existing = await one<any>(db, 'SELECT id, qty FROM cart_items WHERE cart_id = $1 AND variant_id = $2 AND option_ids = $3::int[]', [cid, variantId, opts]);
  const newQty = Math.min((existing?.qty || 0) + qty, v.available, 20);
  if (existing) await db.query('UPDATE cart_items SET qty = $2 WHERE id = $1', [existing.id, newQty]);
  else await db.query('INSERT INTO cart_items(cart_id, variant_id, qty, option_ids) VALUES ($1,$2,$3,$4)', [cid, variantId, Math.max(1, newQty), opts]);
  await db.query('UPDATE carts SET updated_at = now() WHERE id = $1', [cid]);
  return { ok: true };
}

export async function createBuyNowCart(ctx: Ctx, variantId: number, optionIds: number[]): Promise<{ id?: string; error?: string }> {
  const id = crypto.randomUUID();
  await db.query('INSERT INTO carts(id, visitor_id, kind) VALUES ($1, $2, $3)', [id, ctx.visitorId, 'buy_now']);
  const r = await addToCart(ctx, variantId, 1, optionIds, id);
  if (!r.ok) return { error: r.error };
  return { id };
}

export async function updateLine(ctx: Ctx, lineId: number, qty: number, cartId?: string) {
  const c = await findCart(ctx, cartId); if (!c) return;
  if (qty <= 0) await db.query('DELETE FROM cart_items WHERE id = $1 AND cart_id = $2', [lineId, c.id]);
  else await db.query('UPDATE cart_items SET qty = LEAST($3, 20) WHERE id = $1 AND cart_id = $2', [lineId, c.id, qty]);
  await db.query('UPDATE carts SET updated_at = now() WHERE id = $1', [c.id]);
}

/** Server-computed cart view. Prices always come from the database, never from the client. */
export async function getCart(ctx: Ctx, cartId?: string): Promise<CartView> {
  const c = await findCart(ctx, cartId);
  if (!c) return { id: null, kind: 'cart', lines: [], subtotal: 0, options_total: 0, count: 0, issues: [] };
  const rows = await many<any>(db, `
    SELECT ci.id, ci.variant_id, ci.qty, ci.option_ids, v.slug, v.title, v.price, v.published AND NOT v.archived AS published, v.is_sample, v.grade,
           v.warranty_months,
           (SELECT url FROM product_images WHERE variant_id = v.id ORDER BY sort, id LIMIT 1) AS image,
           (SELECT count(*) FROM inventory_units u WHERE u.variant_id = v.id AND u.status = 'available')::int AS available
      FROM cart_items ci JOIN product_variants v ON v.id = ci.variant_id
     WHERE ci.cart_id = $1 ORDER BY ci.id`, [c.id]);
  const allOpt = rows.flatMap((r) => r.option_ids);
  const opts = allOpt.length ? await many<any>(db, 'SELECT id, variant_id, label_ar, label_en, price FROM upgrade_options WHERE id = ANY($1::int[]) AND active', [allOpt]) : [];
  const lines: CartLine[] = rows.map((r) => {
    const options = opts.filter((o) => r.option_ids.includes(o.id) && o.variant_id === r.variant_id);
    const options_total = options.reduce((s, o) => s + o.price, 0);
    return { ...r, options, options_total, line_total: (r.price + options_total) * r.qty };
  });
  const issues = lines.filter((l) => !l.published || l.available < l.qty).map((l) => l.id);
  return {
    id: c.id, kind: c.kind, lines,
    subtotal: lines.reduce((s, l) => s + l.price * l.qty, 0),
    options_total: lines.reduce((s, l) => s + l.options_total * l.qty, 0),
    count: lines.reduce((s, l) => s + l.qty, 0), issues,
  };
}

export async function cartCount(ctx: Ctx): Promise<number> {
  const c = await findCart(ctx);
  if (!c || c.kind !== 'cart') return 0;
  const r = await one<any>(db, 'SELECT COALESCE(sum(qty),0)::int AS n FROM cart_items WHERE cart_id = $1', [c.id]);
  return r?.n || 0;
}

// ---- wishlist & compare (visitor scoped) -------------------------------------------------
export async function wishlistIds(ctx: Ctx): Promise<number[]> {
  return (await many<any>(db, 'SELECT variant_id FROM wishlist_items WHERE visitor_id = $1 ORDER BY created_at DESC', [ctx.visitorId])).map((r) => r.variant_id);
}
export async function toggleWishlist(ctx: Ctx, variantId: number): Promise<boolean> {
  const del = await db.query('DELETE FROM wishlist_items WHERE visitor_id = $1 AND variant_id = $2', [ctx.visitorId, variantId]);
  if (del.rowCount) return false;
  const exists = await one(db, 'SELECT 1 FROM product_variants WHERE id = $1 AND published', [variantId]);
  if (!exists) return false;
  await db.query('INSERT INTO wishlist_items(visitor_id, variant_id) VALUES ($1,$2) ON CONFLICT DO NOTHING', [ctx.visitorId, variantId]);
  return true;
}
export function compareIds(ctx: Ctx): number[] {
  return (ctx.cookies.lo_cmp || '').split('.').map(Number).filter((n) => Number.isInteger(n) && n > 0).slice(0, 4);
}
export function setCompare(ctx: Ctx, ids: number[]) {
  setCookie(ctx, 'lo_cmp', ids.slice(0, 4).join('.'), { maxAge: 60 * 60 * 24 * 30, httpOnly: false });
}
