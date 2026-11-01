/**
 * Catalog read model. Loads published variants with live availability (counted from
 * inventory_units, never from a client counter) and serves filtering, facets, sorting and search.
 *
 * The snapshot is cached briefly and invalidated on every inventory/product/order write.
 * For catalogs beyond ~10k SKUs, move filtering into SQL (indexes already exist) — the
 * Filters interface stays the same.
 */
import { db, many } from '../db';
import { parseQuery, textScore, tokenizeDoc, normalize, type ParsedQuery } from './search';

export interface CatalogItem {
  id: number; slug: string; sku: string; title: string; family_id: number; family_slug: string; family_name: string;
  series: string | null; brand_slug: string; brand_name: string; brand_aliases: string[]; inventory_mode: 'unique' | 'batch';
  grade: string | null; cpu_brand: string | null; cpu_model: string | null; cpu_tier: string | null; cpu_gen: number | null;
  cpu_cores: number | null; ram_gb: number | null; ram_type: string | null; ram_max_gb: number | null; storage_gb: number | null;
  storage_type: string | null; gpu_brand: string | null; gpu_model: string | null; gpu_dedicated: boolean | null; vram_gb: number | null;
  screen_in: number | null; resolution: string | null; refresh_hz: number | null; touch: boolean | null; convertible: boolean | null;
  os: string | null; weight_kg: number | null; charger_included: boolean | null; usages: string[]; price: number;
  compare_at_price: number | null; warranty_months: number | null; is_offer: boolean; is_accessory: boolean; is_sample: boolean;
  created_at: Date; available: number; sold: number; rating_avg: number | null; rating_count: number;
  image: string | null; image_kind: string | null; battery_min: number | null; battery_max: number | null; battery_untested: number;
  has_upgrades: boolean;
  _doc: string[];
}

export interface Filters {
  q?: string; brand?: string[]; series?: string[]; family?: string[]; usage?: string[]; cpu_brand?: string[]; cpu_tier?: string[];
  cpu_gen?: number[]; cpu_model?: string[]; ram?: number[]; ram_type?: string[]; storage?: number[]; storage_min?: number;
  storage_type?: string[]; gpu_brand?: string[]; gpu_model?: string[]; vram?: number[]; gpu_type?: string[]; screen?: string[];
  resolution?: string[]; refresh?: string[]; touch?: boolean; convertible?: boolean; grade?: string[]; battery_known?: boolean;
  in_stock?: boolean; offer?: boolean; min?: number; max?: number; accessory?: boolean; sort?: string; page?: number;
}

let snapshot: { at: number; items: CatalogItem[] } | null = null;
const TTL = 30_000;

export function invalidateCatalog() { snapshot = null; }

export async function loadCatalog(): Promise<CatalogItem[]> {
  if (snapshot && Date.now() - snapshot.at < TTL) return snapshot.items;
  const rows = await many<CatalogItem>(db, `
    SELECT v.id, v.slug, v.sku, v.title, v.family_id, f.slug AS family_slug, f.name AS family_name, f.series,
           b.slug AS brand_slug, b.name AS brand_name, b.aliases AS brand_aliases, v.inventory_mode, v.grade,
           v.cpu_brand, v.cpu_model, v.cpu_tier, v.cpu_gen, v.cpu_cores, v.ram_gb, v.ram_type, v.ram_max_gb,
           v.storage_gb, v.storage_type, v.gpu_brand, v.gpu_model, v.gpu_dedicated, v.vram_gb, v.screen_in, v.resolution,
           v.refresh_hz, v.touch, v.convertible, v.os, v.weight_kg, v.charger_included, v.usages, v.price, v.compare_at_price,
           v.warranty_months, v.is_offer, f.is_accessory, v.is_sample, v.created_at,
           COALESCE(u.available, 0)::int AS available,
           COALESCE(s.sold, 0)::int AS sold,
           r.rating_avg, COALESCE(r.rating_count, 0)::int AS rating_count,
           img.url AS image, img.kind AS image_kind,
           u.battery_min, u.battery_max, COALESCE(u.battery_untested, 0)::int AS battery_untested,
           EXISTS (SELECT 1 FROM upgrade_options o WHERE o.variant_id = v.id AND o.active) AS has_upgrades
      FROM product_variants v
      JOIN product_families f ON f.id = v.family_id
      JOIN brands b ON b.id = f.brand_id
      LEFT JOIN LATERAL (
        SELECT count(*) AS available, min(battery_health_pct) AS battery_min, max(battery_health_pct) AS battery_max,
               count(*) FILTER (WHERE battery_health_pct IS NULL) AS battery_untested
          FROM inventory_units WHERE variant_id = v.id AND status = 'available') u ON TRUE
      LEFT JOIN LATERAL (
        SELECT count(*) AS sold FROM order_items oi JOIN orders o ON o.id = oi.order_id
         WHERE oi.variant_id = v.id AND o.status IN ('confirmed','preparing','shipped','delivered')) s ON TRUE
      LEFT JOIN LATERAL (
        SELECT round(avg(rating)::numeric, 1) AS rating_avg, count(*) AS rating_count
          FROM reviews WHERE variant_id = v.id AND approved AND verified) r ON TRUE
      LEFT JOIN LATERAL (
        SELECT url, kind FROM product_images WHERE variant_id = v.id ORDER BY sort, id LIMIT 1) img ON TRUE
     WHERE v.published AND NOT v.archived`);
  for (const it of rows) {
    it._doc = tokenizeDoc(it.title, it.brand_name, ...(it.brand_aliases || []), it.family_name, it.series, it.cpu_model,
      it.cpu_tier, it.gpu_model, it.sku, it.ram_gb ? `${it.ram_gb}gb` : '', it.os);
  }
  snapshot = { at: Date.now(), items: rows };
  return rows;
}

// ---- helpers ---------------------------------------------------------------------------
export function resolutionClass(res: string | null): string | null {
  if (!res) return null;
  const w = Number(res.split('x')[0]);
  if (w >= 3800) return '4k'; if (w >= 2500) return 'qhd'; if (w >= 1900) return 'fhd'; return 'hd';
}
export function screenBucket(inch: number | null): string | null {
  if (!inch) return null; return String(Math.floor(inch));
}
export function refreshClass(hz: number | null): string | null {
  if (!hz) return null; return hz >= 120 ? '120+' : '60';
}
export function storageBucket(gb: number | null): number | null {
  if (!gb) return null; if (gb >= 2048) return 2048; if (gb >= 1024) return 1024; if (gb >= 512) return 512; if (gb >= 256) return 256; return 128;
}

const inList = <T>(arr: T[] | undefined, v: T | null | undefined) => !arr?.length || (v !== null && v !== undefined && arr.includes(v));

export function matches(it: CatalogItem, f: Filters, skip?: keyof Filters): boolean {
  const k = (key: keyof Filters) => key !== skip;
  if (k('accessory') && f.accessory !== undefined && it.is_accessory !== f.accessory) return false;
  if (k('brand') && !inList(f.brand, it.brand_slug)) return false;
  if (k('series') && f.series?.length && !f.series.some((s) => normalize(it.series || '') === s || it._doc.includes(s))) return false;
  if (k('family') && !inList(f.family, it.family_slug)) return false;
  if (k('usage') && f.usage?.length && !f.usage.some((u) => it.usages.includes(u))) return false;
  if (k('cpu_brand') && !inList(f.cpu_brand, it.cpu_brand)) return false;
  if (k('cpu_tier') && !inList(f.cpu_tier, it.cpu_tier)) return false;
  if (k('cpu_gen') && !inList(f.cpu_gen, it.cpu_gen)) return false;
  if (k('cpu_model') && f.cpu_model?.length && !f.cpu_model.some((m) => normalize(it.cpu_model || '').replace(/[\s-]/g, '').includes(normalize(m).replace(/[\s-]/g, '')))) return false;
  if (k('ram') && !inList(f.ram, it.ram_gb)) return false;
  if (k('ram_type') && !inList(f.ram_type, it.ram_type)) return false;
  if (k('storage') && !inList(f.storage, storageBucket(it.storage_gb))) return false;
  if (f.storage_min && (it.storage_gb || 0) < f.storage_min) return false;
  if (k('storage_type') && !inList(f.storage_type, it.storage_type)) return false;
  if (k('gpu_brand') && !inList(f.gpu_brand, it.gpu_brand)) return false;
  if (k('gpu_model') && f.gpu_model?.length && !f.gpu_model.some((g) => normalize(it.gpu_model || '').replace(/\s/g, '').includes(normalize(g).replace(/\s/g, '')))) return false;
  if (k('vram') && !inList(f.vram, it.vram_gb)) return false;
  if (k('gpu_type') && f.gpu_type?.length && !f.gpu_type.includes(it.gpu_dedicated ? 'dedicated' : it.gpu_dedicated === false ? 'integrated' : '?')) return false;
  if (k('screen') && !inList(f.screen, screenBucket(it.screen_in))) return false;
  if (k('resolution') && !inList(f.resolution, resolutionClass(it.resolution))) return false;
  if (k('refresh') && !inList(f.refresh, refreshClass(it.refresh_hz))) return false;
  if (k('touch') && f.touch !== undefined && it.touch !== f.touch) return false;
  if (k('convertible') && f.convertible !== undefined && it.convertible !== f.convertible) return false;
  if (k('grade') && !inList(f.grade, it.grade)) return false;
  if (k('battery_known') && f.battery_known && !(it.battery_max !== null)) return false;
  if (k('in_stock') && f.in_stock && it.available < 1) return false;
  if (k('offer') && f.offer && !it.is_offer) return false;
  if (k('min') && f.min !== undefined && it.price < f.min * 100) return false;
  if (k('max') && f.max !== undefined && it.price > f.max * 100) return false;
  return true;
}

/** Value-for-money heuristic used by "recommended" sort and the "Best value" section. */
export function perfIndex(it: CatalogItem): number {
  const tierScore: Record<string, number> = { i3: 2, r3: 2, i5: 4, r5: 4.3, u5: 5, i7: 6, r7: 6.3, u7: 7, i9: 8, r9: 8.3, m1: 6, m2: 7, m3: 8, m4: 9 };
  let p = tierScore[it.cpu_tier || ''] ?? 3;
  if (it.cpu_gen) p += Math.max(0, it.cpu_gen - 7) * 0.45;
  if (/\d{4,5}h[xsk]?\b/i.test(it.cpu_model || '')) p += 1.5;
  p += Math.min(it.ram_gb || 8, 64) / 8;
  if (it.gpu_dedicated) p += 1.5 + (it.vram_gb || 0) * 0.35;
  if (it.storage_type === 'nvme' || it.storage_type === 'ssd') p += 0.6;
  const gradeAdj: Record<string, number> = { excellent: 1, very_good: 0.6, good: 0.2, fair: -0.5 };
  p += gradeAdj[it.grade || ''] ?? 0;
  return p;
}
export function valueScore(it: CatalogItem): number { return perfIndex(it) / Math.max(it.price / 100_000, 1); }

const complete = (i: CatalogItem) => Number(!!(i.ram_gb && i.storage_gb && i.cpu_gen));
export function sortItems(items: CatalogItem[], sort = 'recommended', scores?: Map<number, number>): CatalogItem[] {
  const arr = [...items];
  const stock = (a: CatalogItem, b: CatalogItem) => Number(b.available > 0) - Number(a.available > 0);
  switch (sort) {
    case 'price_asc': return arr.sort((a, b) => stock(a, b) || a.price - b.price);
    case 'price_desc': return arr.sort((a, b) => stock(a, b) || b.price - a.price);
    case 'newest': return arr.sort((a, b) => stock(a, b) || +b.created_at - +a.created_at);
    case 'best_selling': return arr.sort((a, b) => stock(a, b) || b.sold - a.sold || a.price - b.price);
    case 'rating': return arr.sort((a, b) => stock(a, b) || (b.rating_avg ?? -1) - (a.rating_avg ?? -1) || b.rating_count - a.rating_count);
    default:
      return arr.sort((a, b) => stock(a, b) || ((scores?.get(b.id) ?? 0) - (scores?.get(a.id) ?? 0))
        || Number(b.is_offer) - Number(a.is_offer) || complete(b) - complete(a) || (b.cpu_gen || 0) - (a.cpu_gen || 0) || valueScore(b) - valueScore(a));
  }
}

export interface FacetValue { value: string; count: number }
export type Facets = Record<string, FacetValue[]>;

function facet(items: CatalogItem[], f: Filters, key: keyof Filters, get: (it: CatalogItem) => string | number | null | undefined): FacetValue[] {
  const counts = new Map<string, number>();
  for (const it of items) {
    if (!matches(it, f, key)) continue;
    const v = get(it); if (v === null || v === undefined || v === '') continue;
    counts.set(String(v), (counts.get(String(v)) || 0) + 1);
  }
  return [...counts].map(([value, count]) => ({ value, count }));
}

export interface SearchResult {
  items: CatalogItem[]; total: number; facets: Facets; parsed: ParsedQuery | null; priceRange: [number, number];
  effective: Filters; relaxed: boolean;
}

export async function searchCatalog(input: Filters, pageSize = 24): Promise<SearchResult> {
  const all = (await loadCatalog()).filter((i) => input.accessory ? i.is_accessory : !i.is_accessory);
  let f: Filters = { ...input };
  let parsed: ParsedQuery | null = null;
  let scored = new Map<number, number>();
  let pool = all;
  let relaxed = false;

  if (input.q && input.q.trim()) {
    const brandAliases: Record<string, string[]> = {};
    for (const it of all) brandAliases[it.brand_slug] = [it.brand_name, ...(it.brand_aliases || [])];
    parsed = parseQuery(input.q, { brands: brandAliases });
    // structured parts of the query merge into the filters (explicit URL filters win)
    for (const [k, v] of Object.entries(parsed.filters)) if ((f as any)[k] === undefined || ((f as any)[k]?.length === 0)) (f as any)[k] = v;
    if (parsed.text.length) {
      const strict: CatalogItem[] = []; const loose: CatalogItem[] = [];
      for (const it of all) {
        const { score, matchedAll } = textScore(parsed.text, it._doc);
        if (score > 0) { scored.set(it.id, score); (matchedAll ? strict : loose).push(it); }
      }
      if (strict.length) pool = strict;
      else if (loose.length) { pool = loose; relaxed = true; }
      else if (parsed.understood.length) relaxed = true;  // unknown words ignored, structured filters still apply
      else pool = [];
    }
  }

  const filtered = pool.filter((it) => matches(it, f));
  const sorted = sortItems(filtered, f.sort, scored);
  const page = Math.max(1, f.page || 1);
  const prices = all.map((i) => i.price / 100);

  const facets: Facets = {
    brand: facet(pool, f, 'brand', (i) => i.brand_slug),
    family: facet(pool, f, 'family', (i) => i.family_slug),
    usage: (() => { const c = new Map<string, number>(); for (const it of pool) if (matches(it, f, 'usage')) for (const u of it.usages) c.set(u, (c.get(u) || 0) + 1); return [...c].map(([value, count]) => ({ value, count })); })(),
    cpu_brand: facet(pool, f, 'cpu_brand', (i) => i.cpu_brand),
    cpu_tier: facet(pool, f, 'cpu_tier', (i) => i.cpu_tier),
    cpu_gen: facet(pool, f, 'cpu_gen', (i) => i.cpu_gen),
    cpu_model: facet(pool, f, 'cpu_model', (i) => i.cpu_model),
    ram: facet(pool, f, 'ram', (i) => i.ram_gb),
    ram_type: facet(pool, f, 'ram_type', (i) => i.ram_type),
    storage: facet(pool, f, 'storage', (i) => storageBucket(i.storage_gb)),
    storage_type: facet(pool, f, 'storage_type', (i) => i.storage_type),
    gpu_type: facet(pool, f, 'gpu_type', (i) => i.gpu_dedicated === null ? null : i.gpu_dedicated ? 'dedicated' : 'integrated'),
    gpu_brand: facet(pool, f, 'gpu_brand', (i) => i.gpu_brand),
    gpu_model: facet(pool, f, 'gpu_model', (i) => i.gpu_model),
    vram: facet(pool, f, 'vram', (i) => i.vram_gb),
    screen: facet(pool, f, 'screen', (i) => screenBucket(i.screen_in)),
    resolution: facet(pool, f, 'resolution', (i) => resolutionClass(i.resolution)),
    refresh: facet(pool, f, 'refresh', (i) => refreshClass(i.refresh_hz)),
    touch: facet(pool, f, 'touch', (i) => i.touch ? 'true' : null),
    convertible: facet(pool, f, 'convertible', (i) => i.convertible ? 'true' : null),
    grade: facet(pool, f, 'grade', (i) => i.grade),
    battery_known: facet(pool, f, 'battery_known', (i) => i.battery_max !== null ? 'true' : null),
    in_stock: facet(pool, f, 'in_stock', (i) => i.available > 0 ? 'true' : null),
    offer: facet(pool, f, 'offer', (i) => i.is_offer ? 'true' : null),
  };
  return {
    items: sorted.slice((page - 1) * pageSize, page * pageSize), total: sorted.length, facets, parsed,
    priceRange: [Math.floor(Math.min(...prices, 0)), Math.ceil(Math.max(...prices, 0))], effective: f, relaxed,
  };
}

/** Parse catalog filters from URL search params (multi-value supported: ?brand=dell&brand=hp). */
export function filtersFromParams(sp: URLSearchParams): Filters {
  const list = (k: string) => { const v = sp.getAll(k).flatMap((x) => x.split(',')).map((x) => x.trim()).filter(Boolean); return v.length ? v : undefined; };
  const nums = (k: string) => list(k)?.map(Number).filter((n) => Number.isFinite(n));
  const bool = (k: string) => (sp.get(k) === '1' || sp.get(k) === 'true') ? true : undefined;
  const num = (k: string) => { const v = sp.get(k); if (!v) return undefined; const n = Number(v.replace(/[^\d]/g, '')); return Number.isFinite(n) && n > 0 ? n : undefined; };
  return {
    q: sp.get('q')?.slice(0, 120) || undefined, brand: list('brand'), series: list('series'), family: list('family'), usage: list('usage'),
    cpu_brand: list('cpu_brand'), cpu_tier: list('cpu_tier'), cpu_gen: nums('cpu_gen'), cpu_model: list('cpu_model'), ram: nums('ram'),
    ram_type: list('ram_type'), storage: nums('storage'), storage_type: list('storage_type'), gpu_brand: list('gpu_brand'),
    gpu_model: list('gpu_model'), vram: nums('vram'), gpu_type: list('gpu_type'), screen: list('screen'), resolution: list('resolution'),
    refresh: list('refresh'), touch: bool('touch'), convertible: bool('convertible'), grade: list('grade'), battery_known: bool('battery_known'),
    in_stock: bool('in_stock'), offer: bool('offer'), min: num('min'), max: num('max'), sort: sp.get('sort') || undefined,
    page: num('page'), accessory: sp.get('accessory') === '1' ? true : undefined,
  };
}

export async function getItemsByIds(ids: number[]): Promise<CatalogItem[]> {
  const all = await loadCatalog();
  const map = new Map(all.map((i) => [i.id, i]));
  return ids.map((id) => map.get(id)).filter(Boolean) as CatalogItem[];
}

export async function suggest(q: string) {
  const res = await searchCatalog({ q }, 6);
  const nq = normalize(q);
  const all = await loadCatalog();
  const families = [...new Map(all.filter((i) => !i.is_accessory).map((i) => [i.family_slug, `${i.brand_name} ${i.family_name}`])).values()]
    .filter((name) => tokenizeDoc(name).some((t) => nq.split(' ').some((w) => w.length >= 2 && t.startsWith(w)))).slice(0, 4);
  return { items: res.items, total: res.total, understood: res.parsed?.understood || [], families };
}
