import type { SearchResult, Filters } from '../../server/services/catalog';
import { brand } from '../../config/brand';
import { Layout } from '../Layout';
import { View, Icon, href, ProductCard, Breadcrumbs, gradeLabel } from '../ui';

export interface CatalogData { res: SearchResult; filters: Filters; brandNames: Record<string, string>; familyNames: Record<string, string>; pageSize: number }

const TIER: Record<string, string> = { i3: 'Core i3', i5: 'Core i5', i7: 'Core i7', i9: 'Core i9', r3: 'Ryzen 3', r5: 'Ryzen 5', r7: 'Ryzen 7', r9: 'Ryzen 9', u5: 'Core Ultra 5', u7: 'Core Ultra 7', m1: 'Apple M1', m2: 'Apple M2', m3: 'Apple M3', m4: 'Apple M4' };
const RES: Record<string, string> = { hd: 'HD', fhd: 'Full HD', qhd: 'QHD+', '4k': '4K' };

export function labelFor(v: View, key: string, value: string, d: Pick<CatalogData, 'brandNames' | 'familyNames'>): string {
  switch (key) {
    case 'brand': return d.brandNames[value] || value;
    case 'family': return d.familyNames[value] || value;
    case 'usage': return v.t(`usage_${value}` as any);
    case 'cpu_tier': return TIER[value] || value.toUpperCase();
    case 'cpu_brand': return value === 'amd' ? 'AMD' : value === 'apple' ? 'Apple' : 'Intel';
    case 'cpu_gen': return v.t('gen_n', { n: value });
    case 'ram': case 'vram': return `${value}GB`;
    case 'storage': return Number(value) >= 1024 ? `${Number(value) / 1024}TB+` : `${value}GB+`;
    case 'storage_type': return value === 'nvme' ? 'NVMe SSD' : value.toUpperCase();
    case 'gpu_brand': return value === 'nvidia' ? 'NVIDIA' : value === 'amd' ? 'AMD' : value === 'apple' ? 'Apple' : 'Intel';
    case 'gpu_type': return v.t(value as any);
    case 'screen': return `${value}"`;
    case 'resolution': return RES[value] || value;
    case 'refresh': return value === '120+' ? '120Hz+' : '60Hz';
    case 'grade': return gradeLabel(v, value);
    default: return value;
  }
}

const GROUPS: { key: string; label: string; open?: boolean; sortNum?: boolean }[] = [
  { key: 'usage', label: 'f_usage', open: true }, { key: 'brand', label: 'f_brand', open: true }, { key: 'family', label: 'f_family' },
  { key: 'cpu_brand', label: 'f_cpu_brand' }, { key: 'cpu_tier', label: 'f_cpu_tier', open: true }, { key: 'cpu_gen', label: 'f_cpu_gen', sortNum: true },
  { key: 'cpu_model', label: 'f_cpu_model' }, { key: 'ram', label: 'f_ram', open: true, sortNum: true }, { key: 'ram_type', label: 'f_ram_type' },
  { key: 'storage', label: 'f_storage', sortNum: true }, { key: 'storage_type', label: 'f_storage_type' }, { key: 'gpu_type', label: 'f_gpu_type', open: true },
  { key: 'gpu_brand', label: 'f_gpu_brand' }, { key: 'gpu_model', label: 'f_gpu_model' }, { key: 'vram', label: 'f_vram', sortNum: true },
  { key: 'screen', label: 'f_screen', sortNum: true }, { key: 'resolution', label: 'f_resolution' }, { key: 'refresh', label: 'f_refresh' },
  { key: 'grade', label: 'f_grade', open: true },
];
const BOOLS = [['in_stock', 'f_in_stock'], ['offer', 'f_offer'], ['touch', 'f_touch'], ['convertible', 'f_convertible'], ['battery_known', 'f_battery_known']] as const;

function qsWithout(f: Filters, key: string, value?: string): string {
  const sp = new URLSearchParams();
  for (const [k, val] of Object.entries(f)) {
    if (val === undefined || k === 'page') continue;
    if (Array.isArray(val)) for (const x of val) { if (!(k === key && String(x) === value)) sp.append(k, String(x)); }
    else if (!(k === key && (value === undefined || String(val) === value))) sp.set(k, typeof val === 'boolean' ? '1' : String(val));
  }
  const s = sp.toString(); return s ? `?${s}` : '';
}

export function CatalogPage({ v, d }: { v: View; d: CatalogData }) {
  const { t, locale } = v;
  const { res, filters: f } = d;
  const sel = (key: string) => ((f as any)[key] || []).map(String) as string[];
  const usage = f.usage?.length === 1 ? f.usage[0] : null;
  const title = f.q ? `${locale === 'ar' ? 'نتائج البحث عن' : 'Results for'} “${f.q}”` : f.accessory ? t('accessories') : usage ? t(`usage_${usage}` as any)
    : f.offer ? t('offers') : f.brand?.length === 1 ? `${d.brandNames[f.brand[0]] || f.brand[0]}` : t('all_laptops');
  const page = f.page || 1; const pages = Math.max(1, Math.ceil(res.total / d.pageSize));
  const active: { key: string; value: string; label: string }[] = [];
  for (const g of GROUPS) for (const val of sel(g.key)) active.push({ key: g.key, value: val, label: labelFor(v, g.key, val, d) });
  for (const [k, l] of BOOLS) if ((f as any)[k]) active.push({ key: k, value: 'true', label: t(l) });
  if (f.min) active.push({ key: 'min', value: String(f.min), label: `≥ ${f.min.toLocaleString(locale === 'ar' ? 'ar-EG' : 'en')}` });
  if (f.max) active.push({ key: 'max', value: String(f.max), label: `≤ ${f.max.toLocaleString(locale === 'ar' ? 'ar-EG' : 'en')}` });
  const base = href(v, '/laptops');
  const hasFilters = active.length > 0 || !!f.q;
  return (
    <Layout v={v} meta={{
      title: `${title} | ${brand.name}`, description: locale === 'ar' ? `${title} — لابتوبات مستوردة بمواصفات وحالة واضحة وأسعار بالجنيه المصري.` : `${title} — imported laptops with clear specs, condition and EGP prices.`,
      noindex: !!f.q || active.length > 1, canonical: `${v.baseUrl}${base}${usage && active.length === 1 ? `?usage=${usage}` : ''}`,
      jsonLd: [{ '@context': 'https://schema.org', '@type': 'ItemList', itemListElement: res.items.map((it, i) => ({ '@type': 'ListItem', position: i + 1, url: `${v.baseUrl}${href(v, `/p/${it.slug}`)}` })) }],
    }}>
      <div className="container">
        <Breadcrumbs items={[{ name: t('home'), url: href(v) }, { name: t('all_laptops'), url: base }, ...(title !== t('all_laptops') ? [{ name: title }] : [])]} />
        <div className="cat-head">
          <div>
            <h1>{title}</h1>
            <p className="muted" aria-live="polite">{t('results', { n: res.total })}</p>
          </div>
          <form method="get" action={base} className="cat-sort js-autosubmit">
            {Object.entries(f).flatMap(([k, val]) => k === 'sort' || k === 'page' || val === undefined ? [] : Array.isArray(val) ? val.map((x, i) => <input key={k + i} type="hidden" name={k} value={String(x)} />) : [<input key={k} type="hidden" name={k} value={typeof val === 'boolean' ? '1' : String(val)} />])}
            <label htmlFor="sort">{t('sort')}</label>
            <select id="sort" name="sort" defaultValue={f.sort || 'recommended'}>
              {['recommended', 'price_asc', 'price_desc', 'newest', 'best_selling', 'rating'].map((s) => <option key={s} value={s}>{t(`sort_${s}` as any)}</option>)}
            </select>
            <noscript><button className="btn btn--sm">{t('apply')}</button></noscript>
          </form>
          <button type="button" className="btn btn--outline btn--sm cat-filter-btn js-filters-open" aria-controls="filters"><Icon name="filter" size={16} />{t('filters')}{active.length ? ` (${active.length})` : ''}</button>
        </div>
        {res.parsed && res.parsed.understood.length ? (
          <div className="understood"><span>{t('search_understood')}</span>{res.parsed.understood.map((u, i) => <span key={i} className="chip chip--sm">{u.key === 'usage' ? t(`usage_${u.label}` as any) : u.label}</span>)}</div>
        ) : null}
        {active.length ? (
          <div className="active-filters">
            {active.map((a, i) => <a key={i} className="chip chip--sm chip--x" href={`${base}${qsWithout(f, a.key, a.value)}`} aria-label={`${t('remove')}: ${a.label}`}>{a.label}<Icon name="x" size={14} /></a>)}
            <a className="link" href={f.q ? `${base}?q=${encodeURIComponent(f.q)}` : base}>{t('reset_filters')}</a>
          </div>
        ) : null}

        <div className="cat">
          <aside className="filters" id="filters" aria-label={t('filters')}>
            <div className="filters__head"><b>{t('filters')}</b><button type="button" className="iconbtn js-filters-close" aria-label={t('close')}><Icon name="x" /></button></div>
            <form method="get" action={base} className="js-filterform">
              {f.q ? <input type="hidden" name="q" value={f.q} /> : null}
              {f.sort ? <input type="hidden" name="sort" value={f.sort} /> : null}
              {f.accessory ? <input type="hidden" name="accessory" value="1" /> : null}
              <fieldset className="fgroup">
                <legend>{t('f_price')}</legend>
                <div className="fprice">
                  <label><span>{t('f_min')}</span><input type="number" name="min" inputMode="numeric" min={0} step={500} defaultValue={f.min} placeholder={String(res.priceRange[0])} /></label>
                  <label><span>{t('f_max')}</span><input type="number" name="max" inputMode="numeric" min={0} step={500} defaultValue={f.max} placeholder={String(res.priceRange[1])} /></label>
                </div>
              </fieldset>
              <fieldset className="fgroup fgroup--bools">
                <legend className="sr-only">{t('f_availability')}</legend>
                {BOOLS.map(([k, l]) => {
                  const count = res.facets[k]?.find((x) => x.value === 'true')?.count || 0;
                  const on = !!(f as any)[k];
                  if (!count && !on) return null;
                  return <label key={k} className="check"><input type="checkbox" name={k} value="1" defaultChecked={on} /><span>{t(l)}</span><small>{count}</small></label>;
                })}
              </fieldset>
              {GROUPS.map((g) => {
                let vals = res.facets[g.key] || [];
                const selected = sel(g.key);
                for (const s of selected) if (!vals.find((x) => x.value === s)) vals = [...vals, { value: s, count: 0 }];
                if (!vals.length || (vals.length < 2 && !selected.length)) return null;
                vals = [...vals].sort((a, b) => g.sortNum ? Number(a.value) - Number(b.value) : labelFor(v, g.key, a.value, d).localeCompare(labelFor(v, g.key, b.value, d)));
                return (
                  <details key={g.key} className="fgroup" open={g.open || selected.length > 0}>
                    <summary>{t(g.label as any)}{selected.length ? <span className="count">{selected.length}</span> : null}<Icon name="chevronDown" size={16} /></summary>
                    <div className="fgroup__opts">
                      {vals.map((x) => (
                        <label key={x.value} className={`check${x.count === 0 && !selected.includes(x.value) ? ' is-empty' : ''}`}>
                          <input type="checkbox" name={g.key} value={x.value} defaultChecked={selected.includes(x.value)} />
                          <span>{labelFor(v, g.key, x.value, d)}</span><small>{x.count}</small>
                        </label>
                      ))}
                    </div>
                  </details>
                );
              })}
              <div className="filters__actions">
                <button className="btn btn--primary btn--block">{t('show_results')}</button>
                {hasFilters ? <a className="btn btn--ghost btn--block" href={base}>{t('reset_filters')}</a> : null}
              </div>
            </form>
          </aside>
          <div className="cat__results">
            {res.items.length ? (
              <div className="grid" data-list="catalog">{res.items.map((it) => <ProductCard key={it.id} v={v} it={it} list="catalog" />)}</div>
            ) : (
              <div className="empty">
                <Icon name="search" size={40} />
                <h2>{t('no_results')}</h2>
                <p>{t('no_results_tips')}</p>
                <div className="chips">
                  {hasFilters ? <a className="chip" href={base}>{t('reset_filters')}</a> : null}
                  <a className="chip" href={href(v, '/help-me-choose')}>{t('hero_cta2')}</a>
                  {['study', 'office', 'gaming', 'engineering'].map((u) => <a key={u} className="chip" href={href(v, `/laptops?usage=${u}`)}>{t(`usage_${u}` as any)}</a>)}
                </div>
              </div>
            )}
            {pages > 1 ? (
              <nav className="pager" aria-label="pagination">
                {Array.from({ length: pages }, (_, i) => i + 1).map((p) => {
                  const q = qsWithout(f, '__none'); const sep = q ? '&' : '?';
                  return p === page ? <span key={p} aria-current="page" className="pager__cur">{p}</span> : <a key={p} href={`${base}${q}${p > 1 ? `${sep}page=${p}` : ''}`}>{p}</a>;
                })}
              </nav>
            ) : null}
          </div>
        </div>
      </div>
    </Layout>
  );
}
