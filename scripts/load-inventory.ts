/**
 * Replaces the demo catalog with LAP ONE's real stock (from the inventory sheet sent on 1 Nov 2026).
 * Only facts present in the sheet (or the processor/GPU model named in it) are stored. Unknowns stay NULL
 * and render as "not yet specified". Run: node dist/load-inventory.js
 */
import { db, one } from '../src/server/db';
import { EGP } from '../src/server/money';
import { saveSetting, DEFAULT_SETTINGS } from '../src/server/services/settings';
import { writeSvg } from './images';
import { studioSvg, traitsFor } from './studio';
import path from 'node:path';

type R = { brand: string; family: string; series: string; color: string; cpu: [string | null, string | null, string | null, number | null];
  ram: [number | null, string | null]; ramUpgradable: boolean | null; storage: [number | null, string | null]; gpu: [string | null, string | null, boolean | null, number | null];
  screen: number | null; touch?: boolean; convertible?: boolean; os?: string; price: number; qty: number; usages: string[]; note?: string };

const ROWS: R[] = [
  { brand: 'hp', family: 'EliteBook 845 G7', series: 'EliteBook', color: 'silver', cpu: ['amd', 'Ryzen 5 PRO 4650U', 'r5', null], ram: [8, 'DDR4'], ramUpgradable: true, storage: [256, 'nvme'], gpu: ['amd', 'AMD Radeon', false, null], screen: 14, price: 12900, qty: 0, usages: ['office', 'study', 'programming'] },
  { brand: 'apple', family: 'MacBook Pro 2018 (A2141)', series: 'MacBook', color: 'graphite', cpu: ['intel', 'Core i9-8750H', 'i9', 8], ram: [32, null], ramUpgradable: false, storage: [500, null], gpu: ['amd', 'AMD Radeon', true, 4], screen: 15, os: 'macOS', price: 32500, qty: 1, usages: ['graphics', 'programming'] },
  { brand: 'hp', family: 'ZBook Power 15 G7', series: 'ZBook', color: 'graphite', cpu: ['intel', 'Core i5-10300H', 'i5', 10], ram: [16, 'DDR4'], ramUpgradable: null, storage: [512, 'nvme'], gpu: ['nvidia', 'Quadro P620', true, 4], screen: 15, price: 22500, qty: 1, usages: ['engineering', 'workstation', 'graphics'] },
  { brand: 'dell', family: 'Vostro 5510', series: 'Vostro', color: 'graphite', cpu: ['intel', 'Core i7-11390H', 'i7', 11], ram: [16, 'DDR4'], ramUpgradable: true, storage: [512, 'nvme'], gpu: ['intel', 'Intel', false, null], screen: 15, price: 22500, qty: 1, usages: ['programming', 'office', 'study'] },
  { brand: 'lenovo', family: 'ThinkPad X1 Yoga', series: 'ThinkPad', color: 'black', cpu: ['intel', 'Core i5-8665U', 'i5', 8], ram: [8, 'DDR4'], ramUpgradable: false, storage: [256, 'nvme'], gpu: ['intel', 'Intel', false, null], screen: 14, touch: true, convertible: true, price: 13500, qty: 1, usages: ['office', 'study'] },
  { brand: 'dell', family: 'Chromebook 13 3380', series: 'Chromebook', color: 'black', cpu: ['intel', 'Celeron 3855U', null, null], ram: [null, null], ramUpgradable: null, storage: [null, null], gpu: [null, null, null, null], screen: 13, os: 'ChromeOS', price: 2500, qty: 2, usages: ['budget'], note: 'للتصفح فقط' },
  { brand: 'dell', family: 'Precision 3520', series: 'Precision', color: 'black', cpu: ['intel', 'Core i5-7440HQ', 'i5', 7], ram: [16, 'DDR4'], ramUpgradable: true, storage: [256, 'nvme'], gpu: ['nvidia', 'Quadro M620', true, 2], screen: 15, price: 12700, qty: 3, usages: ['engineering', 'workstation', 'budget'] },
  { brand: 'hp', family: 'EliteBook 840 G7', series: 'EliteBook', color: 'silver', cpu: ['intel', 'Core i5-10210U', 'i5', 10], ram: [8, 'DDR4'], ramUpgradable: true, storage: [256, 'nvme'], gpu: ['intel', 'Intel', false, null], screen: 14, price: 12900, qty: 1, usages: ['office', 'study'] },
  { brand: 'dell', family: 'Latitude 7250', series: 'Latitude', color: 'black', cpu: ['intel', 'Core i5 (5th Gen)', 'i5', 5], ram: [8, 'DDR3'], ramUpgradable: true, storage: [256, 'nvme'], gpu: ['intel', 'Intel', false, null], screen: 12, price: 5500, qty: 1, usages: ['budget', 'study', 'office'] },
  { brand: 'hp', family: 'ProBook 430 G8', series: 'ProBook', color: 'silver', cpu: ['intel', 'Core i5-1145G7', 'i5', 11], ram: [8, 'DDR4'], ramUpgradable: true, storage: [256, 'nvme'], gpu: ['intel', 'Intel', false, null], screen: 13, price: 13200, qty: 2, usages: ['study', 'office'] },
  { brand: 'microsoft', family: 'Surface Laptop 3', series: 'Surface', color: 'silver', cpu: ['intel', 'Core i5-1035G7', 'i5', 10], ram: [16, 'DDR4'], ramUpgradable: false, storage: [256, 'nvme'], gpu: ['intel', 'Intel', false, null], screen: 13.5, touch: true, price: 16500, qty: 1, usages: ['study', 'office', 'programming'] },
  { brand: 'microsoft', family: 'Surface Laptop 4', series: 'Surface', color: 'silver', cpu: ['intel', 'Core i5-1145G7', 'i5', 11], ram: [8, 'DDR4'], ramUpgradable: false, storage: [256, 'nvme'], gpu: ['intel', 'Intel', false, null], screen: 13.5, touch: true, price: 15500, qty: 11, usages: ['study', 'office'] },
  { brand: 'microsoft', family: 'Surface Laptop 3', series: 'Surface', color: 'silver', cpu: ['intel', 'Core i7-1065G7', 'i7', 10], ram: [16, 'DDR4'], ramUpgradable: false, storage: [256, 'nvme'], gpu: ['intel', 'Intel', false, null], screen: 13.5, touch: true, price: 19500, qty: 1, usages: ['programming', 'office', 'study'] },
  // Sheet said "14 inch"; confirmed by LAP ONE on 1 Nov 2026 as 13.5".
  { brand: 'microsoft', family: 'Surface Laptop 3', series: 'Surface', color: 'silver', cpu: ['intel', 'Core i5-1035G7', 'i5', 10], ram: [8, 'DDR4'], ramUpgradable: false, storage: [256, 'nvme'], gpu: ['intel', 'Intel', false, null], screen: 13.5, touch: true, price: 13500, qty: 20, usages: ['study', 'office'] },
];

const BRAND_NAMES: Record<string, string> = { hp: 'HP', apple: 'Apple', dell: 'Dell', lenovo: 'Lenovo', microsoft: 'Microsoft Surface' };
const slugify = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

async function main() {
  await db.tx(async (q) => {
    // Remove demo catalog + anything that referenced it (demo orders, carts, leads, analytics)
    await q.query(`TRUNCATE analytics_events, customer_leads, coupon_redemptions, wishlist_items, reviews, returns, shipments, payment_events, payments,
      stock_reservations, order_events, order_items, orders, cart_items, carts, inventory_movements, product_images, inspections, inventory_units,
      upgrade_options, price_history, variant_categories, product_variants, product_families, coupons RESTART IDENTITY CASCADE`);
    await q.query(`UPDATE shipping_zones SET fee = NULL, free_threshold = NULL, eta_min_days = NULL, eta_max_days = NULL,
      name_ar = regexp_replace(name_ar, ' \\(تجريبي\\)', ''), name_en = regexp_replace(name_en, ' \\(sample\\)', '')`);
    const catIds = Object.fromEntries((await q.query('SELECT slug, id FROM categories')).rows.map((r: any) => [r.slug, r.id]));
    let n = 1000;
    for (const r of ROWS) {
      const brand = await one<any>(q, 'SELECT id FROM brands WHERE slug = $1', [r.brand]);
      const fslug = `${r.brand}-${slugify(r.family)}`;
      const descAr = [r.note, r.ramUpgradable === true ? 'الرامات قابلة للترقية.' : r.ramUpgradable === false ? 'الرامات غير قابلة للترقية.' : null].filter(Boolean).join(' ') || null;
      const descEn = [r.note ? 'Web browsing only.' : null, r.ramUpgradable === true ? 'RAM is upgradeable.' : r.ramUpgradable === false ? 'RAM is not upgradeable.' : null].filter(Boolean).join(' ') || null;
      const fam = await one<any>(q, `INSERT INTO product_families(brand_id, slug, name, series, description_ar, description_en) VALUES ($1,$2,$3,$4,$5,$6)
          ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name RETURNING id`, [brand.id, fslug, r.family, r.series, descAr, descEn]);
      for (const view of ['front', 'angle'] as const) writeSvg(path.resolve('public/img/demo'), `${fslug}-${view}.svg`, studioSvg(view, traitsFor(r.brand, r.family, r.screen), r.family));
      const cpuShort = (r.cpu[1] || '').replace(/^Core /, '');
      const st = r.storage[0] ? `${r.storage[0]}GB${r.storage[1] === 'nvme' ? ' NVMe' : ''}` : '';
      const title = `${BRAND_NAMES[r.brand].replace(' Surface', '')} ${r.family}${cpuShort ? ` — ${cpuShort}` : ''}${r.ram[0] ? ` / ${r.ram[0]}GB` : ''}${st ? ` / ${st}` : ''}`;
      const slug = `${fslug}-${slugify(cpuShort)}${r.ram[0] ? `-${r.ram[0]}gb` : ''}`;
      const sku = `LO-${++n}`;
      const v = await one<any>(q, `INSERT INTO product_variants(family_id, slug, sku, title, inventory_mode, grade, cpu_brand, cpu_model, cpu_tier, cpu_gen, ram_gb, ram_type,
          storage_gb, storage_type, gpu_brand, gpu_model, gpu_dedicated, vram_gb, screen_in, touch, convertible, os, usages, price, published, is_sample,
          warranty_months, warranty_text_ar, warranty_text_en)
        VALUES ($1,$2,$3,$4,$5,'excellent',$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,TRUE,FALSE,$24,$25,$26) RETURNING id`,
        [fam.id, slug, sku, title, r.qty > 1 ? 'batch' : 'unique', r.cpu[0], r.cpu[1], r.cpu[2], r.cpu[3], r.ram[0], r.ram[1], r.storage[0], r.storage[1],
          r.gpu[0], r.gpu[1], r.gpu[2], r.gpu[3], r.screen, r.touch ?? null, r.convertible ?? (r.family.includes('Surface Laptop') ? false : null), r.os ?? null, r.usages, EGP(r.price), 6, 'ضمان 6 شهور + استبدال أو استرجاع خلال 14 يوم من الاستلام', '6-month warranty + exchange or return within 14 days of delivery']);
      for (const u of r.usages) await q.query('INSERT INTO variant_categories VALUES ($1,$2)', [v.id, catIds[u]]);
      for (const [i, view] of ['front', 'angle'].entries())
        await q.query(`INSERT INTO product_images(variant_id,url,alt,kind,width,height,sort) VALUES ($1,$2,$3,'representative',800,600,$4)`, [v.id, `/img/demo/${fslug}-${view}.svg`, title, i]);
      await q.query('INSERT INTO price_history(variant_id, old_price, new_price) VALUES ($1, NULL, $2)', [v.id, EGP(r.price)]);
      for (let i = 0; i < r.qty; i++) {
        const u = await one<any>(q, `INSERT INTO inventory_units(variant_id, unit_sku, status) VALUES ($1,$2,'available') RETURNING id`, [v.id, `${sku}-${String(i + 1).padStart(2, '0')}`]);
        await q.query(`INSERT INTO inventory_movements(unit_id, to_status, reason) VALUES ($1,'available','stock sheet 2026-11-01')`, [u.id]);
      }
    }
  });
  // Settings: real WhatsApp, no demo banner, no unverified claims or sample policies
  const B = (ar = '', en = '') => ({ ar, en });
  const s: any = {
    demo_mode: false,
    contact: { ...DEFAULT_SETTINGS.contact, whatsapp: '201041125959' },
    announcements: [{ ar: 'للطلب والاستفسار: واتساب 01041125959', en: 'Orders & questions: WhatsApp 01041125959', enabled: true }],
    trust: {
      ...Object.fromEntries(Object.entries(DEFAULT_SETTINGS.trust).map(([k, x]) => [k, { ...x, enabled: false }])),
      warranty: { enabled: true, title: B('ضمان 6 شهور', '6-month warranty'), body: B('كل الأجهزة عليها ضمان 6 شهور.', 'Every laptop comes with a 6-month warranty.') },
      shipping_returns: { enabled: true, title: B('استبدال أو استرجاع خلال 14 يوم', 'Exchange or return within 14 days'), body: B('تقدر تستبدل أو ترجّع الجهاز خلال 14 يوم من الاستلام.', 'You can exchange or return the laptop within 14 days of delivery.') },
      grading: { enabled: true, title: B('حالة ممتازة', 'Excellent condition'), body: B('كل الأجهزة المعروضة حالتها ممتازة.', 'All listed laptops are in excellent condition.') },
    },
    policies: { warranty: B('كل الأجهزة عليها ضمان 6 شهور من تاريخ الاستلام.\n\nلتفاصيل التغطية أو لو عندك أي مشكلة في الجهاز، كلمنا على واتساب 01041125959.', 'Every laptop comes with a 6-month warranty from the delivery date.\n\nFor coverage details or any issue with your laptop, message us on WhatsApp 01041125959.'),
      returns: B('تقدر تستبدل أو ترجّع الجهاز خلال 14 يوم من تاريخ الاستلام.\n\nلطلب استبدال أو استرجاع، كلمنا على واتساب 01041125959.', 'You can exchange or return your laptop within 14 days of delivery.\n\nTo request an exchange or return, message us on WhatsApp 01041125959.'),
      shipping: B(), privacy: B(), terms: B(), about: B(), inspection: B() },
    payments: { ...DEFAULT_SETTINGS.payments, cod: { enabled: true, max_order: null } },
    faq: [
      { q: B('هل الأجهزة جديدة؟', 'Are the laptops new?'), a: B('لا، الأجهزة مستوردة مستعملة. المواصفات مكتوبة في صفحة كل جهاز.', 'No — they are imported pre-owned laptops. Specs are listed on each device page.') },
      { q: B('إزاي أطلب؟', 'How do I order?'), a: B('أضف الجهاز للسلة وأكمل البيانات، وهيتبعت طلبك على واتساب 01041125959 لتأكيده مع فريق المبيعات.', 'Add the laptop to your cart and fill in your details; your order is sent on WhatsApp 01041125959 to confirm with our sales team.') },
      { q: B('فيه ضمان؟', 'Is there a warranty?'), a: B('أيوه، ضمان 6 شهور على كل الأجهزة، واستبدال أو استرجاع خلال 14 يوم من الاستلام.', 'Yes — a 6-month warranty on every laptop, plus exchange or return within 14 days of delivery.') },
      { q: B('تكلفة الشحن كام؟', 'How much is shipping?'), a: B('فريق المبيعات بيأكدلك تكلفة ومدة الشحن حسب محافظتك قبل تأكيد الطلب.', 'Our sales team confirms the shipping cost and time for your governorate before confirming the order.') },
    ],
  };
  for (const [k, v] of Object.entries(s)) await saveSetting(k as any, v, null);
  console.log(`Loaded ${ROWS.length} listings, ${ROWS.reduce((a, r) => a + r.qty, 0)} units.`);
  await db.end();
}
main().catch((e) => { console.error(e); process.exit(1); });
