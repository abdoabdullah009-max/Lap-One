/** Regenerates the studio illustrations for every laptop family in the catalog. Run: node dist/render-images.js */
import fs from 'node:fs';
import path from 'node:path';
import { db, many } from '../src/server/db';
import { studioSvg, traitsFor } from './studio';

const rows = await many<any>(db, `SELECT f.slug, f.name, b.slug AS brand, max(v.screen_in)::float AS screen
  FROM product_families f JOIN brands b ON b.id = f.brand_id JOIN product_variants v ON v.family_id = f.id GROUP BY f.slug, f.name, b.slug`);
const dir = path.resolve('public/img/demo');
for (const r of rows) {
  const t = traitsFor(r.brand, r.name, r.screen);
  for (const view of ['front', 'angle'] as const) fs.writeFileSync(path.join(dir, `${r.slug}-${view}.svg`), studioSvg(view, t, r.name));
  console.log('rendered', r.slug);
}
process.exit(0);
