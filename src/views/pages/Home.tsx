import { brand } from '../../config/brand';
import type { CatalogItem } from '../../server/services/catalog';
import { Layout } from '../Layout';
import { View, Icon, href, bi, money, ProductCard, GradeBadge } from '../ui';

export interface HomeSection { key: string; title: [string, string]; tagline: string; href: string; items: CatalogItem[]; count: number }
export interface HomeData {
  hero: CatalogItem | null; featured: CatalogItem[]; sections: HomeSection[];
  brands: { slug: string; name: string; count: number }[];
  reviews: { display_name: string; rating: number; body: string | null; title: string }[];
}

/** Shop-by-usage circle: one product photo on a soft disc + label + count. */
function UsageCircle({ v, s, i }: { v: View; s: HomeSection; i: number }) {
  return (
    <a className="ucircle reveal" style={{ ['--d' as any]: `${i * 50}ms` }} href={s.href}>
      <span className="ucircle__disc"><img src={s.items[0]?.image || ''} alt="" width={400} height={300} loading="lazy" /></span>
      <b>{s.title[0]} {s.title[1]}</b>
      <small>{v.t('results', { n: s.count })}</small>
    </a>
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
  const tabs = [
    { key: 'top', label: ar ? 'مختارات' : 'Top picks', items: d.featured, href: href(v, '/laptops'), count: 0, more: ar ? 'شوف كل الأجهزة' : 'See all laptops' },
    ...d.sections.map((sec) => ({ key: sec.key, label: `${sec.title[0]} ${sec.title[1]}`.replace('و ', 'و'), items: sec.items.slice(0, 8), href: sec.href, count: sec.count, more: '' })),
  ].filter((tb) => tb.items.length);
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
        {d.sections.length ? (
          <section className="section" aria-labelledby="use-h">
            <div className="section__head section__head--center"><h2 id="use-h">{ar ? 'تسوّق حسب استخدامك' : 'Shop by what you do'}</h2></div>
            <div className="ucircles">{d.sections.map((sec, i) => <UsageCircle key={sec.key} v={v} s={sec} i={i} />)}</div>
          </section>
        ) : null}

        <section className="section ptabs js-tabs" aria-labelledby="pt-h">
          <div className="ptabs__head">
            <h2 id="pt-h">{ar ? 'اختار جهازك' : 'Pick your laptop'}</h2>
            <div className="ptabs__list" role="tablist" aria-labelledby="pt-h">
              {tabs.map((tb, i) => <button key={tb.key} type="button" role="tab" id={`tab-${tb.key}`} aria-controls={`panel-${tb.key}`} aria-selected={i === 0} tabIndex={i === 0 ? 0 : -1} className="ptabs__tab js-tab">{tb.label}</button>)}
            </div>
          </div>
          {tabs.map((tb, i) => (
            <div key={tb.key} role="tabpanel" id={`panel-${tb.key}`} aria-labelledby={`tab-${tb.key}`} hidden={i !== 0} className="ptabs__panel">
              <div className="grid grid--home">{tb.items.map((it) => <ProductCard key={it.id} v={v} it={it} list={`home_${tb.key}`} />)}</div>
              <div className="ptabs__more"><a className="btn btn--outline" href={tb.href}>{tb.more || (ar ? `شوف كل ${tb.label} (${tb.count})` : `See all ${tb.label} (${tb.count})`)}<Icon name="arrow" size={16} className="flip-rtl" /></a></div>
            </div>
          ))}
        </section>

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
