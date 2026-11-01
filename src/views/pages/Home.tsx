import { brand } from '../../config/brand';
import type { CatalogItem } from '../../server/services/catalog';
import { Layout } from '../Layout';
import { View, Icon, href, bi, money, ProductCard, GradeBadge, cpuShort, storageText } from '../ui';

export interface HomeSection { key: string; title: [string, string]; tagline: string; href: string; items: CatalogItem[]; count: number }
export interface HomeData {
  hero: CatalogItem | null; featured: CatalogItem[]; sections: HomeSection[];
  brands: { slug: string; name: string; count: number }[];
  reviews: { display_name: string; rating: number; body: string | null; title: string }[];
}

/** Spotlight tile: brand, bold model name, key specs, price — with a laptop image on a soft blue wave. */
function FeatureTile({ v, it, i }: { v: View; it: CatalogItem; i: number }) {
  const gpu = it.gpu_dedicated ? `${it.gpu_model}${it.vram_gb ? ` ${it.vram_gb}GB` : ''}` : null;
  return (
    <a className="ftile reveal" style={{ ['--d' as any]: `${i * 60}ms` }} href={href(v, `/p/${it.slug}`)}>
      <span className="ftile__text">
        <span className="ftile__brand">{it.brand_name.replace(' Surface', '')}</span>
        <b className="ftile__model">{it.family_name}</b>
        <span className="ftile__spec"><Icon name="cpu" size={14} />{cpuShort(it)}</span>
        {it.ram_gb ? <span className="ftile__spec">{it.ram_gb}GB · {storageText(v, it.storage_gb, it.storage_type)}</span> : null}
        {gpu ? <span className="ftile__spec ftile__spec--gpu">{gpu}</span> : null}
        <span className="ftile__price">{money(v, it.price)}</span>
      </span>
      <img className="ftile__img" src={it.image || ''} alt={it.title} width={800} height={600} loading={i < 3 ? 'eager' : 'lazy'} />
      <span className="ftile__go" aria-hidden="true"><Icon name="arrow" size={18} className="flip-rtl" /></span>
    </a>
  );
}

/** Category band: overlapping product images, two-tone title, tagline, then a scrollable rail with arrows. */
function CategorySection({ v, s, idx }: { v: View; s: HomeSection; idx: number }) {
  const pics = s.items.slice(0, 3);
  const railId = `rail-${s.key}`;
  return (
    <section className="catsec reveal" aria-labelledby={`h-${s.key}`} id={s.key}>
      <a className={`catband${idx % 2 ? ' catband--alt' : ''}`} href={s.href}>
        <span className="catband__pics" aria-hidden="true">{pics.map((p, k) => <img key={p.id} src={p.image || ''} alt="" width={400} height={300} loading="lazy" className={`catband__pic catband__pic--${k}`} />)}</span>
        <span className="catband__text">
          <h2 id={`h-${s.key}`} className="catband__title"><span>{s.title[0]}</span> {s.title[1]}</h2>
          <span className="catband__tag">{s.tagline}</span>
        </span>
        <span className="catband__cta">{v.t('view_all')} ({s.count}) <Icon name="arrow" size={16} className="flip-rtl" /></span>
      </a>
      <div className="railwrap">
        <button type="button" className="railnav railnav--prev js-rail" data-target={railId} data-dir="-1" aria-label={v.locale === 'ar' ? 'السابق' : 'Previous'}><Icon name="chevron" size={20} className="flip-rtl rot180" /></button>
        <div className="rail rail--snap" id={railId} role="list">{s.items.map((it) => <div role="listitem" key={it.id}><ProductCard v={v} it={it} list={s.key} /></div>)}</div>
        <button type="button" className="railnav railnav--next js-rail" data-target={railId} data-dir="1" aria-label={v.locale === 'ar' ? 'التالي' : 'Next'}><Icon name="chevron" size={20} className="flip-rtl" /></button>
      </div>
    </section>
  );
}

export function HomePage({ v, d }: { v: View; d: HomeData }) {
  const { t, settings: s, locale } = v;
  const ar = locale === 'ar';
  const promises = [
    { icon: 'shield', t: ar ? 'ضمان 6 شهور' : '6-month warranty', s: ar ? 'على كل الأجهزة' : 'On every laptop', on: s.trust.warranty.enabled },
    { icon: 'truck', t: ar ? 'استبدال أو استرجاع' : 'Exchange or return', s: ar ? 'خلال 14 يوم من الاستلام' : 'Within 14 days of delivery', on: s.trust.shipping_returns.enabled },
    { icon: 'star', t: ar ? 'حالة ممتازة' : 'Excellent condition', s: ar ? 'كل الأجهزة المعروضة' : 'Every listed laptop', on: s.trust.grading.enabled },
    { icon: 'whatsapp', t: ar ? 'رد سريع على واتساب' : 'Fast WhatsApp replies', s: s.contact.whatsapp ? s.contact.whatsapp.replace(/^20/, '0') : '', on: !!s.contact.whatsapp },
  ].filter((p) => p.on);
  const h = d.hero;
  return (
    <Layout v={v} bodyClass="has-bnav" meta={{
      title: ar ? `${brand.name} | لابتوبات استيراد بمواصفات واضحة وضمان 6 شهور` : `${brand.name} | Imported laptops with clear specs and a 6-month warranty`,
      description: t('hero_sub'), ogImage: h?.image || undefined,
      jsonLd: [{ '@context': 'https://schema.org', '@type': 'Organization', name: brand.name, url: v.baseUrl, logo: `${v.baseUrl}${brand.logoUrl || ''}`, ...(s.contact.whatsapp ? { telephone: `+${s.contact.whatsapp}` } : {}) },
        { '@context': 'https://schema.org', '@type': 'WebSite', url: v.baseUrl, potentialAction: { '@type': 'SearchAction', target: `${v.baseUrl}/${locale}/laptops?q={q}`, 'query-input': 'required name=q' } }],
    }}>
      <section className="hero2">
        <div className="container hero2__in">
          <div className="hero2__copy">
            <h1>{t('hero_title')}</h1>
            <p className="hero__sub">{t('hero_sub')}</p>
            <div className="hero__ctas">
              <a className="btn btn--primary btn--lg" href={href(v, '/laptops')}>{t('hero_cta')}</a>
              <a className="btn btn--outline btn--lg" href={href(v, '/help-me-choose')}><Icon name="sparkle" size={18} />{t('hero_cta2')}</a>
            </div>
          </div>
          {h ? (
            <a className="hero2__spot" href={href(v, `/p/${h.slug}`)}>
              <img src={h.image || ''} alt={h.title} width={800} height={600} fetchPriority="high" />
              <span className="hero2__badge"><GradeBadge v={v} grade={h.grade} /><b>{money(v, h.price)}</b></span>
              <span className="hero2__name">{h.brand_name.replace(' Surface', '')} {h.family_name}</span>
            </a>
          ) : null}
        </div>
        {promises.length ? (
          <div className="container"><ul className="promises">{promises.map((p) => <li key={p.icon}><span className="promises__icon"><Icon name={p.icon} size={20} /></span><span><b>{p.t}</b><small dir="auto">{p.s}</small></span></li>)}</ul></div>
        ) : null}
      </section>

      <div className="container">
        {d.featured.length ? (
          <section className="section" aria-labelledby="featured-h">
            <div className="section__head"><h2 id="featured-h">{ar ? 'موديلات مميزة' : 'Featured models'}</h2><a className="link-arrow" href={href(v, '/laptops')}>{t('view_all')}<Icon name="arrow" size={16} className="flip-rtl" /></a></div>
            <div className="ftiles">{d.featured.map((it, i) => <FeatureTile key={it.id} v={v} it={it} i={i} />)}</div>
          </section>
        ) : null}

        <section className="section" aria-labelledby="cats-h">
          <div className="section__head"><h2 id="cats-h">{t('categories')}</h2></div>
          <div className="cattiles">
            {d.sections.map((sec, i) => (
              <a key={sec.key} className="cattile reveal" style={{ ['--d' as any]: `${i * 50}ms` }} href={sec.href}>
                <img src={sec.items[0]?.image || ''} alt="" width={400} height={300} loading="lazy" />
                <span className="cattile__title"><span>{sec.title[0]}</span> {sec.title[1]}</span>
                <small>{t('results', { n: sec.count })}</small>
              </a>
            ))}
          </div>
        </section>

        {d.sections.map((sec, i) => <CategorySection key={sec.key} v={v} s={sec} idx={i} />)}

        <section className="section js-recent" hidden aria-labelledby="recent"><div className="section__head"><h2 id="recent">{t('recently_viewed')}</h2></div><div className="rail js-recent-rail" /></section>

        {d.brands.length > 1 ? (
          <section className="section" aria-labelledby="brands-h">
            <div className="section__head"><h2 id="brands-h">{t('shop_by_brand')}</h2></div>
            <div className="brands">{d.brands.map((b) => <a key={b.slug} href={href(v, `/laptops?brand=${b.slug}`)} className="brandtile"><b>{b.name}</b><small>{t('results', { n: b.count })}</small></a>)}</div>
          </section>
        ) : null}

        {d.reviews.length ? (
          <section className="section" aria-labelledby="rev-h"><div className="section__head"><h2 id="rev-h">{t('reviews_title')}</h2></div>
            <div className="reviews">{d.reviews.map((r, i) => <figure key={i} className="review"><div className="stars" aria-label={`${r.rating}/5`}>{'★'.repeat(r.rating)}{'☆'.repeat(5 - r.rating)}</div><blockquote>{r.body}</blockquote><figcaption>{r.display_name} · {r.title}</figcaption></figure>)}</div>
          </section>
        ) : null}

        {s.faq.length ? (
          <section className="section" aria-labelledby="faq-h"><div className="section__head"><h2 id="faq-h">{t('faq')}</h2></div>
            <div className="faq">{s.faq.map((f, i) => <details key={i}><summary>{bi(v, f.q)}<Icon name="chevronDown" size={18} /></summary><p>{bi(v, f.a)}</p></details>)}</div>
          </section>
        ) : null}
      </div>
    </Layout>
  );
}
