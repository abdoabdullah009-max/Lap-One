import type { ReactNode } from 'react';
import type { Locale } from '../config/brand';
import type { T } from '../server/i18n';
import type { Settings } from '../server/services/settings';
import type { CatalogItem } from '../server/services/catalog';
import { formatEGP } from '../server/money';

export interface View {
  locale: Locale; t: T; settings: Settings; path: string; search: string; cartCount: number; wishIds: number[]; compareIds: number[];
  nonce: string; v: string; baseUrl: string;
}

export const href = (v: View, p = '') => `/${v.locale}${p}`;
export const money = (v: View, piasters: number) => formatEGP(piasters, v.locale);
export const bi = (v: View, b: { ar: string; en: string } | undefined | null) => (b ? (v.locale === 'ar' ? b.ar || b.en : b.en || b.ar) : '');

// Inline icon set (stroke icons, 24px grid) — no icon font or library download needed.
const PATHS: Record<string, string> = {
  search: 'M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14Zm10 17-4.35-4.35',
  heart: 'M19.5 12.6 12 20l-7.5-7.4A4.8 4.8 0 0 1 12 6.3a4.8 4.8 0 0 1 7.5 6.3Z',
  cart: 'M3 4h2l2.4 11.2a2 2 0 0 0 2 1.6h7.8a2 2 0 0 0 2-1.5L21 8H6.2M10 21h.01M17 21h.01',
  user: 'M20 21v-1a6 6 0 0 0-6-6h-4a6 6 0 0 0-6 6v1M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z',
  compare: 'M16 3h5v5M4 20 21 3M21 16v5h-5M15 15l6 6M4 4l5 5',
  menu: 'M4 6h16M4 12h16M4 18h16', x: 'M18 6 6 18M6 6l12 12', check: 'M20 6 9 17l-5-5',
  chevron: 'm9 18 6-6-6-6', chevronDown: 'm6 9 6 6 6-6', arrow: 'M5 12h14M13 6l6 6-6 6',
  truck: 'M3 6h11v10H3zM14 9h4l3 3v4h-7M7.5 19a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3ZM17.5 19a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3Z',
  shield: 'M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Zm-3-10 2 2 4-4',
  cpu: 'M9 9h6v6H9zM4 9h2M4 15h2M18 9h2M18 15h2M9 4v2M15 4v2M9 18v2M15 18v2M6 6h12v12H6z',
  battery: 'M3 8h15v8H3zM21 11v2M6 11h6v2H6z', star: 'm12 3 2.8 5.7 6.2.9-4.5 4.4 1 6.2L12 17.3 6.5 20.2l1-6.2L3 9.6l6.2-.9Z',
  filter: 'M4 5h16M7 12h10M10 19h4', eye: 'M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Zm10 3a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z',
  phone: 'M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.4 1.8.7 2.7a2 2 0 0 1-.5 2.1L8 9.8a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.7.7a2 2 0 0 1 1.7 2Z',
  mail: 'M3 5h18v14H3zM3 6l9 7 9-7', pin: 'M12 22s7-6.1 7-12a7 7 0 0 0-14 0c0 5.9 7 12 7 12Zm0-9a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z',
  grid: 'M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z', info: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20Zm0-6v-4m0-4h.01',
  alert: 'M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0ZM12 9v4m0 4h.01',
  tag: 'M20.6 13.4 13.4 20.6a2 2 0 0 1-2.8 0L3 13V3h10l7.6 7.6a2 2 0 0 1 0 2.8ZM7.5 7.5h.01',
  sparkle: 'M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M6 18l2.5-2.5M15.5 8.5 18 6',
  globe: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20ZM2 12h20M12 2a15 15 0 0 1 0 20 15 15 0 0 1 0-20',
  expand: 'M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7', minus: 'M5 12h14', plus: 'M12 5v14M5 12h14', trash: 'M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14',
  wrench: 'M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 0 0 5.4-5.4l-2.5 2.5-2.4-.6-.6-2.4Z', clock: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20Zm0-14v4l3 2',
  monitor: 'M3 4h18v12H3zM8 20h8M12 16v4', gamepad: 'M6 11h4M8 9v4M15 12h.01M18 10h.01M17.3 5H6.7a4 4 0 0 0-4 3.6l-.6 6A3 3 0 0 0 5 18c1 0 2-.5 2.6-1.3L9 15h6l1.4 1.7A3.3 3.3 0 0 0 19 18a3 3 0 0 0 3-3.4l-.7-6A4 4 0 0 0 17.3 5Z',
  book: 'M4 19.5A2.5 2.5 0 0 1 6.5 17H20V3H6.5A2.5 2.5 0 0 0 4 5.5v14ZM4 19.5A2.5 2.5 0 0 0 6.5 22H20v-5',
  briefcase: 'M3 7h18v13H3zM8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M3 13h18', code: 'm16 18 6-6-6-6M8 6l-6 6 6 6',
  ruler: 'M21.3 8.7 8.7 21.3a1 1 0 0 1-1.4 0l-4.6-4.6a1 1 0 0 1 0-1.4L15.3 2.7a1 1 0 0 1 1.4 0l4.6 4.6a1 1 0 0 1 0 1.4ZM7.5 10.5l2 2M10.5 7.5l2 2M13.5 4.5l2 2M4.5 13.5l2 2',
  palette: 'M12 22a10 10 0 1 1 10-10c0 2.8-2.2 4-4 4h-1.5a1.5 1.5 0 0 0-1 2.6A1.5 1.5 0 0 1 14.4 21 9.9 9.9 0 0 1 12 22ZM7.5 10.5h.01M10.5 6.5h.01M15.5 7.5h.01',
  server: 'M3 3h18v7H3zM3 14h18v7H3zM7 6.5h.01M7 17.5h.01', piggy: 'M19 9.5c1 .5 2 1.5 2 3s-1 2-2 2v2.5h-3V15H9v2H6v-3a6 6 0 0 1 3-11h4a6 6 0 0 1 6 6.5ZM16 9h.01',
  whatsapp: 'M3 21l1.7-5A8.5 8.5 0 1 1 8 19.4L3 21Zm6.2-13.3c-.3-.6-.5-.6-.8-.6h-.6c-.2 0-.6.1-.9.4-.3.3-1.1 1.1-1.1 2.7s1.2 3.1 1.3 3.3c.2.2 2.3 3.6 5.6 4.9 2.8 1.1 3.3.9 3.9.8.6-.1 2-.8 2.3-1.6.3-.8.3-1.5.2-1.6-.1-.1-.3-.2-.6-.4l-2.2-1c-.3-.1-.5-.2-.7.1l-.9 1.2c-.2.2-.4.3-.7.1-.3-.2-1.3-.5-2.5-1.5-.9-.8-1.5-1.8-1.7-2.1-.2-.3 0-.5.1-.6l.5-.6.3-.5c.1-.2 0-.4 0-.6l-1-2.4Z',
};
export function Icon({ name, size = 20, className = '', label }: { name: string; size?: number; className?: string; label?: string }) {
  const filled = name === 'whatsapp';
  return (
    <svg className={`icon ${className}`} width={size} height={size} viewBox="0 0 24 24" fill={filled ? 'currentColor' : 'none'} stroke={filled ? 'none' : 'currentColor'}
      strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden={label ? undefined : true} role={label ? 'img' : undefined} aria-label={label}>
      <path d={PATHS[name] || PATHS.info} fillRule={filled ? 'evenodd' : undefined} />
    </svg>
  );
}

export const USAGE_ICON: Record<string, string> = {
  study: 'book', office: 'briefcase', programming: 'code', engineering: 'ruler', graphics: 'palette', gaming: 'gamepad', workstation: 'server', budget: 'piggy',
};

export function gradeLabel(v: View, g: string | null) { return g ? v.t(`grade_${g}` as any) : v.t('unknown'); }

export function GradeBadge({ v, grade }: { v: View; grade: string | null }) {
  if (!grade) return null;
  return <span className={`grade grade--${grade}`} title={bi(v, (v.settings.grade_definitions as any)[grade])}>{gradeLabel(v, grade)}</span>;
}

export function StockLabel({ v, n }: { v: View; n: number }) {
  if (n < 1) return <span className="stock stock--out">{v.t('out_of_stock')}</span>;
  return <span className="stock stock--in"><span className="dot" />{n === 1 ? v.t('last_unit') : v.t('in_stock')}</span>;
}

export function storageText(v: View, gb: number | null, type?: string | null) {
  if (!gb) return v.t('unknown');
  const s = gb >= 1024 ? `${gb / 1024}${v.t('tb') === 'TB' ? 'TB' : ' تيرا'}` : `${gb}GB`;
  return `${s}${type ? ` ${type === 'nvme' ? 'NVMe' : type.toUpperCase()}` : ''}`;
}
export function cpuShort(it: CatalogItem) { return (it.cpu_model || '').replace(/^Core /, ''); }
export function genText(v: View, gen: number | null) { return gen ? v.t('gen_n', { n: gen }) : ''; }

export function Price({ v, price, was }: { v: View; price: number; was?: number | null }) {
  return (
    <div className="price">
      <span className="price__now">{money(v, price)}</span>
      {was && was > price ? <><s className="price__was" aria-label={v.t('was')}>{money(v, was)}</s><span className="price__save">{v.t('save', { amount: money(v, was - price) })}</span></> : null}
    </div>
  );
}

export function ProductCard({ v, it, list }: { v: View; it: CatalogItem; list?: string }) {
  const inWish = v.wishIds.includes(it.id);
  const inCmp = v.compareIds.includes(it.id);
  const url = href(v, `/p/${it.slug}`);
  const wa = waLink(v, v.locale === 'ar'
    ? `مرحبًا، مهتم بالجهاز ده:\n${it.title}\nالسعر: ${money(v, it.price)}\n${v.baseUrl}${url}`
    : `Hi, I'm interested in:\n${it.title}\nPrice: ${money(v, it.price)}\n${v.baseUrl}${url}`);
  return (
    <article className={`card${it.available < 1 ? ' card--out' : ''}`} data-id={it.id} data-list={list}>
      <a href={url} className="card__media" tabIndex={-1} aria-hidden="true">
        {it.image ? <img src={it.image} alt="" width={400} height={300} loading="lazy" decoding="async" /> : <span className="card__noimg" />}
        {it.image_kind === 'representative' ? <span className="card__imgnote">{v.locale === 'ar' ? 'صورة توضيحية' : 'Representative image'}</span> : null}
      </a>
      <div className="card__tools">
        <button type="button" className={`iconbtn js-wish${inWish ? ' is-on' : ''}`} data-id={it.id} aria-pressed={inWish} aria-label={inWish ? v.t('in_wishlist') : v.t('add_wishlist')}><Icon name="heart" size={18} /></button>
        {!it.is_accessory ? <button type="button" className={`iconbtn js-compare${inCmp ? ' is-on' : ''}`} data-id={it.id} aria-pressed={inCmp} aria-label={inCmp ? v.t('in_compare') : v.t('add_compare')}><Icon name="compare" size={18} /></button> : null}
        <button type="button" className="iconbtn js-quick" data-slug={it.slug} aria-label={v.t('quick_view')}><Icon name="eye" size={18} /></button>
      </div>
      <div className="card__body">
        <div className="card__meta">
          <span className="card__brand">{it.brand_name}</span>
          <GradeBadge v={v} grade={it.grade} />
          {it.is_offer ? <span className="badge badge--offer">{v.t('offers')}</span> : null}
        </div>
        <h3 className="card__title"><a href={url}>{it.is_accessory ? it.title : `${it.family_name}`}</a></h3>
        {!it.is_accessory ? (
          <ul className="card__specs">
            <li title={v.t('s_cpu')}><Icon name="cpu" size={14} />{cpuShort(it)}{it.cpu_gen ? <small> · {genText(v, it.cpu_gen)}</small> : null}</li>
            {it.ram_gb || it.storage_gb ? <li><bdi dir="ltr">{[it.ram_gb ? `${it.ram_gb}GB RAM` : null, it.storage_gb ? storageText(v, it.storage_gb, it.storage_type) : null].filter(Boolean).join(' · ')}</bdi></li> : null}
            {it.gpu_model || it.screen_in ? <li><bdi dir="ltr">{[it.gpu_model ? `${it.gpu_model}${it.gpu_dedicated && it.vram_gb ? ` ${it.vram_gb}GB` : ''}` : null, it.screen_in ? `${it.screen_in}"` : null].filter(Boolean).join(' · ')}</bdi></li> : null}
          </ul>
        ) : null}
        <div className="card__foot">
          <div>
            <Price v={v} price={it.price} was={it.compare_at_price} />
            <div className="card__sub">
              <StockLabel v={v} n={it.available} />
              {it.warranty_months ? <span className="muted">· {v.t('warranty_months', { n: it.warranty_months })}</span> : null}
            </div>
          </div>
          <div className="card__acts">
            {wa ? <a className="btn btn--icon btn--wa js-wa" data-source="whatsapp_card" data-variant={it.id} href={wa} target="_blank" rel="noopener" aria-label={`${v.t('ask_whatsapp')}: ${it.title}`}><Icon name="whatsapp" size={18} /></a> : null}
            <form method="post" action={href(v, '/cart/add')} className="js-add">
              <input type="hidden" name="variant_id" value={it.id} />
              <button className="btn btn--icon btn--primary" disabled={it.available < 1} aria-label={`${v.t('add_to_cart')}: ${it.title}`}><Icon name="cart" size={18} /></button>
            </form>
          </div>
        </div>
        {it.is_sample ? <span className="sample-tag">{v.t('sample_badge')}</span> : null}
      </div>
    </article>
  );
}

export function Section({ title, link, linkLabel, children, id }: { title: string; link?: string; linkLabel?: string; children: ReactNode; id?: string }) {
  return (
    <section className="section" aria-labelledby={id}>
      <div className="section__head"><h2 id={id}>{title}</h2>{link ? <a className="link-arrow" href={link}>{linkLabel}<Icon name="arrow" size={16} className="flip-rtl" /></a> : null}</div>
      {children}
    </section>
  );
}

export function Rail({ v, items, list }: { v: View; items: CatalogItem[]; list: string }) {
  return <div className="rail" role="list">{items.map((it) => <div role="listitem" key={it.id}><ProductCard v={v} it={it} list={list} /></div>)}</div>;
}

export function waLink(v: View, text: string): string | null {
  const n = (v.settings.contact.whatsapp || '').replace(/[^\d]/g, '');
  return n ? `https://wa.me/${n}?text=${encodeURIComponent(text)}` : null;
}

export function Breadcrumbs({ items }: { items: { name: string; url?: string }[] }) {
  return (
    <nav aria-label="breadcrumb" className="crumbs"><ol>
      {items.map((c, i) => <li key={i}>{c.url && i < items.length - 1 ? <a href={c.url}>{c.name}</a> : <span aria-current={i === items.length - 1 ? 'page' : undefined}>{c.name}</span>}</li>)}
    </ol></nav>
  );
}

export function JsonLd({ data }: { data: unknown }) {
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(data).replace(/</g, '\\u003c') }} />;
}
