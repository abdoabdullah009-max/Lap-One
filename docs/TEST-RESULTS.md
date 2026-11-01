# Test results

Run on 31 Oct 2026 in the build environment (Node 22.23, PostgreSQL 16, Chromium via Playwright).
Every result below comes from tests that were actually executed. Nothing here is estimated.

## Static checks
| Check | Result |
|---|---|
| `tsc --noEmit` (strict) | ✅ 0 errors (React types via a local shim, because `@types/react` could not be installed offline) |
| Production build (esbuild) | ✅ server, client (app.js ≈ 19 KB min), CSS (≈ 47 KB min) |

## Unit + integration — `npm test` (real PostgreSQL test database): **20 / 20 passed**
| # | Test |
|---|---|
| 1 | A unique unit cannot be sold twice under **concurrent** checkouts; cancelling returns it to stock |
| 2 | Idempotency: the same submission (in parallel and repeated) creates one order |
| 3 | Server recalculates totals (price + compatible upgrade, bogus option ignored, coupon, shipping, free threshold) |
| 4 | Unconfigured governorate is rejected instead of inventing a fee |
| 5 | Paymob: forged signature rejected (no state change), amount mismatch flagged, success confirms once, replay ignored, units → sold, one purchase event |
| 6 | Failed card payment does not confirm; expired reservation cancels the order and releases units |
| 7 | Order status transitions enforced; COD *Delivered* records the payment; shipped orders cannot be cancelled; audit rows written |
| 8 | Coupon usage limit holds under concurrency |
| 9–16 | Search understanding: spec examples, Arabic digits/“ألف”, processor variants (`core i5`, `كور اي 7`, `ryzen 7`, `i7-1185G7`, “الجيل الحادي عشر”), storage vs RAM, normalization, typo tolerance |
| 17 | Money: integer piasters, parsing, rounding down on percentages |
| 18 | Egyptian phone normalization (+20, Arabic digits, invalid prefixes) |
| 19 | Paymob HMAC computation and tamper detection |
| 20 | Recommender needs derivation |

## End-to-end browser tests — `npm run test:e2e`: **19 / 19 passed**
Home AR/EN + language switch · all header/footer links resolve · search autocomplete & understood chips · multi-filters in URL, reset, price sort ·
product specs/unknowns/condition/battery/upgrade total · out-of-stock blocked (UI + server) · compare (4 max, hide identical) + wishlist ·
wizard results · cart + COD guest checkout (validation errors, persisted order, cart emptied) · buy-now → Paymob sandbox success → Paid/Confirmed ·
card failure → failed state + retry · duplicate submission → one order · cross-origin POST & unsigned webhook rejected · admin auth, wrong password,
confirm order → units sold → audit · admin create product + receive unit + publish, cost not exposed publicly, price change audited, misleading
previous price rejected · RBAC (warehouse/sales/accountant limits, masked phones, missing CSRF token rejected) · keyboard (skip link, Esc, radio groups) ·
SEO (canonical, hreflang, Product/Offer/Breadcrumb JSON-LD, sitemap, robots, admin noindex) ·
**responsive: no horizontal overflow on 7 pages × 5 widths (360, 390, 768, 1366, 1920) in RTL and LTR**.

## Manual checks performed
- Photo upload: real JPEG → WebP 1600×1200 shown as “actual unit”; a fake `.jpg` rejected by magic-byte check
- CSV import: dry run creates nothing; row errors reported (`price_egp invalid`); real run creates the product as unpublished + units
- Visual review of screenshots: home, catalog, product, wizard, checkout, order confirmation (mobile + desktop, RTL + LTR), admin dashboard and order page

## Bugs found by testing and fixed
- Header cart count showed 0 after the very first add-to-cart (new cart cookie not visible in the same request)
- Wizard auto-advanced when keyboard users moved between options with arrow keys (now only on pointer selection)
- Product-card tool buttons rendered below the image instead of over it; hero spec chips overlapped in RTL
- Compare-limit response used HTTP 409, which logged a console error (now a normal response with a message)

## Not tested / limitations
- Real Paymob API (test or live keys), real WhatsApp numbers, GA4/GTM/Pixel delivery, Google Fonts loading
- Lighthouse/Core Web Vitals scores (tool not available here — measure on staging)
- Screen-reader walkthrough (semantic HTML, labels, `aria-*` and focus handling were implemented but not tested with NVDA/VoiceOver)
- Load testing beyond the concurrency tests above
