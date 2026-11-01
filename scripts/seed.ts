/**
 * Demo seed. EVERYTHING created here is sample data (is_sample = true, demo_mode setting on):
 * prices, stock, condition notes, battery readings, warranty terms, shipping fees and policy text
 * are illustrative and must be replaced before launch. Run: npm run seed  (use --reset to wipe first)
 */
import crypto from 'node:crypto';
import path from 'node:path';
import { db, one } from '../src/server/db';
import { migrate } from '../src/server/db/migrate';
import { hashPassword, ROLES } from '../src/server/auth';
import { EGP } from '../src/server/money';
import { saveSetting, DEFAULT_SETTINGS, type Settings } from '../src/server/services/settings';
import { laptopSvg, accessorySvg, writeSvg } from './images';

const IMG_DIR = path.resolve(process.cwd(), 'public/img/demo');

type V = {
  fam: string; brand: string; series: string; name: string; color: string; grade: string | null; mode: 'unique' | 'batch';
  cpu: [string, string, string, number | null, number | null]; // brand, model, tier, gen, cores
  ram: [number, string, number | null]; storage: [number, string]; gpu: [string, string, boolean, number | null];
  screen: [number, string, number, boolean, boolean]; os: string; weight: number | null; price: number; was?: number;
  usages: string[]; units: (number | null)[]; // battery health per unit (null = untested)
  warranty: number | null; offer?: boolean; defects?: string; cosmetic?: string; keyboard?: string; screenNote?: string;
  upgrades?: [string, string, string, number][]; soldOut?: boolean; charger?: boolean; ports?: string;
};

const L: V[] = [
  { fam: 'dell-latitude-5420', brand: 'dell', series: 'Latitude', name: 'Latitude 5420', color: 'graphite', grade: 'very_good', mode: 'batch',
    cpu: ['intel', 'Core i5-1145G7', 'i5', 11, 4], ram: [16, 'DDR4', 64], storage: [256, 'nvme'], gpu: ['intel', 'Iris Xe', false, null],
    screen: [14, '1920x1080', 60, false, false], os: 'Windows 11 Pro', weight: 1.4, price: 14500, usages: ['study', 'office', 'programming'],
    units: [82, 85, 88, null, 79], warranty: 3, cosmetic: 'خدوش استخدام خفيفة جدًا على الغطاء', ports: 'USB-C Thunderbolt 4, 2× USB-A, HDMI, RJ45',
    upgrades: [['ssd', 'ترقية التخزين إلى 512GB NVMe', 'Upgrade to 512GB NVMe', 1200], ['ram', 'ترقية الرامات إلى 32GB', 'Upgrade RAM to 32GB', 2000]] },
  { fam: 'dell-latitude-5420', brand: 'dell', series: 'Latitude', name: 'Latitude 5420', color: 'graphite', grade: 'good', mode: 'batch',
    cpu: ['intel', 'Core i5-1145G7', 'i5', 11, 4], ram: [8, 'DDR4', 64], storage: [256, 'nvme'], gpu: ['intel', 'Iris Xe', false, null],
    screen: [14, '1920x1080', 60, false, false], os: 'Windows 11 Pro', weight: 1.4, price: 12900, usages: ['study', 'office', 'budget'],
    units: [76, null], warranty: 3, cosmetic: 'خدوش واضحة على الغطاء وحول لوحة اللمس', upgrades: [['ram', 'ترقية الرامات إلى 16GB', 'Upgrade RAM to 16GB', 1000]] },
  { fam: 'dell-latitude-7490', brand: 'dell', series: 'Latitude', name: 'Latitude 7490', color: 'black', grade: 'good', mode: 'unique',
    cpu: ['intel', 'Core i7-8650U', 'i7', 8, 4], ram: [16, 'DDR4', 32], storage: [512, 'ssd'], gpu: ['intel', 'UHD 620', false, null],
    screen: [14, '1920x1080', 60, false, false], os: 'Windows 10 Pro', weight: 1.4, price: 11000, usages: ['office', 'study'],
    units: [71], warranty: 1, cosmetic: 'خدش طولي ظاهر على الغطاء الخارجي (حوالي 4 سم)', defects: 'خدش ظاهر على الغطاء — لا يؤثر على الأداء' },
  { fam: 'dell-latitude-5400', brand: 'dell', series: 'Latitude', name: 'Latitude 5400', color: 'black', grade: 'fair', mode: 'batch',
    cpu: ['intel', 'Core i5-8365U', 'i5', 8, 4], ram: [8, 'DDR4', 32], storage: [256, 'ssd'], gpu: ['intel', 'UHD 620', false, null],
    screen: [14, '1366x768', 60, false, false], os: 'Windows 10 Pro', weight: 1.5, price: 8500, usages: ['budget', 'study'],
    units: [null, null, null], warranty: 1, cosmetic: 'علامات استخدام واضحة على الجسم والغطاء', keyboard: 'لمعان على بعض الأزرار من الاستخدام',
    upgrades: [['ram', 'ترقية الرامات إلى 16GB', 'Upgrade RAM to 16GB', 900]] },
  { fam: 'dell-precision-5550', brand: 'dell', series: 'Precision', name: 'Precision 5550', color: 'silver', grade: 'excellent', mode: 'unique',
    cpu: ['intel', 'Core i7-10850H', 'i7', 10, 6], ram: [32, 'DDR4', 64], storage: [1024, 'nvme'], gpu: ['nvidia', 'Quadro T2000', true, 4],
    screen: [15.6, '1920x1200', 60, false, false], os: 'Windows 11 Pro', weight: 1.84, price: 32000, usages: ['engineering', 'graphics', 'workstation', 'programming'],
    units: [90], warranty: 6 },
  { fam: 'dell-precision-7560', brand: 'dell', series: 'Precision', name: 'Precision 7560', color: 'graphite', grade: 'very_good', mode: 'batch',
    cpu: ['intel', 'Core i7-11850H', 'i7', 11, 8], ram: [32, 'DDR4', 128], storage: [1024, 'nvme'], gpu: ['nvidia', 'RTX A2000', true, 4],
    screen: [15.6, '1920x1080', 60, false, false], os: 'Windows 11 Pro', weight: 2.5, price: 41000, usages: ['workstation', 'engineering', 'graphics'],
    units: [87, 84], warranty: 6, ports: '2× Thunderbolt 4, 2× USB-A, HDMI 2.1, RJ45, SD',
    upgrades: [['ram', 'ترقية الرامات إلى 64GB', 'Upgrade RAM to 64GB', 4500]] },
  { fam: 'dell-xps-15-9500', brand: 'dell', series: 'XPS', name: 'XPS 15 9500', color: 'silver', grade: 'very_good', mode: 'unique',
    cpu: ['intel', 'Core i7-10750H', 'i7', 10, 6], ram: [16, 'DDR4', 64], storage: [512, 'nvme'], gpu: ['nvidia', 'GTX 1650 Ti', true, 4],
    screen: [15.6, '1920x1200', 60, false, false], os: 'Windows 11 Home', weight: 1.83, price: 27500, usages: ['graphics', 'programming'],
    units: [83], warranty: 3 },
  { fam: 'hp-elitebook-840-g6', brand: 'hp', series: 'EliteBook', name: 'EliteBook 840 G6', color: 'silver', grade: 'very_good', mode: 'batch',
    cpu: ['intel', 'Core i5-8365U', 'i5', 8, 4], ram: [8, 'DDR4', 32], storage: [256, 'nvme'], gpu: ['intel', 'UHD 620', false, null],
    screen: [14, '1920x1080', 60, false, false], os: 'Windows 10 Pro', weight: 1.48, price: 10500, was: 11500, offer: true, usages: ['study', 'office', 'budget'],
    units: [80, 77, 86, 81], warranty: 3, upgrades: [['ram', 'ترقية الرامات إلى 16GB', 'Upgrade RAM to 16GB', 900]] },
  { fam: 'hp-elitebook-840-g8', brand: 'hp', series: 'EliteBook', name: 'EliteBook 840 G8', color: 'silver', grade: 'excellent', mode: 'batch',
    cpu: ['intel', 'Core i7-1185G7', 'i7', 11, 4], ram: [16, 'DDR4', 64], storage: [512, 'nvme'], gpu: ['intel', 'Iris Xe', false, null],
    screen: [14, '1920x1080', 60, false, false], os: 'Windows 11 Pro', weight: 1.36, price: 19500, usages: ['office', 'programming', 'study'],
    units: [92, 89, 91], warranty: 6 },
  { fam: 'hp-elitebook-x360-1030-g4', brand: 'hp', series: 'EliteBook', name: 'EliteBook x360 1030 G4', color: 'silver', grade: 'very_good', mode: 'unique',
    cpu: ['intel', 'Core i7-8665U', 'i7', 8, 4], ram: [16, 'LPDDR3', 16], storage: [512, 'nvme'], gpu: ['intel', 'UHD 620', false, null],
    screen: [13.3, '1920x1080', 60, true, true], os: 'Windows 11 Pro', weight: 1.25, price: 15500, usages: ['study', 'office'],
    units: [84], warranty: 3 },
  { fam: 'hp-probook-450-g7', brand: 'hp', series: 'ProBook', name: 'ProBook 450 G7', color: 'silver', grade: 'good', mode: 'batch',
    cpu: ['intel', 'Core i5-10210U', 'i5', 10, 4], ram: [8, 'DDR4', 32], storage: [256, 'nvme'], gpu: ['nvidia', 'GeForce MX250', true, 2],
    screen: [15.6, '1920x1080', 60, false, false], os: 'Windows 10 Pro', weight: 2.0, price: 11800, usages: ['study', 'office', 'budget'],
    units: [78, null, 74], warranty: 3,
    upgrades: [['ram', 'ترقية الرامات إلى 16GB', 'Upgrade RAM to 16GB', 900], ['ssd', 'ترقية التخزين إلى 512GB NVMe', 'Upgrade to 512GB NVMe', 1100]] },
  { fam: 'hp-zbook-15-g6', brand: 'hp', series: 'ZBook', name: 'ZBook 15 G6', color: 'graphite', grade: 'good', mode: 'unique',
    cpu: ['intel', 'Core i7-9850H', 'i7', 9, 6], ram: [32, 'DDR4', 128], storage: [512, 'nvme'], gpu: ['nvidia', 'Quadro T1000', true, 4],
    screen: [15.6, '1920x1080', 60, false, false], os: 'Windows 10 Pro', weight: 2.6, price: 23000, usages: ['engineering', 'workstation'],
    units: [73], warranty: 3, cosmetic: 'انبعاج صغير في الركن الأمامي الأيسر', keyboard: 'زر المسافة عليه لمعان من الاستخدام',
    defects: 'انبعاج صغير في ركن الجسم — لا يؤثر على الأداء' },
  { fam: 'hp-zbook-firefly-14-g8', brand: 'hp', series: 'ZBook', name: 'ZBook Firefly 14 G8', color: 'silver', grade: 'excellent', mode: 'unique',
    cpu: ['intel', 'Core i7-1165G7', 'i7', 11, 4], ram: [16, 'DDR4', 64], storage: [512, 'nvme'], gpu: ['nvidia', 'Quadro T500', true, 4],
    screen: [14, '1920x1080', 60, false, false], os: 'Windows 11 Pro', weight: 1.35, price: 24500, usages: ['engineering', 'programming', 'graphics'],
    units: [94], warranty: 6 },
  { fam: 'lenovo-thinkpad-t480', brand: 'lenovo', series: 'ThinkPad', name: 'ThinkPad T480', color: 'black', grade: 'good', mode: 'batch',
    cpu: ['intel', 'Core i5-8350U', 'i5', 8, 4], ram: [8, 'DDR4', 32], storage: [256, 'nvme'], gpu: ['intel', 'UHD 620', false, null],
    screen: [14, '1920x1080', 60, false, false], os: 'Windows 10 Pro', weight: 1.58, price: 9200, usages: ['study', 'budget', 'office'],
    units: [70, 75, null, 68, 81, 72], warranty: 1, upgrades: [['ram', 'ترقية الرامات إلى 16GB', 'Upgrade RAM to 16GB', 900]] },
  { fam: 'lenovo-thinkpad-t14-gen2', brand: 'lenovo', series: 'ThinkPad', name: 'ThinkPad T14 Gen 2', color: 'black', grade: 'very_good', mode: 'batch',
    cpu: ['intel', 'Core i7-1165G7', 'i7', 11, 4], ram: [16, 'DDR4', 48], storage: [512, 'nvme'], gpu: ['intel', 'Iris Xe', false, null],
    screen: [14, '1920x1080', 60, false, false], os: 'Windows 11 Pro', weight: 1.5, price: 17800, usages: ['programming', 'office', 'study'],
    units: [88, 85], warranty: 3 },
  { fam: 'lenovo-thinkpad-x1-carbon-gen8', brand: 'lenovo', series: 'ThinkPad', name: 'ThinkPad X1 Carbon Gen 8', color: 'black', grade: 'very_good', mode: 'unique',
    cpu: ['intel', 'Core i7-10610U', 'i7', 10, 4], ram: [16, 'LPDDR3', 16], storage: [512, 'nvme'], gpu: ['intel', 'UHD 620', false, null],
    screen: [14, '1920x1080', 60, false, false], os: 'Windows 11 Pro', weight: 1.09, price: 18900, usages: ['study', 'office', 'programming'],
    units: [86], warranty: 3 },
  { fam: 'lenovo-thinkpad-p53', brand: 'lenovo', series: 'ThinkPad', name: 'ThinkPad P53', color: 'black', grade: 'very_good', mode: 'unique',
    cpu: ['intel', 'Core i7-9850H', 'i7', 9, 6], ram: [32, 'DDR4', 128], storage: [1024, 'nvme'], gpu: ['nvidia', 'Quadro T2000', true, 4],
    screen: [15.6, '1920x1080', 60, false, false], os: 'Windows 10 Pro', weight: 2.5, price: 26000, usages: ['workstation', 'engineering'],
    units: [80], warranty: 3, soldOut: true },
  { fam: 'lenovo-legion-5-15ach6h', brand: 'lenovo', series: 'Legion', name: 'Legion 5 15ACH6H', color: 'black', grade: 'very_good', mode: 'batch',
    cpu: ['amd', 'Ryzen 7 5800H', 'r7', 5, 8], ram: [16, 'DDR4', 32], storage: [512, 'nvme'], gpu: ['nvidia', 'RTX 3060', true, 6],
    screen: [15.6, '1920x1080', 165, false, false], os: 'Windows 11 Home', weight: 2.4, price: 33000, usages: ['gaming', 'graphics'],
    units: [81, 84], warranty: 3, upgrades: [['ram', 'ترقية الرامات إلى 32GB', 'Upgrade RAM to 32GB', 2000]] },
  { fam: 'microsoft-surface-pro-7', brand: 'microsoft', series: 'Surface', name: 'Surface Pro 7', color: 'silver', grade: 'very_good', mode: 'batch',
    cpu: ['intel', 'Core i5-1035G4', 'i5', 10, 4], ram: [8, 'LPDDR4x', 8], storage: [256, 'nvme'], gpu: ['intel', 'Iris Plus', false, null],
    screen: [12.3, '2736x1824', 60, true, true], os: 'Windows 11 Home', weight: 0.78, price: 13500, usages: ['study'],
    units: [83, null], warranty: 3, charger: true, keyboard: 'الكيبورد (Type Cover) غير مرفق' },
  { fam: 'microsoft-surface-laptop-3', brand: 'microsoft', series: 'Surface', name: 'Surface Laptop 3', color: 'gold', grade: 'good', mode: 'unique',
    cpu: ['intel', 'Core i5-1035G7', 'i5', 10, 4], ram: [8, 'LPDDR4x', 8], storage: [256, 'nvme'], gpu: ['intel', 'Iris Plus', false, null],
    screen: [13.5, '2256x1504', 60, true, false], os: 'Windows 11 Home', weight: 1.29, price: 12800, usages: ['study', 'office'],
    units: [null], warranty: 1, cosmetic: 'علامات خفيفة على قماش Alcantara حول لوحة اللمس' },
  { fam: 'hp-omen-15-2020', brand: 'hp', series: 'Omen', name: 'Omen 15 (2020)', color: 'black', grade: 'good', mode: 'unique',
    cpu: ['intel', 'Core i7-10750H', 'i7', 10, 6], ram: [16, 'DDR4', 32], storage: [512, 'nvme'], gpu: ['nvidia', 'RTX 2060', true, 6],
    screen: [15.6, '1920x1080', 144, false, false], os: 'Windows 11 Home', weight: 2.36, price: 28500, was: 30000, offer: true, usages: ['gaming', 'graphics'],
    units: [68], warranty: 3, cosmetic: 'خدش صغير بجوار لوحة اللمس', defects: 'البطارية 68% — مناسبة للاستخدام على الكهرباء أكثر' },
  { fam: 'apple-macbook-air-m1', brand: 'apple', series: 'MacBook', name: 'MacBook Air M1 (2020)', color: 'silver', grade: 'excellent', mode: 'unique',
    cpu: ['apple', 'Apple M1', 'm1', null, 8], ram: [8, 'Unified', 8], storage: [256, 'ssd'], gpu: ['apple', 'Apple M1 7-core GPU', false, null],
    screen: [13.3, '2560x1600', 60, false, false], os: 'macOS', weight: 1.29, price: 24000, usages: ['study', 'programming', 'office'],
    units: [95], warranty: 3, keyboard: 'كيبورد إنجليزي فقط' },
];

const ACCESSORIES: { fam: string; name: string; kind: string; price: number; units: number; usages: string[] }[] = [
  { fam: 'acc-usb-c-65w-charger', name: 'شاحن USB-C أصلي 65W', kind: 'charger', price: 950, units: 10, usages: [] },
  { fam: 'acc-ddr4-16gb-3200', name: 'رامات DDR4 16GB 3200MHz SODIMM', kind: 'ram', price: 1500, units: 8, usages: [] },
  { fam: 'acc-nvme-512gb', name: 'هارد NVMe SSD 512GB', kind: 'ssd', price: 1700, units: 6, usages: [] },
  { fam: 'acc-backpack-156', name: 'شنطة ظهر لابتوب 15.6"', kind: 'bag', price: 650, units: 10, usages: [] },
];

const BRANDS: [string, string, string[]][] = [
  ['dell', 'Dell', ['ديل', 'دل']], ['hp', 'HP', ['اتش بي', 'إتش بي']], ['lenovo', 'Lenovo', ['لينوفو']],
  ['microsoft', 'Microsoft Surface', ['سيرفس', 'مايكروسوفت', 'surface']], ['apple', 'Apple', ['ابل', 'ماك', 'macbook']],
  ['generic', 'LAP ONE Accessories', ['اكسسوارات']],
];
const CATEGORIES: [string, string, string][] = [
  ['study', 'الدراسة والجامعة', 'Study & university'], ['office', 'الشغل والمكاتب', 'Work & office'], ['programming', 'البرمجة', 'Programming'],
  ['engineering', 'الهندسة والتصميم', 'Engineering & CAD'], ['graphics', 'الجرافيك والمونتاج', 'Graphics & video'], ['gaming', 'الجيمينج', 'Gaming'],
  ['workstation', 'محطات العمل', 'Workstations'], ['budget', 'أجهزة اقتصادية', 'Budget picks'],
];

const rnd = (n: number) => crypto.randomBytes(n).toString('hex').toUpperCase();

async function main() {
  await migrate();
  const reset = process.argv.includes('--reset');
  if (reset) {
    await db.query(`TRUNCATE analytics_events, audit_logs, customer_leads, coupon_redemptions, wishlist_items, reviews, returns, shipments,
      payment_events, payments, stock_reservations, order_events, order_items, orders, coupons, shipping_zones, cart_items, carts,
      inventory_movements, product_images, inspections, inventory_units, upgrade_options, price_history, variant_categories,
      product_variants, product_families, categories, brands, addresses, customers, sessions, users, roles, site_settings RESTART IDENTITY CASCADE`);
    console.log('database reset');
  }
  if (await one(db, 'SELECT 1 FROM product_variants LIMIT 1')) { console.log('catalog already seeded (use --reset to reseed)'); await db.end(); return; }

  // roles & users
  for (const [key, ar, en] of ROLES) await db.query('INSERT INTO roles(key,name_ar,name_en) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING', [key, ar, en]);
  const pw = process.env.SEED_ADMIN_PASSWORD || crypto.randomBytes(9).toString('base64url');
  const adminEmail = process.env.SEED_ADMIN_EMAIL || 'admin@lapone.local';
  const staff: [string, string, string][] = [[adminEmail, 'Super Admin', 'super_admin'], ['manager@lapone.local', 'Store Manager', 'manager'],
    ['sales@lapone.local', 'Sales (demo)', 'sales'], ['warehouse@lapone.local', 'Warehouse (demo)', 'warehouse'],
    ['accountant@lapone.local', 'Accountant (demo)', 'accountant'], ['support@lapone.local', 'Support (demo)', 'support']];
  for (const [email, name, role] of staff) {
    await db.query('INSERT INTO users(email,name,password_hash,role_key) VALUES ($1,$2,$3,$4) ON CONFLICT (email) DO NOTHING', [email, name, hashPassword(pw), role]);
  }

  for (const [i, [slug, name, aliases]] of BRANDS.entries()) await db.query('INSERT INTO brands(slug,name,aliases,sort) VALUES ($1,$2,$3,$4)', [slug, name, aliases, i]);
  for (const [i, [slug, ar, en]] of CATEGORIES.entries()) await db.query('INSERT INTO categories(slug,name_ar,name_en,sort) VALUES ($1,$2,$3,$4)', [slug, ar, en, i]);
  await db.query(`INSERT INTO categories(slug,name_ar,name_en,kind,sort) VALUES ('accessories','إكسسوارات وترقيات','Accessories & upgrades','accessory',99)`);
  const brandId = async (slug: string) => (await one<any>(db, 'SELECT id FROM brands WHERE slug=$1', [slug])).id;
  const catIds = Object.fromEntries((await db.query('SELECT slug, id FROM categories')).rows.map((r: any) => [r.slug, r.id]));

  const famIds = new Map<string, number>();
  let skuN = 1000;
  for (const v of L) {
    if (!famIds.has(v.fam)) {
      const f = await one<any>(db, `INSERT INTO product_families(brand_id, slug, name, series, description_ar, description_en, is_sample)
        VALUES ($1,$2,$3,$4,$5,$6,TRUE) RETURNING id`, [await brandId(v.brand), v.fam, v.name, v.series,
        `${v.name} — جهاز ${v.series} من ${v.brand.toUpperCase()}. وصف تجريبي يُستبدل بوصف المنتج الفعلي.`,
        `${v.name} — a ${v.series} model. Sample description to be replaced with real copy.`]);
      famIds.set(v.fam, f.id);
      const label = `${v.name}`;
      for (const view of ['front', 'angle', 'closed'] as const) writeSvg(IMG_DIR, `${v.fam}-${view}.svg`, laptopSvg(view, v.color, label, v.series));
    }
    const gradeSlug = v.grade!.replace('_', '-');
    const slug = `${v.fam}-${v.cpu[2]}-${v.ram[0]}gb-${v.storage[0] >= 1024 ? v.storage[0] / 1024 + 'tb' : v.storage[0] + 'gb'}-${gradeSlug}`;
    const title = `${BRANDS.find((b) => b[0] === v.brand)![1].replace(' Surface', '')} ${v.name} — ${v.cpu[1].replace('Core ', '')} / ${v.ram[0]}GB / ${v.storage[0] >= 1024 ? v.storage[0] / 1024 + 'TB' : v.storage[0] + 'GB'} ${v.storage[1] === 'nvme' ? 'NVMe' : 'SSD'}`;
    const sku = `LO-${++skuN}`;
    const variant = await one<any>(db, `INSERT INTO product_variants(family_id, slug, sku, title, inventory_mode, grade, cpu_brand, cpu_model, cpu_tier, cpu_gen, cpu_cores,
        ram_gb, ram_type, ram_max_gb, storage_gb, storage_type, gpu_brand, gpu_model, gpu_dedicated, vram_gb, screen_in, resolution, refresh_hz,
        touch, convertible, os, connectivity, ports, weight_kg, charger_included, keyboard_layout, usages, price, compare_at_price, warranty_months,
        warranty_text_ar, warranty_text_en, is_offer, published, is_sample, created_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29,$30,$31,$32,$33,$34,$35,$36,$37,$38,TRUE,TRUE,
        now() - ($39 || ' days')::interval) RETURNING id`,
      [famIds.get(v.fam), slug, sku, title, v.mode, v.grade, v.cpu[0], v.cpu[1], v.cpu[2], v.cpu[3], v.cpu[4], v.ram[0], v.ram[1], v.ram[2],
        v.storage[0], v.storage[1], v.gpu[0], v.gpu[1], v.gpu[2], v.gpu[3], v.screen[0], v.screen[1], v.screen[2], v.screen[3], v.screen[4],
        v.os, v.brand === 'apple' ? 'Wi-Fi 6, Bluetooth 5.0' : 'Wi-Fi, Bluetooth', v.ports ?? null, v.weight, v.charger ?? true,
        v.keyboard?.includes('إنجليزي') ? 'EN' : null, v.usages, EGP(v.price), v.was ? EGP(v.was) : null, v.warranty,
        v.warranty ? `ضمان تجريبي ${v.warranty} شهر على العيوب الفنية — الشروط الفعلية تحددها الإدارة` : null,
        v.warranty ? `Sample ${v.warranty}-month warranty on functional defects — actual terms set by management` : null,
        !!v.offer, String(Math.floor(Math.random() * 40))]);
    for (const u of v.usages) await db.query('INSERT INTO variant_categories VALUES ($1,$2)', [variant.id, catIds[u]]);
    let sort = 0;
    for (const view of ['front', 'angle', 'closed']) {
      await db.query(`INSERT INTO product_images(variant_id,url,alt,kind,width,height,sort) VALUES ($1,$2,$3,'representative',800,600,$4)`,
        [variant.id, `/img/demo/${v.fam}-${view}.svg`, `${title} (${view})`, sort++]);
    }
    for (const [i, up] of (v.upgrades || []).entries()) {
      await db.query('INSERT INTO upgrade_options(variant_id,kind,label_ar,label_en,price,sort) VALUES ($1,$2,$3,$4,$5,$6)', [variant.id, up[0], up[1], up[2], EGP(up[3]), i]);
    }
    for (const [i, bat] of v.units.entries()) {
      const status = v.soldOut ? 'sold' : 'available';
      const unit = await one<any>(db, `INSERT INTO inventory_units(variant_id, internal_serial, unit_sku, status, purchase_cost, warehouse_location,
          battery_health_pct, battery_tested_at, battery_method, battery_notes, cosmetic_notes, screen_notes, keyboard_notes, defects, included_accessories)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) RETURNING id`,
        [variant.id, `SN-${rnd(5)}`, `${sku}-${String(i + 1).padStart(2, '0')}`, status, EGP(Math.round(v.price * (0.68 + Math.random() * 0.1))),
          `A-${1 + (skuN % 4)}-${String(i + 1).padStart(2, '0')}`, bat, bat === null ? null : new Date(Date.now() - 86400000 * (3 + i)).toISOString().slice(0, 10),
          bat === null ? null : (v.brand === 'apple' ? 'System Report → Power: Full Charge Capacity ÷ Design Capacity' : 'powercfg /batteryreport: Full Charge Capacity ÷ Design Capacity'),
          bat !== null && bat < 75 ? 'السعة أقل من 75% من سعة التصميم' : null,
          v.cosmetic ?? 'لا توجد خدوش ظاهرة', v.screenNote ?? 'بدون بكسلات ميتة أو بقع ظاهرة', v.keyboard ?? 'كل الأزرار تعمل',
          v.defects ?? null, v.charger === false ? 'بدون شاحن' : 'شاحن أصلي']);
      await db.query(`INSERT INTO inventory_movements(unit_id, from_status, to_status, reason) VALUES ($1, NULL, 'received', 'seed: received'), ($1, 'received', $2, 'seed: inspection passed')`, [unit.id, status]);
      await db.query(`INSERT INTO inspections(unit_id, functional_status, checklist, notes) VALUES ($1,$2,$3,$4)`,
        [unit.id, v.defects ? 'passed_with_notes' : 'passed',
          JSON.stringify({ screen: true, keyboard: true, touchpad: true, ports: true, wifi: true, bluetooth: true, camera: true, speakers: true, microphone: true, charging: true, storage_health: true, stress_test: true }),
          'فحص تجريبي: اختبار تشغيل كامل + اختبار ضغط 30 دقيقة (بيانات نموذجية)']);
    }
  }

  // accessories
  for (const a of ACCESSORIES) {
    const f = await one<any>(db, `INSERT INTO product_families(brand_id, slug, name, is_accessory, description_ar, description_en, is_sample)
      VALUES ($1,$2,$3,TRUE,$4,$5,TRUE) RETURNING id`, [await brandId('generic'), a.fam, a.name, 'إكسسوار تجريبي', 'Sample accessory']);
    const v = await one<any>(db, `INSERT INTO product_variants(family_id, slug, sku, title, inventory_mode, price, published, is_sample, warranty_months, usages)
      VALUES ($1,$2,$3,$4,'batch',$5,TRUE,TRUE,NULL,'{}') RETURNING id`, [f.id, a.fam, `LO-A${++skuN}`, a.name, EGP(a.price)]);
    await db.query('INSERT INTO variant_categories VALUES ($1,$2)', [v.id, catIds.accessories]);
    const url = writeSvg(IMG_DIR, `${a.fam}.svg`, accessorySvg(a.kind, a.name));
    await db.query(`INSERT INTO product_images(variant_id,url,alt,kind,width,height) VALUES ($1,$2,$3,'representative',800,600)`, [v.id, url, a.name]);
    for (let i = 0; i < a.units; i++) {
      await db.query(`INSERT INTO inventory_units(variant_id, unit_sku, status, purchase_cost, warehouse_location) VALUES ($1,$2,'available',$3,'ACC-1')`,
        [v.id, `LO-A${skuN}-${i + 1}`, EGP(Math.round(a.price * 0.6))]);
    }
  }

  // shipping zones (SAMPLE fees)
  const zones: [string, string, string[], number, number | null, number, number][] = [
    ['القاهرة الكبرى (تجريبي)', 'Greater Cairo (sample)', ['CAI', 'GIZ', 'QAL'], 75, 20000, 1, 2],
    ['الإسكندرية والدلتا (تجريبي)', 'Alexandria & Delta (sample)', ['ALX', 'BEH', 'DAK', 'GHR', 'MNF', 'SHR', 'KFS', 'DAM'], 100, 25000, 2, 4],
    ['القناة وسيناء (تجريبي)', 'Canal & Sinai (sample)', ['PTS', 'ISM', 'SUZ', 'SIN', 'JS'], 120, null, 2, 5],
    ['الصعيد (تجريبي)', 'Upper Egypt (sample)', ['FYM', 'BNS', 'MNY', 'AST', 'SHG', 'QNA', 'LXR', 'ASN'], 140, null, 3, 6],
  ];
  for (const [i, z] of zones.entries()) {
    await db.query(`INSERT INTO shipping_zones(name_ar,name_en,governorates,fee,free_threshold,eta_min_days,eta_max_days,sort) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [z[0], z[1], z[2], EGP(z[3]), z[4] ? EGP(z[4]) : null, z[5], z[6], i]);
  }
  // Remote governorates intentionally left without a zone -> checkout shows "contact us" (no invented fee)

  await db.query(`INSERT INTO coupons(code, kind, value, min_order, max_uses, active) VALUES ('DEMO5', 'percent', 5, $1, 100, TRUE)`, [EGP(10000)]);

  // settings (sample)
  const s: Partial<Settings> = {
    demo_mode: true,
    announcements: [
      { ar: 'نسخة تجريبية — الطلبات لا تُشحن', en: 'Demo store — orders are not shipped', enabled: true },
      { ar: 'الشحن لمحافظات مختارة — التكلفة تظهر قبل تأكيد الطلب', en: 'Shipping to selected governorates — cost shown before you confirm', enabled: true },
    ],
    payments: { ...DEFAULT_SETTINGS.payments, cod: { enabled: true, max_order: null }, paymob_card: { enabled: true }, paymob_wallet: { enabled: true },
      manual_transfer: { enabled: true, instapay_handle: 'demo.lapone@instapay (تجريبي)', bank_details: { ar: 'بيانات بنك تجريبية — تُستبدل من الإعدادات', en: 'Sample bank details — replace in settings' } } },
    budget_ranges: [{ min: null, max: EGP(10000) }, { min: EGP(10000), max: EGP(15000) }, { min: EGP(15000), max: EGP(25000) }, { min: EGP(25000), max: EGP(40000) }, { min: EGP(40000), max: null }],
    trust: {
      inspection: { enabled: true, title: { ar: 'فحص كل جهاز', en: 'Every device inspected' }, body: { ar: 'كل جهاز بيتسجل له فحص وظيفي (الشاشة، الكيبورد، المنافذ، الشحن، التخزين) ونتيجته بتظهر في صفحته.', en: 'Every device gets a recorded functional check (screen, keyboard, ports, charging, storage) shown on its page.' } },
      grading: { enabled: true, title: { ar: 'تصنيف حالة واضح', en: 'Clear condition grades' }, body: { ar: 'ممتاز، جيد جدًا، جيد، مقبول — مع وصف مكتوب لأي خدوش أو عيوب.', en: 'Excellent, Very good, Good, Fair — with written notes on any marks or defects.' } },
      warranty: { enabled: true, title: { ar: 'ضمان معلن لكل جهاز', en: 'Warranty stated per device' }, body: { ar: 'مدة الضمان مكتوبة في صفحة كل جهاز (بيانات تجريبية).', en: 'Warranty length is stated on each device page (sample data).' } },
      support: { enabled: true, title: { ar: 'دعم قبل وبعد الشراء', en: 'Support before and after purchase' }, body: { ar: 'اسأل على واتساب قبل ما تشتري، وتواصل معانا بعد الاستلام.', en: 'Ask on WhatsApp before buying and reach us after delivery.' } },
      shipping_returns: { enabled: true, title: { ar: 'شحن واسترجاع بشروط واضحة', en: 'Clear shipping & returns' }, body: { ar: 'تكلفة الشحن تظهر قبل التأكيد، وسياسة الاسترجاع منشورة.', en: 'Shipping cost shown before you confirm; returns policy published.' } },
    },
    grade_definitions: {
      excellent: { ar: 'ممتاز: بدون خدوش ظاهرة من مسافة الاستخدام العادية.', en: 'Excellent: no visible marks at normal viewing distance.' },
      very_good: { ar: 'جيد جدًا: علامات استخدام خفيفة جدًا.', en: 'Very good: very light signs of use.' },
      good: { ar: 'جيد: خدوش أو علامات واضحة لكن الجسم سليم.', en: 'Good: visible marks, body intact.' },
      fair: { ar: 'مقبول: علامات استخدام كثيرة أو عيب شكلي ملحوظ، يعمل بشكل سليم.', en: 'Fair: heavy wear or a notable cosmetic flaw; works properly.' },
    },
    policies: {
      warranty: { ar: 'نص نموذجي: الضمان يغطي العيوب الفنية التي تظهر خلال مدة الضمان المذكورة في صفحة الجهاز، ولا يغطي سوء الاستخدام أو الكسر أو السوائل.', en: 'Sample: warranty covers functional defects appearing within the period stated on the device page; excludes misuse, breakage or liquid damage.' },
      shipping: { ar: 'نص نموذجي: تكلفة الشحن حسب المحافظة وتظهر قبل تأكيد الطلب.', en: 'Sample: shipping cost depends on governorate and is shown before you confirm.' },
      returns: { ar: 'نص نموذجي: يمكن طلب الاسترجاع خلال مدة تحددها الإدارة إذا كان الجهاز مخالفًا للوصف المعلن.', en: 'Sample: returns can be requested within a period set by management if the device does not match its description.' },
      privacy: { ar: 'نص نموذجي: نستخدم بياناتك لتنفيذ الطلب فقط، ولا نرسل رسائل تسويقية إلا بموافقتك.', en: 'Sample: we use your data to fulfil the order only, and send marketing only with your consent.' },
      terms: { ar: 'نص نموذجي للشروط والأحكام.', en: 'Sample terms and conditions.' },
      about: { ar: 'LAP ONE متخصصة في اللابتوبات المستوردة المفحوصة. (نص نموذجي)', en: 'LAP ONE specialises in inspected imported laptops. (sample text)' },
      inspection: { ar: 'نص نموذجي: كل جهاز يمر باختبار تشغيل وفحص للمكونات الأساسية ويُسجل التقرير في النظام.', en: 'Sample: each device goes through a power-on test and component check, recorded in our system.' },
    },
    faq: [
      { q: { ar: 'هل الأجهزة جديدة؟', en: 'Are the laptops new?' }, a: { ar: 'لا، الأجهزة مستوردة مستعملة ومفحوصة، وحالة كل جهاز مكتوبة بوضوح في صفحته.', en: 'No — they are imported pre-owned and inspected; each device page states its condition.' } },
      { q: { ar: 'إيه الفرق بين الحالة الشكلية والفحص الوظيفي؟', en: 'What is the difference between cosmetic grade and functional test?' }, a: { ar: 'الحالة الشكلية بتوصف المظهر (خدوش، علامات)، والفحص الوظيفي بيوضح إن كل المكونات بتشتغل.', en: 'Cosmetic grade describes appearance; the functional test confirms components work.' } },
      { q: { ar: 'هل أقدر أسأل قبل ما أشتري؟', en: 'Can I ask before buying?' }, a: { ar: 'أيوه، زر واتساب في كل صفحة جهاز بيبعت لنا تفاصيل الجهاز تلقائيًا.', en: 'Yes — the WhatsApp button on each device page sends us its details automatically.' } },
      { q: { ar: 'إزاي أعرف تكلفة الشحن؟', en: 'How do I know the shipping cost?' }, a: { ar: 'اختار المحافظة في صفحة إتمام الطلب وهتظهر التكلفة قبل التأكيد.', en: 'Choose your governorate at checkout and the cost appears before you confirm.' } },
    ],
  };
  for (const [k, v] of Object.entries(s)) await saveSetting(k as keyof Settings, v as any, null);

  console.log('\nDemo data seeded (all sample data).');
  console.log(`Staff accounts (password: ${process.env.SEED_ADMIN_PASSWORD ? '<SEED_ADMIN_PASSWORD from env>' : pw}):`);
  for (const [email, , role] of staff) console.log(`  ${role.padEnd(12)} ${email}`);
  await db.end();
}

main().catch(async (e) => { console.error(e); process.exit(1); });
