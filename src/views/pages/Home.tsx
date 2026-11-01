import { USAGES } from '../../config/catalog';
import { brand } from '../../config/brand';
import type { CatalogItem } from '../../server/services/catalog';
import { Layout } from '../Layout';
import { View, Icon, href, bi, money, Section, Rail, USAGE_ICON, GradeBadge, cpuShort, storageText } from '../ui';

export interface HomeData {
  hero: CatalogItem | null; bestSellers: CatalogItem[]; newArrivals: CatalogItem[]; bestValue: CatalogItem[]; offers: CatalogItem[];
  workstations: CatalogItem[]; students: CatalogItem[]; accessories: CatalogItem[]; brands: { slug: string; name: string; count: number }[];
  usageCounts: Record<string, number>; reviews: { display_name: string; rating: number; body: string | null; title: string }[];
}

export function HomePage({ v, d }: { v: View; d: HomeData }) {
  const { t, settings: s, locale } = v;
  const trust = Object.entries(s.trust).filter(([, x]) => x.enabled && bi(v, x.body));
  const trustIcons: Record<string, string> = { inspection: 'check', grading: 'star', warranty: 'shield', support: 'phone', shipping_returns: 'truck' };
  const budgetLabel = (r: { min: number | null; max: number | null }) => {
    const f = (n: number) => money(v, n);
    if (r.min === null && r.max !== null) return t('budget_under', { max: f(r.max) });
    if (r.max === null && r.min !== null) return t('budget_over', { min: f(r.min) });
    return t('budget_between', { min: f(r.min!), max: f(r.max!) });
  };
  const budgetHref = (r: { min: number | null; max: number | null }) => {
    const q = new URLSearchParams(); if (r.min !== null) q.set('min', String(r.min / 100)); if (r.max !== null) q.set('max', String(r.max / 100));
    return href(v, `/laptops?${q}`);
  };
  const h = d.hero;
  return (
    <Layout v={v} meta={{
      title: locale === 'ar' ? `${brand.name} | لابتوبات استيراد مفحوصة بمواصفات وحالة واضحة` : `${brand.name} | Inspected imported laptops with clear specs and condition`,
      description: t('hero_sub'), ogImage: h?.image || undefined,
      jsonLd: [{ '@context': 'https://schema.org', '@type': 'Organization', name: brand.name, url: v.baseUrl, ...(s.contact.phone ? { telephone: s.contact.phone } : {}) },
        { '@context': 'https://schema.org', '@type': 'WebSite', url: v.baseUrl, potentialAction: { '@type': 'SearchAction', target: `${v.baseUrl}/${locale}/laptops?q={q}`, 'query-input': 'required name=q' } }],
    }}>
      <section className="hero">
        <div className="container hero__in">
          <div className="hero__copy">
            <h1>{t('hero_title')}</h1>
            <p className="hero__sub">{t('hero_sub')}</p>
            <div className="hero__ctas">
              <a className="btn btn--primary btn--lg" href={href(v, '/laptops')}>{t('hero_cta')}</a>
              <a className="btn btn--outline btn--lg" href={href(v, '/help-me-choose')}><Icon name="sparkle" size={18} />{t('hero_cta2')}</a>
            </div>
            <ul className="hero__points">
              <li><Icon name="check" size={16} />{t('hero_point1')}</li>
              <li><Icon name="check" size={16} />{t('hero_point2')}</li>
              <li><Icon name="check" size={16} />{t('hero_point3')}</li>
            </ul>
          </div>
          {h ? (
            <a className="hero__product" href={href(v, `/p/${h.slug}`)}>
              <img src={h.image || ''} alt={h.title} width={800} height={600} fetchPriority="high" />
              <div className="hero__chip hero__chip--a"><Icon name="cpu" size={16} />{cpuShort(h)}</div>
              <div className="hero__chip hero__chip--b">{h.ram_gb}GB · {storageText(v, h.storage_gb, h.storage_type)}</div>
              <div className="hero__tag">
                <span className="hero__tag-name">{h.brand_name} {h.family_name}</span>
                <span className="hero__tag-row"><GradeBadge v={v} grade={h.grade} /><b>{money(v, h.price)}</b></span>
              </div>
              {h.image_kind === 'representative' ? <span className="hero__imgnote">{locale === 'ar' ? 'صورة توضيحية' : 'Representative image'}</span> : null}
            </a>
          ) : null}
        </div>
      </section>

      <div className="container">
        <Section title={t('shop_by_usage')} id="usage">
          <div className="usage-grid">
            {USAGES.map((u) => (
              <a key={u} className="usage" href={href(v, `/laptops?usage=${u}`)}>
                <span className="usage__icon"><Icon name={USAGE_ICON[u]} size={24} /></span>
                <span className="usage__name">{t(`usage_${u}` as any)}</span>
                <span className="usage__desc">{t(`usage_${u}_d` as any)}</span>
                <span className="usage__count">{v.t('results', { n: d.usageCounts[u] || 0 })}</span>
              </a>
            ))}
          </div>
        </Section>

        {s.budget_ranges.length ? (
          <Section title={t('shop_by_budget')} id="budget">
            <div className="chips chips--lg">{s.budget_ranges.map((r, i) => <a key={i} className="chip" href={budgetHref(r)}>{budgetLabel(r)}</a>)}</div>
          </Section>
        ) : null}

        {d.offers.length ? <Section title={t('special_offers')} link={href(v, '/laptops?offer=1')} linkLabel={t('view_all')} id="offers"><Rail v={v} items={d.offers} list="offers" /></Section> : null}
        {d.bestSellers.length ? <Section title={t('best_sellers')} link={href(v, '/laptops?sort=best_selling')} linkLabel={t('view_all')} id="best"><Rail v={v} items={d.bestSellers} list="best_sellers" /></Section> : null}
        <Section title={t('new_arrivals')} link={href(v, '/laptops?sort=newest')} linkLabel={t('view_all')} id="new"><Rail v={v} items={d.newArrivals} list="new_arrivals" /></Section>
        <Section title={t('best_value')} link={href(v, '/laptops')} linkLabel={t('view_all')} id="value"><Rail v={v} items={d.bestValue} list="best_value" /></Section>

        <Section title={t('shop_by_brand')} id="brands">
          <div className="brands">{d.brands.map((b) => <a key={b.slug} href={href(v, `/laptops?brand=${b.slug}`)} className="brandtile"><b>{b.name}</b><small>{t('results', { n: b.count })}</small></a>)}</div>
        </Section>

        {d.workstations.length ? <Section title={t('workstations')} link={href(v, '/laptops?usage=workstation')} linkLabel={t('view_all')} id="ws"><Rail v={v} items={d.workstations} list="workstations" /></Section> : null}
        {d.students.length ? <Section title={t('for_students')} link={href(v, '/laptops?usage=study&sort=price_asc')} linkLabel={t('view_all')} id="students"><Rail v={v} items={d.students} list="students" /></Section> : null}
        <section className="section js-recent" hidden aria-labelledby="recent"><div className="section__head"><h2 id="recent">{t('recently_viewed')}</h2></div><div className="rail js-recent-rail" /></section>
        {d.accessories.length ? <Section title={t('accessories')} link={href(v, '/laptops?accessory=1')} linkLabel={t('view_all')} id="acc"><Rail v={v} items={d.accessories} list="accessories" /></Section> : null}
      </div>

      {trust.length ? (
        <section className="trust" aria-labelledby="trust-h">
          <div className="container">
            <h2 id="trust-h">{t('why_us')}</h2>
            <div className="trust__grid">
              {trust.map(([k, x]) => (
                <div key={k} className="trust__item">
                  <span className="trust__icon"><Icon name={trustIcons[k]} size={22} /></span>
                  <h3>{bi(v, x.title)}</h3><p>{bi(v, x.body)}</p>
                  {k === 'inspection' ? <a href={href(v, '/pages/inspection')} className="link-arrow">{POL[locale].more}<Icon name="arrow" size={14} className="flip-rtl" /></a> : null}
                  {k === 'warranty' ? <a href={href(v, '/pages/warranty')} className="link-arrow">{POL[locale].more}<Icon name="arrow" size={14} className="flip-rtl" /></a> : null}
                  {k === 'shipping_returns' ? <a href={href(v, '/pages/returns')} className="link-arrow">{POL[locale].more}<Icon name="arrow" size={14} className="flip-rtl" /></a> : null}
                </div>
              ))}
            </div>
            <div className="grades">
              {(['excellent', 'very_good', 'good', 'fair'] as const).map((g) => <div key={g} className="grades__item"><GradeBadge v={v} grade={g} /><p>{bi(v, s.grade_definitions[g])}</p></div>)}
            </div>
          </div>
        </section>
      ) : null}

      <div className="container">
        <Section title={t('reviews_title')} id="reviews">
          {d.reviews.length ? (
            <div className="reviews">{d.reviews.map((r, i) => <figure key={i} className="review"><div className="stars" aria-label={`${r.rating}/5`}>{'★'.repeat(r.rating)}{'☆'.repeat(5 - r.rating)}</div><blockquote>{r.body}</blockquote><figcaption>{r.display_name} · {r.title}</figcaption></figure>)}</div>
          ) : <p className="empty-note"><Icon name="info" size={18} />{t('no_reviews')}</p>}
        </Section>

        {s.faq.length ? (
          <Section title={t('faq')} id="faq">
            <div className="faq">{s.faq.map((f, i) => <details key={i}><summary>{bi(v, f.q)}<Icon name="chevronDown" size={18} /></summary><p>{bi(v, f.a)}</p></details>)}</div>
          </Section>
        ) : null}
      </div>
    </Layout>
  );
}
const POL = { ar: { more: 'اعرف أكتر' }, en: { more: 'Learn more' } };
