/**
 * End-to-end browser tests (Playwright, Chromium). Run against a server on a TEST database:
 *   DATABASE_URL=.../lapone_test PORT=3001 PUBLIC_BASE_URL=http://localhost:3001 node dist/server.js &
 *   BASE=http://localhost:3001 ADMIN_PW=... node tests/e2e/run.mjs
 * Writes screenshots to test-results/ and exits non-zero on any failure.
 */
import fs from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
let pw; try { pw = require('playwright'); } catch { pw = createRequire('/home/claude/.npm-global/lib/node_modules/')('playwright'); }
const { chromium } = pw;

const BASE = process.env.BASE || 'http://localhost:3001';
const PW = process.env.ADMIN_PW || 'DemoPass!2026';
const OUT = 'test-results'; fs.mkdirSync(OUT, { recursive: true });
const results = []; let browser;
const IGNORE = /fonts\.g|ERR_TUNNEL|ERR_CONNECTION|net::ERR|Failed to load resource.*(fonts|googleapis)/;

async function test(name, fn, allowHttpErrors = false) {
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 900 } }); const page = await ctx.newPage();
  const errors = []; page.on('pageerror', (e) => errors.push(e.message)); page.on('console', (m) => { if (m.type() === 'error' && !IGNORE.test(m.text()) && !(allowHttpErrors && /status of 40[13]/.test(m.text()))) errors.push(m.text()); });
  const t0 = Date.now();
  try { await fn(page, ctx); if (errors.length) throw new Error('Console/page errors: ' + errors.join(' | ')); results.push({ name, ok: true, ms: Date.now() - t0 }); console.log(`✓ ${name}`); }
  catch (e) { results.push({ name, ok: false, error: String(e.message || e).slice(0, 400) }); console.log(`✗ ${name}\n   ${String(e.message || e).slice(0, 400)}`); await page.screenshot({ path: `${OUT}/FAIL-${name.replace(/\W+/g, '_')}.png` }).catch(() => {}); }
  finally { await ctx.close(); }
}
const expect = (cond, msg) => { if (!cond) throw new Error(msg); };
const priceNum = (s) => Number(String(s).replace(/[٠-٩]/g, (d) => '٠١٢٣٤٥٦٧٨٩'.indexOf(d)).replace(/[^\d]/g, ''));

async function checkout(page, method = 'cod', gov = 'CAI') {
  await page.fill('#name', 'E2E Tester'); await page.fill('#phone', '01012345678');
  await page.selectOption('#governorate', gov); await page.fill('#city', 'Nasr City'); await page.fill('#street', '10 Abbas El Akkad');
  await page.waitForFunction(() => !document.querySelector('.js-ship')?.textContent?.includes('يُحسب') && !document.querySelector('.js-ship')?.textContent?.includes('Calculated'));
  await page.check(`input[name=payment_method][value=${method}]`);
  await Promise.all([page.waitForNavigation(), page.click('.js-place')]);
}
async function adminLogin(page, email = 'admin@lapone.local') {
  await page.goto(`${BASE}/admin/login`); await page.fill('input[name=email]', email); await page.fill('input[name=password]', PW);
  await Promise.all([page.waitForNavigation(), page.click('button')]);
}

browser = await chromium.launch();

await test('home renders in Arabic RTL and English LTR with working language switch', async (page) => {
  await page.goto(`${BASE}/ar`);
  expect(await page.getAttribute('html', 'dir') === 'rtl', 'ar should be rtl');
  expect((await page.textContent('h1')).includes('اختار اللاب'), 'Arabic hero');
  await Promise.all([page.waitForNavigation(), page.click('.nav__lang')]);
  expect(page.url().endsWith('/en'), 'switched to /en'); expect(await page.getAttribute('html', 'dir') === 'ltr', 'en should be ltr');
  expect(await page.locator('.card').count() > 8, 'merchandising rails show inventory');
});

await test('every header/nav/footer link resolves (no dead links)', async (page) => {
  await page.goto(`${BASE}/ar`);
  const hrefs = await page.$$eval('header a[href^="/"], footer a[href^="/"], .drawer a[href^="/"]', (as) => [...new Set(as.map((a) => a.getAttribute('href')))]);
  for (const h of hrefs) { const r = await page.request.get(BASE + h); expect(r.status() < 400, `${h} → ${r.status()}`); }
});

await test('smart search: autocomplete + understood filters', async (page) => {
  await page.goto(`${BASE}/ar`);
  await page.fill('#q', 'RTX A2000'); await page.waitForSelector('#search-pop:not([hidden]) .sp-item');
  expect((await page.textContent('#search-pop')).includes('Precision 7560'), 'suggests Precision 7560');
  await page.fill('#q', 'لاب i7 جيل عاشر'); await Promise.all([page.waitForNavigation(), page.press('#q', 'Enter')]);
  expect(await page.locator('.understood .chip').count() >= 2, 'shows understood chips');
  const titles = await page.$$eval('.card__specs li:first-child', (els) => els.map((e) => e.textContent));
  expect(titles.length > 0 && titles.every((t) => /i7-10/.test(t)), 'all results are i7 10th gen: ' + titles.join(','));
  await page.goto(`${BASE}/ar/laptops?q=zzzzqqq`); expect(await page.locator('.empty').count() === 1, 'helpful zero-result state');
});

await test('filters (multi-select, URL state, reset) and sorting', async (page) => {
  await page.goto(`${BASE}/ar/laptops`);
  const all = await page.locator('.grid .card').count();
  await Promise.all([page.waitForNavigation(), page.check('input[name=brand][value=hp]')]);
  await Promise.all([page.waitForNavigation(), page.check('input[name=brand][value=dell]')]);
  expect(/brand=hp/.test(page.url()) && /brand=dell/.test(page.url()), 'both brands in URL');
  const brands = await page.$$eval('.card__brand', (e) => e.map((x) => x.textContent.toLowerCase()));
  expect(brands.every((b) => b === 'hp' || b === 'dell'), 'only hp/dell'); expect(brands.length < all, 'filter reduced results');
  await Promise.all([page.waitForNavigation(), page.selectOption('#sort', 'price_asc')]);
  const prices = (await page.$$eval('.card .price__now', (e) => e.map((x) => x.textContent))).map(priceNum);
  const inStock = await page.$$eval('.card', (e) => e.map((x) => !x.classList.contains('card--out')));
  const p2 = prices.filter((_, i) => inStock[i]); expect(p2.every((p, i) => i === 0 || p >= p2[i - 1]), 'ascending price ' + p2);
  await Promise.all([page.waitForNavigation(), page.click('.active-filters a.link')]);
  expect(!/brand=/.test(page.url()), 'filters reset');
});

await test('product page: specs, condition, battery, unknown values, upgrade price, WhatsApp text', async (page) => {
  await page.goto(`${BASE}/en/p/dell-latitude-5420-i5-16gb-256gb-very-good`);
  expect(await page.locator('#specs tr').count() >= 20, 'spec table'); expect(await page.locator('#specs .unknown').count() >= 1, 'unknown values marked');
  expect((await page.textContent('.gallery__kind')).includes('Representative'), 'representative image disclosure');
  expect((await page.textContent('#battery')).includes('%'), 'battery range shown');
  await page.check('input[name=opt_ssd]:not([value=""])');
  expect(!(await page.isHidden('.js-total')), 'total visible with upgrade');
  expect(priceNum(await page.textContent('.buy .js-total-val')) === 14500 + 1200, 'upgrade adds 1200');
  await page.goto(`${BASE}/en/p/dell-latitude-5400-i5-8gb-256gb-fair`);
  expect((await page.textContent('#battery')).includes('not been tested'), 'unknown battery disclosed, no invented %');
});

await test('out-of-stock product cannot be purchased', async (page) => {
  await page.goto(`${BASE}/ar/p/lenovo-thinkpad-p53-i7-32gb-1tb-very-good`);
  expect(await page.isDisabled('.buy__ctas button.btn--primary'), 'buy disabled');
  const r = await page.request.post(`${BASE}/ar/cart/add`, { form: { variant_id: await page.getAttribute('input[name=variant_id]', 'value') }, headers: { Accept: 'application/json', Origin: BASE } });
  expect(r.status() === 409, 'server refuses out-of-stock add: ' + r.status());
});

await test('compare up to 4 with hide-identical, and wishlist', async (page) => {
  await page.goto(`${BASE}/en/laptops`);
  const btns = page.locator('.card .js-compare');
  for (let i = 0; i < 5; i++) { await btns.nth(i).click(); await page.waitForTimeout(250); }
  expect((await page.textContent('.toast')).includes('4'), 'blocks a 5th item');
  await page.goto(`${BASE}/en/compare`); expect(await page.locator('.table--compare thead th').count() === 5, '4 columns + label');
  const before = await page.locator('.table--compare tbody tr:visible').count(); await page.check('.js-hide-same');
  expect(await page.locator('.table--compare tbody tr:visible').count() < before, 'identical rows hidden');
  await page.goto(`${BASE}/en/laptops`); await page.locator('.card .js-wish').first().click(); await page.waitForTimeout(300);
  await page.goto(`${BASE}/en/wishlist`); expect(await page.locator('.grid .card').count() === 1, 'wishlist has item');
});

await test('recommendation wizard returns in-stock matches', async (page) => {
  await page.goto(`${BASE}/ar/help-me-choose`);
  await page.click('label.optcard:has(input[value=gaming])');
  for (let i = 0; i < 3; i++) await page.click('.js-wnext');  // step 1 auto-advances on click
  await Promise.all([page.waitForNavigation(), page.click('.js-wsubmit')]);
  const n = await page.locator('.rec').count(); expect(n >= 1 && n <= 5, `got ${n} recommendations`);
  expect((await page.textContent('.rec')).match(/RTX|GTX/), 'gaming picks have dedicated GPUs');
});

let codOrder;
await test('cart + guest checkout (COD) creates a persisted order and reserves stock', async (page) => {
  await page.goto(`${BASE}/ar/p/hp-elitebook-840-g8-i7-16gb-512gb-excellent`);
  await page.click('.js-addbtn'); await page.waitForSelector('.toast:not([hidden])');
  expect((await page.textContent('.js-cart-count')) === '1', 'cart count 1');
  await page.goto(`${BASE}/ar/cart`); await Promise.all([page.waitForNavigation(), page.click('.qtyform button[value="2"]')]);
  expect((await page.textContent('.qtyform span')) === '2', 'qty updated');
  await Promise.all([page.waitForNavigation(), page.click('a[href$="/checkout"]')]);
  await page.fill('#phone', '0101'); await page.click('.js-place');
  expect(await page.locator('.field--err').count() >= 1, 'client validation shows errors');
  await checkout(page, 'cod');
  expect(/\/order\/LO-\d+\?t=/.test(page.url()), 'redirected to order page: ' + page.url());
  codOrder = await page.getAttribute('.order-hero', 'data-order');
  expect((await page.textContent('.order-status')).includes('الدفع عند الاستلام'), 'payment status pay-on-delivery');
  await page.reload(); expect(await page.getAttribute('.order-hero', 'data-order') === codOrder, 'stable on reload');
  await page.goto(`${BASE}/ar/cart`); expect(await page.locator('.cline').count() === 0, 'cart emptied');
});

await test('buy now → Paymob sandbox success → paid & confirmed (never before callback)', async (page) => {
  await page.goto(`${BASE}/en/p/hp-elitebook-840-g6-i5-8gb-256gb-very-good`);
  await Promise.all([page.waitForNavigation(), page.click('button[formaction$="/buy-now"]')]);
  expect(page.url().includes('/checkout?cart='), 'buy-now checkout'); expect(await page.locator('.mini-lines li').count() === 1, 'single item');
  await checkout(page, 'card');
  expect(page.url().includes('/pay/sandbox/'), 'redirected to hosted (sandbox) payment');
  await Promise.all([page.waitForNavigation(), page.click('button[value=success]')]);
  await page.waitForSelector('.ps--paid', { timeout: 10000 });
  expect((await page.textContent('.order-status')).includes('Confirmed'), 'order confirmed after verified callback');
});

await test('card failure shows failed state with retry, no false success', async (page) => {
  await page.goto(`${BASE}/en/p/lenovo-thinkpad-t480-i5-8gb-256gb-good`);
  await Promise.all([page.waitForNavigation(), page.click('button[formaction$="/buy-now"]')]);
  await checkout(page, 'card');
  await Promise.all([page.waitForNavigation(), page.click('button[value=fail]')]);
  await page.waitForSelector('.ps--failed'); expect(!(await page.textContent('body')).includes('Payment confirmed'), 'no success message');
  expect(await page.locator('text=Try paying again').count() === 1, 'retry offered');
  await Promise.all([page.waitForNavigation(), page.click('text=Try paying again')]); expect(page.url().includes('/pay/sandbox/'), 'retry goes to payment');
});

await test('duplicate checkout submission creates one order', async (page) => {
  await page.goto(`${BASE}/ar/p/lenovo-thinkpad-t14-gen2-i7-16gb-512gb-very-good`);
  await Promise.all([page.waitForNavigation(), page.click('button[formaction$="/buy-now"]')]);
  const form = await page.$eval('.js-checkout', (f) => { const d = new FormData(f); return { action: f.action, idem: d.get('idempotency_key'), cart: d.get('cart_id') }; });
  const body = { idempotency_key: form.idem, cart_id: form.cart, name: 'Dup Test', phone: '01122334455', delivery_method: 'delivery', governorate: 'GIZ', city: 'Dokki', street: '5 Tahrir St', payment_method: 'cod' };
  const [r1, r2] = await Promise.all([page.request.post(form.action, { form: body, headers: { Origin: BASE }, maxRedirects: 0 }), page.request.post(form.action, { form: body, headers: { Origin: BASE }, maxRedirects: 0 })]);
  const l1 = r1.headers().location, l2 = r2.headers().location;
  expect(l1 && l1 === l2, `same order for both submits: ${l1} vs ${l2}`);
});

await test('cross-origin POST is blocked (CSRF)', async (page) => {
  const r = await page.request.post(`${BASE}/ar/cart/add`, { form: { variant_id: '1' }, headers: { Origin: 'https://evil.example' } });
  expect(r.status() === 403, 'blocked: ' + r.status());
  const w = await page.request.post(`${BASE}/webhooks/paymob?hmac=${'0'.repeat(128)}`, { data: { type: 'TRANSACTION', obj: { id: 1, order: { merchant_order_id: 'LO-1-P1' } } } });
  expect(w.status() === 401, 'unsigned webhook rejected: ' + w.status());
});

await test('admin: auth required, login, confirm COD order → units sold, audit logged', async (page) => {
  const r = await page.goto(`${BASE}/admin/orders`); expect(page.url().includes('/admin/login'), 'redirects to login');
  expect((await page.request.get(`${BASE}/admin`)).url().includes('login'), 'protected');
  await page.goto(`${BASE}/admin/login`); await page.fill('input[name=email]', 'admin@lapone.local'); await page.fill('input[name=password]', 'wrong-password'); await page.click('button');
  expect(await page.locator('.flash--err').count() === 1, 'bad password rejected');
  await adminLogin(page); expect(await page.locator('.stat').count() > 5, 'dashboard stats');
  await page.goto(`${BASE}/admin/orders?q=${codOrder}`); await Promise.all([page.waitForNavigation(), page.click(`text=${codOrder}`)]);
  page.on('dialog', (d) => d.accept());
  await page.selectOption('select[name=status]', 'confirmed'); await Promise.all([page.waitForNavigation(), page.click('button:has-text("Update")')]);
  expect((await page.textContent('.stats')).toLowerCase().includes('confirmed'), 'order confirmed');
  expect(await page.locator('td .pill--sold').count() === 2, 'both units sold');
  await page.goto(`${BASE}/admin/audit`); expect((await page.textContent('table')).includes('order.status_change'), 'audit entry');
});

await test('admin: create product, receive unit, publish → visible in store; price change audited', async (page) => {
  await adminLogin(page); page.on('dialog', (d) => d.accept());
  await page.goto(`${BASE}/admin/products/new`);
  await page.selectOption('select[name=new_brand_id]', { label: 'Dell' }); await page.fill('input[name=new_family_name]', 'Latitude 7420 E2E');
  await page.fill('input[name=title]', 'Dell Latitude 7420 E2E — i7 / 16GB / 512GB'); await page.fill('input[name=slug]', 'dell-latitude-7420-e2e');
  await page.fill('input[name=sku]', 'E2E-7420'); await page.selectOption('select[name=grade]', 'very_good'); await page.fill('input[name=price]', '21000');
  await page.check('input[name=published]'); await page.check('input[name=usages][value=office]'); await page.fill('input[name=ram_gb]', '16');
  await Promise.all([page.waitForNavigation(), page.click('button:has-text("Create product")')]);
  expect((await page.textContent('.flash')).includes('created'), 'created');
  await Promise.all([page.waitForNavigation(), page.click('text=+ Add unit(s)')]);
  await page.selectOption('select[name=status]', 'available'); await page.fill('input[name=purchase_cost]', '16000');
  await Promise.all([page.waitForNavigation(), page.click('button:has-text("Add units")')]);
  const store = await page.request.get(`${BASE}/ar/p/dell-latitude-7420-e2e`); expect(store.status() === 200, 'store page live');
  expect(!(await store.text()).includes('16000') && !(await store.text()).includes('16,000'), 'cost not exposed publicly');
  await page.goto(`${BASE}/admin/products`); await page.click('text=Dell Latitude 7420 E2E'); await page.fill('input[name=price]', '20500');
  await Promise.all([page.waitForNavigation(), page.click('button:has-text("Save changes")')]);
  await page.goto(`${BASE}/admin/audit?action=product.price_change`); expect((await page.textContent('table')).includes('2050000'), 'price change audited with values');
  await page.goto(`${BASE}/admin/products`); await page.click('text=Dell Latitude 7420 E2E'); await page.fill('input[name=compare_at_price]', '19000');
  await Promise.all([page.waitForNavigation(), page.click('button:has-text("Save changes")')]);
  expect((await page.textContent('.flash--err')).includes('higher'), 'misleading previous price rejected');
});

await test('RBAC: warehouse/sales/accountant restrictions', async (page, ctx) => {
  await adminLogin(page, 'warehouse@lapone.local');
  expect((await page.goto(`${BASE}/admin/settings`)).status() === 403, 'warehouse cannot open settings');
  expect((await page.goto(`${BASE}/admin/customers`)).status() === 403, 'warehouse cannot view customers');
  await page.goto(`${BASE}/admin/orders`); const phones = await page.$$eval('td small.muted', (e) => e.map((x) => x.textContent)); expect(phones.every((p) => p.includes('•')), 'phones masked for warehouse');
  await page.goto(`${BASE}/admin/inventory`); expect(!(await page.textContent('thead')).includes('Cost'), 'no cost column for warehouse');
  await ctx.clearCookies();
  await adminLogin(page, 'sales@lapone.local');
  expect((await page.goto(`${BASE}/admin/products/new`)).status() === 403, 'sales cannot create products');
  expect(!(await (await page.goto(`${BASE}/admin`)).text()).includes('Gross profit'), 'sales cannot see profit');
  await ctx.clearCookies();
  await adminLogin(page, 'accountant@lapone.local');
  expect((await (await page.goto(`${BASE}/admin`)).text()).includes('Gross profit'), 'accountant sees profit');
  const csrf = await page.$eval('input[name=_csrf]', (i) => i.value);
  const r = await page.request.post(`${BASE}/admin/products/1`, { form: { _csrf: csrf, title: 'hack' }, headers: { Origin: BASE } }); expect(r.status() === 403, 'accountant cannot edit products');
  const r2 = await page.request.post(`${BASE}/admin/coupons`, { form: { code: 'X', kind: 'percent', value: '5' }, headers: { Origin: BASE } }); expect(r2.status() === 403, 'missing CSRF token rejected');
}, true); // 403 pages are the expected outcome here

await test('keyboard: skip link, focusable controls, Escape closes menus', async (page) => {
  await page.goto(`${BASE}/ar`); await page.keyboard.press('Tab');
  expect((await page.evaluate(() => document.activeElement?.className)) === 'skip', 'first tab = skip link');
  await page.keyboard.press('Enter'); expect((await page.evaluate(() => document.activeElement?.id)) === 'main', 'skip moves focus to main');
  await page.click('.nav__cats summary'); expect(await page.isVisible('.mega'), 'mega open'); await page.keyboard.press('Escape'); expect(!(await page.isVisible('.mega')), 'Esc closes');
  await page.goto(`${BASE}/ar/help-me-choose`); await page.focus('input[name=usage][value=study]'); await page.keyboard.press('ArrowRight');
  expect((await page.evaluate(() => document.activeElement?.getAttribute('name'))) === 'usage', 'radio group keyboard operable');
});

await test('SEO: metadata, canonical, hreflang, JSON-LD, sitemap, robots, noindex admin', async (page) => {
  await page.goto(`${BASE}/ar/p/dell-precision-5550-i7-32gb-1tb-excellent`);
  expect(await page.locator('link[rel=canonical]').count() === 1 && await page.locator('link[hreflang=en]').count() === 1, 'canonical + hreflang');
  const ld = await page.$$eval('script[type="application/ld+json"]', (s) => s.map((x) => JSON.parse(x.textContent)));
  expect(ld.some((d) => d['@type'] === 'Product' && d.offers?.priceCurrency === 'EGP'), 'Product/Offer JSON-LD'); expect(ld.some((d) => d['@type'] === 'BreadcrumbList'), 'Breadcrumb JSON-LD');
  const sm = await (await page.request.get(`${BASE}/sitemap.xml`)).text(); expect(sm.includes('/p/dell-precision-5550') && sm.includes('hreflang'), 'sitemap with alternates');
  const rb = await (await page.request.get(`${BASE}/robots.txt`)).text(); expect(rb.includes('Disallow: /admin'), 'robots blocks admin');
  const ad = await page.request.get(`${BASE}/admin/login`); expect(ad.headers()['x-robots-tag']?.includes('noindex'), 'admin noindex header');
});

// Responsive screenshots: 5 breakpoints × RTL/LTR on key pages, with horizontal-overflow checks
const SIZES = [[360, 740, 'xs'], [390, 844, 'mobile'], [768, 1024, 'tablet'], [1366, 900, 'laptop'], [1920, 1080, 'desktop']];
const PAGES = [['home', '/ar'], ['home-en', '/en'], ['catalog', '/ar/laptops'], ['product', '/ar/p/hp-zbook-15-g6-i7-32gb-512gb-good'], ['product-en', '/en/p/lenovo-legion-5-15ach6h-r7-16gb-512gb-very-good'], ['cart', '/ar/cart'], ['wizard', '/ar/help-me-choose']];
await test('responsive: no horizontal overflow at 5 breakpoints (RTL + LTR)', async (page) => {
  const bad = [];
  for (const [w, h, label] of SIZES) {
    await page.setViewportSize({ width: w, height: h });
    for (const [name, path] of PAGES) {
      await page.goto(BASE + path); await page.waitForTimeout(150);
      if (await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1)) bad.push(`${name}@${w}`);
      if (['home', 'product', 'product-en', 'catalog'].includes(name) && ['mobile', 'laptop'].includes(label)) await page.screenshot({ path: `${OUT}/${name}-${label}.png` });
    }
  }
  expect(!bad.length, 'overflow: ' + bad.join(', '));
});

await browser.close();
fs.writeFileSync(`${OUT}/e2e-results.json`, JSON.stringify(results, null, 2));
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
