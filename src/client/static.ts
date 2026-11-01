import { setupTabs } from './tabs';
/* Runtime for the single-file static demo (index.html). Hash routing over pre-rendered pages,
   client-side search/filter using the same query parser as the server, in-memory cart/compare/wishlist.
   No order is ever sent anywhere. */
import { parseQuery, textScore } from '../server/services/search';

declare const __DATA__: {
  shell: Record<string, string>; pages: Record<string, string>; cards: Record<string, Record<number, string>>;
  items: any[]; zones: { gov: string[]; fee: number; free: number | null; min: number | null; max: number | null }[];
  govs: [string, string, string][]; wa: string; budgets: { min: number | null; max: number | null }[];
};
const D = __DATA__ as typeof __DATA__ & { img: Record<string, string> };
const hyd = (h: string) => h.replace(/IMG:([\w.-]+)/g, (_m, k) => D.img[k] || '');
const $ = <T extends Element = HTMLElement>(s: string, r: ParentNode = document) => r.querySelector(s) as T | null;
const $$ = <T extends Element = HTMLElement>(s: string, r: ParentNode = document) => Array.from(r.querySelectorAll(s)) as T[];
const state = { cart: [] as { id: number; qty: number; opts: { label: string; price: number }[] }[], cmp: [] as number[], wish: [] as number[] };
const byId = new Map(D.items.map((i) => [i.id, i]));
const bySlug = new Map(D.items.map((i) => [i.slug, i]));
let L: 'ar' | 'en' = 'ar';
const tr = (ar: string, en: string) => (L === 'ar' ? ar : en);
const money = (p: number) => { const n = new Intl.NumberFormat(L === 'ar' ? 'ar-EG' : 'en-EG', { maximumFractionDigits: 0 }).format(p / 100); return L === 'ar' ? `${n} ج.م` : `EGP ${n}`; };
const esc = (s: string) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));

function toast(msg: string) {
  const t = $('.toast'); if (!t) return; t.innerHTML = msg; t.hidden = false; clearTimeout((t as any)._t); (t as any)._t = setTimeout(() => (t.hidden = true), 2600);
}
function counts() {
  const set = (sel: string, n: number) => $$(sel).forEach((e) => { e.textContent = String(n); e.hidden = !n; });
  set('.js-cart-count', state.cart.reduce((s, l) => s + l.qty, 0)); set('.js-wish-count', state.wish.length); set('.js-cmp-count', state.cmp.length);
  const bar = $('.cmpbar'); if (bar) { bar.hidden = !state.cmp.length; const tx = $('.js-cmpbar-text', bar); if (tx) tx.textContent = tr(`المقارنة (${state.cmp.length}/4)`, `Compare (${state.cmp.length}/4)`); }
  $$('.js-wish').forEach((b) => b.classList.toggle('is-on', state.wish.includes(Number(b.dataset.id))));
  $$('.js-compare').forEach((b) => b.classList.toggle('is-on', state.cmp.includes(Number(b.dataset.id))));
}

// ---------------------------------------------------------------- routing
function route() {
  const raw = location.hash.replace(/^#/, '') || '/ar';
  const [path, qs = ''] = raw.split('?');
  const sp = new URLSearchParams(qs);
  const m = path.match(/^\/(ar|en)(\/.*)?$/); if (!m) { location.hash = '#/ar'; return; }
  const loc = m[1] as 'ar' | 'en'; const rest = m[2] || '';
  if (loc !== L || !$('#main')) {
    L = loc; document.documentElement.lang = L; document.documentElement.dir = L === 'ar' ? 'rtl' : 'ltr';
    document.body.innerHTML = hyd(D.shell[L]); bindShell();
  }
  const main = $('#main')!;
  let html = D.pages[`${L}${rest}`];
  if (rest === '/laptops') html = catalog(sp);
  else if (rest === '/cart') html = cartPage();
  else if (rest === '/checkout') html = checkoutPage();
  else if (rest === '/compare') html = comparePage();
  else if (rest === '/wishlist') html = gridPage(tr('المفضلة', 'Wishlist'), state.wish, tr('قائمة المفضلة فاضية.', 'Your wishlist is empty.'));
  else if (rest === '/help-me-choose' && sp.get('go')) html = wizardResults(sp);
  else if (rest.startsWith('/lp/') || rest.startsWith('/brand/')) html = catalog(new URLSearchParams(rest.startsWith('/brand/') ? `brand=${rest.slice(7)}` : ({ students: 'usage=study', gaming: 'usage=gaming', workstations: 'usage=workstation', offers: 'offer=1', budget: 'usage=budget' } as any)[rest.slice(4)] || ''));
  if (!html) html = `<div class="container empty empty--page"><span class="big404">404</span><h1>${tr('الصفحة غير موجودة', 'Page not found')}</h1><a class="btn btn--primary" href="#/${L}">${tr('ارجع للرئيسية', 'Back to home')}</a></div>`;
  main.innerHTML = hyd(html);
  $$<HTMLAnchorElement>('.bnav a').forEach((x) => { const h = (x.getAttribute('href') || '').replace(/^#\/(ar|en)/, ''); x.classList.toggle('is-on', h === rest || (h === '/laptops' && rest.startsWith('/laptops'))); });
  const lang = $<HTMLAnchorElement>('.nav__lang'); if (lang) lang.href = `#/${L === 'ar' ? 'en' : 'ar'}${rest}${qs ? '?' + qs : ''}`;
  $$<HTMLAnchorElement>('.drawer__nav a[lang]').forEach((a) => (a.href = lang!.href));
  const q = $<HTMLInputElement>('#q'); if (q) q.value = rest === '/laptops' ? sp.get('q') || '' : '';
  $('#drawer')!.hidden = true; document.body.style.overflow = '';
  enhance(main); counts(); window.scrollTo(0, 0);
  if (rest.startsWith('/p/')) { const it = bySlug.get(rest.slice(3)); if (it) { const rv: number[] = JSON.parse(sessionStorage.getItem('rv') || '[]').filter((x: number) => x !== it.id); rv.unshift(it.id); try { sessionStorage.setItem('rv', JSON.stringify(rv.slice(0, 8))); } catch { /* */ } } }
  const recent = $('.js-recent'); if (recent) { let rv: number[] = []; try { rv = JSON.parse(sessionStorage.getItem('rv') || '[]'); } catch { /* */ } if (rv.length) { $('.js-recent-rail', recent)!.innerHTML = hyd(rv.map((id) => `<div role="listitem">${D.cards[L][id] || ''}</div>`).join('')); recent.hidden = false; counts(); } }
}

// ---------------------------------------------------------------- catalog (same parser as the server)
function filterItems(sp: URLSearchParams) {
  const accessory = sp.get('accessory') === '1';
  let items = D.items.filter((i) => i.is_accessory === accessory);
  const f: any = {};
  for (const k of ['brand', 'usage', 'cpu_tier', 'grade', 'family', 'gpu_type', 'cpu_gen', 'ram', 'screen', 'storage_type', 'cpu_brand', 'gpu_brand']) { const v = sp.getAll(k); if (v.length) f[k] = v; }
  for (const k of ['min', 'max']) if (sp.get(k)) f[k] = Number(sp.get(k));
  for (const k of ['offer', 'in_stock', 'touch', 'convertible', 'battery_known']) if (sp.get(k) === '1') f[k] = true;
  let understood: string[] = [];
  const score = new Map<number, number>();
  const q = sp.get('q');
  if (q) {
    const p = parseQuery(q, { brands: Object.fromEntries(D.items.map((i) => [i.brand_slug, [i.brand_name, ...(i.brand_aliases || [])]])) });
    understood = p.understood.map((u) => u.label);
    const pf: any = p.filters;
    for (const k of Object.keys(pf)) if (f[k] === undefined) f[k] = Array.isArray(pf[k]) ? pf[k].map(String) : pf[k];
    if (p.text.length) {
      const strict = items.filter((i) => { const r = textScore(p.text, i._doc); if (r.score) score.set(i.id, r.score); return r.matchedAll; });
      items = strict.length ? strict : items.filter((i) => score.get(i.id));
    }
  }
  const has = (k: string, v: any) => !f[k] || f[k].map(String).includes(String(v));
  items = items.filter((i) => has('brand', i.brand_slug) && (!f.usage || f.usage.some((u: string) => i.usages.includes(u))) && has('cpu_tier', i.cpu_tier) && has('grade', i.grade)
    && has('family', i.family_slug) && has('cpu_gen', i.cpu_gen) && has('ram', i.ram_gb) && has('cpu_brand', i.cpu_brand) && has('gpu_brand', i.gpu_brand) && has('storage_type', i.storage_type)
    && has('screen', i.screen_in ? Math.floor(i.screen_in) : null) && (!f.gpu_type || f.gpu_type.includes(i.gpu_dedicated ? 'dedicated' : 'integrated'))
    && (!f.series || f.series.some((s: string) => i._doc.includes(s))) && (!f.gpu_model || f.gpu_model.some((g: string) => String(i.gpu_model || '').toLowerCase().replace(/\s/g, '').includes(String(g).replace(/\s/g, ''))))
    && (!f.cpu_model || f.cpu_model.some((c: string) => String(i.cpu_model || '').toLowerCase().includes(c))) && (!f.storage_min || (i.storage_gb || 0) >= f.storage_min)
    && (!f.min || i.price >= f.min * 100) && (!f.max || i.price <= f.max * 100) && (!f.offer || i.is_offer) && (!f.in_stock || i.available > 0)
    && (!f.touch || i.touch) && (!f.convertible || i.convertible) && (!f.battery_known || i.battery_max !== null));
  const sort = sp.get('sort') || 'recommended';
  const stock = (a: any, b: any) => Number(b.available > 0) - Number(a.available > 0);
  items.sort((a, b) => stock(a, b) || (sort === 'price_asc' ? a.price - b.price : sort === 'price_desc' ? b.price - a.price : sort === 'newest' ? b.created - a.created
    : (score.get(b.id) || 0) - (score.get(a.id) || 0) || b.value - a.value));
  return { items, understood };
}
function catalog(sp: URLSearchParams) {
  const tpl = D.pages[`${L}/laptops`];
  const { items, understood } = filterItems(sp);
  const wrap = document.createElement('div'); wrap.innerHTML = tpl;
  const usage = sp.getAll('usage');
  const title = sp.get('q') ? `${tr('نتائج البحث عن', 'Results for')} “${esc(sp.get('q')!)}”` : sp.get('accessory') ? tr('إكسسوارات وترقيات', 'Accessories & upgrades')
    : sp.get('offer') ? tr('العروض', 'Offers') : usage.length === 1 ? ($(`input[name=usage][value="${usage[0]}"]`, wrap)?.parentElement?.querySelector('span')?.textContent || '') : '';
  if (title) $('.cat-head h1', wrap)!.innerHTML = title;
  $('.cat-head p', wrap)!.textContent = tr(`${items.length} جهاز`, `${items.length} laptops`);
  $$<HTMLInputElement>('.js-filterform input[type=checkbox]', wrap).forEach((i) => { if (sp.getAll(i.name).includes(i.value)) i.setAttribute('checked', ''); else i.removeAttribute('checked'); });
  for (const k of ['min', 'max']) { const i = $<HTMLInputElement>(`.js-filterform input[name=${k}]`, wrap); if (i) i.setAttribute('value', sp.get(k) || ''); }
  const sel = $<HTMLSelectElement>('#sort', wrap); if (sel) $$('option', sel).forEach((o) => o.toggleAttribute('selected', o.getAttribute('value') === (sp.get('sort') || 'recommended')));
  const extra = document.createElement('div');
  extra.innerHTML = (understood.length ? `<div class="understood"><span>${tr('فهمنا بحثك كـ:', 'We understood your search as:')}</span>${understood.map((u) => `<span class="chip chip--sm">${esc(u)}</span>`).join('')}</div>` : '')
    + ([...sp.keys()].filter((k) => k !== 'sort').length ? `<div class="active-filters"><a class="link" href="#/${L}/laptops">${tr('مسح كل الفلاتر', 'Clear all filters')}</a></div>` : '');
  $('.cat-head', wrap)!.after(extra);
  $$('.understood, .active-filters', wrap).forEach((e) => { if (!extra.contains(e)) e.remove(); });
  const grid = $('.cat__results', wrap)!;
  grid.innerHTML = items.length ? `<div class="grid">${items.map((i) => D.cards[L][i.id]).join('')}</div>`
    : `<div class="empty"><h2>${tr('مفيش نتائج مطابقة', 'No matching laptops')}</h2><p>${tr('جرّب تشيل بعض الفلاتر أو ابحث بكلمة أعم.', 'Try removing filters or a broader search.')}</p><a class="chip" href="#/${L}/laptops">${tr('مسح كل الفلاتر', 'Clear all filters')}</a></div>`;
  return wrap.innerHTML;
}

// ---------------------------------------------------------------- cart / checkout (demo only)
const lineTotal = (l: typeof state.cart[number]) => (byId.get(l.id).price + l.opts.reduce((s, o) => s + o.price, 0)) * l.qty;
function cartPage() {
  if (!state.cart.length) return `<div class="container"><h1>${tr('سلة المشتريات', 'Shopping cart')}</h1><div class="empty"><p>${tr('السلة فاضية.', 'Your cart is empty.')}</p><a class="btn btn--primary" href="#/${L}/laptops">${tr('كمّل تسوق', 'Continue shopping')}</a></div></div>`;
  const total = state.cart.reduce((s, l) => s + lineTotal(l), 0);
  return `<div class="container"><h1>${tr('سلة المشتريات', 'Shopping cart')}</h1><div class="cart"><ul class="cart__lines">${state.cart.map((l, k) => { const it = byId.get(l.id); return `<li class="cline">
    <a href="#/${L}/p/${it.slug}" class="cline__img"><img src="${it.image}" alt="" width="120" height="90"></a>
    <div class="cline__info"><a href="#/${L}/p/${it.slug}" class="cline__title">${esc(it.title)}</a>${l.opts.length ? `<ul class="cline__opts">${l.opts.map((o) => `<li>+ ${esc(o.label)} (${money(o.price)})</li>`).join('')}</ul>` : ''}</div>
    <div class="cline__qty"><span class="qtyform"><button class="iconbtn js-qty" data-k="${k}" data-d="-1">−</button><span>${l.qty}</span><button class="iconbtn js-qty" data-k="${k}" data-d="1" ${l.qty >= it.available ? 'disabled' : ''}>+</button></span></div>
    <div class="cline__price"><b>${money(lineTotal(l))}</b></div></li>`; }).join('')}</ul>
    <aside class="summary"><h2>${tr('مراجعة الطلب', 'Order review')}</h2><dl><dt>${tr('المجموع الفرعي', 'Subtotal')}</dt><dd>${money(total)}</dd><dt>${tr('الشحن', 'Shipping')}</dt><dd class="muted">${tr('يُحسب في الخطوة التالية', 'Next step')}</dd><dt class="summary__total">${tr('الإجمالي', 'Total')}</dt><dd class="summary__total">${money(total)}</dd></dl>
    <a class="btn btn--primary btn--lg btn--block" href="#/${L}/checkout">${tr('إتمام الطلب', 'Checkout')}</a><a class="btn btn--ghost btn--block" href="#/${L}/laptops">${tr('كمّل تسوق', 'Continue shopping')}</a></aside></div></div>`;
}
function checkoutPage() {
  if (!state.cart.length) return cartPage();
  const merch = state.cart.reduce((s, l) => s + lineTotal(l), 0);
  return `<div class="container"><h1>${tr('إتمام الطلب', 'Checkout')}</h1><p class="note note--info">${tr('بعد ما تضغط تأكيد، هيتفتح واتساب برسالة فيها طلبك. فريق المبيعات هيأكدلك التوفر وتكلفة الشحن قبل أي دفع.', 'After you confirm, WhatsApp opens with your order. Our sales team confirms availability and shipping cost before any payment.')}</p>
  <form class="checkout js-demo-checkout" novalidate data-merch="${merch}"><div class="checkout__main">
    <section class="cstep"><h2><span class="cstep__n">1</span>${tr('بيانات التواصل', 'Contact details')}</h2><div class="fields">
      <div class="field"><label for="name">${tr('الاسم بالكامل', 'Full name')}</label><input id="name" required minlength="3"></div>
      <div class="field"><label for="phone">${tr('رقم الموبايل', 'Mobile number')}</label><input id="phone" type="tel" dir="ltr" placeholder="01XXXXXXXXX"></div></div></section>
    <section class="cstep"><h2><span class="cstep__n">2</span>${tr('التوصيل', 'Delivery')}</h2><div class="fields">
      <div class="field"><label for="gov">${tr('المحافظة', 'Governorate')}</label><select id="gov"><option value="">${tr('اختر…', 'Choose…')}</option>${D.govs.map(([c, a, e]) => `<option value="${c}">${L === 'ar' ? a : e}</option>`).join('')}</select></div>
      <div class="field"><label for="city">${tr('المنطقة / المدينة', 'Area / city')}</label><input id="city"></div>
      <div class="field"><label for="street">${tr('الشارع والعنوان', 'Street and address')}</label><input id="street"></div></div><p class="ship-quote muted js-quote"></p></section>
    <section class="cstep"><h2><span class="cstep__n">3</span>${tr('طريقة الدفع', 'Payment method')}</h2><div class="paylist">
      ${[['cod', tr('الدفع عند الاستلام', 'Cash on delivery')], ['card', tr('بطاقة بنكية (Paymob)', 'Card (Paymob)')], ['transfer', tr('تحويل بنكي / InstaPay', 'Bank transfer / InstaPay')]].map(([v, l], i) => `<label class="payopt"><input type="radio" name="pm" value="${v}" ${i ? '' : 'checked'}><span><b>${l}</b></span></label>`).join('')}</div></section></div>
    <aside class="summary summary--sticky"><h2>${tr('مراجعة الطلب', 'Order review')}</h2><ul class="mini-lines">${state.cart.map((l) => `<li><img src="${byId.get(l.id).image}" alt="" width="56" height="42"><span>${esc(byId.get(l.id).title)}</span><b>${money(lineTotal(l))}</b></li>`).join('')}</ul>
    <dl><dt>${tr('المجموع الفرعي', 'Subtotal')}</dt><dd>${money(merch)}</dd><dt>${tr('الشحن', 'Shipping')}</dt><dd class="js-ship muted">${tr('يحدده فريق المبيعات', 'Confirmed by sales')}</dd><dt class="summary__total">${tr('الإجمالي', 'Total')}</dt><dd class="summary__total js-grand">${money(merch)}</dd></dl>
    <button class="btn btn--primary btn--lg btn--block">${tr('إرسال الطلب على واتساب', 'Send order on WhatsApp')}</button></aside></form></div>`;
}
function quote(gov: string, merch: number) {
  const z = D.zones.find((x) => x.gov.includes(gov));
  if (!z) return { ok: true, fee: 0, unknown: true, text: tr('تكلفة ومدة الشحن لمحافظتك هيأكدها فريق المبيعات على واتساب.', 'Shipping cost and time for your governorate are confirmed by our sales team on WhatsApp.') };
  const fee = z.free !== null && merch >= z.free ? 0 : z.fee;
  return { ok: true, fee, text: z.min && z.max ? tr(`التوصيل المتوقع: ${z.min}–${z.max} أيام عمل`, `Estimated delivery: ${z.min}–${z.max} business days`) : '' };
}

// ---------------------------------------------------------------- compare / grids / wizard
function gridPage(title: string, ids: number[], empty: string) {
  return `<div class="container"><h1>${title}</h1>${ids.length ? `<div class="grid">${ids.map((id) => D.cards[L][id]).join('')}</div>` : `<div class="empty"><p>${empty}</p><a class="btn btn--primary" href="#/${L}/laptops">${tr('تسوق اللابتوبات', 'Shop laptops')}</a></div>`}</div>`;
}
function comparePage() {
  if (!state.cmp.length) return gridPage(tr('مقارنة الأجهزة', 'Compare laptops'), [], tr('لم تضف أي جهاز للمقارنة بعد. اضغط "قارن" على أي جهاز (حتى 4).', 'Nothing to compare yet. Tap Compare on any laptop (up to 4).'));
  const its = state.cmp.map((id) => byId.get(id));
  const rows: [string, (i: any) => string][] = [[tr('المعالج', 'Processor'), (i) => i.cpu_model], [tr('الجيل', 'Generation'), (i) => i.cpu_gen ?? '—'], [tr('الرامات', 'RAM'), (i) => `${i.ram_gb}GB ${i.ram_type || ''}`],
    [tr('التخزين', 'Storage'), (i) => `${i.storage_gb}GB ${i.storage_type || ''}`], [tr('كارت الشاشة', 'Graphics'), (i) => `${i.gpu_model}${i.vram_gb ? ` ${i.vram_gb}GB` : ''}`], [tr('الشاشة', 'Screen'), (i) => `${i.screen_in}" ${i.resolution || ''}`],
    [tr('معدل التحديث', 'Refresh'), (i) => `${i.refresh_hz || 60}Hz`], [tr('الوزن', 'Weight'), (i) => i.weight_kg ? `${i.weight_kg} kg` : '—'], [tr('الحالة', 'Condition'), (i) => i.grade_label],
    [tr('البطارية', 'Battery'), (i) => i.battery_max !== null ? `${i.battery_min === i.battery_max ? '' : i.battery_min + '–'}${i.battery_max}%` : tr('غير مختبرة', 'Untested')],
    [tr('الضمان', 'Warranty'), (i) => i.warranty_months ? tr(`${i.warranty_months} شهر`, `${i.warranty_months} months`) : '—'], [tr('التوفر', 'Availability'), (i) => i.available ? tr('متاح', 'In stock') : tr('غير متاح', 'Unavailable')], [tr('السعر', 'Price'), (i) => money(i.price)]];
  return `<div class="container"><h1>${tr('مقارنة الأجهزة', 'Compare laptops')}</h1><label class="check check--inline"><input type="checkbox" class="js-hide-same"><span>${tr('إخفاء المواصفات المتطابقة', 'Hide identical specs')}</span></label>
    <div class="table-wrap compare-wrap"><table class="table table--compare js-compare-table" style="--cols:${its.length}"><thead><tr><th></th>${its.map((i) => `<th><a href="#/${L}/p/${i.slug}" class="cmp-head"><img src="${i.image}" alt="" width="160" height="120"><span>${esc(i.title)}</span></a><div class="cmp-actions"><button class="btn btn--ghost btn--sm js-compare is-on" data-id="${i.id}">${tr('حذف', 'Remove')}</button></div></th>`).join('')}</tr></thead>
    <tbody>${rows.map(([l, g]) => { const v = its.map(g); const same = v.every((x) => String(x) === String(v[0])); return `<tr class="${same ? 'is-same' : 'is-diff'}"><th>${l}</th>${v.map((x) => `<td>${esc(String(x))}</td>`).join('')}</tr>`; }).join('')}</tbody></table></div></div>`;
}
function wizardResults(sp: URLSearchParams) {
  const usage = sp.get('usage') || 'study'; const b = D.budgets[Number(sp.get('budget'))]; const reqs = sp.getAll('reqs'); const apps = sp.getAll('apps'); const pref = sp.get('pref') || 'balanced';
  const needG = usage === 'gaming' || usage === 'workstation' || reqs.includes('dgpu') || apps.some((a) => ['video', '3d', 'aaa', 'revit'].includes(a));
  let items = D.items.filter((i) => !i.is_accessory && i.available > 0 && (!b || ((b.max === null || i.price <= b.max * 1.1) && (b.min === null || i.price >= b.min * 0.85)))
    && (!needG || i.gpu_dedicated) && (!reqs.includes('touch') || i.touch) && (!reqs.includes('2in1') || i.convertible) && (!reqs.includes('ram16') || i.ram_gb >= 16)
    && (!reqs.includes('battery') || i.battery_max !== null) && (!reqs.includes('big') || i.screen_in >= 15.5) && (!reqs.includes('small') || i.screen_in <= 14.1));
  items = items.map((i) => ({ i, s: (i.usages.includes(usage) ? 8 : 0) + i.perf * (pref === 'performance' ? 1.6 : 1) + (pref === 'portable' && i.weight_kg ? (i.weight_kg <= 1.4 ? 6 : i.weight_kg > 2 ? -4 : 0) : 0) }))
    .sort((a: any, c: any) => c.s - a.s).slice(0, 5).map((x: any) => x.i);
  return `<div class="container container--narrow"><div class="wresults__head"><h1>${tr('ترشيحاتنا لك', 'Our recommendations')}</h1><a class="btn btn--ghost btn--sm" href="#/${L}/help-me-choose">${tr('ابدأ من جديد', 'Start over')}</a></div>
    <p class="note note--info">${tr('ترشيحات من الأجهزة المتاحة حاليًا. محتاج رأي؟ كلمنا على واتساب.', 'Picks from laptops in stock now. Need advice? Message us on WhatsApp.')}</p>
    ${items.length ? `<div class="grid">${items.map((i: any) => D.cards[L][i.id]).join('')}</div>` : `<div class="empty"><p>${tr('مفيش أجهزة متاحة تطابق كل اختياراتك.', 'No in-stock laptops match all your choices.')}</p></div>`}</div>`;
}

// ---------------------------------------------------------------- behaviours
function enhance(root: HTMLElement) {
  setupTabs(root);
  // rails + reveal
  $$<HTMLButtonElement>('.js-rail', root).forEach((btn) => {
    const rail = document.getElementById(btn.dataset.target || ''); if (!rail) return;
    const sync = () => { const max = rail.scrollWidth - rail.clientWidth; const pos = Math.abs(rail.scrollLeft); $$<HTMLButtonElement>(`.js-rail[data-target="${rail.id}"]`).forEach((b) => { b.disabled = b.dataset.dir === '-1' ? pos < 4 : pos > max - 4; }); };
    btn.addEventListener('click', () => { const card = rail.firstElementChild as HTMLElement | null; const step = ((card?.offsetWidth || 260) + 14) * 2; rail.scrollBy({ left: Number(btn.dataset.dir) * step * (L === 'ar' ? -1 : 1), behavior: 'smooth' }); });
    rail.addEventListener('scroll', sync, { passive: true }); sync();
  });
  const rev = $$('.reveal', root);
  if ('IntersectionObserver' in window) { const io = new IntersectionObserver((ents) => ents.forEach((en) => { if (en.isIntersecting) { en.target.classList.add('is-in'); io.unobserve(en.target); } }), { rootMargin: '0px 0px -8% 0px' }); rev.forEach((e) => io.observe(e)); }
  else rev.forEach((e) => e.classList.add('is-in'));
  // gallery
  const g = $('.js-gallery', root);
  if (g) {
    const track = $('.gallery__track', g)!; const slides = $$('.gallery__slide', g); const thumbs = $$<HTMLButtonElement>('.gallery__thumb', g);
    thumbs.forEach((t) => t.addEventListener('click', () => { const s = slides[Number(t.dataset.index)]; track.scrollTo({ left: s.offsetLeft - track.offsetLeft, behavior: 'smooth' }); thumbs.forEach((x) => x.classList.toggle('is-on', x === t)); }));
    slides.forEach((s) => s.addEventListener('click', () => s.classList.toggle('is-zoom')));
  }
  const form = $<HTMLFormElement>('.js-buyform', root);
  if (form) {
    const base = Number(form.dataset.base);
    const upd = () => { const ex = $$<HTMLInputElement>('input[type=radio][name^=opt_]:checked', form).reduce((s, i) => s + Number(i.dataset.price || 0), 0); const t = $('.js-total', form); if (t) t.hidden = !ex; $$('.js-total-val').forEach((e) => (e.textContent = money(base + ex))); };
    form.addEventListener('change', upd); upd();
    const bar = $('.buybar'); const ctas = $('.buy__ctas', root);
    if (bar && ctas) new IntersectionObserver(([en]) => bar.classList.toggle('is-shown', !en.isIntersecting && en.boundingClientRect.top < 0)).observe(ctas);
  }
  const wiz = $<HTMLFormElement>('.js-wizard', root);
  if (wiz) {
    const steps = $$('.wstep', wiz); let i = 0; wiz.classList.add('is-stepped');
    const prev = $<HTMLButtonElement>('.js-wprev', wiz)!, next = $<HTMLButtonElement>('.js-wnext', wiz)!, sub = $<HTMLButtonElement>('.js-wsubmit', wiz)!, bar = $('.js-wbar', wiz)!;
    const show = () => { steps.forEach((s, k) => s.classList.toggle('is-active', k === i)); prev.hidden = !i; next.hidden = i === steps.length - 1; sub.hidden = i !== steps.length - 1; bar.style.width = `${((i + 1) / steps.length) * 100}%`; };
    next.onclick = () => { i++; show(); }; prev.onclick = () => { i--; show(); };
    steps[0].addEventListener('click', (e) => { if ((e as MouseEvent).detail > 0 && (e.target as HTMLElement).closest('label')) setTimeout(() => { i = 1; show(); }, 120); });
    show();
  }
  const co = $<HTMLFormElement>('.js-demo-checkout', root);
  if (co) {
    const merch = Number(co.dataset.merch);
    $('#gov', co)!.addEventListener('change', (e) => { const q = quote((e.target as HTMLSelectElement).value, merch); $('.js-quote', co)!.textContent = q.text; $('.js-ship', co)!.textContent = (q as any).unknown ? tr('يحدده فريق المبيعات', 'Confirmed by sales') : q.ok ? (q.fee ? money(q.fee) : tr('مجاني', 'Free')) : '—'; $('.js-grand', co)!.textContent = money(merch + q.fee); });
  }
}

function bindShell() {
  $('.js-drawer-open')?.addEventListener('click', () => { $('#drawer')!.hidden = false; document.body.style.overflow = 'hidden'; });
  $('.js-drawer-close')?.addEventListener('click', () => { $('#drawer')!.hidden = true; document.body.style.overflow = ''; });
  const q = $<HTMLInputElement>('#q'); const pop = $('#search-pop');
  q?.addEventListener('input', () => {
    if (!pop) return; const v = q.value.trim(); if (v.length < 2) { pop.hidden = true; return; }
    const { items, understood } = filterItems(new URLSearchParams({ q: v }));
    pop.innerHTML = (understood.length ? `<div class="sp-chips">${understood.map((u) => `<span class="chip chip--sm">${esc(u)}</span>`).join('')}</div>` : '')
      + items.slice(0, 6).map((i) => `<a class="sp-item" href="#/${L}/p/${i.slug}"><img src="${i.image}" alt="" width="52" height="39"><span><b>${esc(i.title)}</b><small>${money(i.price)}</small></span></a>`).join('')
      + `<a class="sp-all" href="#/${L}/laptops?q=${encodeURIComponent(v)}">${tr('عرض كل النتائج', 'See all results')} (${items.length})</a>`;
    pop.innerHTML = hyd(pop.innerHTML); pop.hidden = false;
  });
  document.addEventListener('click', (e) => { if (pop && !(e.target as Element).closest('.js-search')) pop.hidden = true; });
  window.addEventListener('scroll', () => $('.header')?.classList.toggle('is-scrolled', scrollY > 8), { passive: true });
}

function addToCart(id: number, qty: number, opts: { label: string; price: number }[]) {
  const it = byId.get(id); if (!it || it.available < 1) return toast(tr('غير متاح حاليًا', 'Currently unavailable'));
  const key = JSON.stringify(opts); const ex = state.cart.find((l) => l.id === id && JSON.stringify(l.opts) === key);
  if (ex) ex.qty = Math.min(ex.qty + qty, it.available); else state.cart.push({ id, qty: Math.min(qty, it.available), opts });
  counts(); toast(`${tr('تمت الإضافة للسلة', 'Added to cart')} <a href="#/${L}/cart">${tr('عرض السلة', 'View cart')}</a>`);
}
function onSubmit(e: Event) {
  const f = e.target as HTMLFormElement; e.preventDefault();
  const sub = (e as SubmitEvent).submitter as HTMLElement | null;
  if (f.matches('.js-search')) { const v = ($('#q', f) as HTMLInputElement).value.trim(); location.hash = `#/${L}/laptops${v ? `?q=${encodeURIComponent(v)}` : ''}`; return; }
  if (f.matches('.js-filterform, .cat-sort')) {
    const sp = new URLSearchParams(location.hash.split('?')[1] || ''); const keep = ['q', 'accessory', 'sort'];
    const out = new URLSearchParams(); for (const k of keep) if (sp.get(k)) out.set(k, sp.get(k)!);
    for (const [k, v] of new FormData(f).entries()) if (String(v)) { if (keep.includes(k)) out.set(k, String(v)); else out.append(k, String(v)); }
    location.hash = `#/${L}/laptops?${out}`; $('#filters')?.classList.remove('is-open'); document.body.style.overflow = ''; return;
  }
  if (f.matches('.js-wizard')) { location.hash = `#/${L}/help-me-choose?${new URLSearchParams(new FormData(f) as any)}`; return; }
  if (f.matches('.js-add, .js-buyform')) {
    const id = Number(($('input[name=variant_id]', f) as HTMLInputElement).value); const qty = Number(($('[name=qty]', f) as HTMLInputElement | null)?.value || 1);
    const opts = $$<HTMLInputElement>('input[type=radio][name^=opt_]:checked', f).filter((i) => i.value).map((i) => ({ label: i.dataset.label || '', price: Number(i.dataset.price) }));
    addToCart(id, qty, opts);
    if (sub?.getAttribute('formaction')) location.hash = `#/${L}/checkout`;
    return;
  }
  if (f.matches('.js-demo-checkout')) {
    const phone = ($('#phone', f) as HTMLInputElement).value.replace(/\s/g, '');
    const name = ($('#name', f) as HTMLInputElement).value.trim(); const gov = ($('#gov', f) as HTMLSelectElement).value;
    if (name.length < 3 || !/^01[0125]\d{8}$/.test(phone) || !gov) return toast(tr('اكمل الاسم ورقم موبايل مصري صحيح والمحافظة', 'Enter a name, a valid Egyptian mobile and governorate'));
    const govName = (D.govs.find((g) => g[0] === gov) || [])[L === 'ar' ? 1 : 2] || gov;
    const pm = (($('input[name=pm]:checked', f) as HTMLInputElement | null)?.closest('label')?.textContent || '').trim();
    const lines = state.cart.map((l) => `• ${byId.get(l.id).title}${l.opts.length ? ` (${l.opts.map((o) => o.label).join('، ')})` : ''} × ${l.qty} — ${money(lineTotal(l))}`).join('\n');
    const msg = tr(`طلب جديد من الموقع:\n${lines}\nالإجمالي (بدون الشحن): ${money(Number(f.dataset.merch))}\n\nالاسم: ${name}\nالموبايل: ${phone}\nالعنوان: ${govName} — ${($('#city', f) as HTMLInputElement).value} — ${($('#street', f) as HTMLInputElement).value}\nطريقة الدفع المفضلة: ${pm}`,
      `New order from the website:\n${lines}\nTotal (excl. shipping): ${money(Number(f.dataset.merch))}\n\nName: ${name}\nMobile: ${phone}\nAddress: ${govName} — ${($('#city', f) as HTMLInputElement).value} — ${($('#street', f) as HTMLInputElement).value}\nPreferred payment: ${pm}`);
    window.open(`https://wa.me/${D.wa}?text=${encodeURIComponent(msg)}`, '_blank', 'noopener');
    state.cart = []; counts();
    $('#main')!.innerHTML = `<div class="container container--narrow"><div class="order-hero"><span class="order-hero__icon">✓</span><div><h1>${tr('تم تجهيز طلبك على واتساب', 'Your order is ready on WhatsApp')}</h1><p>${tr('ابعت الرسالة اللي اتفتحت في واتساب، وفريق المبيعات هيأكدلك التوفر وتكلفة الشحن. الطلب مش مؤكد غير بعد رد فريق المبيعات.', 'Send the message that opened in WhatsApp; our sales team will confirm availability and shipping. The order is confirmed only after they reply.')}</p><a class="btn btn--wa" href="https://wa.me/${D.wa}" target="_blank" rel="noopener">${tr('افتح واتساب', 'Open WhatsApp')}</a> </div></div><a class="btn btn--primary" href="#/${L}">${tr('الرئيسية', 'Home')}</a></div>`;
    return;
  }
  if (f.matches('form[action*="/contact"], form[action*="/track"]')) { window.open(`https://wa.me/${D.wa}`, '_blank', 'noopener'); return; }
}
function onChange(e: Event) {
  const t = e.target as HTMLInputElement;
  if (t.closest('.js-filterform') && t.type === 'checkbox' && matchMedia('(min-width: 1024px)').matches) t.form!.requestSubmit();
  if (t.closest('.cat-sort')) t.form!.requestSubmit();
  if (t.matches('.js-hide-same')) $('.js-compare-table')?.classList.toggle('hide-same', t.checked);
}
function onClick(e: Event) {
  const el = (e.target as Element).closest<HTMLElement>('.js-wish, .js-compare, .js-quick, .js-compare-clear, .js-qty, .js-filters-open, .js-filters-close, .js-buybar-buy, a[href="#top"]');
  if (!el) return;
  if (el.matches('a[href="#top"]')) { e.preventDefault(); scrollTo({ top: 0, behavior: 'smooth' }); return; }
  e.preventDefault();
  const id = Number(el.dataset.id);
  if (el.matches('.js-wish')) { state.wish = state.wish.includes(id) ? state.wish.filter((x) => x !== id) : [...state.wish, id]; counts(); }
  else if (el.matches('.js-compare')) {
    if (state.cmp.includes(id)) state.cmp = state.cmp.filter((x) => x !== id); else if (state.cmp.length >= 4) return toast(tr('يمكن مقارنة 4 أجهزة كحد أقصى', 'Up to 4 laptops'));
    else state.cmp.push(id);
    counts(); if (location.hash.includes('/compare')) route();
  } else if (el.matches('.js-compare-clear')) { state.cmp = []; counts(); }
  else if (el.matches('.js-quick')) location.hash = `#/${L}/p/${el.dataset.slug}`;
  else if (el.matches('.js-qty')) { const l = state.cart[Number(el.dataset.k)]; l.qty += Number(el.dataset.d); if (l.qty < 1) state.cart.splice(Number(el.dataset.k), 1); route(); }
  else if (el.matches('.js-filters-open')) { $('#filters')?.classList.add('is-open'); document.body.style.overflow = 'hidden'; }
  else if (el.matches('.js-filters-close')) { $('#filters')?.classList.remove('is-open'); document.body.style.overflow = ''; }
  else if (el.matches('.js-buybar-buy')) ($('button[formaction]') as HTMLButtonElement | null)?.click();
}

document.documentElement.classList.add('js-ready');
document.addEventListener('click', onClick); document.addEventListener('submit', onSubmit); document.addEventListener('change', onChange);
window.addEventListener('hashchange', route);
route();
