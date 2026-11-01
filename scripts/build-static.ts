/** Builds dist-static/index.html: a single self-contained demo of the storefront. Needs the server running on PORT (default 3000). */
import fs from 'node:fs';
import path from 'node:path';
import * as esbuild from 'esbuild';
import { db, many } from '../src/server/db';
import { loadCatalog, perfIndex, valueScore } from '../src/server/services/catalog';
import { getSettings } from '../src/server/services/settings';
import { GOVERNORATES } from '../src/config/catalog';

const BASE = process.env.BASE || 'http://localhost:3000';
const SITE = process.env.STATIC_URL || 'https://abdoabdullah009-max.github.io/Lap-One/';
const get = async (p: string) => { const r = await fetch(BASE + p); if (!r.ok) throw new Error(`${p} → ${r.status}`); return r.text(); };
const mainOf = (h: string) => h.slice(h.indexOf('<main id="main" tabindex="-1">') + 30, h.lastIndexOf('</main>'));
const img: Record<string, string> = {};
const tok = (h: string) => h.replace(/\/img\/demo\/([\w.-]+\.svg)/g, (_m, f) => {
  if (!img[f]) img[f] = 'data:image/svg+xml;base64,' + fs.readFileSync(path.join('public/img/demo', f)).toString('base64');
  return `IMG:${f}`;
}).replace(/\/brand\/logo\.png/g, 'data:image/png;base64,' + fs.readFileSync('public/brand/logo.png').toString('base64'))
  .replace(/href="\/(ar|en)/g, 'href="#/$1')
  .split(encodeURIComponent(BASE + '/')).join(encodeURIComponent(SITE + '#/')).split(BASE + '/').join(SITE + '#/').replace(/<script[\s\S]*?<\/script>/g, '');

async function main() {
  const items = (await loadCatalog()).map((i) => ({ ...i, image: i.image, perf: perfIndex(i), value: valueScore(i), created: +new Date(i.created_at) }));
  const shell: Record<string, string> = {}; const pages: Record<string, string> = {}; const cards: Record<string, Record<number, string>> = {};
  for (const l of ['ar', 'en']) {
    const home = await get(`/${l}`);
    const body = home.slice(home.indexOf('<body'), home.lastIndexOf('</body>'));
    shell[l] = tok(body.slice(body.indexOf('>') + 1).replace(mainOf(home), ''));
    const paths = ['', '/laptops', '/help-me-choose', '/faq', '/contact', '/track', ...['warranty', 'shipping', 'returns', 'inspection', 'privacy', 'terms', 'about'].map((p) => `/pages/${p}`), ...items.map((i) => `/p/${i.slug}`)];
    for (const p of paths) pages[`${l}${p}`] = tok(mainOf(await get(`/${l}${p}`)));
    cards[l] = {};
    for (const p of ['/laptops', '/laptops?accessory=1']) {
      for (const m of (await get(`/${l}${p}`)).matchAll(/<article class="card[^"]*" data-id="(\d+)"[\s\S]*?<\/article>/g)) cards[l][Number(m[1])] = tok(m[0]);
    }
  }
  for (const i of items) (i as any).image = tok(i.image || '');
  const gl: Record<string, string> = { excellent: 'Excellent', very_good: 'Very good', good: 'Good', fair: 'Fair' };
  const slim = items.map((i: any) => { const { _doc, ...r } = i; return { ...r, _doc, grade_label: gl[i.grade] || '' }; });
  const zones = (await many<any>(db, 'SELECT governorates, fee, free_threshold, eta_min_days, eta_max_days FROM shipping_zones WHERE active AND fee IS NOT NULL'))
    .map((z) => ({ gov: z.governorates, fee: z.fee, free: z.free_threshold, min: z.eta_min_days, max: z.eta_max_days }));
  const st = await getSettings();
  const data = { shell, pages, cards, items: slim, zones, govs: GOVERNORATES, wa: st.contact.whatsapp, budgets: st.budget_ranges, img };
  const js = (await esbuild.build({ entryPoints: ['src/client/static.ts'], bundle: true, write: false, minify: true, format: 'iife', target: ['es2020'], define: { __DATA__: 'window.__DATA__' } })).outputFiles[0].text;
  const css = fs.readFileSync('public/assets/app.css', 'utf8');
  const fav = 'data:image/svg+xml;base64,' + fs.readFileSync('public/favicon.svg').toString('base64');
  const html = `<!DOCTYPE html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>LAP ONE — لابتوبات استيراد بمواصفات واضحة</title><meta name="description" content="LAP ONE — لابتوبات استيراد بمواصفات واضحة وأسعار بالجنيه المصري. للطلب واتساب 01041125959"><meta name="theme-color" content="#0060FF">
<link rel="icon" href="${fav}"><link rel="preconnect" href="https://fonts.googleapis.com"><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+Arabic:wght@400;500;600;700&family=Inter:wght@400;500;600;700&display=swap">
<style>${css}</style></head><body><main id="boot" style="padding:40px;text-align:center">LAP ONE…</main>
<script>window.__DATA__=${JSON.stringify(data).replace(/</g, '\\u003c')};</script><script>${js}</script></body></html>`;
  fs.mkdirSync('dist-static', { recursive: true }); fs.writeFileSync('dist-static/index.html', html);
  console.log(`dist-static/index.html ${(html.length / 1024 / 1024).toFixed(2)} MB · ${Object.keys(pages).length} pages · ${items.length} products · ${Object.keys(img).length} images`);
  await db.end();
}
main().catch((e) => { console.error(e); process.exit(1); });
