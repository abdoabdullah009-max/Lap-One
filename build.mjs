// Build: server + scripts (Node ESM), client bundle (browser), CSS (concatenated + minified).
import * as esbuild from 'esbuild';
import fs from 'node:fs';
import crypto from 'node:crypto';

const watch = process.argv.includes('--watch');
const common = { bundle: true, sourcemap: true, logLevel: 'info', jsx: 'automatic', define: { 'process.env.NODE_ENV': '"production"' } };
const nodeOpts = { ...common, platform: 'node', format: 'esm', target: 'node22', packages: 'external',
  banner: { js: "import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);" }, define: {} };

const testFiles = fs.existsSync('tests/unit') ? fs.readdirSync('tests/unit').filter((f) => f.endsWith('.test.ts')).map((f) => `tests/unit/${f}`) : [];
const builds = [
  { ...nodeOpts, entryPoints: { server: 'src/server/index.ts', migrate: 'src/server/db/migrate.ts', seed: 'scripts/seed.ts' }, outdir: 'dist' },
  ...(testFiles.length ? [{ ...nodeOpts, entryPoints: testFiles, outdir: 'dist/tests' }] : []),
  { ...common, platform: 'browser', format: 'iife', target: ['es2020', 'chrome90', 'safari15', 'firefox90'], minify: true, entryPoints: { app: 'src/client/main.ts', admin: 'src/client/admin.ts' }, outdir: 'public/assets' },
  { ...common, loader: { '.css': 'css' }, minify: true, entryPoints: { app: 'src/styles/app.css', admin: 'src/styles/admin.css' }, outdir: 'public/assets' },
];

function writeVersion() {
  const h = crypto.createHash('sha1');
  for (const f of ['app.js', 'app.css', 'admin.js', 'admin.css']) if (fs.existsSync(`public/assets/${f}`)) h.update(fs.readFileSync(`public/assets/${f}`));
  fs.writeFileSync('public/assets/version.json', JSON.stringify({ v: h.digest('hex').slice(0, 10) }));
}

if (watch) {
  for (const b of builds) (await esbuild.context({ ...b, plugins: [{ name: 'v', setup(bd) { bd.onEnd(writeVersion); } }] })).watch();
} else {
  await Promise.all(builds.map((b) => esbuild.build(b)));
  writeVersion();
}
