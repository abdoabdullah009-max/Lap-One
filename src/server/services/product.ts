import { db, one, many } from '../db';
import { loadCatalog, perfIndex, type CatalogItem } from './catalog';

export interface PublicUnit {
  // Public-safe projection of an inventory unit: NO internal serial, NO purchase cost, NO location
  ref: string; battery_health_pct: number | null; battery_tested_at: string | null; battery_method: string | null;
  battery_notes: string | null; cosmetic_notes: string | null; screen_notes: string | null; keyboard_notes: string | null;
  defects: string | null; included_accessories: string | null;
  inspection: { functional_status: string; inspected_at: Date; checklist: Record<string, boolean>; notes: string | null } | null;
}
export interface ProductDetail {
  item: CatalogItem;
  family: { id: number; slug: string; name: string; description_ar: string | null; description_en: string | null };
  variant: Record<string, any>;
  images: { url: string; alt: string | null; kind: 'representative' | 'actual_unit'; width: number | null; height: number | null }[];
  upgrades: { id: number; kind: string; label_ar: string; label_en: string; price: number }[];
  units: PublicUnit[];
  siblings: CatalogItem[];
  reviews: { display_name: string; rating: number; body: string | null; created_at: Date }[];
}

export async function getProduct(slug: string): Promise<ProductDetail | null> {
  const all = await loadCatalog();
  const item = all.find((i) => i.slug === slug);
  if (!item) return null;
  const variant = await one<any>(db, `SELECT ports, connectivity, warranty_text_ar, warranty_text_en, keyboard_layout FROM product_variants WHERE id = $1`, [item.id]);
  const family = await one<any>(db, 'SELECT id, slug, name, description_ar, description_en FROM product_families WHERE id = $1', [item.family_id]);
  const images = await many<any>(db, 'SELECT url, alt, kind, width, height FROM product_images WHERE variant_id = $1 ORDER BY kind DESC, sort, id', [item.id]);
  const upgrades = await many<any>(db, 'SELECT id, kind, label_ar, label_en, price FROM upgrade_options WHERE variant_id = $1 AND active ORDER BY sort, id', [item.id]);
  const unitRows = await many<any>(db, `
    SELECT u.id, u.unit_sku, u.battery_health_pct, to_char(u.battery_tested_at, 'YYYY-MM-DD') AS battery_tested_at, u.battery_method,
           u.battery_notes, u.cosmetic_notes, u.screen_notes, u.keyboard_notes, u.defects, u.included_accessories,
           i.functional_status, i.inspected_at, i.checklist, i.notes AS inspection_notes
      FROM inventory_units u
      LEFT JOIN LATERAL (SELECT * FROM inspections WHERE unit_id = u.id ORDER BY inspected_at DESC LIMIT 1) i ON TRUE
     WHERE u.variant_id = $1 AND u.status = 'available' ORDER BY u.id`, [item.id]);
  const units: PublicUnit[] = unitRows.map((u) => ({
    ref: u.unit_sku.slice(-2), battery_health_pct: u.battery_health_pct, battery_tested_at: u.battery_tested_at, battery_method: u.battery_method,
    battery_notes: u.battery_notes, cosmetic_notes: u.cosmetic_notes, screen_notes: u.screen_notes, keyboard_notes: u.keyboard_notes,
    defects: u.defects, included_accessories: u.included_accessories,
    inspection: u.functional_status ? { functional_status: u.functional_status, inspected_at: u.inspected_at, checklist: u.checklist, notes: u.inspection_notes } : null,
  }));
  const siblings = all.filter((i) => i.family_id === item.family_id && i.id !== item.id);
  const reviews = await many<any>(db, 'SELECT display_name, rating, body, created_at FROM reviews WHERE variant_id = $1 AND approved AND verified ORDER BY created_at DESC LIMIT 20', [item.id]);
  return { item, family, variant, images, upgrades, units, siblings, reviews };
}

/** Genuinely comparable alternatives: same usage overlap, in stock, similar price band; with honest pros/cons. */
export async function relatedProducts(item: CatalogItem, limit = 4) {
  const all = (await loadCatalog()).filter((i) => !i.is_accessory && i.id !== item.id && i.available > 0);
  const scored = all.map((o) => {
    const overlap = o.usages.filter((u) => item.usages.includes(u)).length;
    const priceDiff = Math.abs(o.price - item.price) / item.price;
    return { o, s: overlap * 2 - priceDiff * 4 + (o.family_id === item.family_id ? -1 : 0) };
  }).filter((x) => x.s > -1.5).sort((a, b) => b.s - a.s).slice(0, limit).map((x) => x.o);
  return scored.map((o) => ({ item: o, diff: compareDiff(item, o) }));
}

export interface DiffNote { key: string; better: boolean; vars?: Record<string, string | number> }
/** Facts-only differences of `o` relative to `base`. */
export function compareDiff(base: CatalogItem, o: CatalogItem): DiffNote[] {
  const notes: DiffNote[] = [];
  const d = o.price - base.price;
  if (Math.abs(d) >= 50_000) notes.push({ key: d < 0 ? 'cheaper' : 'pricier', better: d < 0, vars: { amount: Math.abs(d) } });
  if ((o.ram_gb || 0) !== (base.ram_gb || 0)) notes.push({ key: 'ram', better: (o.ram_gb || 0) > (base.ram_gb || 0), vars: { n: o.ram_gb || 0 } });
  if ((o.storage_gb || 0) !== (base.storage_gb || 0)) notes.push({ key: 'storage', better: (o.storage_gb || 0) > (base.storage_gb || 0), vars: { n: o.storage_gb || 0 } });
  if (!!o.gpu_dedicated !== !!base.gpu_dedicated) notes.push({ key: o.gpu_dedicated ? 'dgpu' : 'igpu', better: !!o.gpu_dedicated, vars: { model: o.gpu_model || '' } });
  const p1 = perfIndex(base), p2 = perfIndex(o);
  if (Math.abs(p2 - p1) > 1.2) notes.push({ key: 'cpu', better: p2 > p1, vars: { model: o.cpu_model || '' } });
  if (o.weight_kg && base.weight_kg && Math.abs(o.weight_kg - base.weight_kg) >= 0.3) notes.push({ key: o.weight_kg < base.weight_kg ? 'lighter' : 'heavier', better: o.weight_kg < base.weight_kg, vars: { kg: o.weight_kg } });
  const gr = ['fair', 'good', 'very_good', 'excellent'];
  if (o.grade && base.grade && o.grade !== base.grade) notes.push({ key: 'grade', better: gr.indexOf(o.grade) > gr.indexOf(base.grade), vars: { grade: o.grade } });
  return notes.slice(0, 4);
}
