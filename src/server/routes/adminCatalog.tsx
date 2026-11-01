import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { z } from 'zod';
import { db, one, many, type Queryable } from '../db';
import { env } from '../env';
import { HttpError, sendText, type Ctx } from '../http';
import { can } from '../auth';
import { audit } from '../services/audit';
import { invalidateCatalog } from '../services/catalog';
import { parseEGP } from '../money';
import { GRADES, USAGES, UNIT_STATUSES, type UnitStatus } from '../../config/catalog';
import { aroute, av, back, page, s, nOrNull, bool, arr, toCsv, parseCsv } from './adminCore';
import { AdminLayout, Csrf, F, Pill, Pager, egp, egpInput, dt, dOnly } from '../../views/admin/ui';

const req = createRequire(import.meta.url);

// ---------------------------------------------------------------- products list
aroute('GET', '/admin/products', 'products.view', async (ctx) => {
  const a = av(ctx); const sp = ctx.url.searchParams; const q = (sp.get('q') || '').trim(); const f = sp.get('f') || ''; const pageN = Math.max(1, Number(sp.get('page')) || 1);
  const cond: string[] = []; const params: any[] = [];
  if (q) { params.push(`%${q}%`); cond.push(`(v.title ILIKE $1 OR v.sku ILIKE $1 OR f.name ILIKE $1)`); }
  if (f === 'published') cond.push('v.published AND NOT v.archived'); if (f === 'draft') cond.push('NOT v.published AND NOT v.archived'); if (f === 'archived') cond.push('v.archived');
  if (f !== 'archived' && !cond.some((c) => c.includes('archived'))) cond.push('NOT v.archived');
  const where = `WHERE ${cond.join(' AND ')}`;
  const count = (await one<any>(db, `SELECT count(*)::int AS n FROM product_variants v JOIN product_families f ON f.id = v.family_id ${where}`, params)).n;
  const rows = await many<any>(db, `SELECT v.*, f.name AS family, f.is_accessory, b.name AS brand,
      (SELECT count(*) FROM inventory_units u WHERE u.variant_id = v.id AND u.status = 'available')::int AS avail,
      (SELECT count(*) FROM inventory_units u WHERE u.variant_id = v.id AND u.status = 'reserved')::int AS reserved,
      (SELECT count(*) FROM inventory_units u WHERE u.variant_id = v.id AND u.status = 'sold')::int AS sold
      FROM product_variants v JOIN product_families f ON f.id = v.family_id JOIN brands b ON b.id = f.brand_id ${where} ORDER BY v.id DESC LIMIT 40 OFFSET ${(pageN - 1) * 40}`, params);
  page(ctx, (
    <AdminLayout a={a} title="Products" actions={can(ctx.user, 'products.edit') ? <a className="btn btn--primary btn--sm" href="/admin/products/new">+ New product</a> : null}>
      <form method="get" className="filters"><input name="q" placeholder="Title, SKU, model" defaultValue={q} />
        <select name="f" defaultValue={f}><option value="">Active</option><option value="published">Published</option><option value="draft">Unpublished</option><option value="archived">Archived</option></select><button className="btn btn--sm">Filter</button></form>
      <table className="t t--rows"><thead><tr><th>Product</th><th>SKU</th><th>Grade</th><th>Price</th><th>Stock</th><th>Mode</th><th>State</th></tr></thead>
        <tbody>{rows.map((v) => (
          <tr key={v.id}><td><a href={`/admin/products/${v.id}`}><b>{v.title}</b></a>{v.is_sample ? <span className="tag">sample</span> : null}</td><td>{v.sku}</td><td>{v.grade || '—'}</td><td>{egp(v.price)}{v.compare_at_price ? <div className="muted small"><s>{egp(v.compare_at_price)}</s></div> : null}</td>
            <td className={v.avail <= v.low_stock_threshold ? 'warn' : ''}>{v.avail} avail{v.reserved ? ` · ${v.reserved} reserved` : ''}{v.sold ? ` · ${v.sold} sold` : ''}</td><td>{v.inventory_mode}</td>
            <td>{v.archived ? <Pill s="archived" /> : v.published ? <Pill s="published" /> : <Pill s="draft" />}</td></tr>
        ))}</tbody></table>
      <Pager page={pageN} pages={Math.ceil(count / 40)} base={`/admin/products?q=${encodeURIComponent(q)}&f=${f}`} />
    </AdminLayout>
  ));
});

// ---------------------------------------------------------------- product form
const productSchema = z.object({
  family_id: z.string().optional(), new_brand_id: z.string().optional(), new_family_name: z.string().trim().max(120).optional(), new_series: z.string().trim().max(60).optional(),
  is_accessory: z.string().optional(), title: z.string().trim().min(3).max(200), slug: z.string().trim().regex(/^[a-z0-9-]{3,120}$/, 'slug: lowercase letters, numbers and dashes'),
  sku: z.string().trim().min(2).max(40), inventory_mode: z.enum(['unique', 'batch']), grade: z.string().optional(),
  price: z.string(), compare_at_price: z.string().optional(), warranty_months: z.string().optional(), warranty_text_ar: z.string().max(400).optional(), warranty_text_en: z.string().max(400).optional(),
  low_stock_threshold: z.string().optional(), description_ar: z.string().max(4000).optional(), description_en: z.string().max(4000).optional(),
}).passthrough();

const SPEC_FIELDS: [string, string, 'text' | 'int' | 'num' | 'bool' | 'select', [string, string][]?][] = [
  ['cpu_brand', 'CPU maker', 'select', [['', 'unknown'], ['intel', 'Intel'], ['amd', 'AMD'], ['apple', 'Apple']]], ['cpu_model', 'CPU model (e.g. Core i7-1185G7)', 'text'],
  ['cpu_tier', 'CPU class', 'select', [['', 'unknown'], ...['i3', 'i5', 'i7', 'i9', 'r3', 'r5', 'r7', 'r9', 'u5', 'u7', 'm1', 'm2', 'm3', 'm4'].map((x) => [x, x.toUpperCase()] as [string, string])]],
  ['cpu_gen', 'CPU generation', 'int'], ['cpu_cores', 'Cores', 'int'], ['ram_gb', 'RAM (GB)', 'int'], ['ram_type', 'RAM type', 'text'], ['ram_max_gb', 'Max RAM (GB)', 'int'],
  ['storage_gb', 'Storage (GB)', 'int'], ['storage_type', 'Storage type', 'select', [['', 'unknown'], ['nvme', 'NVMe SSD'], ['ssd', 'SATA SSD'], ['hdd', 'HDD']]],
  ['gpu_brand', 'GPU maker', 'select', [['', 'unknown'], ['intel', 'Intel'], ['nvidia', 'NVIDIA'], ['amd', 'AMD'], ['apple', 'Apple']]], ['gpu_model', 'GPU model', 'text'],
  ['gpu_dedicated', 'Dedicated GPU', 'bool'], ['vram_gb', 'VRAM (GB)', 'int'], ['screen_in', 'Screen (inches)', 'num'], ['resolution', 'Resolution (e.g. 1920x1080)', 'text'],
  ['refresh_hz', 'Refresh (Hz)', 'int'], ['touch', 'Touchscreen', 'bool'], ['convertible', '2-in-1', 'bool'], ['os', 'Operating system', 'text'], ['connectivity', 'Connectivity', 'text'],
  ['ports', 'Ports', 'text'], ['weight_kg', 'Weight (kg)', 'num'], ['charger_included', 'Charger included', 'bool'], ['keyboard_layout', 'Keyboard layout', 'text'],
];

/** Tri-state for booleans: '' = unknown (NULL), '1' = yes, '0' = no. Never guessed. */
function specValues(body: Record<string, any>) {
  const out: Record<string, any> = {};
  for (const [k, , t] of SPEC_FIELDS) {
    const raw = s(body[k]);
    if (raw === '') { out[k] = null; continue; }
    if (t === 'int') { const n = Number(raw); out[k] = Number.isInteger(n) && n >= 0 ? n : null; }
    else if (t === 'num') { const n = Number(raw); out[k] = Number.isFinite(n) && n > 0 ? n : null; }
    else if (t === 'bool') out[k] = raw === '1';
    else out[k] = raw.slice(0, 200);
  }
  if (out.resolution && !/^\d{3,4}x\d{3,4}$/.test(out.resolution)) out.resolution = null;
  return out;
}

async function productFormData() {
  const families = await many<any>(db, 'SELECT f.id, f.name, b.name AS brand, f.is_accessory FROM product_families f JOIN brands b ON b.id = f.brand_id ORDER BY b.name, f.name');
  const brands = await many<any>(db, 'SELECT id, name FROM brands ORDER BY sort, name');
  return { families, brands };
}

function ProductForm({ a, v, fam, families, brands, canCost }: { a: any; v: any; fam: any; families: any[]; brands: any[]; canCost: boolean }) {
  const isNew = !v.id; void canCost;
  const tri = (x: boolean | null | undefined) => (x === null || x === undefined ? '' : x ? '1' : '0');
  return (
    <form method="post" action={isNew ? '/admin/products' : `/admin/products/${v.id}`} className="card stack"><Csrf a={a} />
      <h3>Model / family</h3>
      <div className="grid">
        <F label="Existing family" name="family_id" type="select" value={v.family_id || ''} options={[['', isNew ? '— create new family below —' : '—'], ...families.map((f) => [String(f.id), `${f.brand} ${f.name}${f.is_accessory ? ' (accessory)' : ''}`] as [string, string])]} />
        {isNew ? <><F label="…or new family: brand" name="new_brand_id" type="select" options={[['', '—'], ...brands.map((b) => [String(b.id), b.name] as [string, string])]} />
          <F label="New family name (e.g. Latitude 5420)" name="new_family_name" /><F label="Series (e.g. Latitude)" name="new_series" /><F label="Accessory (not a laptop)" name="is_accessory" type="checkbox" /></> : null}
        <F label="Description (Arabic)" name="description_ar" type="textarea" value={fam?.description_ar} wide dir="rtl" />
        <F label="Description (English)" name="description_en" type="textarea" value={fam?.description_en} wide />
      </div>
      <h3>Listing</h3>
      <div className="grid">
        <F label="Title" name="title" value={v.title} required wide hint="Shown to customers, e.g. Dell Latitude 5420 — i5-1145G7 / 16GB / 256GB NVMe" />
        <F label="URL slug" name="slug" value={v.slug} required hint="lowercase-with-dashes" /><F label="SKU" name="sku" value={v.sku} required />
        <F label="Inventory mode" name="inventory_mode" type="select" value={v.inventory_mode || 'unique'} options={[['unique', 'Unique unit (one physical laptop)'], ['batch', 'Batch (several identical units)']]} />
        <F label="Cosmetic grade" name="grade" type="select" value={v.grade || ''} options={[['', '— (accessory)'], ...GRADES.map((g) => [g, g.replace('_', ' ')] as [string, string])]} />
        <F label="Price (EGP)" name="price" type="number" step="0.01" value={egpInput(v.price)} required />
        <F label="Previous price (EGP)" name="compare_at_price" type="number" step="0.01" value={egpInput(v.compare_at_price)} hint="Only if it was really sold at this price. Must be higher than price." />
        <F label="Warranty (months)" name="warranty_months" type="number" value={v.warranty_months ?? ''} hint="Empty = not specified; 0 = no warranty" />
        <F label="Warranty terms (Arabic)" name="warranty_text_ar" value={v.warranty_text_ar} dir="rtl" /><F label="Warranty terms (English)" name="warranty_text_en" value={v.warranty_text_en} />
        <F label="Low-stock threshold" name="low_stock_threshold" type="number" value={v.low_stock_threshold ?? 1} />
        <F label="Special offer" name="is_offer" type="checkbox" value={v.is_offer} /><F label="Published" name="published" type="checkbox" value={v.published} />
      </div>
      <fieldset className="usages"><legend>Intended usage</legend>{USAGES.map((u) => <label key={u}><input type="checkbox" name="usages" value={u} defaultChecked={(v.usages || []).includes(u)} /> {u}</label>)}</fieldset>
      <h3>Specifications <small className="muted">— leave blank if not verified; the store shows “Not yet specified”</small></h3>
      <div className="grid">
        {SPEC_FIELDS.map(([k, label, t, opts]) => t === 'bool'
          ? <F key={k} label={label} name={k} type="select" value={tri(v[k])} options={[['', 'unknown'], ['1', 'yes'], ['0', 'no']]} />
          : t === 'select' ? <F key={k} label={label} name={k} type="select" value={v[k] ?? ''} options={opts!} />
          : <F key={k} label={label} name={k} type={t === 'text' ? 'text' : 'number'} step={t === 'num' ? '0.01' : undefined} value={v[k]} />)}
      </div>
      <button className="btn btn--primary">{isNew ? 'Create product' : 'Save changes'}</button>
    </form>
  );
}

aroute('GET', '/admin/products/new', 'products.edit', async (ctx) => {
  const a = av(ctx); const d = await productFormData();
  page(ctx, <AdminLayout a={a} title="New product"><ProductForm a={a} v={{ inventory_mode: 'unique', low_stock_threshold: 1, usages: [] }} fam={null} {...d} canCost={can(ctx.user, 'costs.view')} /></AdminLayout>);
});

async function saveProduct(ctx: Ctx, id: number | null) {
  const parsed = productSchema.safeParse(Object.fromEntries(Object.entries(ctx.body).map(([k, v]) => [k, Array.isArray(v) && k !== 'usages' ? v[0] : v])));
  const where = id ? `/admin/products/${id}` : '/admin/products/new';
  if (!parsed.success) return back(ctx, where, undefined, parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '));
  const b = parsed.data;
  const price = parseEGP(b.price); const compare = b.compare_at_price ? parseEGP(b.compare_at_price) : null;
  if (price === null) return back(ctx, where, undefined, 'Invalid price');
  if (compare !== null && compare <= price) return back(ctx, where, undefined, 'Previous price must be higher than the current price (no misleading discounts)');
  const grade = b.grade && (GRADES as readonly string[]).includes(b.grade) ? b.grade : null;
  const usages = arr(ctx.body.usages).filter((u) => (USAGES as readonly string[]).includes(u));
  const specs = specValues(ctx.body);
  try {
    const newId = await db.tx(async (q) => {
      let familyId = nOrNull(b.family_id);
      if (!familyId) {
        const brandId = nOrNull(b.new_brand_id); const name = s(b.new_family_name);
        if (!brandId || !name) throw new Error('Choose an existing family or enter a new family brand + name');
        const fslug = `${(await one<any>(q, 'SELECT slug FROM brands WHERE id=$1', [brandId])).slug}-${name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}`;
        familyId = (await one<any>(q, `INSERT INTO product_families(brand_id, slug, name, series, is_accessory) VALUES ($1,$2,$3,$4,$5)
          ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name RETURNING id`, [brandId, fslug, name, s(b.new_series) || null, bool(b.is_accessory)])).id;
      }
      await q.query('UPDATE product_families SET description_ar = $2, description_en = $3 WHERE id = $1', [familyId, s(b.description_ar) || null, s(b.description_en) || null]);
      const cols: Record<string, any> = { family_id: familyId, title: b.title, slug: b.slug, sku: b.sku, inventory_mode: b.inventory_mode, grade, price, compare_at_price: compare,
        warranty_months: nOrNull(b.warranty_months), warranty_text_ar: s(b.warranty_text_ar) || null, warranty_text_en: s(b.warranty_text_en) || null,
        low_stock_threshold: nOrNull(b.low_stock_threshold) ?? 1, is_offer: bool(ctx.body.is_offer), published: bool(ctx.body.published), usages, ...specs };
      const keys = Object.keys(cols);
      if (id) {
        const before = await one<any>(q, 'SELECT * FROM product_variants WHERE id = $1 FOR UPDATE', [id]);
        if (!before) throw new HttpError(404, 'Not found');
        await q.query(`UPDATE product_variants SET ${keys.map((k, i) => `${k} = $${i + 2}`).join(', ')}, updated_at = now() WHERE id = $1`, [id, ...keys.map((k) => cols[k])]);
        if (before.price !== price || before.compare_at_price !== compare) {
          await q.query('INSERT INTO price_history(variant_id, old_price, new_price, changed_by) VALUES ($1,$2,$3,$4)', [id, before.price, price, ctx.user!.id]);
          await audit(q, ctx.user!.id, 'product.price_change', 'variant', id, { price: before.price, compare_at_price: before.compare_at_price }, { price, compare_at_price: compare }, ctx.ip);
        }
        if (before.published !== cols.published) await audit(q, ctx.user!.id, cols.published ? 'product.publish' : 'product.unpublish', 'variant', id, null, null, ctx.ip);
        await audit(q, ctx.user!.id, 'product.update', 'variant', id, null, { title: b.title }, ctx.ip);
        return id;
      }
      const r = await one<any>(q, `INSERT INTO product_variants(${keys.join(', ')}) VALUES (${keys.map((_, i) => `$${i + 1}`).join(', ')}) RETURNING id`, keys.map((k) => cols[k]));
      await q.query('INSERT INTO price_history(variant_id, old_price, new_price, changed_by) VALUES ($1,NULL,$2,$3)', [r.id, price, ctx.user!.id]);
      await audit(q, ctx.user!.id, 'product.create', 'variant', r.id, null, { title: b.title, price }, ctx.ip);
      return r.id as number;
    });
    invalidateCatalog();
    back(ctx, `/admin/products/${newId}`, id ? 'Product saved' : 'Product created — now add inventory units and photos');
  } catch (e: any) {
    back(ctx, where, undefined, e.code === '23505' ? `Duplicate value (${e.constraint}) — slug and SKU must be unique` : e.message);
  }
}
aroute('POST', '/admin/products', 'products.edit', (ctx) => saveProduct(ctx, null));
aroute('POST', '/admin/products/:id', 'products.edit', (ctx) => saveProduct(ctx, Number(ctx.params.id)));

aroute('GET', '/admin/products/:id', 'products.view', async (ctx) => {
  const a = av(ctx); const id = Number(ctx.params.id);
  const v = await one<any>(db, 'SELECT * FROM product_variants WHERE id = $1', [id]); if (!v) throw new HttpError(404, 'Product not found');
  const fam = await one<any>(db, 'SELECT * FROM product_families WHERE id = $1', [v.family_id]);
  const d = await productFormData();
  const images = await many<any>(db, 'SELECT * FROM product_images WHERE variant_id = $1 ORDER BY sort, id', [id]);
  const ups = await many<any>(db, 'SELECT * FROM upgrade_options WHERE variant_id = $1 ORDER BY sort, id', [id]);
  const units = await many<any>(db, 'SELECT id, unit_sku, status, battery_health_pct, warehouse_location FROM inventory_units WHERE variant_id = $1 ORDER BY id', [id]);
  const prices = await many<any>(db, 'SELECT p.*, u.name FROM price_history p LEFT JOIN users u ON u.id = p.changed_by WHERE variant_id = $1 ORDER BY p.id DESC LIMIT 10', [id]);
  const edit = can(ctx.user, 'products.edit');
  page(ctx, (
    <AdminLayout a={a} title={v.title} actions={<><a className="btn btn--sm" href={`/ar/p/${v.slug}`} target="_blank">View in store ↗</a>{edit && !v.archived ? <form method="post" action={`/admin/products/${id}/archive`} className="inline"><Csrf a={a} /><button className="btn btn--sm btn--danger" data-confirm="Archive this product? It will be unpublished and hidden.">Archive</button></form> : null}</>}>
      {v.is_sample ? <p className="flash flash--err">Sample data — replace with real stock before launch.</p> : null}
      <div className="cols cols--wide">
        {edit ? <ProductForm a={a} v={v} fam={fam} {...d} canCost={can(ctx.user, 'costs.view')} /> : <section className="card"><p>You have read-only access to products.</p></section>}
        <div>
          <section className="card">
            <h3>Physical units ({units.length})</h3>
            <table className="t"><tbody>{units.map((u) => <tr key={u.id}><td><a href={`/admin/inventory/${u.id}`}>{u.unit_sku}</a></td><td><Pill s={u.status} /></td><td>{u.battery_health_pct !== null ? `${u.battery_health_pct}%` : 'battery untested'}</td><td>{u.warehouse_location}</td></tr>)}</tbody></table>
            {can(ctx.user, 'inventory.edit') ? <a className="btn btn--sm" href={`/admin/inventory/new?variant=${id}`}>+ Add unit(s)</a> : null}
          </section>
          <section className="card">
            <h3>Photos</h3>
            <div className="thumbs">{images.map((im) => (
              <figure key={im.id}><img src={im.url} alt="" width={140} height={105} /><figcaption><Pill s={im.kind} />{edit ? <form method="post" action={`/admin/products/${id}/images/${im.id}/delete`} className="inline"><Csrf a={a} /><button className="linkbtn" data-confirm="Delete photo?">delete</button></form> : null}</figcaption></figure>
            ))}</div>
            {edit ? (
              <form method="post" action={`/admin/products/${id}/images`} encType="multipart/form-data" className="stack"><Csrf a={a} />
                <input type="file" name="photos" accept="image/jpeg,image/png,image/webp" multiple required />
                <F label="Photo type" name="kind" type="select" options={[['actual_unit', 'Actual photo of this exact unit'], ['representative', 'Representative model image']]} />
                <F label="Linked unit (for actual photos)" name="unit_id" type="select" options={[['', '—'], ...units.map((u) => [String(u.id), u.unit_sku] as [string, string])]} />
                <button className="btn btn--sm">Upload</button>
                <small className="muted">JPEG/PNG/WebP up to {env.MAX_UPLOAD_MB}MB. Converted to WebP (max 1600px). Customers see whether a photo is of the actual unit or representative.</small>
              </form>
            ) : null}
          </section>
          <section className="card">
            <h3>Upgrade options</h3>
            <p className="muted small">Only add upgrades that are technically compatible with this model and that you can actually install.</p>
            <table className="t"><tbody>{ups.map((u) => <tr key={u.id}><td>{u.kind}</td><td>{u.label_en}<div className="small" dir="rtl">{u.label_ar}</div></td><td>{egp(u.price)}</td><td>{edit ? <form method="post" action={`/admin/upgrades/${u.id}/toggle`} className="inline"><Csrf a={a} /><button className="linkbtn">{u.active ? 'disable' : 'enable'}</button></form> : u.active ? 'active' : 'off'}</td></tr>)}</tbody></table>
            {edit ? (
              <form method="post" action={`/admin/products/${id}/upgrades`} className="grid"><Csrf a={a} />
                <F label="Type" name="kind" type="select" options={[['ram', 'RAM'], ['ssd', 'SSD'], ['accessory', 'Accessory']]} />
                <F label="Label (Arabic)" name="label_ar" required dir="rtl" /><F label="Label (English)" name="label_en" required /><F label="Price (EGP)" name="price" type="number" step="0.01" required />
                <button className="btn btn--sm">Add upgrade</button>
              </form>
            ) : null}
          </section>
          <section className="card"><h3>Price history</h3><table className="t"><tbody>{prices.map((p) => <tr key={p.id}><td>{dt(p.changed_at)}</td><td>{egp(p.old_price)} → {egp(p.new_price)}</td><td>{p.name || 'system'}</td></tr>)}</tbody></table></section>
        </div>
      </div>
    </AdminLayout>
  ));
});

aroute('POST', '/admin/products/:id/archive', 'products.edit', async (ctx) => {
  const id = Number(ctx.params.id);
  await db.query('UPDATE product_variants SET archived = TRUE, published = FALSE, updated_at = now() WHERE id = $1', [id]);
  await audit(null, ctx.user!.id, 'product.archive', 'variant', id, null, null, ctx.ip); invalidateCatalog();
  back(ctx, '/admin/products', 'Product archived');
});

aroute('POST', '/admin/products/:id/upgrades', 'products.edit', async (ctx) => {
  const id = Number(ctx.params.id); const price = parseEGP(s(ctx.body.price)); const kind = s(ctx.body.kind);
  if (price === null || !['ram', 'ssd', 'accessory'].includes(kind) || !s(ctx.body.label_ar) || !s(ctx.body.label_en)) return back(ctx, `/admin/products/${id}`, undefined, 'All upgrade fields are required');
  await db.query('INSERT INTO upgrade_options(variant_id, kind, label_ar, label_en, price) VALUES ($1,$2,$3,$4,$5)', [id, kind, s(ctx.body.label_ar).slice(0, 120), s(ctx.body.label_en).slice(0, 120), price]);
  await audit(null, ctx.user!.id, 'product.upgrade_add', 'variant', id, null, { kind, price }, ctx.ip); invalidateCatalog();
  back(ctx, `/admin/products/${id}`, 'Upgrade added');
});
aroute('POST', '/admin/upgrades/:id/toggle', 'products.edit', async (ctx) => {
  const u = await one<any>(db, 'UPDATE upgrade_options SET active = NOT active WHERE id = $1 RETURNING variant_id, active', [Number(ctx.params.id)]);
  if (!u) throw new HttpError(404, 'Not found'); invalidateCatalog();
  back(ctx, `/admin/products/${u.variant_id}`, `Upgrade ${u.active ? 'enabled' : 'disabled'}`);
});

// ---------------------------------------------------------------- image uploads (validated + re-encoded)
function sniff(buf: Buffer): 'jpeg' | 'png' | 'webp' | null {
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'jpeg';
  if (buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'png';
  if (buf.subarray(0, 4).toString() === 'RIFF' && buf.subarray(8, 12).toString() === 'WEBP') return 'webp';
  return null;
}
aroute('POST', '/admin/products/:id/images', 'products.edit', async (ctx) => {
  const id = Number(ctx.params.id); const kind = s(ctx.body.kind) === 'representative' ? 'representative' : 'actual_unit'; const unitId = nOrNull(ctx.body.unit_id);
  const files = ctx.files.filter((f) => f.field === 'photos');
  if (!files.length) return back(ctx, `/admin/products/${id}`, undefined, 'Choose at least one image');
  let sharp: any = null; try { sharp = req('sharp'); } catch { /* optional */ }
  const dir = path.resolve(process.cwd(), env.UPLOAD_DIR, 'products', String(id)); fs.mkdirSync(dir, { recursive: true });
  let n = 0;
  for (const f of files.slice(0, 12)) {
    const type = sniff(f.data); if (!type) continue;                       // reject anything that is not really an image
    const name = crypto.randomBytes(12).toString('hex');
    let file: string; let width: number | null = null; let height: number | null = null;
    if (sharp) {
      const out = await sharp(f.data, { limitInputPixels: 40_000_000 }).rotate().resize({ width: 1600, height: 1600, fit: 'inside', withoutEnlargement: true }).webp({ quality: 82 }).toBuffer({ resolveWithObject: true });
      file = `${name}.webp`; fs.writeFileSync(path.join(dir, file), out.data); width = out.info.width; height = out.info.height;
    } else { file = `${name}.${type === 'jpeg' ? 'jpg' : type}`; fs.writeFileSync(path.join(dir, file), f.data); }
    const sort = (await one<any>(db, 'SELECT COALESCE(max(sort), -1) + 1 AS s FROM product_images WHERE variant_id = $1', [id])).s;
    await db.query('INSERT INTO product_images(variant_id, unit_id, url, alt, kind, width, height, sort) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)',
      [id, unitId, `/uploads/products/${id}/${file}`, null, kind, width, height, kind === 'actual_unit' ? -1 : sort]);
    n++;
  }
  await audit(null, ctx.user!.id, 'product.images_upload', 'variant', id, null, { count: n, kind }, ctx.ip); invalidateCatalog();
  back(ctx, `/admin/products/${id}`, n ? `${n} photo(s) uploaded` : undefined, n ? undefined : 'No valid JPEG/PNG/WebP files');
});
aroute('POST', '/admin/products/:id/images/:img/delete', 'products.edit', async (ctx) => {
  const id = Number(ctx.params.id);
  const im = await one<any>(db, 'DELETE FROM product_images WHERE id = $1 AND variant_id = $2 RETURNING url', [Number(ctx.params.img), id]);
  if (im?.url.startsWith('/uploads/')) { try { fs.unlinkSync(path.resolve(process.cwd(), env.UPLOAD_DIR, im.url.slice(9))); } catch { /* already gone */ } }
  invalidateCatalog(); back(ctx, `/admin/products/${id}`, 'Photo deleted');
});

// ---------------------------------------------------------------- inventory units
/** Statuses staff can set manually. reserved/sold are controlled by orders only (prevents double-selling). */
const MANUAL_TRANSITIONS: Record<UnitStatus, UnitStatus[]> = {
  received: ['awaiting_inspection', 'available', 'under_maintenance', 'archived'],
  awaiting_inspection: ['available', 'under_maintenance', 'archived'],
  available: ['under_maintenance', 'awaiting_inspection', 'archived'],
  reserved: [], sold: [],
  returned: ['awaiting_inspection', 'available', 'under_maintenance', 'archived'],
  under_maintenance: ['awaiting_inspection', 'available', 'archived'],
  archived: ['awaiting_inspection'],
};

aroute('GET', '/admin/inventory', 'inventory.view', async (ctx) => {
  const a = av(ctx); const sp = ctx.url.searchParams; const st = sp.get('status') || ''; const q = (sp.get('q') || '').trim(); const pageN = Math.max(1, Number(sp.get('page')) || 1);
  const cond: string[] = []; const params: any[] = [];
  if (st && (UNIT_STATUSES as readonly string[]).includes(st)) { params.push(st); cond.push(`u.status = $${params.length}::unit_status`); }
  if (q) { params.push(`%${q}%`); cond.push(`(u.unit_sku ILIKE $${params.length} OR v.title ILIKE $${params.length}${can(ctx.user, 'inventory.edit') ? ` OR u.internal_serial ILIKE $${params.length}` : ''})`); }
  const where = cond.length ? `WHERE ${cond.join(' AND ')}` : '';
  const count = (await one<any>(db, `SELECT count(*)::int AS n FROM inventory_units u JOIN product_variants v ON v.id = u.variant_id ${where}`, params)).n;
  const rows = await many<any>(db, `SELECT u.*, v.title, v.id AS vid FROM inventory_units u JOIN product_variants v ON v.id = u.variant_id ${where} ORDER BY u.id DESC LIMIT 50 OFFSET ${(pageN - 1) * 50}`, params);
  const counts = await many<any>(db, `SELECT status, count(*)::int AS n FROM inventory_units GROUP BY status`);
  const costs = can(ctx.user, 'costs.view');
  page(ctx, (
    <AdminLayout a={a} title="Inventory units" actions={can(ctx.user, 'export') || can(ctx.user, 'import') ? <a className="btn btn--sm" href="/admin/export/inventory.csv">Export CSV</a> : null}>
      <div className="chips">{counts.map((c) => <a key={c.status} href={`/admin/inventory?status=${c.status}`} className={`chip${st === c.status ? ' on' : ''}`}>{c.status.replace('_', ' ')}: {c.n}</a>)}<a href="/admin/inventory" className="chip">all</a></div>
      <form method="get" className="filters"><input name="q" placeholder="Unit SKU, product, serial" defaultValue={q} /><input type="hidden" name="status" value={st} /><button className="btn btn--sm">Search</button></form>
      <table className="t t--rows"><thead><tr><th>Unit</th><th>Product</th><th>Status</th><th>Battery</th><th>Location</th>{costs ? <th>Cost</th> : null}<th>Updated</th></tr></thead>
        <tbody>{rows.map((u) => <tr key={u.id}><td><a href={`/admin/inventory/${u.id}`}><b>{u.unit_sku}</b></a></td><td><a href={`/admin/products/${u.vid}`}>{u.title}</a></td><td><Pill s={u.status} /></td>
          <td>{u.battery_health_pct !== null ? `${u.battery_health_pct}%` : <span className="muted">untested</span>}</td><td>{u.warehouse_location || '—'}</td>{costs ? <td>{egp(u.purchase_cost)}</td> : null}<td>{dt(u.updated_at)}</td></tr>)}</tbody></table>
      <Pager page={pageN} pages={Math.ceil(count / 50)} base={`/admin/inventory?status=${st}&q=${encodeURIComponent(q)}`} />
    </AdminLayout>
  ));
});

function UnitFields({ u, costs }: { u: any; costs: boolean }) {
  return (
    <div className="grid">
      <F label="Internal serial (confidential)" name="internal_serial" value={u.internal_serial} />
      <F label="Warehouse location" name="warehouse_location" value={u.warehouse_location} />
      {costs ? <F label="Purchase cost (EGP, confidential)" name="purchase_cost" type="number" step="0.01" value={egpInput(u.purchase_cost)} /> : null}
      <F label="Battery health %" name="battery_health_pct" type="number" value={u.battery_health_pct} hint="Only a measured value. Leave empty if not tested." />
      <F label="Battery tested on" name="battery_tested_at" type="date" value={u.battery_tested_at ? new Date(u.battery_tested_at).toISOString().slice(0, 10) : ''} />
      <F label="Battery test method" name="battery_method" value={u.battery_method} placeholder="e.g. powercfg /batteryreport: Full Charge ÷ Design" />
      <F label="Battery notes" name="battery_notes" value={u.battery_notes} dir="auto" />
      <F label="Cosmetic notes (scratches, dents)" name="cosmetic_notes" type="textarea" value={u.cosmetic_notes} dir="auto" />
      <F label="Screen notes" name="screen_notes" value={u.screen_notes} dir="auto" /><F label="Keyboard notes" name="keyboard_notes" value={u.keyboard_notes} dir="auto" />
      <F label="Known defects (shown to customers)" name="defects" type="textarea" value={u.defects} dir="auto" />
      <F label="Included accessories" name="included_accessories" value={u.included_accessories} dir="auto" />
    </div>
  );
}
function unitValues(body: Record<string, any>, costs: boolean) {
  const bat = nOrNull(body.battery_health_pct);
  const out: Record<string, any> = {
    internal_serial: s(body.internal_serial) || null, warehouse_location: s(body.warehouse_location) || null,
    battery_health_pct: bat !== null && bat >= 0 && bat <= 100 ? Math.round(bat) : null, battery_tested_at: s(body.battery_tested_at) || null,
    battery_method: s(body.battery_method) || null, battery_notes: s(body.battery_notes) || null, cosmetic_notes: s(body.cosmetic_notes) || null,
    screen_notes: s(body.screen_notes) || null, keyboard_notes: s(body.keyboard_notes) || null, defects: s(body.defects) || null, included_accessories: s(body.included_accessories) || null,
  };
  if (out.battery_health_pct !== null && (!out.battery_tested_at || !out.battery_method)) throw new Error('A battery percentage needs a test date and method');
  if (costs) out.purchase_cost = s(body.purchase_cost) ? parseEGP(s(body.purchase_cost)) : null;
  return out;
}

aroute('GET', '/admin/inventory/new', 'inventory.edit', async (ctx) => {
  const a = av(ctx); const vid = Number(ctx.url.searchParams.get('variant'));
  const variants = await many<any>(db, 'SELECT id, title, sku, inventory_mode FROM product_variants WHERE NOT archived ORDER BY title');
  page(ctx, (
    <AdminLayout a={a} title="Receive inventory">
      <form method="post" action="/admin/inventory" className="card stack"><Csrf a={a} />
        <div className="grid">
          <F label="Product variant" name="variant_id" type="select" value={vid || ''} required options={variants.map((v) => [String(v.id), `${v.title} [${v.sku}] (${v.inventory_mode})`] as [string, string])} />
          <F label="Number of units" name="count" type="number" value="1" hint="For unique products use 1. Batch: identical config & grade." />
          <F label="Initial status" name="status" type="select" options={[['awaiting_inspection', 'Awaiting inspection'], ['received', 'Received'], ['available', 'Available (already inspected)']]} />
        </div>
        <UnitFields u={{}} costs={can(ctx.user, 'costs.view')} />
        <button className="btn btn--primary">Add units</button>
      </form>
    </AdminLayout>
  ));
});
aroute('POST', '/admin/inventory', 'inventory.edit', async (ctx) => {
  const vid = Number(ctx.body.variant_id); const count = Math.min(Math.max(1, Number(ctx.body.count) || 1), 200);
  const status = ['awaiting_inspection', 'received', 'available'].includes(s(ctx.body.status)) ? s(ctx.body.status) : 'awaiting_inspection';
  let vals: Record<string, any>;
  try { vals = unitValues(ctx.body, can(ctx.user, 'costs.view')); } catch (e: any) { return back(ctx, `/admin/inventory/new?variant=${vid}`, undefined, e.message); }
  const v = await one<any>(db, 'SELECT id, sku, inventory_mode FROM product_variants WHERE id = $1', [vid]); if (!v) throw new HttpError(404, 'Variant not found');
  if (v.inventory_mode === 'unique') {
    const existing = await one<any>(db, `SELECT count(*)::int AS n FROM inventory_units WHERE variant_id = $1 AND status <> 'archived'`, [vid]);
    if (existing.n + count > 1) return back(ctx, `/admin/inventory/new?variant=${vid}`, undefined, 'A unique-unit product can only have one active unit. Create a separate listing or switch it to batch mode.');
  }
  if (count > 1 && vals.internal_serial) return back(ctx, `/admin/inventory/new?variant=${vid}`, undefined, 'Serial numbers are per unit — add units one at a time or leave serial empty and fill it per unit.');
  const ids = await db.tx(async (q) => {
    const out: number[] = [];
    const base = (await one<any>(q, 'SELECT count(*)::int AS n FROM inventory_units WHERE variant_id = $1', [vid])).n;
    for (let i = 0; i < count; i++) {
      const sku = `${v.sku}-${String(base + i + 1).padStart(2, '0')}-${crypto.randomBytes(2).toString('hex').toUpperCase()}`;
      const keys = Object.keys(vals);
      const u = await one<any>(q, `INSERT INTO inventory_units(variant_id, unit_sku, status, ${keys.join(', ')}) VALUES ($1,$2,$3::unit_status, ${keys.map((_, k) => `$${k + 4}`).join(', ')}) RETURNING id`,
        [vid, sku, status, ...keys.map((k) => vals[k])]);
      await q.query(`INSERT INTO inventory_movements(unit_id, from_status, to_status, reason, user_id) VALUES ($1, NULL, $2::unit_status, 'received into stock', $3)`, [u.id, status, ctx.user!.id]);
      out.push(u.id);
    }
    await audit(q, ctx.user!.id, 'inventory.receive', 'variant', vid, null, { count, status, cost: vals.purchase_cost ?? null }, ctx.ip);
    return out;
  });
  invalidateCatalog();
  back(ctx, ids.length === 1 ? `/admin/inventory/${ids[0]}` : `/admin/products/${vid}`, `${ids.length} unit(s) added`);
});

aroute('GET', '/admin/inventory/:id', 'inventory.view', async (ctx) => {
  const a = av(ctx); const id = Number(ctx.params.id); const costs = can(ctx.user, 'costs.view'); const edit = can(ctx.user, 'inventory.edit');
  const u = await one<any>(db, 'SELECT u.*, v.title, v.id AS vid FROM inventory_units u JOIN product_variants v ON v.id = u.variant_id WHERE u.id = $1', [id]);
  if (!u) throw new HttpError(404, 'Unit not found');
  const moves = await many<any>(db, 'SELECT m.*, us.name, o.number FROM inventory_movements m LEFT JOIN users us ON us.id = m.user_id LEFT JOIN orders o ON o.id = m.order_id WHERE m.unit_id = $1 ORDER BY m.id DESC', [id]);
  const insp = await many<any>(db, 'SELECT i.*, us.name FROM inspections i LEFT JOIN users us ON us.id = i.inspector_id WHERE unit_id = $1 ORDER BY i.id DESC', [id]);
  const next = MANUAL_TRANSITIONS[u.status as UnitStatus];
  const CHECKS = ['screen', 'keyboard', 'touchpad', 'ports', 'wifi', 'bluetooth', 'camera', 'speakers', 'microphone', 'charging', 'storage_health', 'stress_test'];
  page(ctx, (
    <AdminLayout a={a} title={`Unit ${u.unit_sku}`} actions={<a className="btn btn--sm" href={`/admin/products/${u.vid}`}>← {u.title}</a>}>
      <div className="cols cols--wide">
        <div>
          {edit ? (
            <form method="post" action={`/admin/inventory/${id}`} className="card stack"><Csrf a={a} />
              <h3>Unit details</h3>
              {!edit ? null : <UnitFields u={u} costs={costs} />}
              <button className="btn btn--primary">Save unit</button>
            </form>
          ) : <section className="card"><p>Status <Pill s={u.status} /> · battery {u.battery_health_pct ?? 'untested'}</p></section>}
          {edit ? (
            <form method="post" action={`/admin/inventory/${id}/inspection`} className="card stack"><Csrf a={a} />
              <h3>Record inspection</h3>
              <div className="checkgrid">{CHECKS.map((c) => <label key={c}><input type="checkbox" name={`chk_${c}`} value="1" defaultChecked /> {c.replace('_', ' ')}</label>)}</div>
              <F label="Result" name="functional_status" type="select" options={[['passed', 'Passed'], ['passed_with_notes', 'Passed with notes'], ['failed', 'Failed']]} />
              <F label="Notes (shown on the product page)" name="notes" type="textarea" dir="auto" />
              <button className="btn">Save inspection</button>
            </form>
          ) : null}
        </div>
        <div>
          <section className="card">
            <h3>Status: <Pill s={u.status} /></h3>
            {edit && next.length ? (
              <form method="post" action={`/admin/inventory/${id}/status`} className="stack"><Csrf a={a} />
                <F label="Change to" name="status" type="select" options={next.map((x) => [x, x.replace('_', ' ')])} /><F label="Reason" name="reason" required />
                <button className="btn btn--sm" data-confirm="Change unit status?">Change status</button>
              </form>
            ) : <p className="muted small">{['reserved', 'sold'].includes(u.status) ? 'Reserved/sold units are controlled by their order (cancel or return the order to release them).' : 'Read-only.'}</p>}
            {costs ? <p>Purchase cost: <b>{egp(u.purchase_cost)}</b></p> : null}
          </section>
          <section className="card"><h3>Inspections</h3>{insp.map((i) => <div key={i.id} className="small"><Pill s={i.functional_status} /> {dt(i.inspected_at)} · {i.name || 'seed'}<div>{i.notes}</div></div>)}{!insp.length ? <p className="muted">None recorded.</p> : null}</section>
          <section className="card"><h3>Movement history</h3><ul className="timeline">{moves.map((m) => <li key={m.id}><small>{dt(m.created_at)} · {m.name || 'system'}</small><div>{m.from_status ? <Pill s={m.from_status} /> : null} → <Pill s={m.to_status} /> {m.reason}{m.number ? <> · <a href={`/admin/orders/${m.order_id}`}>{m.number}</a></> : null}</div></li>)}</ul></section>
        </div>
      </div>
    </AdminLayout>
  ));
});

aroute('POST', '/admin/inventory/:id', 'inventory.edit', async (ctx) => {
  const id = Number(ctx.params.id); const costs = can(ctx.user, 'costs.view');
  let vals: Record<string, any>;
  try { vals = unitValues(ctx.body, costs); } catch (e: any) { return back(ctx, `/admin/inventory/${id}`, undefined, e.message); }
  try {
    await db.tx(async (q) => {
      const before = await one<any>(q, 'SELECT * FROM inventory_units WHERE id = $1 FOR UPDATE', [id]);
      const keys = Object.keys(vals);
      await q.query(`UPDATE inventory_units SET ${keys.map((k, i) => `${k} = $${i + 2}`).join(', ')}, updated_at = now() WHERE id = $1`, [id, ...keys.map((k) => vals[k])]);
      if (costs && before.purchase_cost !== vals.purchase_cost) await audit(q, ctx.user!.id, 'unit.cost_change', 'unit', id, { purchase_cost: before.purchase_cost }, { purchase_cost: vals.purchase_cost }, ctx.ip);
      if (before.battery_health_pct !== vals.battery_health_pct) await audit(q, ctx.user!.id, 'unit.battery_change', 'unit', id, { battery: before.battery_health_pct }, { battery: vals.battery_health_pct }, ctx.ip);
      await audit(q, ctx.user!.id, 'unit.update', 'unit', id, null, null, ctx.ip);
    });
  } catch (e: any) { return back(ctx, `/admin/inventory/${id}`, undefined, e.code === '23505' ? 'That serial number is already used by another unit' : e.message); }
  invalidateCatalog(); back(ctx, `/admin/inventory/${id}`, 'Unit saved');
});

aroute('POST', '/admin/inventory/:id/status', 'inventory.edit', async (ctx) => {
  const id = Number(ctx.params.id); const to = s(ctx.body.status) as UnitStatus; const reason = s(ctx.body.reason).slice(0, 300);
  const err = await db.tx(async (q) => {
    const u = await one<any>(q, 'SELECT status FROM inventory_units WHERE id = $1 FOR UPDATE', [id]);
    if (!u) return 'Not found';
    if (!MANUAL_TRANSITIONS[u.status as UnitStatus].includes(to)) return `Cannot change ${u.status} → ${to} manually`;
    const active = await one(q, `SELECT 1 FROM stock_reservations WHERE unit_id = $1 AND status = 'active'`, [id]);
    if (active) return 'Unit has an active reservation';
    await q.query('UPDATE inventory_units SET status = $2::unit_status, updated_at = now() WHERE id = $1', [id, to]);
    await q.query(`INSERT INTO inventory_movements(unit_id, from_status, to_status, reason, user_id) VALUES ($1,$2::unit_status,$3::unit_status,$4,$5)`, [id, u.status, to, reason || 'manual', ctx.user!.id]);
    await audit(q, ctx.user!.id, 'unit.status_change', 'unit', id, { status: u.status }, { status: to, reason }, ctx.ip);
    return null;
  });
  invalidateCatalog();
  err ? back(ctx, `/admin/inventory/${id}`, undefined, err) : back(ctx, `/admin/inventory/${id}`, `Status changed to ${to}`);
});

aroute('POST', '/admin/inventory/:id/inspection', 'inventory.edit', async (ctx) => {
  const id = Number(ctx.params.id); const fs_ = s(ctx.body.functional_status);
  if (!['passed', 'passed_with_notes', 'failed'].includes(fs_)) return back(ctx, `/admin/inventory/${id}`, undefined, 'Choose a result');
  const checklist: Record<string, boolean> = {};
  for (const k of ['screen', 'keyboard', 'touchpad', 'ports', 'wifi', 'bluetooth', 'camera', 'speakers', 'microphone', 'charging', 'storage_health', 'stress_test']) checklist[k] = bool(ctx.body[`chk_${k}`]);
  await db.query('INSERT INTO inspections(unit_id, inspector_id, functional_status, checklist, notes) VALUES ($1,$2,$3,$4,$5)', [id, ctx.user!.id, fs_, JSON.stringify(checklist), s(ctx.body.notes).slice(0, 1000) || null]);
  await audit(null, ctx.user!.id, 'unit.inspection', 'unit', id, null, { result: fs_ }, ctx.ip); invalidateCatalog();
  back(ctx, `/admin/inventory/${id}`, 'Inspection recorded');
});

// ---------------------------------------------------------------- import / export
aroute('GET', '/admin/export/inventory.csv', 'inventory.view', async (ctx) => {
  const costs = can(ctx.user, 'costs.view'); const serial = can(ctx.user, 'inventory.edit');
  const rows = await many<any>(db, `SELECT u.unit_sku, v.sku AS variant_sku, v.title, u.status, u.warehouse_location, u.battery_health_pct, u.battery_tested_at, u.defects, u.internal_serial, u.purchase_cost, v.price, u.created_at
    FROM inventory_units u JOIN product_variants v ON v.id = u.variant_id ORDER BY v.sku, u.id`);
  const out = rows.map((r) => ({ ...r, price: r.price / 100, purchase_cost: r.purchase_cost === null ? '' : r.purchase_cost / 100, battery_tested_at: r.battery_tested_at ? new Date(r.battery_tested_at).toISOString().slice(0, 10) : '', created_at: new Date(r.created_at).toISOString() }));
  const cols = ['unit_sku', 'variant_sku', 'title', 'status', 'warehouse_location', 'battery_health_pct', 'battery_tested_at', 'defects', ...(serial ? ['internal_serial'] : []), ...(costs ? ['purchase_cost'] : []), 'price', 'created_at'];
  await audit(null, ctx.user!.id, 'export.inventory', 'inventory', null, null, { rows: rows.length }, ctx.ip);
  sendText(ctx, toCsv(out, cols), 'text/csv; charset=utf-8', 200, { 'Content-Disposition': 'attachment; filename="inventory.csv"' });
});

const IMPORT_COLS = ['sku', 'brand', 'family_name', 'series', 'title', 'slug', 'inventory_mode', 'grade', 'price_egp', 'compare_at_egp', 'warranty_months', 'usages', 'published', 'units_to_add',
  'cpu_brand', 'cpu_model', 'cpu_tier', 'cpu_gen', 'cpu_cores', 'ram_gb', 'ram_type', 'ram_max_gb', 'storage_gb', 'storage_type', 'gpu_brand', 'gpu_model', 'gpu_dedicated', 'vram_gb',
  'screen_in', 'resolution', 'refresh_hz', 'touch', 'convertible', 'os', 'weight_kg', 'charger_included'];

aroute('GET', '/admin/import', 'import', async (ctx) => {
  const a = av(ctx);
  page(ctx, (
    <AdminLayout a={a} title="Import / Export">
      <div className="cols">
        <form method="post" action="/admin/import" encType="multipart/form-data" className="card stack"><Csrf a={a} />
          <h3>Import products (CSV)</h3>
          <p className="muted small">One row per sellable variant. Existing SKUs are updated; new SKUs are created as <b>unpublished</b> unless <code>published</code> = 1. <code>units_to_add</code> creates that many units in “awaiting inspection”.
            Booleans: 1 / 0 / empty (= unknown). <code>usages</code>: pipe-separated, e.g. <code>study|office</code>. Excel users: “Save As → CSV UTF-8”.</p>
          <input type="file" name="file" accept=".csv,text/csv" required />
          <label className="f"><span><input type="checkbox" name="dry_run" value="1" defaultChecked /> Dry run (validate only)</span></label>
          <button className="btn btn--primary">Import</button>
          <a href="/admin/import/template.csv">Download template</a>
        </form>
        <section className="card stack"><h3>Export</h3>
          <a className="btn" href="/admin/export/inventory.csv">Inventory units (CSV)</a>
          {can(ctx.user, 'export') ? <a className="btn" href="/admin/export/orders.csv">Orders (CSV)</a> : null}
          <p className="muted small">Columns with costs and serial numbers are only included for roles allowed to see them.</p></section>
      </div>
    </AdminLayout>
  ));
});
aroute('GET', '/admin/import/template.csv', 'import', async (ctx) => {
  const ex = { sku: 'LO-2001', brand: 'dell', family_name: 'Latitude 5410', series: 'Latitude', title: 'Dell Latitude 5410 — i5-10310U / 16GB / 256GB NVMe', slug: 'dell-latitude-5410-i5-16gb-256gb-good',
    inventory_mode: 'batch', grade: 'good', price_egp: '12500', compare_at_egp: '', warranty_months: '3', usages: 'study|office', published: '0', units_to_add: '3', cpu_brand: 'intel', cpu_model: 'Core i5-10310U',
    cpu_tier: 'i5', cpu_gen: '10', cpu_cores: '4', ram_gb: '16', ram_type: 'DDR4', ram_max_gb: '32', storage_gb: '256', storage_type: 'nvme', gpu_brand: 'intel', gpu_model: 'UHD Graphics', gpu_dedicated: '0',
    vram_gb: '', screen_in: '14', resolution: '1920x1080', refresh_hz: '60', touch: '0', convertible: '0', os: 'Windows 11 Pro', weight_kg: '1.45', charger_included: '1' };
  sendText(ctx, toCsv([ex], IMPORT_COLS), 'text/csv; charset=utf-8', 200, { 'Content-Disposition': 'attachment; filename="lapone-import-template.csv"' });
});

async function importRow(q: Queryable, r: Record<string, string>, userId: number): Promise<string> {
  if (!r.sku) throw new Error('sku required');
  const price = parseEGP(r.price_egp); if (price === null) throw new Error('price_egp invalid');
  const compare = r.compare_at_egp ? parseEGP(r.compare_at_egp) : null; if (compare !== null && compare <= price) throw new Error('compare_at_egp must be > price');
  const grade = r.grade ? (GRADES as readonly string[]).includes(r.grade) ? r.grade : (() => { throw new Error(`grade must be one of ${GRADES.join('/')}`); })() : null;
  const mode = r.inventory_mode === 'batch' ? 'batch' : 'unique';
  const brand = await one<any>(q, 'SELECT id, slug FROM brands WHERE slug = $1 OR lower(name) = lower($1)', [r.brand]);
  if (!brand) throw new Error(`unknown brand "${r.brand}" (create it first)`);
  const fslug = `${brand.slug}-${(r.family_name || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}`;
  if (!r.family_name) throw new Error('family_name required');
  const fam = await one<any>(q, `INSERT INTO product_families(brand_id, slug, name, series) VALUES ($1,$2,$3,$4) ON CONFLICT (slug) DO UPDATE SET series = COALESCE(EXCLUDED.series, product_families.series) RETURNING id`, [brand.id, fslug, r.family_name, r.series || null]);
  const body: Record<string, any> = { ...r };
  const specs = specValues(body);
  const usages = (r.usages || '').split('|').map((x) => x.trim()).filter((u) => (USAGES as readonly string[]).includes(u));
  const cols: Record<string, any> = { family_id: fam.id, title: r.title || r.sku, slug: r.slug || `${fslug}-${r.sku.toLowerCase()}`, inventory_mode: mode, grade, price, compare_at_price: compare,
    warranty_months: r.warranty_months === '' ? null : Number(r.warranty_months), usages, published: r.published === '1', ...specs };
  if (!/^[a-z0-9-]{3,120}$/.test(cols.slug)) throw new Error('slug invalid');
  const ex = await one<any>(q, 'SELECT id, price FROM product_variants WHERE sku = $1', [r.sku]);
  let id: number; let action: string;
  const keys = Object.keys(cols);
  if (ex) {
    await q.query(`UPDATE product_variants SET ${keys.map((k, i) => `${k} = $${i + 2}`).join(', ')}, updated_at = now() WHERE id = $1`, [ex.id, ...keys.map((k) => cols[k])]);
    if (ex.price !== price) { await q.query('INSERT INTO price_history(variant_id, old_price, new_price, changed_by) VALUES ($1,$2,$3,$4)', [ex.id, ex.price, price, userId]); await audit(q, userId, 'product.price_change', 'variant', ex.id, { price: ex.price }, { price, via: 'import' }); }
    id = ex.id; action = 'updated';
  } else {
    id = (await one<any>(q, `INSERT INTO product_variants(sku, ${keys.join(', ')}) VALUES ($1, ${keys.map((_, i) => `$${i + 2}`).join(', ')}) RETURNING id`, [r.sku, ...keys.map((k) => cols[k])])).id;
    action = 'created';
  }
  const add = Math.min(Number(r.units_to_add) || 0, 200);
  if (mode === 'unique' && add > 1) throw new Error('unique products can only receive 1 unit');
  for (let i = 0; i < add; i++) {
    const u = await one<any>(q, `INSERT INTO inventory_units(variant_id, unit_sku, status) VALUES ($1,$2,'awaiting_inspection') RETURNING id`, [id, `${r.sku}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`]);
    await q.query(`INSERT INTO inventory_movements(unit_id, to_status, reason, user_id) VALUES ($1,'awaiting_inspection','CSV import',$2)`, [u.id, userId]);
  }
  return `${action}${add ? ` + ${add} unit(s)` : ''}`;
}

aroute('POST', '/admin/import', 'import', async (ctx) => {
  const a = av(ctx); const file = ctx.files.find((f) => f.field === 'file');
  if (!file) return back(ctx, '/admin/import', undefined, 'Choose a CSV file');
  const rows = parseCsv(file.data.toString('utf8')).slice(0, 2000);
  const dry = bool(ctx.body.dry_run);
  const results: { row: number; sku: string; ok: boolean; msg: string }[] = [];
  const canEdit = can(ctx.user, 'products.edit');
  if (!canEdit) return back(ctx, '/admin/import', undefined, 'Importing products requires products.edit permission');
  try {
    await db.tx(async (q) => {
      for (const [i, r] of rows.entries()) {
        await q.query('SAVEPOINT r');
        try { results.push({ row: i + 2, sku: r.sku, ok: true, msg: await importRow(q, r, ctx.user!.id) }); await q.query('RELEASE SAVEPOINT r'); }
        catch (e: any) { await q.query('ROLLBACK TO SAVEPOINT r'); results.push({ row: i + 2, sku: r.sku, ok: false, msg: e.code === '23505' ? `duplicate (${e.constraint})` : e.message }); }
      }
      if (dry) throw Object.assign(new Error('dry run'), { dry: true });
      await audit(q, ctx.user!.id, 'import.products', 'variant', null, null, { rows: rows.length, ok: results.filter((x) => x.ok).length }, ctx.ip);
    });
  } catch (e: any) { if (!e.dry) throw e; }
  if (!dry) invalidateCatalog();
  page(ctx, (
    <AdminLayout a={a} title={dry ? 'Import preview (nothing saved)' : 'Import result'}>
      <p>{results.filter((r) => r.ok).length} OK · {results.filter((r) => !r.ok).length} errors {dry ? '— re-upload without “Dry run” to save.' : ''}</p>
      <table className="t t--rows"><thead><tr><th>Row</th><th>SKU</th><th>Result</th></tr></thead><tbody>{results.map((r) => <tr key={r.row} className={r.ok ? '' : 'bad'}><td>{r.row}</td><td>{r.sku}</td><td>{r.msg}</td></tr>)}</tbody></table>
      <a className="btn" href="/admin/import">Back</a>
    </AdminLayout>
  ));
});
void dOnly;
