# LAP ONE — E-commerce platform for inspected imported laptops (Egypt)

Arabic-first (RTL) / English (LTR) storefront, guest checkout, transactional per-unit inventory,
Paymob payments (sandbox simulator included), and a role-based admin portal.

> **Demo data:** `npm run seed` loads 22 sample laptops + 4 accessories, sample shipping fees,
> sample policies and a `DEMO5` coupon. Everything is flagged as sample on the storefront (banner + badges).
> Replace before launch — see [docs/GO-LIVE-CHECKLIST.md](docs/GO-LIVE-CHECKLIST.md).

---

## Quick start

Requirements: **Node.js 22+**, **PostgreSQL 14+** (16 recommended).

```bash
cp .env.example .env              # fill DATABASE_URL, SESSION_SECRET (openssl rand -hex 32), PAYMOB_HMAC_SECRET
npm install
npm run build                     # server + client bundles → dist/ and public/assets/
npm run seed                      # migrates and loads demo data; prints staff logins
npm start                         # http://localhost:3000  (admin: /admin)
```

Development with rebuild-on-save: `npm run dev` in one terminal, `node --watch dist/server.js` in another.

Or with Docker: `docker compose up --build` (Postgres + app; then `docker compose exec app node dist/seed.js`).

### Demo staff accounts (created by the seed)

| Role | Email |
|---|---|
| Super Admin | `admin@lapone.local` |
| Branch/Store Manager | `manager@lapone.local` |
| Sales Employee | `sales@lapone.local` |
| Warehouse Employee | `warehouse@lapone.local` |
| Accountant | `accountant@lapone.local` |
| Customer Support | `support@lapone.local` |

Password = `SEED_ADMIN_PASSWORD` from `.env` (or a random one printed by the seed). **Delete or re-password these before launch.**

---

## Architecture

| Layer | Choice | Why |
|---|---|---|
| Server | Node.js 22 + TypeScript, `node:http` router | Small, fast, no framework lock-in. Every page is **server-rendered** (SEO) |
| Views | React 19 server rendering (`renderToStaticMarkup`) | Typed components, zero hydration cost |
| Client JS | One vanilla-TS bundle (~19 KB min) | Progressive enhancement: every form works without JS |
| CSS | Hand-written design system, CSS logical properties | Perfect RTL/LTR mirroring; ~47 KB min, no framework |
| Database | PostgreSQL, plain SQL migrations (`migrations/`) | Row-level locks + partial unique indexes for stock safety |
| DB driver | Bundled wire-protocol client **or** official `pg` (`DB_DRIVER=pg`) | Same `query(text, params)` API; parameterized queries only |
| Validation | Zod | Server-side validation of every input |
| Images | `sharp` → WebP (max 1600 px) | Upload validation by magic bytes + re-encoding |

**Why not Next.js/Prisma?** The build environment for this project had no package-registry access, so it was
built on the tools available (React, Zod, esbuild, PostgreSQL). The code is organised so a move to Next.js App Router
is mechanical: `src/views/**` are plain React server components, `src/server/services/**` is framework-free business
logic, and SQL lives in services (a Prisma/Drizzle schema can be generated from `migrations/001_init.sql` with `prisma db pull`).

```
src/
  config/        brand.ts (central brand config), catalog.ts (grades, statuses, governorates)
  server/
    db/          pgwire.ts (Postgres client), index.ts (pool, transactions), migrate.ts
    services/    catalog, search (query understanding), product, cart, orders, pricing,
                 recommend, payments/paymob, settings, audit
    routes/      store.tsx (storefront + APIs + webhooks), admin*.tsx (admin portal)
    auth.ts      scrypt passwords, DB sessions, RBAC permission map
    http.ts      cookies, body/multipart parsing, CSP & security headers, origin check, rate limiting
  views/         Layout, ui components, pages/*, admin/*
  client/        main.ts (storefront), admin.ts
  styles/        app.css, admin.css
migrations/      001_init.sql — 35 tables
scripts/         seed.ts, images.ts (sample illustrations)
tests/unit/      logic + integration tests (node:test)
tests/e2e/       Playwright browser tests
```

### Key design decisions

- **Money** is `BIGINT` piasters everywhere (1 EGP = 100). No floats in pricing, discounts or totals.
- **Inventory**: every physical laptop is an `inventory_units` row. *Unique* listings have one unit (own serial, battery,
  photos, defects); *batch* listings have many identical units. Families group variants (grades/configs) → `ProductGroup` JSON-LD.
- **No double-selling**: checkout locks units with `SELECT … FOR UPDATE SKIP LOCKED` inside a transaction, and a partial
  unique index allows only one active reservation per unit. Reservations expire (configurable per payment method); a
  background sweep cancels unpaid orders and returns units to stock.
- **Prices are recomputed on the server** at order time (variant price, compatible upgrade options, coupon, shipping zone).
- **Idempotent checkout**: each checkout form carries an idempotency key (unique index) — double clicks and retries return the same order.
- **Payments are confirmed only by HMAC-verified Paymob callbacks**, never by the browser redirect. Callbacks are stored in
  `payment_events` (unique per event) so replays are ignored; amount mismatches raise an alert on the order.
- **Honesty rules are enforced in code**: unknown specs render as “Not yet specified”; battery % requires a test date + method;
  previous price must be higher than current price; reviews show only if verified + approved; trust claims show only when enabled;
  delivery estimates show only when configured; unconfigured governorates get “contact us” instead of an invented fee.

---

## Feature status

### ✅ Implemented and tested (automated tests — see [docs/TEST-RESULTS.md](docs/TEST-RESULTS.md))
- Arabic RTL / English LTR storefront with language switch, hreflang, per-locale URLs
- Homepage: announcement bar, sticky header, mega menu, hero, shop by usage / budget / brand, merchandising rails
  from live inventory (best sellers only from real sales), recently viewed, trust section, verified-reviews section (honest empty state), FAQ, footer
- Smart search: autocomplete, Arabic/English, processor names & generations (incl. Arabic ordinals), price phrases
  (“أقل من 15 ألف”), RAM vs storage disambiguation, GPU models, typo tolerance, recent searches, zero-result help
- 20+ filters (multi-select, counts, in URL), 6 sort orders, pagination
- Product page: gallery (thumbs, swipe, zoom, fullscreen) with actual-vs-representative labels, purchase panel,
  sibling variants, upgrade options with live total, spec table with unknowns, condition (cosmetic vs functional),
  per-unit battery data, inspection checklist, related products with factual pros/cons, mobile sticky buy bar, JSON-LD
- Compare (max 4, hide identical), wishlist, quick view
- “ساعدني أختار” 5-question wizard → 3–5 in-stock recommendations with reasons, strengths, limitations, comparisons
- Cart, Buy-now, guest checkout with Egyptian phone validation, governorate shipping zones, free-shipping thresholds,
  coupons, COD, order confirmation + tracking, WhatsApp product/cart inquiries (logged as leads)
- Paymob sandbox flow (success, failure, retry), HMAC verification, replay protection
- Admin: login with lockout, sessions, CSRF tokens, 6 roles with enforced permissions, dashboard with date range,
  product CRUD/publish/archive, inventory receiving, unit status rules, inspections, photo upload, upgrades,
  orders (status rules, assign, payment & shipping references, returns, notes, invoice), audit log, CSV export/import
- Security: CSP with nonces, origin checks on all POSTs, rate limits, parameterized SQL, upload sniffing, noindex admin

### ⚠️ Implemented but not externally verified
- **Paymob test/live mode** (`PAYMOB_MODE=test|live`): the Intention API + Unified Checkout redirect is implemented to Paymob’s
  documented contract but has not been called against Paymob’s servers (no credentials). Verify with test keys first.
- **GA4 / GTM / Meta Pixel** loading and e-commerce events (consent-gated). Implemented; needs your IDs and a Tag Assistant check.
- **`DB_DRIVER=pg`** path (official driver) — implemented, but tests ran on the bundled driver.
- Google Fonts (blocked in the build sandbox; system fallbacks were used in screenshots).
- Lighthouse / Core Web Vitals were **not measured** (no Lighthouse in the build environment). Pages are server-rendered,
  JS is ~19 KB, images are lazy-loaded with explicit dimensions — but run Lighthouse on staging before claiming scores.

### 🧪 Mocked / sandbox only
- `PAYMOB_MODE=sandbox_mock`: a local page simulates Paymob’s hosted checkout and sends a correctly signed callback to the real webhook.
- Mobile wallets use the same Paymob path with a separate integration ID (sandbox only so far).

### ⏳ Not yet implemented (Phase 2)
- Installments / BNPL (needs a contracted provider; the toggle is disabled)
- Customer accounts & saved addresses (guest checkout + order tracking by number+phone covers Phase 1)
- Automated abandoned-cart messages (admin view + consent flags exist; connect an approved SMS/WhatsApp provider)
- Review collection flow (table + display exist; a post-delivery review request is not built)
- Cloud object storage for uploads (currently local disk — use a persistent volume, or add an S3/R2 adapter)
- Admin UI in Arabic (storefront is fully bilingual; admin is English)
- Excel (.xlsx) import (CSV import works; Excel “Save as CSV UTF-8”)
- Wholesale/dealer portal, Meta Conversions API, ETA e-invoicing integration

---

## Scripts

| Command | What it does |
|---|---|
| `npm run build` | Bundles server, client JS and CSS |
| `npm start` | Runs migrations then starts the server |
| `npm run seed` / `npm run seed:reset` | Loads demo data (reset wipes **all** data) |
| `npm test` | Unit + integration tests — **needs `DATABASE_URL` pointing at a database whose name contains `test`** |
| `npm run test:e2e` | Browser tests against a running server (`BASE=http://localhost:3001`) |
| `npm run typecheck` | TypeScript check |

See [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) for production.

---

## Static demo (`index.html`)

`index.html` at the repository root is a single-file, server-less demo of the storefront (sample data, no real orders).
Open it in a browser or publish it with GitHub Pages. Regenerate it after changing data with `npm run build:static`
(needs the server running locally) and copy `dist-static/index.html` to the repository root.
