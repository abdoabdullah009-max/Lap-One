import { setupTabs } from './tabs';
/* LAP ONE storefront client. Progressive enhancement: every feature here has a server-rendered fallback. */
const $ = <T extends Element = HTMLElement>(s: string, r: ParentNode = document) => r.querySelector(s) as T | null;
const $$ = <T extends Element = HTMLElement>(s: string, r: ParentNode = document) => Array.from(r.querySelectorAll(s)) as T[];
const L = document.documentElement.lang === 'en' ? 'en' : 'ar';
const T = {
  ar: { added: 'تمت الإضافة للسلة', view: 'عرض السلة', err: 'حصل خطأ، حاول تاني', recent: 'عمليات بحث سابقة', all: 'عرض كل النتائج', models: 'موديلات', products: 'أجهزة', understood: 'فهمنا', none: 'مفيش نتائج مباشرة — اضغط Enter للبحث الكامل', out: 'غير متاح', phone: 'اكتب رقم موبايل مصري صحيح (11 رقم يبدأ بـ 01)', req: 'الحقل ده مطلوب' },
  en: { added: 'Added to cart', view: 'View cart', err: 'Something went wrong, try again', recent: 'Recent searches', all: 'See all results', models: 'Models', products: 'Laptops', understood: 'Understood', none: 'No instant matches — press Enter for full search', out: 'Unavailable', phone: 'Enter a valid Egyptian mobile (11 digits starting with 01)', req: 'This field is required' },
}[L];
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
const store = { get(k: string) { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch { return null; } }, set(k: string, v: unknown) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* private mode */ } } };
async function post(url: string, data: Record<string, unknown>) {
  const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json', 'X-Requested-With': 'fetch' }, body: JSON.stringify(data), credentials: 'same-origin' });
  return { ok: r.ok, status: r.status, data: await r.json().catch(() => ({})) };
}

// ---------------------------------------------------------------- analytics (consent-aware)
const body = document.body;
const w = window as any;
w.dataLayer = w.dataLayer || [];
function consentState(): 'yes' | 'no' | null { const m = document.cookie.match(/(?:^|; )lo_consent=(yes|no)/); return m ? (m[1] as any) : null; }
function analyticsAllowed() { return body.dataset.consentRequired !== '1' || consentState() === 'yes'; }
function loadScript(src: string) { const s = document.createElement('script'); s.async = true; s.src = src; document.head.appendChild(s); }
let trackersLoaded = false;
function loadTrackers() {
  if (trackersLoaded || !analyticsAllowed()) return; trackersLoaded = true;
  const { ga, gtm, pixel } = body.dataset;
  if (gtm) { w.dataLayer.push({ 'gtm.start': Date.now(), event: 'gtm.js' }); loadScript(`https://www.googletagmanager.com/gtm.js?id=${encodeURIComponent(gtm)}`); }
  else if (ga) { w.gtag = function () { w.dataLayer.push(arguments); }; w.gtag('js', new Date()); w.gtag('config', ga); loadScript(`https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(ga)}`); }
  if (pixel) {
    const f: any = (w.fbq = function () { f.callMethod ? f.callMethod.apply(f, arguments) : f.queue.push(arguments); }); f.queue = []; f.loaded = true; f.version = '2.0';
    loadScript('https://connect.facebook.net/en_US/fbevents.js'); w.fbq('init', pixel); w.fbq('track', 'PageView');
  }
}
const PIXEL_MAP: Record<string, string> = { view_item: 'ViewContent', add_to_cart: 'AddToCart', begin_checkout: 'InitiateCheckout', add_payment_info: 'AddPaymentInfo', purchase: 'Purchase', search: 'Search', generate_lead: 'Contact' };
function track(event: string, params: Record<string, unknown> = {}) {
  if (!analyticsAllowed()) return;
  w.dataLayer.push({ ecommerce: null }); w.dataLayer.push({ event, ecommerce: { currency: 'EGP', ...params } });
  if (w.gtag && !body.dataset.gtm) w.gtag('event', event, { currency: 'EGP', ...params });
  if (w.fbq && PIXEL_MAP[event]) w.fbq('track', PIXEL_MAP[event], { currency: 'EGP', value: params.value });
}
const consentBox = $('.consent');
if (consentBox && consentState() === null) consentBox.hidden = false;
$$('.js-consent').forEach((b) => b.addEventListener('click', () => {
  document.cookie = `lo_consent=${b.dataset.v}; path=/; max-age=${60 * 60 * 24 * 180}; samesite=lax`;
  if (consentBox) consentBox.hidden = true;
  if (b.dataset.v === 'yes') loadTrackers();
}));
loadTrackers();

// ---------------------------------------------------------------- toast
const toastEl = $('.toast');
let toastTimer = 0;
function toast(html: string, error = false) {
  if (!toastEl) return;
  toastEl.innerHTML = html; toastEl.classList.toggle('is-error', error); toastEl.hidden = false;
  clearTimeout(toastTimer); toastTimer = window.setTimeout(() => (toastEl.hidden = true), 3500);
}
const setCount = (sel: string, n: number) => $$(sel).forEach((el) => { el.textContent = String(n); el.hidden = n === 0; });

// ---------------------------------------------------------------- header & drawer
const header = $('.header');
const onScroll = () => header?.classList.toggle('is-scrolled', scrollY > 8);
addEventListener('scroll', onScroll, { passive: true }); onScroll();
if (header) document.documentElement.style.setProperty('--header-h', `${header.offsetHeight}px`);
const drawer = $('#drawer');
const openDrawer = (open: boolean) => {
  if (!drawer) return; drawer.hidden = !open;
  $('.js-drawer-open')?.setAttribute('aria-expanded', String(open));
  document.body.style.overflow = open ? 'hidden' : '';
  if (open) ($('.drawer__nav a', drawer) as HTMLElement | null)?.focus();
};
$('.js-drawer-open')?.addEventListener('click', () => openDrawer(true));
$('.js-drawer-close')?.addEventListener('click', () => openDrawer(false));
drawer?.addEventListener('click', (e) => { if (e.target === drawer) openDrawer(false); });
addEventListener('keydown', (e) => { if (e.key === 'Escape') { openDrawer(false); $$('details[open].nav__cats').forEach((d) => d.removeAttribute('open')); closeFilters(); } });
document.addEventListener('click', (e) => { $$('details[open].nav__cats').forEach((d) => { if (!d.contains(e.target as Node)) d.removeAttribute('open'); }); });

// ---------------------------------------------------------------- search autocomplete
const sForm = $<HTMLFormElement>('.js-search');
const sInput = $<HTMLInputElement>('#q');
const sPop = $('#search-pop');
if (sForm && sInput && sPop) {
  let timer = 0; let ctrl: AbortController | null = null; let active = -1;
  const items = () => $$<HTMLAnchorElement>('.sp-item', sPop);
  const close = () => { sPop.hidden = true; sInput.setAttribute('aria-expanded', 'false'); active = -1; };
  const open = () => { sPop.hidden = false; sInput.setAttribute('aria-expanded', 'true'); };
  const showRecent = () => {
    const rec: string[] = store.get('lo_recent_q') || [];
    if (!rec.length) return close();
    sPop.innerHTML = `<div class="sp-group">${T.recent}</div>` + rec.map((q, i) => `<a class="sp-item" role="option" id="sp-${i}" href="/${L}/laptops?q=${encodeURIComponent(q)}"><span>${esc(q)}</span></a>`).join('');
    open();
  };
  const render = (q: string, d: any) => {
    let h = '';
    if (d.understood?.length) h += `<div class="sp-chips"><small class="muted">${T.understood}:</small>${d.understood.map((u: any) => `<span class="chip chip--sm">${esc(u.label)}</span>`).join('')}</div>`;
    if (d.families?.length) h += `<div class="sp-group">${T.models}</div>` + d.families.map((f: string) => `<a class="sp-item" role="option" href="/${L}/laptops?q=${encodeURIComponent(f)}"><span><b>${esc(f)}</b></span></a>`).join('');
    if (d.items?.length) h += `<div class="sp-group">${T.products}</div>` + d.items.map((it: any) => `<a class="sp-item" role="option" href="${esc(it.url)}">${it.image ? `<img src="${esc(it.image)}" alt="" width="52" height="39">` : ''}<span><b>${esc(it.title)}</b><small>${esc(it.price)}${it.available < 1 ? ` · ${T.out}` : ''}</small></span></a>`).join('');
    if (!h) h = `<div class="sp-group">${T.none}</div>`;
    h += `<a class="sp-all" href="/${L}/laptops?q=${encodeURIComponent(q)}">${T.all}${d.total ? ` (${d.total})` : ''}</a>`;
    sPop.innerHTML = h; items().forEach((a, i) => (a.id = `sp-${i}`)); open();
  };
  sInput.addEventListener('input', () => {
    const q = sInput.value.trim(); clearTimeout(timer);
    if (q.length < 2) return showRecent();
    timer = window.setTimeout(async () => {
      ctrl?.abort(); ctrl = new AbortController();
      try { const r = await fetch(`/api/search/suggest?l=${L}&q=${encodeURIComponent(q)}`, { signal: ctrl.signal }); render(q, await r.json()); } catch { /* aborted */ }
    }, 160);
  });
  sInput.addEventListener('focus', () => { if (!sInput.value.trim()) showRecent(); });
  sInput.addEventListener('keydown', (e) => {
    const list = items(); if (sPop.hidden || !list.length) return;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault(); active = (active + (e.key === 'ArrowDown' ? 1 : -1) + list.length) % list.length;
      list.forEach((a, i) => a.setAttribute('aria-selected', String(i === active))); sInput.setAttribute('aria-activedescendant', list[active].id);
    } else if (e.key === 'Enter' && active >= 0) { e.preventDefault(); location.href = list[active].href; } else if (e.key === 'Escape') close();
  });
  document.addEventListener('click', (e) => { if (!sForm.contains(e.target as Node)) close(); });
  sForm.addEventListener('submit', () => {
    const q = sInput.value.trim(); if (!q) return;
    const rec: string[] = (store.get('lo_recent_q') || []).filter((x: string) => x !== q); rec.unshift(q); store.set('lo_recent_q', rec.slice(0, 6));
    track('search', { search_term: q });
  });
}

// ---------------------------------------------------------------- add to cart / wishlist / compare
document.addEventListener('submit', async (e) => {
  const form = e.target as HTMLFormElement;
  if (!form.matches('.js-add, .js-buyform')) return;
  const submitter = (e as SubmitEvent).submitter as HTMLButtonElement | null;
  if (submitter?.getAttribute('formaction')) { // Buy now: normal navigation
    track('begin_checkout', { value: Number(form.dataset.base || 0) / 100 }); return;
  }
  e.preventDefault();
  const btn = submitter || $<HTMLButtonElement>('button', form); if (btn) btn.disabled = true;
  try {
    const data = Object.fromEntries(new FormData(form).entries());
    const r = await post(form.action, data);
    if (r.ok) {
      setCount('.js-cart-count', r.data.count); toast(`${esc(r.data.message || T.added)} <a href="/${L}/cart">${T.view}</a>`);
      track('add_to_cart', { items: [{ item_id: data.variant_id }] });
    } else toast(esc(r.data.message || r.data.error || T.err), true);
  } catch { form.submit(); } finally { if (btn) btn.disabled = false; }
});

document.addEventListener('click', async (e) => {
  const el = (e.target as Element).closest<HTMLElement>('.js-wish, .js-compare, .js-quick, .js-compare-clear, .js-wa, .js-qv-close');
  if (!el) return;
  if (el.matches('.js-wish')) {
    const id = el.dataset.id; const r = await post('/api/wishlist', { id });
    if (!r.ok) return toast(T.err, true);
    $$(`.js-wish[data-id="${id}"]`).forEach((b) => { b.classList.toggle('is-on', r.data.on); b.setAttribute('aria-pressed', String(r.data.on)); });
    setCount('.js-wish-count', r.data.count);
  } else if (el.matches('.js-compare')) {
    const id = el.dataset.id; const r = await post('/api/compare', { id });
    if (!r.ok || r.data.ok === false) return toast(esc(r.data.error || T.err), true);
    if (el.matches('.js-compare-remove')) return location.reload();
    $$(`.js-compare[data-id="${id}"]`).forEach((b) => { b.classList.toggle('is-on', r.data.on); b.setAttribute('aria-pressed', String(r.data.on)); });
    updateCmpBar(r.data.ids.length, r.data.label);
  } else if (el.matches('.js-compare-clear')) {
    const r = await post('/api/compare', { clear: 1 }); $$('.js-compare').forEach((b) => b.classList.remove('is-on')); updateCmpBar(0, r.data.label);
  } else if (el.matches('.js-quick')) {
    e.preventDefault();
    const dlg = $<HTMLDialogElement>('dialog.qv'); const box = $('.qv__body');
    if (!dlg || !box || !dlg.showModal) return void (location.href = `/${L}/p/${el.dataset.slug}`);
    box.innerHTML = '<div class="skeleton"></div>'; dlg.showModal();
    const r = await fetch(`/api/quick/${encodeURIComponent(el.dataset.slug!)}?l=${L}`); box.innerHTML = await r.text();
  } else if (el.matches('.js-qv-close')) { $<HTMLDialogElement>('dialog.qv')?.close(); }
  else if (el.matches('.js-wa')) {
    fetch('/api/lead', { method: 'POST', keepalive: true, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ source: el.dataset.source, variant_id: el.dataset.variant, page: location.pathname }) }).catch(() => {});
    track('generate_lead', { method: 'whatsapp' });
  }
});
function updateCmpBar(n: number, label: string) {
  const bar = $('.cmpbar'); if (!bar) return;
  bar.hidden = n === 0; const t = $('.js-cmpbar-text', bar); if (t) t.textContent = label; setCount('.js-cmp-count', n);
}
$('dialog.qv')?.addEventListener('click', (e) => { if (e.target === e.currentTarget) (e.currentTarget as HTMLDialogElement).close(); });

// ---------------------------------------------------------------- catalog filters
const filterForm = $<HTMLFormElement>('.js-filterform');
const filtersEl = $('#filters');
const isDesktop = () => matchMedia('(min-width: 1024px)').matches;
filterForm?.addEventListener('change', (e) => { if (isDesktop() && (e.target as HTMLInputElement).type === 'checkbox') filterForm.requestSubmit(); });
filterForm?.addEventListener('submit', () => { $$<HTMLInputElement>('input[type=number]', filterForm).forEach((i) => { if (!i.value) i.disabled = true; }); });
$$<HTMLFormElement>('.js-autosubmit').forEach((f) => f.addEventListener('change', () => f.submit()));
function closeFilters() { filtersEl?.classList.remove('is-open'); document.body.style.overflow = ''; }
$('.js-filters-open')?.addEventListener('click', () => { filtersEl?.classList.add('is-open'); document.body.style.overflow = 'hidden'; });
$('.js-filters-close')?.addEventListener('click', closeFilters);
const listEl = $('[data-list="catalog"]');
if (listEl) post('/api/events', { name: 'view_item_list', list: 'catalog' }).catch(() => {}), track('view_item_list', { item_list_name: 'catalog' });

// ---------------------------------------------------------------- product gallery
const gallery = $('.js-gallery');
if (gallery) {
  const track_ = $('.gallery__track', gallery)!; const slides = $$('.gallery__slide', gallery); const thumbs = $$<HTMLButtonElement>('.gallery__thumb', gallery);
  const go = (i: number) => { const s = slides[i]; if (s) track_.scrollTo({ left: s.offsetLeft - track_.offsetLeft, behavior: 'smooth' }); };
  thumbs.forEach((t) => t.addEventListener('click', () => go(Number(t.dataset.index))));
  const io = new IntersectionObserver((ents) => ents.forEach((en) => {
    if (en.isIntersecting && en.intersectionRatio > 0.6) { const i = Number((en.target as HTMLElement).dataset.index); thumbs.forEach((t, k) => { t.classList.toggle('is-on', k === i); t.setAttribute('aria-selected', String(k === i)); }); }
  }), { root: track_, threshold: [0.6] });
  slides.forEach((s) => io.observe(s));
  slides.forEach((s) => {
    s.addEventListener('click', (e) => {
      if (!matchMedia('(hover: hover)').matches) return openLightbox(Number(s.dataset.index));
      const r = s.getBoundingClientRect(); s.style.setProperty('--zx', `${((e as MouseEvent).clientX - r.left) / r.width * 100}%`); s.style.setProperty('--zy', `${((e as MouseEvent).clientY - r.top) / r.height * 100}%`);
      s.classList.toggle('is-zoom');
    });
    s.addEventListener('mousemove', (e) => { if (!s.classList.contains('is-zoom')) return; const r = s.getBoundingClientRect(); s.style.setProperty('--zx', `${(e.clientX - r.left) / r.width * 100}%`); s.style.setProperty('--zy', `${(e.clientY - r.top) / r.height * 100}%`); });
    s.addEventListener('mouseleave', () => s.classList.remove('is-zoom'));
  });
  const main = $('.gallery__main', gallery)!;
  main.addEventListener('keydown', (e) => {
    const cur = thumbs.findIndex((t) => t.classList.contains('is-on'));
    if (e.key === 'ArrowRight') go(L === 'ar' ? cur - 1 : cur + 1); if (e.key === 'ArrowLeft') go(L === 'ar' ? cur + 1 : cur - 1);
  });
  const lb = $<HTMLDialogElement>('.js-lightbox');
  function openLightbox(i: number) {
    if (!lb?.showModal) return; const tr = $('.lightbox__track', lb)!;
    tr.innerHTML = slides.map((s) => `<img src="${esc(($('img', s) as HTMLImageElement).src)}" alt="">`).join(''); lb.showModal();
    requestAnimationFrame(() => tr.scrollTo({ left: (tr.children[i] as HTMLElement).offsetLeft }));
  }
  $('.js-gallery-fs')?.addEventListener('click', () => openLightbox(Math.max(0, thumbs.findIndex((t) => t.classList.contains('is-on')))));
  $('.js-lightbox-close')?.addEventListener('click', () => lb?.close());
}

// ---------------------------------------------------------------- product: upgrades, buy bar, recently viewed
const buyForm = $<HTMLFormElement>('.js-buyform');
if (buyForm) {
  const base = Number(buyForm.dataset.base);
  const fmt = (p: number) => new Intl.NumberFormat(L === 'ar' ? 'ar-EG' : 'en-EG', { maximumFractionDigits: 0 }).format(p / 100);
  const money = (p: number) => (L === 'ar' ? `${fmt(p)} ج.م` : `EGP ${fmt(p)}`);
  const wa = $<HTMLAnchorElement>('.js-wa-product'); const waBase = buyForm.dataset.wa || '';
  const update = () => {
    const sel = $$<HTMLInputElement>('input[type=radio][name^="opt_"]:checked', buyForm).filter((i) => i.value);
    const extra = sel.reduce((s, i) => s + Number(i.dataset.price || 0), 0);
    const box = $('.js-total'); if (box) box.hidden = extra === 0;
    $$('.js-total-val').forEach((el) => (el.textContent = money(base + extra)));
    if (wa && waBase) {
      const opts = sel.map((i) => `+ ${i.dataset.label}`).join('\n');
      const txt = waBase + (opts ? `\n${opts}\n${L === 'ar' ? 'الإجمالي' : 'Total'}: ${money(base + extra)}` : '');
      wa.href = wa.href.replace(/text=[^&]*/, `text=${encodeURIComponent(txt)}`);
    }
  };
  buyForm.addEventListener('change', update); update();
  const bar = $('.buybar'); const ctas = $('.buy__ctas');
  if (bar && ctas) new IntersectionObserver(([en]) => bar.classList.toggle('is-shown', !en.isIntersecting && en.boundingClientRect.top < 0)).observe(ctas);
  $('.js-buybar-buy')?.addEventListener('click', () => ($('button[formaction]', buyForm) as HTMLButtonElement | null)?.click());
  const pid = Number($('[data-view-item]')?.getAttribute('data-view-item'));
  if (pid) {
    const rv: number[] = (store.get('lo_recent') || []).filter((x: number) => x !== pid); rv.unshift(pid); store.set('lo_recent', rv.slice(0, 10));
    track('view_item', { value: base / 100, items: [{ item_id: pid, item_name: $('[data-view-item]')?.getAttribute('data-title') }] });
  }
}
const recent = $('.js-recent');
if (recent) {
  const ids: number[] = (store.get('lo_recent') || []).slice(0, 8);
  if (ids.length) fetch(`/api/cards?l=${L}&ids=${ids.join(',')}`).then((r) => r.text()).then((h) => { if (h.trim()) { $('.js-recent-rail', recent)!.innerHTML = h; recent.hidden = false; } }).catch(() => {});
}

// ---------------------------------------------------------------- compare page
$<HTMLInputElement>('.js-hide-same')?.addEventListener('change', (e) => $('.js-compare-table')?.classList.toggle('hide-same', (e.target as HTMLInputElement).checked));

// ---------------------------------------------------------------- wizard (one question at a time)
const wiz = $<HTMLFormElement>('.js-wizard');
if (wiz) {
  const steps = $$('.wstep', wiz); let i = 0;
  const prev = $<HTMLButtonElement>('.js-wprev', wiz)!; const next = $<HTMLButtonElement>('.js-wnext', wiz)!; const submit = $<HTMLButtonElement>('.js-wsubmit', wiz)!; const bar = $('.js-wbar', wiz)!;
  wiz.classList.add('is-stepped');
  const show = () => {
    steps.forEach((s, k) => s.classList.toggle('is-active', k === i));
    prev.hidden = i === 0; next.hidden = i === steps.length - 1; submit.hidden = i !== steps.length - 1; bar.style.width = `${((i + 1) / steps.length) * 100}%`;
    ($('input', steps[i]) as HTMLInputElement | null)?.focus({ preventScroll: true });
  };
  next.addEventListener('click', () => { i = Math.min(i + 1, steps.length - 1); show(); });
  prev.addEventListener('click', () => { i = Math.max(i - 1, 0); show(); });
  steps[0].addEventListener('click', (e) => { if ((e as MouseEvent).detail > 0 && (e.target as HTMLElement).closest('label')) setTimeout(() => { i = 1; show(); }, 120); });
  show();
}

// ---------------------------------------------------------------- checkout
const co = $<HTMLFormElement>('.js-checkout');
if (co) {
  const gov = $<HTMLSelectElement>('.js-gov', co); const quote = $('.js-ship-quote', co); const shipEl = $('.js-ship', co); const grand = $('.js-grand', co);
  const coupon = $<HTMLInputElement>('#coupon', co); const couponMsg = $('.js-coupon-msg', co); const cartId = ($('input[name=cart_id]', co) as HTMLInputElement | null)?.value || '';
  let couponApplied = '';
  const method = () => ($('input[name=delivery_method]:checked', co) as HTMLInputElement | null)?.value || 'delivery';
  const refresh = async () => {
    const m = method();
    $$('.js-address', co).forEach((el) => (el.hidden = m === 'pickup')); const pi = $('.js-pickup-info', co); if (pi) pi.hidden = m !== 'pickup';
    if (m === 'delivery' && !gov?.value) return;
    const r = await fetch(`/api/shipping?l=${L}&gov=${gov?.value || ''}&method=${m}&cart=${cartId}&coupon=${encodeURIComponent(couponApplied)}`); const d = await r.json();
    if (quote) { quote.textContent = [d.message, d.freeThresholdText].filter(Boolean).join(' · '); quote.classList.toggle('warn', !d.ok); }
    if (shipEl) shipEl.textContent = d.ok ? d.feeText : '—';
    if (grand) grand.textContent = d.totalText;
    $$('.js-discount-row', co).forEach((el) => (el.hidden = !d.discount)); const dEl = $('.js-discount', co); if (dEl) dEl.textContent = d.discountText || '';
    $$<HTMLLabelElement>('.payopt', co).forEach((lab) => { const ok = d.methods.includes(lab.dataset.method); lab.classList.toggle('is-disabled', !ok); ($('input', lab) as HTMLInputElement).disabled = !ok; });
    const checked = $<HTMLInputElement>('input[name=payment_method]:checked:not(:disabled)', co);
    if (!checked) ($('input[name=payment_method]:not(:disabled)', co) as HTMLInputElement | null)?.click();
  };
  gov?.addEventListener('change', refresh); $$('input[name=delivery_method]', co).forEach((r) => r.addEventListener('change', refresh)); refresh();
  $('.js-coupon', co)?.addEventListener('click', async () => {
    const code = coupon?.value.trim() || ''; if (!code) return;
    const r = await post('/api/coupon', { code, cart: cartId });
    if (couponMsg) { couponMsg.textContent = r.data.message; couponMsg.classList.toggle('is-ok', !!r.data.ok); }
    couponApplied = r.data.ok ? code : ''; refresh();
  });
  co.addEventListener('change', (e) => { if ((e.target as HTMLInputElement).name === 'payment_method') track('add_payment_info', { payment_type: (e.target as HTMLInputElement).value }); });
  track('begin_checkout', { value: Number(co.dataset.merch) / 100 });
  co.addEventListener('submit', (e) => {
    // light client checks; the server validates everything again
    let bad: HTMLElement | null = null;
    const mark = (el: HTMLInputElement | HTMLSelectElement, msg: string | null) => {
      const field = el.closest('.field'); if (!field) return;
      field.classList.toggle('field--err', !!msg); let errEl = $('.ferr', field);
      if (!errEl && msg) { errEl = document.createElement('span'); errEl.className = 'ferr'; errEl.setAttribute('role', 'alert'); field.appendChild(errEl); }
      if (errEl) errEl.textContent = msg || ''; el.setAttribute('aria-invalid', String(!!msg)); if (msg && !bad) bad = el;
    };
    const phone = $<HTMLInputElement>('#phone', co)!; const digits = phone.value.replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d))).replace(/[\s\-()]/g, '').replace(/^(\+20|0020|20)(?=1)/, '0');
    mark(phone, /^01[0125]\d{8}$/.test(digits) ? null : T.phone);
    const name = $<HTMLInputElement>('#name', co)!; mark(name, name.value.trim().length >= 3 ? null : T.req);
    if (method() === 'delivery') for (const id of ['governorate', 'city', 'street']) { const el = $<HTMLInputElement>(`#${id}`, co)!; mark(el, el.value.trim().length >= 2 ? null : T.req); }
    if (bad) { e.preventDefault(); (bad as HTMLElement).focus(); return; }
    const btn = $<HTMLButtonElement>('.js-place', co)!; btn.disabled = true; btn.textContent = btn.dataset.busy || '…';
  });
}

// ---------------------------------------------------------------- order page
const orderHero = $('.order-hero');
if (orderHero) {
  const purchase = orderHero.getAttribute('data-purchase');
  if (purchase) { try { const p = JSON.parse(purchase); track('purchase', { transaction_id: p.id, value: p.value, items: p.items }); } catch { /* ignore */ } }
  if (orderHero.dataset.pending === '1') {
    let tries = 0;
    const poll = async () => {
      tries++; const r = await fetch(location.href, { headers: { Accept: 'application/json' } }).then((x) => x.json()).catch(() => null);
      if (r && r.payment_status !== 'pending') return location.reload();
      if (tries < 40) setTimeout(poll, 4000);
    };
    setTimeout(poll, 3000);
  }
}

// ---------------------------------------------------------------- rails (arrow buttons) + scroll reveal
function setupRails(root: ParentNode = document) {
  $$<HTMLButtonElement>('.js-rail', root).forEach((btn) => {
    const rail = document.getElementById(btn.dataset.target || ''); if (!rail) return;
    const rtl = getComputedStyle(rail).direction === 'rtl';
    const sync = () => {
      const max = rail.scrollWidth - rail.clientWidth; const pos = Math.abs(rail.scrollLeft);
      $$<HTMLButtonElement>(`.js-rail[data-target="${rail.id}"]`).forEach((b) => { b.disabled = b.dataset.dir === '-1' ? pos < 4 : pos > max - 4; });
    };
    btn.addEventListener('click', () => {
      const card = rail.firstElementChild as HTMLElement | null; const step = (card?.offsetWidth || 260) + 14;
      rail.scrollBy({ left: Number(btn.dataset.dir) * step * (rtl ? -1 : 1) * 2, behavior: 'smooth' });
    });
    rail.addEventListener('scroll', sync, { passive: true }); sync();
  });
}
function setupReveal(root: ParentNode = document) {
  const els = $$('.reveal', root); if (!els.length) return;
  if (!('IntersectionObserver' in window)) { els.forEach((e) => e.classList.add('is-in')); return; }
  const io = new IntersectionObserver((ents) => ents.forEach((en) => { if (en.isIntersecting) { en.target.classList.add('is-in'); io.unobserve(en.target); } }), { rootMargin: '0px 0px -8% 0px' });
  els.forEach((e) => io.observe(e));
}
document.documentElement.classList.add('js-ready');
setupRails(); setupReveal(); setupTabs();
