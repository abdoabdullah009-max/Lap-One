import { brand } from '../../config/brand';
import type { ProductDetail, DiffNote } from '../../server/services/product';
import type { CatalogItem } from '../../server/services/catalog';
import { NOTE_TEXT } from '../../server/services/recommend';
import { Layout } from '../Layout';
import { View, Icon, href, money, Price, GradeBadge, StockLabel, storageText, Breadcrumbs, waLink, gradeLabel, bi, cpuShort, ProductCard } from '../ui';

export interface ProductData { p: ProductDetail; related: { item: CatalogItem; diff: DiffNote[] }[]; zoneSummary: { min: number | null; freeFrom: number | null } }

const fmtNote = (v: View, n: DiffNote) => {
  let s = NOTE_TEXT[v.locale][n.key === 'igpu' ? 'igpu_alt' : n.key] || n.key;
  for (const [k, val] of Object.entries(n.vars || {})) s = s.replaceAll(`{${k}}`, k === 'amount' ? money(v, Number(val)) : k === 'grade' ? gradeLabel(v, String(val)) : String(val));
  return s;
};

export function specRows(v: View, it: CatalogItem, extra: { ports?: string | null; connectivity?: string | null; warranty?: string | null; keyboard?: string | null }) {
  const t = v.t; const U = <span className="unknown">{t('unknown')}</span>;
  const yn = (b: boolean | null) => b === null ? U : b ? t('yes') : t('no');
  return [
    [t('s_brand'), it.brand_name], [t('s_model'), it.family_name], [t('s_cpu'), it.cpu_model || U],
    [t('s_gen'), it.cpu_gen ? t('gen_n', { n: it.cpu_gen }) : it.cpu_brand === 'apple' ? '—' : U], [t('s_cores'), it.cpu_cores ?? U],
    [t('s_ram'), it.ram_gb ? `${it.ram_gb}GB` : U], [t('s_ram_type'), it.ram_type || U], [t('s_ram_max'), it.ram_max_gb ? `${it.ram_max_gb}GB` : U],
    [t('s_storage'), it.storage_gb ? storageText(v, it.storage_gb, it.storage_type) : U],
    [t('s_gpu'), it.gpu_model ? `${it.gpu_model} (${it.gpu_dedicated ? t('dedicated') : t('integrated')})` : U],
    [t('s_vram'), it.gpu_dedicated ? (it.vram_gb ? `${it.vram_gb}GB` : U) : '—'],
    [t('s_screen'), it.screen_in ? `${it.screen_in}"` : U], [t('s_resolution'), it.resolution ? it.resolution.replace('x', ' × ') : U],
    [t('s_refresh'), it.refresh_hz ? `${it.refresh_hz}Hz` : U], [t('s_touch'), yn(it.touch)], [t('s_convertible'), yn(it.convertible)],
    [t('s_os'), it.os || U], [t('s_connectivity'), extra.connectivity || U], [t('s_ports'), extra.ports || U],
    [t('s_weight'), it.weight_kg ? `${it.weight_kg} ${t('kg')}` : U], [t('s_keyboard'), extra.keyboard === 'EN' ? (v.locale === 'ar' ? 'إنجليزي' : 'English') : extra.keyboard || U],
    [t('s_charger'), yn(it.charger_included)], [t('s_grade'), gradeLabel(v, it.grade)], [t('s_warranty'), extra.warranty || (it.warranty_months ? t('warranty_months', { n: it.warranty_months }) : U)],
  ] as [string, any][];
}

export function ProductPage({ v, d }: { v: View; d: ProductData }) {
  const { t, locale, settings } = v;
  const { item: it, images, upgrades, units, siblings, variant, family, reviews } = d.p;
  const url = `${v.baseUrl}${href(v, `/p/${it.slug}`)}`;
  const warrantyText = locale === 'ar' ? variant.warranty_text_ar : variant.warranty_text_en;
  const hasActual = images.some((i) => i.kind === 'actual_unit');
  const kinds = [...new Set(upgrades.map((u) => u.kind))];
  const waText = locale === 'ar'
    ? `مرحبًا، عايز أستفسر عن:\n${it.title}\nالحالة: ${gradeLabel(v, it.grade)}\nالسعر المعروض: ${money(v, it.price)}\n${url}`
    : `Hi, I'd like to ask about:\n${it.title}\nCondition: ${gradeLabel(v, it.grade)}\nListed price: ${money(v, it.price)}\n${url}`;
  const wa = waLink(v, waText);
  const tested = units.filter((u) => u.battery_health_pct !== null);
  const funcStatus = units.length ? units.every((u) => u.inspection?.functional_status === 'passed') ? 'passed' : units.some((u) => u.inspection?.functional_status === 'failed') ? 'failed' : units.some((u) => !u.inspection) ? 'unknown' : 'passed_with_notes' : null;
  const single = it.inventory_mode === 'unique' || units.length === 1;
  // Has anything about condition actually been recorded? If not, show one honest line instead of empty tables.
  const hasCond = units.some((u) => u.cosmetic_notes || u.defects || u.screen_notes || u.keyboard_notes || u.inspection || u.battery_health_pct !== null);
  const u0 = units[0];
  const ldOffer = { '@type': 'Offer', price: (it.price / 100).toFixed(2), priceCurrency: 'EGP', url, itemCondition: 'https://schema.org/UsedCondition',
    availability: it.available > 0 ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock', seller: { '@type': 'Organization', name: brand.name } };
  const ldProduct: any = { '@context': 'https://schema.org', '@type': 'Product', name: it.title, sku: it.sku, brand: { '@type': 'Brand', name: it.brand_name },
    image: images.map((i) => v.baseUrl + i.url), description: (locale === 'ar' ? family.description_ar : family.description_en) || it.title, offers: ldOffer,
    ...(siblings.length ? { inProductGroupWithID: family.slug } : {}),
    ...(it.rating_count ? { aggregateRating: { '@type': 'AggregateRating', ratingValue: it.rating_avg, reviewCount: it.rating_count } } : {}) };
  const ld: unknown[] = [ldProduct, { '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: [
    { '@type': 'ListItem', position: 1, name: t('home'), item: `${v.baseUrl}${href(v)}` },
    { '@type': 'ListItem', position: 2, name: t('all_laptops'), item: `${v.baseUrl}${href(v, '/laptops')}` },
    { '@type': 'ListItem', position: 3, name: `${it.brand_name}`, item: `${v.baseUrl}${href(v, `/laptops?brand=${it.brand_slug}`)}` },
    { '@type': 'ListItem', position: 4, name: it.title }] }];
  if (siblings.length) ld.push({ '@context': 'https://schema.org', '@type': 'ProductGroup', name: `${it.brand_name} ${it.family_name}`, productGroupID: family.slug,
    variesBy: ['https://schema.org/itemCondition', 'memory', 'storage'], hasVariant: [it, ...siblings].map((s) => ({ '@type': 'Product', name: s.title, sku: s.sku, url: `${v.baseUrl}${href(v, `/p/${s.slug}`)}` })) });

  return (
    <Layout v={v} bodyClass="has-buybar" meta={{
      title: `${it.title} — ${gradeLabel(v, it.grade)} | ${brand.name}`,
      description: `${it.title}. ${t('s_grade')}: ${gradeLabel(v, it.grade)}. ${money(v, it.price)}. ${it.available > 0 ? t('in_stock') : t('out_of_stock')}.`,
      ogImage: images[0]?.url, ogType: 'product', canonical: url, jsonLd: ld,
    }}>
      <div className="container" data-view-item={it.id} data-price={it.price} data-title={it.title}>
        <Breadcrumbs items={[{ name: t('home'), url: href(v) }, { name: t('all_laptops'), url: href(v, '/laptops') },
          { name: it.brand_name, url: href(v, `/laptops?brand=${it.brand_slug}`) }, { name: it.family_name }]} />
        {it.is_sample ? <p className="sample-strip"><Icon name="info" size={16} />{locale === 'ar' ? 'هذا المنتج بيانات تجريبية للعرض: السعر والمخزون والحالة والضمان ليست حقيقية.' : 'This product is sample data: price, stock, condition and warranty are not real.'}</p> : null}
        <div className="pdp">
          <div className="gallery js-gallery">
            <div className="gallery__main" tabIndex={0} aria-roledescription="carousel" aria-label={it.title}>
              <div className="gallery__track">
                {images.map((img, i) => (
                  <figure key={i} className="gallery__slide" data-index={i}>
                    <img src={img.url} alt={img.alt || it.title} width={img.width || 800} height={img.height || 600} loading={i === 0 ? 'eager' : 'lazy'} fetchPriority={i === 0 ? 'high' : undefined} />
                    <figcaption className={`gallery__kind gallery__kind--${img.kind}`}>{img.kind === 'actual_unit' ? <><Icon name="check" size={14} />{t('actual_photo')}</> : <><Icon name="info" size={14} />{t('representative_photo')}</>}</figcaption>
                  </figure>
                ))}
              </div>
              <button type="button" className="iconbtn gallery__fs js-gallery-fs" aria-label="fullscreen"><Icon name="expand" size={18} /></button>
            </div>
            {images.length > 1 ? (
              <div className="gallery__thumbs" role="tablist">
                {images.map((img, i) => <button key={i} type="button" role="tab" className={`gallery__thumb${i === 0 ? ' is-on' : ''}`} data-index={i} aria-label={`${i + 1}/${images.length}`} aria-selected={i === 0}><img src={img.url} alt="" width={96} height={72} loading="lazy" /></button>)}
              </div>
            ) : null}
            {!hasActual ? <p className="gallery__note">{locale === 'ar' ? 'لا توجد صور فعلية لهذا الجهاز بعد. اطلب صور الوحدة على واتساب.' : 'No photos of this exact unit yet. Ask for unit photos on WhatsApp.'}</p> : null}
          </div>

          <div className="buy">
            <div className="buy__top">
              <span className="buy__brand">{it.brand_name} · {it.series || ''}</span>
              <div className="buy__icons">
                <button type="button" className={`iconbtn js-wish${v.wishIds.includes(it.id) ? ' is-on' : ''}`} data-id={it.id} aria-pressed={v.wishIds.includes(it.id)} aria-label={t('add_wishlist')}><Icon name="heart" /></button>
                {!it.is_accessory ? <button type="button" className={`iconbtn js-compare${v.compareIds.includes(it.id) ? ' is-on' : ''}`} data-id={it.id} aria-pressed={v.compareIds.includes(it.id)} aria-label={t('add_compare')}><Icon name="compare" /></button> : null}
              </div>
            </div>
            <h1 className="buy__title">{it.title}</h1>
            <div className="buy__badges">
              <GradeBadge v={v} grade={it.grade} />
              {funcStatus && funcStatus !== 'unknown' ? <span className={`badge badge--func badge--${funcStatus}`}><Icon name={funcStatus === 'failed' ? 'alert' : 'check'} size={14} />{t('functional')}: {t(`func_${funcStatus}` as any)}</span> : null}
              {it.is_sample ? <span className="sample-tag">{t('sample_badge')}</span> : null}
            </div>
            {!it.is_accessory ? (
              <ul className="keyspecs">
                <li><Icon name="cpu" size={18} /><span><small>{t('s_cpu')}</small>{cpuShort(it)}{it.cpu_gen ? ` · ${t('gen_n', { n: it.cpu_gen })}` : ''}</span></li>
                <li><Icon name="server" size={18} /><span><small>{t('s_ram')} / {t('s_storage')}</small>{it.ram_gb}GB {it.ram_type || ''} · {storageText(v, it.storage_gb, it.storage_type)}</span></li>
                <li><Icon name="monitor" size={18} /><span><small>{t('s_gpu')}</small>{it.gpu_model}{it.gpu_dedicated && it.vram_gb ? ` ${it.vram_gb}GB` : ''}</span></li>
                <li><Icon name="expand" size={18} /><span><small>{t('s_screen')}</small>{it.screen_in}" {it.resolution ? `· ${it.resolution.replace('x', '×')}` : ''}{it.refresh_hz && it.refresh_hz > 60 ? ` · ${it.refresh_hz}Hz` : ''}{it.touch ? ` · ${t('f_touch')}` : ''}</span></li>
              </ul>
            ) : null}

            {siblings.length ? (
              <div className="variants">
                <span className="label">{locale === 'ar' ? 'اختيارات أخرى لنفس الموديل' : 'Other options for this model'}</span>
                <div className="variants__list">
                  <span className="variant is-on" aria-current="true"><b>{gradeLabel(v, it.grade)}</b><small>{it.ram_gb}GB · {storageText(v, it.storage_gb)}</small><small>{money(v, it.price)}</small></span>
                  {siblings.map((s) => <a key={s.id} className={`variant${s.available < 1 ? ' is-out' : ''}`} href={href(v, `/p/${s.slug}`)}><b>{gradeLabel(v, s.grade)}</b><small>{s.ram_gb}GB · {storageText(v, s.storage_gb)}</small><small>{money(v, s.price)}</small></a>)}
                </div>
              </div>
            ) : null}

            <form method="post" action={href(v, '/cart/add')} className="buy__form js-buyform" data-base={it.price} data-wa={wa ? waText : ''}>
              <input type="hidden" name="variant_id" value={it.id} />
              {kinds.length ? (
                <fieldset className="upgrades">
                  <legend>{t('upgrades')}</legend>
                  {kinds.map((k) => (
                    <div key={k} className="upgrades__group" role="radiogroup">
                      <label className="opt"><input type="radio" name={`opt_${k}`} value="" defaultChecked data-price="0" /><span>{locale === 'ar' ? 'بدون ترقية' : 'No upgrade'}</span><small>+0</small></label>
                      {upgrades.filter((u) => u.kind === k).map((u) => (
                        <label key={u.id} className="opt"><input type="radio" name={`opt_${k}`} value={u.id} data-price={u.price} data-label={locale === 'ar' ? u.label_ar : u.label_en} /><span>{locale === 'ar' ? u.label_ar : u.label_en}</span><small>+{money(v, u.price)}</small></label>
                      ))}
                    </div>
                  ))}
                  <p className="hint">{locale === 'ar' ? 'الترقيات متوافقة مع هذا الجهاز ويتم تركيبها قبل الشحن. السعر النهائي يُحسب على الخادم.' : 'Upgrades are compatible with this laptop and installed before shipping. Final price is calculated on our server.'}</p>
                </fieldset>
              ) : null}
              <div className="buy__price">
                <Price v={v} price={it.price} was={it.compare_at_price} />
                <div className="buy__total js-total" hidden><span>{t('total')}:</span> <b className="js-total-val">{money(v, it.price)}</b></div>
              </div>
              <div className="buy__status">
                <StockLabel v={v} n={it.available} />
                {it.available > 1 ? <span className="muted">{t('in_stock_n', { n: it.available })}</span> : null}
              </div>
              <ul className="buy__facts">
                <li><Icon name="shield" size={18} /><span>{it.warranty_months ? t('warranty_months', { n: it.warranty_months }) : it.warranty_months === 0 ? t('warranty_none') : t('warranty_unknown')}{warrantyText ? <small>{warrantyText}</small> : null}</span></li>
                <li><Icon name="truck" size={18} /><span>{t('shipping_calc')}{d.zoneSummary.freeFrom ? <small>{t('free_shipping_over', { amount: money(v, d.zoneSummary.freeFrom) })}</small> : null}</span></li>
              </ul>
              {it.available > 1 && it.inventory_mode === 'batch' ? (
                <label className="qty"><span>{t('qty')}</span><select name="qty" defaultValue="1">{Array.from({ length: Math.min(it.available, 5) }, (_, i) => <option key={i} value={i + 1}>{i + 1}</option>)}</select></label>
              ) : <input type="hidden" name="qty" value="1" />}
              <div className="buy__ctas">
                <button className="btn btn--primary btn--lg btn--block" formAction={href(v, '/buy-now')} disabled={it.available < 1}>{t('buy_now')}</button>
                <button className="btn btn--outline btn--lg btn--block js-addbtn" disabled={it.available < 1}><Icon name="cart" size={18} />{t('add_to_cart')}</button>
                {wa ? <a className="btn btn--wa btn--block js-wa js-wa-product" data-source="whatsapp_product" data-variant={it.id} href={wa} target="_blank" rel="noopener"><Icon name="whatsapp" size={18} />{t('ask_whatsapp')}</a>
                  : <a className="btn btn--ghost btn--block" href={href(v, '/contact')}><Icon name="phone" size={18} />{t('contact')}</a>}
              </div>
            </form>
          </div>
        </div>

        <nav className="pdp-tabs" aria-label="sections">
          {!it.is_accessory ? <><a href="#condition">{t('condition')}</a><a href="#battery">{t('battery')}</a><a href="#specs">{t('specs')}</a></> : null}
          {d.related.length ? <a href="#related">{t('related')}</a> : null}
        </nav>

        {!it.is_accessory ? (
          <>
            <section id="condition" className="panel">
              <h2>{t('condition')}</h2>
              {!hasCond ? (
                <>{it.grade ? <p className="cond-summary"><b>{t('cosmetic')}:</b> <GradeBadge v={v} grade={it.grade} /> <span className="muted">{bi(v, (settings.grade_definitions as any)[it.grade])}</span></p> : null}
                <p className="note note--info"><Icon name="info" size={18} />{locale === 'ar' ? 'صور الجهاز الفعلي وأي تفاصيل إضافية متاحة عند الطلب — اسألنا على واتساب وهنبعتلك صور الوحدة.' : 'Photos of the actual unit and any extra details are available on request — ask us on WhatsApp.'}
                  {wa ? <> <a href={wa} className="js-wa" data-source="whatsapp_product" data-variant={it.id} target="_blank" rel="noopener">{t('ask_whatsapp')}</a></> : null}</p></>
              ) : <>
              <p className="hint"><Icon name="info" size={16} />{t('grade_vs_function')}</p>
              <div className="cond-grid">
                <div className="cond">
                  <h3>{t('cosmetic')}: <GradeBadge v={v} grade={it.grade} /></h3>
                  <p className="muted">{bi(v, (settings.grade_definitions as any)[it.grade || ''])}</p>
                  {single && u0 ? (
                    <dl className="dl">
                      <dt>{t('scratches')}</dt><dd>{u0.cosmetic_notes || t('not_recorded')}</dd>
                      <dt>{t('screen_notes')}</dt><dd>{u0.screen_notes || t('not_recorded')}</dd>
                      <dt>{t('keyboard_notes')}</dt><dd>{u0.keyboard_notes || t('not_recorded')}</dd>
                      <dt>{t('s_defects')}</dt><dd className={u0.defects ? 'warn' : ''}>{u0.defects || t('none_reported')}</dd>
                      <dt>{t('included')}</dt><dd>{u0.included_accessories || t('not_recorded')}</dd>
                    </dl>
                  ) : null}
                </div>
                <div className="cond">
                  <h3>{t('functional')}: {funcStatus ? <span className={`badge badge--func badge--${funcStatus}`}>{t(`func_${funcStatus}` as any)}</span> : t('func_unknown')}</h3>
                  {u0?.inspection ? (
                    <>
                      <ul className="checklist">
                        {Object.entries(u0.inspection.checklist).map(([k, ok]) => <li key={k} className={ok ? 'ok' : 'bad'}><Icon name={ok ? 'check' : 'x'} size={14} />{CHECK_LABELS[locale][k] || k}</li>)}
                      </ul>
                      <p className="muted small">{t('inspection_notes')}: {u0.inspection.notes || '—'} · {new Date(u0.inspection.inspected_at).toLocaleDateString(locale === 'ar' ? 'ar-EG' : 'en-GB')}</p>
                    </>
                  ) : <p className="muted">{t('func_unknown')}</p>}
                </div>
              </div>
              {!single && units.length ? (
                <>
                  <p className="hint"><Icon name="info" size={16} />{t('units_vary')}</p>
                  <div className="table-wrap"><table className="table table--units">
                    <thead><tr><th>#</th><th>{t('battery_health')}</th><th>{t('scratches')}</th><th>{t('s_defects')}</th><th>{t('tested')}</th></tr></thead>
                    <tbody>{units.map((u) => <tr key={u.ref}><td>{u.ref}</td><td>{u.battery_health_pct !== null ? `${u.battery_health_pct}%` : <span className="unknown">{t('unknown')}</span>}</td><td>{u.cosmetic_notes || '—'}</td><td>{u.defects || t('none_reported')}</td><td>{u.inspection ? t(`func_${u.inspection.functional_status}` as any) : t('func_unknown')}</td></tr>)}</tbody>
                  </table></div>
                </>
              ) : null}
              </>}
            </section>

            <section id="battery" className="panel">
              <h2>{t('battery')}</h2>
              {tested.length === 0 ? <p className="note note--warn"><Icon name="battery" size={18} />{t('battery_unknown')}</p> : single && u0 ? (
                <dl className="dl dl--wide">
                  <dt>{t('battery_health')}</dt><dd><span className="meter" style={{ ['--p' as any]: `${u0.battery_health_pct}%` }}><span /></span> <b>{u0.battery_health_pct}%</b></dd>
                  <dt>{t('battery_tested_at')}</dt><dd>{u0.battery_tested_at}</dd>
                  <dt>{t('battery_method')}</dt><dd dir="auto">{u0.battery_method}</dd>
                  <dt>{t('battery_issues')}</dt><dd>{u0.battery_notes || t('none_reported')}</dd>
                </dl>
              ) : (
                <>
                  <p>{t('battery_range', { min: Math.min(...tested.map((u) => u.battery_health_pct!)), max: Math.max(...tested.map((u) => u.battery_health_pct!)) })}</p>
                  {tested.length < units.length ? <p className="note note--warn"><Icon name="alert" size={16} />{t('battery_partial')}</p> : null}
                  <p className="muted small" dir="auto">{t('battery_method')}: {tested[0].battery_method}</p>
                </>
              )}
              <p className="muted small">{locale === 'ar' ? 'لا نعرض عمر تشغيل تقديري لأنه يعتمد على الاستخدام ولم يُقس.' : 'We do not show an estimated runtime — it depends on usage and has not been measured.'}</p>
            </section>

            <section id="specs" className="panel">
              <h2>{t('specs')}</h2>
              <div className="table-wrap"><table className="table table--specs"><tbody>
                {specRows(v, it, { ports: variant.ports, connectivity: variant.connectivity, warranty: warrantyText, keyboard: variant.keyboard_layout }).map(([k, val]) => <tr key={k}><th scope="row">{k}</th><td>{val}</td></tr>)}
              </tbody></table></div>
            </section>
          </>
        ) : null}

        {(locale === 'ar' ? family.description_ar : family.description_en) ? <section className="panel"><h2>{t('overview')}</h2><p>{locale === 'ar' ? family.description_ar : family.description_en}</p></section> : null}

        {reviews.length ? (
          <section className="panel"><h2>{t('reviews_title')}</h2>
            {reviews.map((r, i) => <figure key={i} className="review"><div className="stars">{'★'.repeat(r.rating)}{'☆'.repeat(5 - r.rating)}</div><blockquote>{r.body}</blockquote><figcaption>{r.display_name}</figcaption></figure>)}
          </section>
        ) : null}

        {d.related.length ? (
          <section id="related" className="section">
            <div className="section__head"><h2>{t('related')}</h2></div>
            <div className="related">
              {d.related.map(({ item, diff }) => (
                <div key={item.id} className="related__item">
                  <ProductCard v={v} it={item} list="related" />
                  {diff.length ? <ul className="diff">{diff.map((n, i) => <li key={i} className={n.better ? 'pro' : 'con'}><Icon name={n.better ? 'plus' : 'minus'} size={14} />{fmtNote(v, n)}</li>)}</ul> : null}
                </div>
              ))}
            </div>
          </section>
        ) : null}
      </div>

      <div className="buybar" aria-hidden="false">
        <div className="buybar__price"><b className="js-total-val">{money(v, it.price)}</b><StockLabel v={v} n={it.available} /></div>
        <button className="btn btn--primary js-buybar-buy" disabled={it.available < 1}>{t('buy_now')}</button>
        {wa ? <a className="btn btn--wa btn--icon js-wa" data-source="whatsapp_product" data-variant={it.id} href={wa} target="_blank" rel="noopener" aria-label={t('ask_whatsapp')}><Icon name="whatsapp" size={20} /></a> : null}
      </div>
      <dialog className="lightbox js-lightbox" aria-label={it.title}><div className="lightbox__track" /><button className="iconbtn lightbox__close js-lightbox-close" aria-label={t('close')}><Icon name="x" /></button></dialog>
    </Layout>
  );
}

const CHECK_LABELS: Record<'ar' | 'en', Record<string, string>> = {
  ar: { screen: 'الشاشة', keyboard: 'الكيبورد', touchpad: 'لوحة اللمس', ports: 'المنافذ', wifi: 'الواي فاي', bluetooth: 'البلوتوث', camera: 'الكاميرا', speakers: 'السماعات', microphone: 'الميكروفون', charging: 'الشحن', storage_health: 'صحة التخزين', stress_test: 'اختبار الضغط' },
  en: { screen: 'Screen', keyboard: 'Keyboard', touchpad: 'Touchpad', ports: 'Ports', wifi: 'Wi-Fi', bluetooth: 'Bluetooth', camera: 'Camera', speakers: 'Speakers', microphone: 'Microphone', charging: 'Charging', storage_health: 'Storage health', stress_test: 'Stress test' },
};

/** Compact fragment for the quick-view dialog. */
export function QuickView({ v, it }: { v: View; it: CatalogItem }) {
  const t = v.t;
  return (
    <div className="quick">
      <img src={it.image || ''} alt={it.title} width={480} height={360} />
      <div>
        <GradeBadge v={v} grade={it.grade} />
        <h2>{it.title}</h2>
        {!it.is_accessory ? <ul className="card__specs"><li>{it.cpu_model}{it.cpu_gen ? ` · ${t('gen_n', { n: it.cpu_gen })}` : ''}</li><li>{it.ram_gb}GB · {storageText(v, it.storage_gb, it.storage_type)}</li><li>{it.gpu_model} · {it.screen_in}"</li></ul> : null}
        <Price v={v} price={it.price} was={it.compare_at_price} />
        <StockLabel v={v} n={it.available} />
        <div className="quick__ctas">
          <form method="post" action={href(v, '/cart/add')} className="js-add"><input type="hidden" name="variant_id" value={it.id} /><button className="btn btn--primary" disabled={it.available < 1}>{t('add_to_cart')}</button></form>
          <a className="btn btn--outline" href={href(v, `/p/${it.slug}`)}>{v.locale === 'ar' ? 'كل التفاصيل' : 'Full details'}</a>
        </div>
      </div>
    </div>
  );
}
