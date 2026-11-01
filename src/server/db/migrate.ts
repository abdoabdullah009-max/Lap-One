import fs from 'node:fs';
import path from 'node:path';
import { db } from './index';

export async function migrate(dir = path.resolve(process.cwd(), 'migrations')) {
  await db.query('CREATE TABLE IF NOT EXISTS schema_migrations (name TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now())');
  const done = new Set((await db.query('SELECT name FROM schema_migrations')).rows.map((r: any) => r.name));
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();
  for (const file of files) {
    if (done.has(file)) continue;
    const sql = fs.readFileSync(path.join(dir, file), 'utf8');
    // Split on statement boundaries (our migrations contain no functions with embedded semicolons)
    const statements = sql.split(/;\s*$/m).map((s) => s.replace(/^\s*--.*$/gm, '').trim()).filter(Boolean);
    await db.tx(async (q) => {
      for (const st of statements) await q.query(st);
      await q.query('INSERT INTO schema_migrations(name) VALUES ($1) ON CONFLICT DO NOTHING', [file]);
    });
    console.log(`applied ${file}`);
  }
}

if (process.argv[1]?.endsWith('migrate.js') || process.argv[1]?.endsWith('migrate.ts')) {
  migrate().then(() => db.end()).catch((e) => { console.error(e); process.exit(1); });
}
