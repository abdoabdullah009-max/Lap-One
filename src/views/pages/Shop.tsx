import { brand } from '../../config/brand';
import { GOVERNORATES, USAGES } from '../../config/catalog';
import type { CatalogItem } from '../../server/services/catalog';
import type { CartView } from '../../server/services/cart';
import { NOTE_TEXT, type Recommendation, type WizardAnswers, type Note } from '../../server/services/recommend';
import type { PaymentMethod } from '../../server/services/orders';
import { Layout, POLICY_TITLES } from '../Layout';
import { View, Icon, href, money, bi, ProductCard, GradeBadge, StockLabel, storageText, gradeLabel, Breadcrumbs, waLink, USAGE_ICON, Price } from '../ui';
import { labelFor } from './Catalog';

// ------------------------------------------------------------------ Compare
export function ComparePage({ v, items }: { v: View; items: CatalogItem[] }) {
  const { t } = v;
  const rows: [string, (i: CatalogItem) => string | number | null, ('high' | 'low')?][] = [
    [t('s_cpu'), (i) => i.cpu_model], [t('s_gen'), (i) => (i.cpu_gen ? t('gen_n', { n: i.cpu_gen }) : null)], [t('s_cores'), (i) => i.cpu_cores, 'high'],
    [t('s_ram'), (i) => (i.ram_gb ? `${i.ram_gb}GB ${i.ram_type || ''}` : null)], [t('s_storage'), (i) => storageText(v, i.storage_gb, i.storage_type)],
    [t('s_gpu'), (i) => (i.gpu_model ? `${i.gpu_model}${i.gpu_dedicated && i.vram_gb ? ` ${i.vram_gb}GB` : ''}` : null)],
    [t('s_screen'), (i) => (i.screen_in ? `${i.screen_in}" ${i.resolution || ''}` : null)], [t('s_refresh'), (i) => (i.refresh_hz ? `${i.refresh_hz}Hz` : null)],
    [t('s_touch'), (i) => (i.touch === null ? null : i.touch ? t('yes') : t('no'))], [t('s_weight'), (i) => (i.weight_kg ? `${i.weight_kg} ${t('kg')}` : null)],
    [t('s_grade'), (i) => gradeLabel(v, i.grade)], [t('battery_health'), (i) => (i.battery_max !== null ? (i.battery_min === i.battery_max ? `${i.battery_max}%` : `${i.battery_min}–${i.battery_max}%`) : null)],
    [t('warranty'), (i) => (i.warranty_months ? t('warranty_months', { n: i.warranty_months }) : null)],
    [t('f_availability'), (i) => (i.available > 0 ? t('in_stock') : t('out_of_stock'))], [t('total'), (i) => money(v, i.price)],
  ];
  return (
    <Layout v={v} meta={{ title: `${t('compare_title')} | ${brand.name}`, noindex: true }}>
      <div className="container">
        <Breadcrumbs items={[{ name: t('home'), url: href(v) }, { name: t('compare_title') }]} />
        <h1>{t('compare_title')}</h1>
        {!items.length ? <div className="empty"><Icon name="compare" size={40} /><p>{t('compare_empty')}</p><a className="btn btn--primary" href={href(v, '/laptops')}>{t('hero_cta')}</a></div> : (
          <>
            <label className="check check--inline"><input type="checkbox" className="js-hide-same" /><span>{t('hide_identical')}</span></label>
            <div className="table-wrap compare-wrap">
              <table className="table table--compare js-compare-table" style={{ ['--cols' as any]: items.length }}>
                <thead><tr><th scope="col"><span className="sr-only">spec</span></th>{items.map((i) => (
                  <th key={i.id} scope="col">
                    <a href={href(v, `/p/${i.slug}`)} className="cmp-head"><img src={i.image || ''} alt="" width={160} height={120} loading="lazy" /><span>{i.title}</span></a>
                    <div className="cmp-actions">
                      <form method="post" action={href(v, '/cart/add')} className="js-add"><input type="hidden" name="variant_id" value={i.id} /><button className="btn btn--primary btn--sm" disabled={i.available < 1}>{t('add_to_cart')}</button></form>
                      <button type="button" className="btn btn--ghost btn--sm js-compare js-compare-remove is-on" data-id={i.id}>{t('remove')}</button>
                    </div>
                  </th>))}</tr></thead>
                <tbody>{rows.map(([label, get]) => {
                  const vals = items.map((i) => get(i));
                  const same = vals.every((x) => String(x) === String(vals[0]));
                  return <tr key={label} className={same ? 'is-same' : 'is-diff'}><th scope="row">{label}</th>{vals.map((x, k) => <td key={k}>{x === null || x === '' ? <span className="unknown">{t('unknown')}</span> : x}</td>)}</tr>;
                })}</tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </Layout>
  );
}

// ------------------------------------------------------------------ Wishlist
export function WishlistPage({ v, items }: { v: View; items: CatalogItem[] }) {
  return (
    <Layout v={v} meta={{ title: `${v.t('wishlist_title')} | ${brand.name}`, noindex: true }}>
      <div className="container">
        <h1>{v.t('wishlist_title')}</h1>
        {items.length ? <div className="grid">{items.map((it) => <ProductCard key={it.id} v={v} it={it} list="wishlist" />)}</div>
          : <div className="empty"><Icon name="heart" size={40} /><p>{v.t('wishlist_empty')}</p><a className="btn btn--primary" href={href(v, '/laptops')}>{v.t('hero_cta')}</a></div>}
      </div>
    </Layout>
  );
}

// ------------------------------------------------------------------ Wizard
const APPS = ['office', 'code', 'heavy_dev', 'autocad', 'revit', 'adobe', 'video', '3d', 'esports', 'aaa'];
const REQS = ['touch', '2in1', 'big', 'small', 'fhd', 'battery', 'ram16', 'dgpu'];
export function noteText(v: View, n: Note) {
  let s = NOTE_TEXT[v.locale][n.key] || n.key;
  for (const [k, val] of Object.entries(n.vars || {})) {
    const rep = k === 'amount' ? money(v, Number(val)) : k === 'usage' ? v.t(`usage_${val}` as any) : k === 'grade' ? gradeLabel(v, String(val)) : String(val);
    s = s.replaceAll(`{${k}}`, rep);
  }
  return s;
}

export function WizardPage({ v, answers, result, usages }: { v: View; answers: Partial<WizardAnswers> & { budget?: string }; result: Recommendation[] | null; usages?: string[] }) {
  const { t, settings: s, locale } = v;
  const budgetLabel = (r: { min: number | null; max: number | null }) => r.min === null ? t('budget_under', { max: money(v, r.max!) }) : r.max === null ? t('budget_over', { min: money(v, r.min) }) : t('budget_between', { min: money(v, r.min), max: money(v, r.max) });
  return (
    <Layout v={v} meta={{ title: `${t('wizard_title')} | ${brand.name}`, description: t('wizard_intro'), noindex: !!result }}>
      <div className="container container--narrow">
        <div className="wizard-head"><span className="wizard-head__icon"><Icon name="sparkle" size={26} /></span><div><h1>{t('wizard_title')}</h1><p className="muted">{t('wizard_intro')}</p></div></div>
        {result === null ? (
          <form method="get" action={href(v, '/help-me-choose')} className="wizard js-wizard" noValidate>
            <input type="hidden" name="go" value="1" />
            <fieldset className="wstep" data-step="1">
              <legend><span className="wstep__n">1/5</span>{t('wq1')}</legend>
              <div className="opts-grid">{USAGES.filter((u) => u !== 'budget' && (!usages || usages.includes(u))).map((u, i) => (
                <label key={u} className="optcard"><input type="radio" name="usage" value={u} required defaultChecked={answers.usage ? answers.usage === u : i === 0} /><span><Icon name={USAGE_ICON[u]} size={22} /><b>{t(`usage_${u}` as any)}</b><small>{t(`usage_${u}_d` as any)}</small></span></label>
              ))}</div>
            </fieldset>
            <fieldset className="wstep" data-step="2">
              <legend><span className="wstep__n">2/5</span>{t('wq2')}</legend>
              <div className="opts-list">
                {s.budget_ranges.map((r, i) => <label key={i} className="optrow"><input type="radio" name="budget" value={i} defaultChecked={answers.budget === String(i)} /><span>{budgetLabel(r)}</span></label>)}
                <label className="optrow"><input type="radio" name="budget" value="any" defaultChecked={!answers.budget || answers.budget === 'any'} /><span>{t('budget_any')}</span></label>
              </div>
            </fieldset>
            <fieldset className="wstep" data-step="3">
              <legend><span className="wstep__n">3/5</span>{t('wq3')}</legend>
              <div className="opts-chips">{APPS.map((a) => <label key={a} className="chipcheck"><input type="checkbox" name="apps" value={a} defaultChecked={answers.apps?.includes(a)} /><span>{t(`app_${a}` as any)}</span></label>)}</div>
            </fieldset>
            <fieldset className="wstep" data-step="4">
              <legend><span className="wstep__n">4/5</span>{t('wq4')}</legend>
              <div className="opts-list">{(['portable', 'performance', 'balanced'] as const).map((p) => <label key={p} className="optrow"><input type="radio" name="pref" value={p} defaultChecked={(answers.pref || 'balanced') === p} /><span>{t(`pref_${p}` as any)}</span></label>)}</div>
            </fieldset>
            <fieldset className="wstep" data-step="5">
              <legend><span className="wstep__n">5/5</span>{t('wq5')}</legend>
              <div className="opts-chips">{REQS.map((r) => <label key={r} className="chipcheck"><input type="checkbox" name="reqs" value={r} defaultChecked={answers.reqs?.includes(r)} /><span>{t(`req_${r === '2in1' ? '2in1' : r}` as any)}</span></label>)}</div>
            </fieldset>
            <div className="wizard__nav">
              <button type="button" className="btn btn--ghost js-wprev" hidden>{t('back')}</button>
              <div className="wizard__progress" aria-hidden="true"><span className="js-wbar" /></div>
              <button type="button" className="btn btn--primary js-wnext" hidden>{t('next')}</button>
              <button className="btn btn--primary js-wsubmit">{t('see_results')}</button>
            </div>
          </form>
        ) : (
          <div className="wresults">
            <div className="wresults__head">
              <h2>{t('wizard_results')}</h2>
              <a className="btn btn--ghost btn--sm" href={href(v, '/help-me-choose')}>{t('restart')}</a>
            </div>
            <div className="chips">
              {answers.usage ? <span className="chip chip--sm">{t(`usage_${answers.usage}` as any)}</span> : null}
              {answers.apps?.map((a) => <span key={a} className="chip chip--sm">{t(`app_${a}` as any)}</span>)}
              {answers.reqs?.map((r) => <span key={r} className="chip chip--sm">{t(`req_${r}` as any)}</span>)}
            </div>
            {result.length === 0 ? (
              <div className="empty"><Icon name="search" size={40} /><h3>{t('wizard_none')}</h3><p>{t('wizard_none_tip')}</p>
                <div className="chips"><a className="chip" href={href(v, '/help-me-choose')}>{t('restart')}</a>{waLink(v, 'Help me choose a laptop') ? <a className="chip js-wa" data-source="whatsapp_general" href={waLink(v, locale === 'ar' ? 'محتاج مساعدة في اختيار لابتوب' : 'I need help choosing a laptop')!} target="_blank" rel="noopener">{t('whatsapp')}</a> : null}</div></div>
            ) : result.map((r, i) => (
              <article key={r.item.id} className={`rec${i === 0 ? ' rec--top' : ''}`}>
                <a href={href(v, `/p/${r.item.slug}`)} className="rec__img"><img src={r.item.image || ''} alt="" width={320} height={240} loading="lazy" /></a>
                <div className="rec__body">
                  <div className="rec__top">
                    <span className="rec__rank">#{i + 1}</span>
                    <span className="rec__match" title={t('match_score')}>{r.match}%</span>
                    <GradeBadge v={v} grade={r.item.grade} />
                    {r.stretch ? <span className="badge badge--warn">{t('wizard_stretch')}</span> : null}
                  </div>
                  <h3><a href={href(v, `/p/${r.item.slug}`)}>{r.item.title}</a></h3>
                  <div className="rec__price"><Price v={v} price={r.item.price} was={r.item.compare_at_price} /><StockLabel v={v} n={r.item.available} /></div>
                  <div className="rec__cols">
                    <div><h4>{t('why_match')}</h4><ul className="ticks">{r.why.map((n, k) => <li key={k}><Icon name="check" size={14} />{noteText(v, n)}</li>)}</ul></div>
                    {r.strengths.length ? <div><h4>{t('strengths')}</h4><ul className="ticks ticks--pro">{r.strengths.map((n, k) => <li key={k}><Icon name="plus" size={14} />{noteText(v, n)}</li>)}</ul></div> : null}
                    {r.limits.length ? <div><h4>{t('limitations')}</h4><ul className="ticks ticks--con">{r.limits.map((n, k) => <li key={k}><Icon name="minus" size={14} />{noteText(v, n)}</li>)}</ul></div> : null}
                  </div>
                  {r.vs.length ? <p className="rec__vs"><b>{t('vs_alt')}:</b> {r.vs.map((n) => noteText(v, n)).join(' · ')}</p> : null}
                  <div className="rec__ctas">
                    <a className="btn btn--primary btn--sm" href={href(v, `/p/${r.item.slug}`)}>{locale === 'ar' ? 'شوف التفاصيل' : 'View details'}</a>
                    <button type="button" className={`btn btn--ghost btn--sm js-compare${v.compareIds.includes(r.item.id) ? ' is-on' : ''}`} data-id={r.item.id}><Icon name="compare" size={16} />{t('add_compare')}</button>
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </div>
    </Layout>
  );
}

// ------------------------------------------------------------------ Cart
export function CartPage({ v, cart, error }: { v: View; cart: CartView; error?: string | null }) {
  const { t, locale } = v;
  const waText = cart.lines.length ? (locale === 'ar' ? 'مرحبًا، عندي استفسار عن الطلب ده:\n' : 'Hi, I have a question about this order:\n') + cart.lines.map((l) => `• ${l.title} ×${l.qty} — ${money(v, (l.price + l.options_total) * l.qty)}`).join('\n') : '';
  const wa = waText ? waLink(v, waText) : null;
  return (
    <Layout v={v} meta={{ title: `${t('cart_title')} | ${brand.name}`, noindex: true }}>
      <div className="container">
        <h1>{t('cart_title')}</h1>
        {error ? <p className="note note--error" role="alert"><Icon name="alert" size={18} />{error}</p> : null}
        {!cart.lines.length ? (
          <div className="empty"><Icon name="cart" size={40} /><p>{t('cart_empty')}</p><a className="btn btn--primary" href={href(v, '/laptops')}>{t('continue_shopping')}</a></div>
        ) : (
          <div className="cart">
            <ul className="cart__lines">
              {cart.lines.map((l) => {
                const issue = cart.issues.includes(l.id);
                return (
                  <li key={l.id} className={`cline${issue ? ' cline--issue' : ''}`}>
                    <a href={href(v, `/p/${l.slug}`)} className="cline__img"><img src={l.image || ''} alt="" width={120} height={90} /></a>
                    <div className="cline__info">
                      <a href={href(v, `/p/${l.slug}`)} className="cline__title">{l.title}</a>
                      <div className="cline__meta"><GradeBadge v={v} grade={l.grade} />{l.warranty_months ? <span className="muted">{t('warranty_months', { n: l.warranty_months })}</span> : null}{l.is_sample ? <span className="sample-tag">{t('sample_badge')}</span> : null}</div>
                      {l.options.length ? <ul className="cline__opts">{l.options.map((o) => <li key={o.id}>+ {locale === 'ar' ? o.label_ar : o.label_en} ({money(v, o.price)})</li>)}</ul> : null}
                      {issue ? <p className="warn small"><Icon name="alert" size={14} />{t('item_unavailable')} ({l.available})</p> : null}
                    </div>
                    <div className="cline__qty">
                      <form method="post" action={href(v, '/cart/update')} className="qtyform">
                        <input type="hidden" name="line" value={l.id} />
                        <button name="qty" value={l.qty - 1} className="iconbtn" aria-label="-"><Icon name={l.qty === 1 ? 'trash' : 'minus'} size={16} /></button>
                        <span aria-label={t('qty')}>{l.qty}</span>
                        <button name="qty" value={l.qty + 1} className="iconbtn" aria-label="+" disabled={l.qty >= l.available}><Icon name="plus" size={16} /></button>
                      </form>
                    </div>
                    <div className="cline__price"><b>{money(v, l.line_total)}</b>{l.qty > 1 ? <small className="muted">{money(v, l.price + l.options_total)} × {l.qty}</small> : null}</div>
                  </li>
                );
              })}
            </ul>
            <aside className="summary">
              <h2>{t('review')}</h2>
              <dl>
                <dt>{t('subtotal')}</dt><dd>{money(v, cart.subtotal)}</dd>
                {cart.options_total ? <><dt>{t('options_total')}</dt><dd>{money(v, cart.options_total)}</dd></> : null}
                <dt>{t('shipping')}</dt><dd className="muted">{t('shipping_tbd')}</dd>
                <dt className="summary__total">{t('total')}</dt><dd className="summary__total">{money(v, cart.subtotal + cart.options_total)}</dd>
              </dl>
              <a className={`btn btn--primary btn--lg btn--block${cart.issues.length ? ' is-disabled' : ''}`} href={cart.issues.length ? '#' : href(v, '/checkout')} aria-disabled={cart.issues.length > 0}>{t('checkout')}</a>
              <a className="btn btn--ghost btn--block" href={href(v, '/laptops')}>{t('continue_shopping')}</a>
              {wa ? <a className="btn btn--wa btn--block js-wa" data-source="whatsapp_cart" href={wa} target="_blank" rel="noopener"><Icon name="whatsapp" size={18} />{t('ask_cart_whatsapp')}</a> : null}
            </aside>
          </div>
        )}
      </div>
    </Layout>
  );
}

// ------------------------------------------------------------------ Checkout
export interface CheckoutData { cart: CartView; methods: PaymentMethod[]; idem: string; values: Record<string, string>; errors: Record<string, string>; formError?: string | null; buyNow: boolean }
export function CheckoutPage({ v, d }: { v: View; d: CheckoutData }) {
  const { t, locale, settings: s } = v;
  const val = (k: string) => d.values[k] ?? '';
  const err = (k: string) => d.errors[k] ? <span className="ferr" id={`e-${k}`} role="alert">{d.errors[k]}</span> : null;
  const field = (k: string, label: string, props: Record<string, any> = {}) => (
    <div className={`field${d.errors[k] ? ' field--err' : ''}`}>
      <label htmlFor={k}>{label}</label>
      <input id={k} name={k} defaultValue={val(k)} aria-invalid={!!d.errors[k]} aria-describedby={d.errors[k] ? `e-${k}` : undefined} {...props} />
      {err(k)}
    </div>
  );
  const pmLabel: Record<PaymentMethod, string> = { cod: t('pay_cod'), card: t('pay_card'), wallet: t('pay_wallet'), transfer: t('pay_transfer') };
  const pmNote: Partial<Record<PaymentMethod, string>> = { card: t('pay_card_note'), wallet: t('pay_card_note'), transfer: t('pay_transfer_note') };
  const merch = d.cart.subtotal + d.cart.options_total;
  return (
    <Layout v={v} meta={{ title: `${t('checkout_title')} | ${brand.name}`, noindex: true }} bodyClass="checkout-body">
      <div className="container">
        <h1>{t('checkout_title')}</h1>
        {d.formError ? <p className="note note--error" role="alert"><Icon name="alert" size={18} />{d.formError}</p> : null}
        <form method="post" action={href(v, '/checkout')} className="checkout js-checkout" noValidate data-merch={merch}>
          <input type="hidden" name="idempotency_key" value={d.idem} />
          {d.buyNow && d.cart.id ? <input type="hidden" name="cart_id" value={d.cart.id} /> : null}
          <div className="checkout__main">
            <section className="cstep">
              <h2><span className="cstep__n">1</span>{t('contact_info')}</h2>
              <div className="fields">
                {field('name', t('full_name'), { autoComplete: 'name', required: true, minLength: 3, maxLength: 80 })}
                {field('phone', t('mobile'), { type: 'tel', inputMode: 'tel', autoComplete: 'tel', required: true, dir: 'ltr', placeholder: '01XXXXXXXXX', pattern: '[0-9+٠-٩ ]{10,16}' })}
                {field('email', t('email_opt'), { type: 'email', autoComplete: 'email', dir: 'ltr' })}
              </div>
            </section>
            <section className="cstep">
              <h2><span className="cstep__n">2</span>{t('delivery_info')}</h2>
              {s.pickup.enabled ? (
                <div className="seg" role="radiogroup">
                  <label><input type="radio" name="delivery_method" value="delivery" defaultChecked={val('delivery_method') !== 'pickup'} /><span><Icon name="truck" size={18} />{t('delivery')}</span></label>
                  <label><input type="radio" name="delivery_method" value="pickup" defaultChecked={val('delivery_method') === 'pickup'} /><span><Icon name="pin" size={18} />{t('pickup')}</span></label>
                </div>
              ) : <input type="hidden" name="delivery_method" value="delivery" />}
              <div className="fields js-address">
                <div className={`field${d.errors.governorate ? ' field--err' : ''}`}>
                  <label htmlFor="governorate">{t('governorate')}</label>
                  <select id="governorate" name="governorate" defaultValue={val('governorate')} required aria-invalid={!!d.errors.governorate} className="js-gov">
                    <option value="">{t('choose')}</option>
                    {GOVERNORATES.map(([c, ar, en]) => <option key={c} value={c}>{locale === 'ar' ? ar : en}</option>)}
                  </select>
                  {err('governorate')}
                </div>
                {field('city', t('city'), { autoComplete: 'address-level2', required: true })}
                {field('street', t('street'), { autoComplete: 'street-address', required: true, className: 'span2' })}
                {field('building', t('building'), {})}
                {field('instructions', t('instructions'), {})}
              </div>
              {s.pickup.enabled ? <p className="muted small js-pickup-info" hidden>{bi(v, s.pickup.address)} {bi(v, s.pickup.hours)}</p> : null}
              <p className="ship-quote js-ship-quote muted" aria-live="polite">{t('shipping_tbd')}</p>
            </section>
            <section className="cstep">
              <h2><span className="cstep__n">3</span>{t('payment')}</h2>
              {d.methods.length ? (
                <div className="paylist" role="radiogroup">
                  {d.methods.map((m, i) => (
                    <label key={m} className="payopt" data-method={m}>
                      <input type="radio" name="payment_method" value={m} defaultChecked={val('payment_method') ? val('payment_method') === m : i === 0} />
                      <span><b>{pmLabel[m]}</b>{pmNote[m] ? <small>{pmNote[m]}</small> : null}</span>
                    </label>
                  ))}
                </div>
              ) : <p className="note note--warn">{t('err_payment_method')}</p>}
              {err('payment_method')}
            </section>
            <section className="cstep cstep--consent">
              <label className="check"><input type="checkbox" name="marketing_consent" defaultChecked={val('marketing_consent') === 'on'} /><span>{t('consent_marketing', { brand: brand.name })}</span></label>
              <p className="muted small">{t('terms_note')} <a href={href(v, '/pages/returns')} target="_blank">{POLICY_TITLES[locale].returns}</a> · <a href={href(v, '/pages/warranty')} target="_blank">{POLICY_TITLES[locale].warranty}</a></p>
            </section>
          </div>
          <aside className="summary summary--sticky">
            <h2>{t('review')}</h2>
            <ul className="mini-lines">{d.cart.lines.map((l) => <li key={l.id}><img src={l.image || ''} alt="" width={56} height={42} /><span>{l.title}{l.options.length ? <small>{l.options.map((o) => locale === 'ar' ? o.label_ar : o.label_en).join(' · ')}</small> : null}</span><b>{l.qty > 1 ? `${l.qty}× ` : ''}{money(v, l.line_total)}</b></li>)}</ul>
            <div className="coupon">
              <label htmlFor="coupon">{t('coupon')}</label>
              <div className="coupon__row"><input id="coupon" name="coupon" defaultValue={val('coupon')} autoComplete="off" dir="ltr" /><button type="button" className="btn btn--outline btn--sm js-coupon">{t('apply_coupon')}</button></div>
              <span className="ferr js-coupon-msg" role="status">{d.errors.coupon || ''}</span>
            </div>
            <dl>
              <dt>{t('subtotal')}</dt><dd>{money(v, merch)}</dd>
              <dt className="js-discount-row" hidden>{t('discount')}</dt><dd className="js-discount-row js-discount" hidden />
              <dt>{t('shipping')}</dt><dd className="js-ship">{t('shipping_tbd')}</dd>
              <dt className="summary__total">{t('total')}</dt><dd className="summary__total js-grand">{money(v, merch)}</dd>
            </dl>
            <button className="btn btn--primary btn--lg btn--block js-place" data-busy={t('placing')} disabled={!d.methods.length}>{t('place_order')}</button>
            <p className="muted small center"><Icon name="shield" size={14} />{locale === 'ar' ? 'بياناتك تُستخدم لتنفيذ الطلب فقط.' : 'Your details are used only to fulfil your order.'}</p>
          </aside>
        </form>
      </div>
    </Layout>
  );
}

// ------------------------------------------------------------------ Order confirmation & tracking
export interface OrderView {
  number: string; status: string; payment_status: string; payment_method: string; total: number; subtotal: number; options_total: number; discount: number;
  shipping_fee: number; created_at: Date; reservation_expires_at: Date | null; address: any; customer: { name: string; phone: string };
  items: { title: string; unit_price: number; options: any[]; options_total: number; slug: string }[]; token: string; canRetry: boolean; firePurchase: boolean; id: number;
  events: { to_value: string | null; body: string | null; created_at: Date; kind: string }[];
}
export function OrderPage({ v, o, payError }: { v: View; o: OrderView; payError?: boolean }) {
  const { t, locale, settings: s } = v;
  const gov = GOVERNORATES.find((g) => g[0] === o.address.governorate);
  const maskPhone = o.customer.phone.replace(/^(\d{3})\d{5}(\d{3})$/, '$1•••••$2');
  const next = o.payment_status === 'paid' ? t('order_next_paid') : o.payment_method === 'cod' ? t('order_next_cod')
    : o.payment_method === 'transfer' ? t('order_next_transfer') : o.payment_status === 'failed' ? t('order_next_failed') : t('order_next_card_pending');
  const pending = ['card', 'wallet'].includes(o.payment_method) && o.payment_status === 'pending' && o.status === 'awaiting_payment';
  const wa = waLink(v, `${t('order_number')}: ${o.number}`);
  const steps = ['pending', 'confirmed', 'preparing', 'shipped', 'delivered'];
  const curIdx = o.status === 'awaiting_payment' ? 0 : steps.indexOf(o.status);
  return (
    <Layout v={v} meta={{ title: `${t('order_number')} ${o.number} | ${brand.name}`, noindex: true, alternates: false }}>
      <div className="container container--narrow">
        <div className={`order-hero${o.status === 'cancelled' ? ' order-hero--bad' : ''}`} data-order={o.number} data-pending={pending ? '1' : '0'}
          {...(o.firePurchase ? { 'data-purchase': JSON.stringify({ id: o.number, value: o.total / 100, items: o.items.map((i) => ({ item_name: i.title, price: i.unit_price / 100 })) }) } : {})}>
          <span className="order-hero__icon"><Icon name={o.status === 'cancelled' ? 'x' : pending ? 'clock' : 'check'} size={28} /></span>
          <div>
            <h1>{o.status === 'cancelled' ? t('st_cancelled') : t('order_received')}</h1>
            <p>{t('order_number')}: <b dir="ltr">{o.number}</b></p>
          </div>
        </div>
        {payError ? <p className="note note--error"><Icon name="alert" size={18} />{t('err_generic')}</p> : null}
        <div className="order-status">
          <div><small>{t('order_status')}</small><b className={`st st--${o.status}`}>{t(`st_${o.status}` as any)}</b></div>
          <div><small>{t('payment_status')}</small><b className={`ps ps--${o.payment_status}`}>{t(`ps_${o.payment_status}` as any)}</b></div>
          <div><small>{t('payment')}</small><b>{({ cod: t('pay_cod'), card: t('pay_card'), wallet: t('pay_wallet'), transfer: t('pay_transfer') } as any)[o.payment_method]}</b></div>
        </div>
        {o.status !== 'cancelled' ? <ol className="progress">{steps.map((st, i) => <li key={st} className={i <= curIdx ? 'done' : ''}><span />{t(`st_${st}` as any)}</li>)}</ol> : null}
        <p className={`note ${o.payment_status === 'failed' ? 'note--error' : 'note--info'}`}><Icon name="info" size={18} />{next}</p>
        {o.payment_method === 'transfer' && o.payment_status === 'awaiting_transfer' ? (
          <div className="panel transfer">
            <h3>{t('pay_transfer')}</h3>
            {s.payments.manual_transfer.instapay_handle ? <p>InstaPay: <b dir="ltr">{s.payments.manual_transfer.instapay_handle}</b></p> : null}
            {bi(v, s.payments.manual_transfer.bank_details) ? <p>{bi(v, s.payments.manual_transfer.bank_details)}</p> : null}
            <p>{t('total')}: <b>{money(v, o.total)}</b> · {t('order_number')}: <b dir="ltr">{o.number}</b></p>
          </div>
        ) : null}
        {o.reservation_expires_at && ['pending', 'awaiting_payment'].includes(o.status) && o.payment_status !== 'paid' ? (
          <p className="muted small">{t('reservation_until', { time: new Date(o.reservation_expires_at).toLocaleString(locale === 'ar' ? 'ar-EG' : 'en-GB', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Africa/Cairo' }) })}</p>
        ) : null}
        {o.canRetry ? (
          <form method="post" action={href(v, `/order/${o.number}/pay?t=${o.token}`)}><button className="btn btn--primary">{t('retry_payment')}</button></form>
        ) : null}
        <div className="panel">
          <ul className="mini-lines">{o.items.map((i, k) => <li key={k}><span><a href={href(v, `/p/${i.slug}`)}>{i.title}</a>{i.options.length ? <small>{i.options.map((x: any) => locale === 'ar' ? x.label_ar : x.label_en).join(' · ')}</small> : null}</span><b>{money(v, i.unit_price + i.options_total)}</b></li>)}</ul>
          <dl className="summary-dl">
            <dt>{t('subtotal')}</dt><dd>{money(v, o.subtotal + o.options_total)}</dd>
            {o.discount ? <><dt>{t('discount')}</dt><dd>−{money(v, o.discount)}</dd></> : null}
            <dt>{t('shipping')}</dt><dd>{money(v, o.shipping_fee)}</dd>
            <dt className="summary__total">{t('total')}</dt><dd className="summary__total">{money(v, o.total)}</dd>
          </dl>
        </div>
        <div className="panel">
          <h3>{t('delivery_info')}</h3>
          <p>{o.customer.name} · <span dir="ltr">{maskPhone}</span></p>
          <p>{o.address.pickup ? t('pickup') : `${gov ? (locale === 'ar' ? gov[1] : gov[2]) : ''} — ${o.address.city}، ${o.address.street}${o.address.building ? `، ${o.address.building}` : ''}`}</p>
        </div>
        <div className="panel help">
          <h3>{t('need_help')}</h3>
          <div className="chips">
            {wa ? <a className="btn btn--wa btn--sm js-wa" data-source="whatsapp_general" href={wa} target="_blank" rel="noopener"><Icon name="whatsapp" size={16} />{t('whatsapp')}</a> : null}
            {s.contact.phone ? <a className="btn btn--outline btn--sm" href={`tel:${s.contact.phone}`}><Icon name="phone" size={16} /><span dir="ltr">{s.contact.phone}</span></a> : null}
            <a className="btn btn--ghost btn--sm" href={href(v, '/contact')}>{t('contact')}</a>
          </div>
        </div>
      </div>
    </Layout>
  );
}

export function TrackPage({ v, notFound, values }: { v: View; notFound: boolean; values: { number?: string; phone?: string } }) {
  const t = v.t;
  return (
    <Layout v={v} meta={{ title: `${t('track_title')} | ${brand.name}`, noindex: true }}>
      <div className="container container--narrow">
        <h1>{t('track_title')}</h1>
        <p className="muted">{t('track_intro')}</p>
        {notFound ? <p className="note note--error" role="alert">{t('track_not_found')}</p> : null}
        <form method="post" action={href(v, '/track')} className="panel fields">
          <div className="field"><label htmlFor="number">{t('order_number')}</label><input id="number" name="number" required dir="ltr" placeholder="LO-10001" defaultValue={values.number} /></div>
          <div className="field"><label htmlFor="tphone">{t('mobile')}</label><input id="tphone" name="phone" type="tel" required dir="ltr" placeholder="01XXXXXXXXX" defaultValue={values.phone} /></div>
          <button className="btn btn--primary">{t('track_btn')}</button>
        </form>
      </div>
    </Layout>
  );
}

// ------------------------------------------------------------------ Content pages
export function PolicyPage({ v, slug }: { v: View; slug: keyof typeof POLICY_TITLES['ar'] }) {
  const s = v.settings; const title = POLICY_TITLES[v.locale][slug];
  const body = bi(v, s.policies[slug]);
  return (
    <Layout v={v} meta={{ title: `${title} | ${brand.name}`, description: body.slice(0, 150) || undefined }}>
      <div className="container container--narrow prose">
        <Breadcrumbs items={[{ name: v.t('home'), url: href(v) }, { name: title }]} />
        <h1>{title}</h1>
        {s.demo_mode && body ? <p className="note note--warn"><Icon name="alert" size={16} />{v.t('sample_policy')}</p> : null}
        {body ? body.split(/\n{2,}/).map((p, i) => <p key={i}>{p}</p>) : <p className="note note--info">{v.t('policy_missing')}</p>}
        {slug === 'warranty' || slug === 'inspection' ? (
          <div className="grades">{(['excellent', 'very_good', 'good', 'fair'] as const).map((g) => <div key={g} className="grades__item"><GradeBadge v={v} grade={g} /><p>{bi(v, s.grade_definitions[g])}</p></div>)}</div>
        ) : null}
      </div>
    </Layout>
  );
}

export function ContactPage({ v, sent }: { v: View; sent: boolean }) {
  const { t, settings: s } = v; const c = s.contact;
  const wa = waLink(v, v.locale === 'ar' ? 'مرحبًا' : 'Hello');
  return (
    <Layout v={v} meta={{ title: `${t('contact')} | ${brand.name}` }}>
      <div className="container container--narrow">
        <h1>{t('contact')}</h1>
        <div className="contact-grid">
          <div className="panel">
            <ul className="footer__contact footer__contact--dark">
              <li><Icon name="phone" size={18} />{c.phone ? <a href={`tel:${c.phone}`} dir="ltr">{c.phone}</a> : <span className="muted">{t('not_set')}</span>}</li>
              <li><Icon name="whatsapp" size={18} />{wa ? <a href={wa} className="js-wa" data-source="whatsapp_general" target="_blank" rel="noopener" dir="ltr">{c.whatsapp.replace(/^20/, '0')}</a> : <span className="muted">{t('not_set')}</span>}</li>
              <li><Icon name="mail" size={18} />{c.email ? <a href={`mailto:${c.email}`}>{c.email}</a> : <span className="muted">{t('not_set')}</span>}</li>
              <li><Icon name="pin" size={18} />{bi(v, c.address) || <span className="muted">{t('not_set')}</span>}</li>
              {bi(v, c.hours) ? <li><Icon name="clock" size={18} />{bi(v, c.hours)}</li> : null}
            </ul>
          </div>
          <form method="post" action={href(v, '/contact')} className="panel fields">
            {sent ? <p className="note note--info" role="status">{v.locale === 'ar' ? 'تم استلام رسالتك. هنتواصل معاك قريبًا.' : 'Message received. We will get back to you soon.'}</p> : null}
            <div className="field"><label htmlFor="cname">{t('full_name')}</label><input id="cname" name="name" required maxLength={80} /></div>
            <div className="field"><label htmlFor="cphone">{t('mobile')}</label><input id="cphone" name="phone" type="tel" required dir="ltr" /></div>
            <div className="field"><label htmlFor="cmsg">{v.locale === 'ar' ? 'رسالتك' : 'Message'}</label><textarea id="cmsg" name="message" rows={4} required maxLength={1000} /></div>
            <input type="text" name="website" className="hp" tabIndex={-1} autoComplete="off" aria-hidden="true" />
            <button className="btn btn--primary">{v.locale === 'ar' ? 'إرسال' : 'Send'}</button>
          </form>
        </div>
      </div>
    </Layout>
  );
}

export function FaqPage({ v }: { v: View }) {
  return (
    <Layout v={v} meta={{ title: `${v.t('faq')} | ${brand.name}`, jsonLd: v.settings.faq.length ? [{ '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: v.settings.faq.map((f) => ({ '@type': 'Question', name: bi(v, f.q), acceptedAnswer: { '@type': 'Answer', text: bi(v, f.a) } })) }] : [] }}>
      <div className="container container--narrow"><h1>{v.t('faq')}</h1>
        <div className="faq">{v.settings.faq.map((f, i) => <details key={i} open={i === 0}><summary>{bi(v, f.q)}<Icon name="chevronDown" size={18} /></summary><p>{bi(v, f.a)}</p></details>)}</div>
      </div>
    </Layout>
  );
}

export function NotFoundPage({ v }: { v: View }) {
  return (
    <Layout v={v} meta={{ title: `${v.t('page_not_found')} | ${brand.name}`, noindex: true }}>
      <div className="container empty empty--page"><span className="big404">404</span><h1>{v.t('page_not_found')}</h1>
        <div className="chips"><a className="btn btn--primary" href={href(v)}>{v.t('back_home')}</a><a className="btn btn--outline" href={href(v, '/laptops')}>{v.t('all_laptops')}</a></div></div>
    </Layout>
  );
}

export function ErrorPage({ v, message }: { v: View; message: string }) {
  return (
    <Layout v={v} meta={{ title: brand.name, noindex: true }}>
      <div className="container empty empty--page"><Icon name="alert" size={40} /><h1>{message}</h1><a className="btn btn--primary" href={href(v)}>{v.t('back_home')}</a></div>
    </Layout>
  );
}

// ------------------------------------------------------------------ Campaign landing pages
export const CAMPAIGNS: Record<string, { filters: Record<string, string>; title: { ar: string; en: string }; sub: { ar: string; en: string } }> = {
  students: { filters: { usage: 'study', in_stock: '1' }, title: { ar: 'لابتوبات للطلاب بأسعار مناسبة', en: 'Student laptops at sensible prices' }, sub: { ar: 'أجهزة خفيفة ومفحوصة للمذاكرة والمحاضرات والمشاريع.', en: 'Light, inspected laptops for lectures and projects.' } },
  gaming: { filters: { usage: 'gaming', in_stock: '1' }, title: { ar: 'لابتوبات جيمينج بكروت RTX', en: 'Gaming laptops with RTX graphics' }, sub: { ar: 'كروت شاشة منفصلة وشاشات سريعة — بحالة ومواصفات معلنة.', en: 'Dedicated GPUs and fast screens — with declared condition.' } },
  workstations: { filters: { usage: 'workstation', in_stock: '1' }, title: { ar: 'محطات عمل للمهندسين والمصممين', en: 'Workstations for engineers and designers' }, sub: { ar: 'Dell Precision و HP ZBook و ThinkPad P بكروت احترافية.', en: 'Dell Precision, HP ZBook and ThinkPad P with pro GPUs.' } },
  offers: { filters: { offer: '1' }, title: { ar: 'عروض حقيقية على لابتوبات مختارة', en: 'Real offers on selected laptops' }, sub: { ar: 'السعر السابق المعروض هو سعر البيع الفعلي قبل العرض.', en: 'The previous price shown is the actual selling price before the offer.' } },
  budget: { filters: { usage: 'budget', in_stock: '1', sort: 'price_asc' }, title: { ar: 'أجهزة اقتصادية تؤدي الغرض', en: 'Budget laptops that get the job done' }, sub: { ar: 'أفضل قيمة مقابل السعر، مع وضوح كامل في الحالة.', en: 'Best value for money, with full transparency on condition.' } },
};
export function LandingPage({ v, key_, items, brandSlug }: { v: View; key_: string; items: CatalogItem[]; brandSlug?: string }) {
  const c = CAMPAIGNS[key_]; const t = v.t;
  const title = brandSlug ? `${v.locale === 'ar' ? 'لابتوبات' : 'Laptops by'} ${items[0]?.brand_name || brandSlug}` : bi(v, c.title);
  const qs = new URLSearchParams(brandSlug ? { brand: brandSlug } : c.filters).toString();
  return (
    <Layout v={v} meta={{ title: `${title} | ${brand.name}`, description: brandSlug ? title : bi(v, c.sub), ogImage: items[0]?.image || undefined }}>
      <section className="lp-hero"><div className="container">
        <h1>{title}</h1><p>{brandSlug ? t('hero_sub') : bi(v, c.sub)}</p>
        <div className="hero__ctas"><a className="btn btn--primary btn--lg" href={href(v, `/laptops?${qs}`)}>{t('view_all')} ({items.length})</a><a className="btn btn--outline-light btn--lg" href={href(v, '/help-me-choose')}>{t('hero_cta2')}</a></div>
      </div></section>
      <div className="container">
        <div className="grid">{items.slice(0, 8).map((it) => <ProductCard key={it.id} v={v} it={it} list={`lp_${key_}`} />)}</div>
        {!items.length ? <div className="empty"><p>{t('no_results')}</p></div> : null}
      </div>
    </Layout>
  );
}

export function SandboxPayPage({ v, payment, sig }: { v: View; payment: { id: number; amount: number; number: string; status: string }; sig: string }) {
  return (
    <html lang="en" dir="ltr"><head><meta charSet="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" /><title>Paymob sandbox (simulated)</title><meta name="robots" content="noindex" /><link rel="stylesheet" href={`/assets/app.css?v=${v.v}`} /></head>
      <body className="sandbox"><main className="container container--narrow">
        <div className="panel">
          <p className="note note--warn"><Icon name="alert" size={18} />SANDBOX SIMULATOR — not a real payment page. In production customers are redirected to Paymob’s hosted checkout.</p>
          <h1>Paymob · Unified Checkout (mock)</h1>
          <p>Order <b>{payment.number}</b> · Amount <b>{formatPlain(payment.amount)} EGP</b> · Payment #{payment.id} ({payment.status})</p>
          <p className="muted small">Choosing an outcome sends a Paymob-format TRANSACTION callback, signed with your PAYMOB_HMAC_SECRET, to <code>/webhooks/paymob</code> — the same verification path as production.</p>
          <form method="post" action={`/pay/sandbox/${payment.id}?s=${sig}`} className="chips">
            <button name="outcome" value="success" className="btn btn--primary">Simulate successful payment</button>
            <button name="outcome" value="fail" className="btn btn--outline">Simulate declined card</button>
          </form>
        </div>
      </main></body></html>
  );
}
const formatPlain = (p: number) => (p / 100).toFixed(2);
void labelFor;
