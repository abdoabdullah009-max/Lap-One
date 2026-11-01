# Go-live checklist — what LAP ONE needs to provide

The admin dashboard shows a live version of this checklist.

## Accounts & credentials
- [ ] **Domain name** + DNS access (and Cloudflare account, optional)
- [ ] **Hosting** account (Railway / Render / Fly / VPS) and **managed PostgreSQL**
- [ ] **Paymob merchant account**: secret key, public key, HMAC secret, card integration ID, wallet integration ID (test, then live)
- [ ] **WhatsApp Business** number for sales (international format `20XXXXXXXXXX`)
- [ ] **Google Analytics 4** measurement ID and/or **Google Tag Manager** container ID
- [ ] **Meta Pixel** ID (optional; Conversions API needs a Meta access token — Phase 2)
- [ ] **Google Search Console** access to verify the domain
- [ ] Installment/BNPL provider contract (valU, Sympl, Souhoola, Aman…) if you want installments — Phase 2

## Business information (Admin → Settings)
- [ ] Customer-service phone, email, store address, working hours, map link, social links
- [ ] **Warranty policy** (what is covered, how long, exclusions) — the site never invents coverage
- [ ] **Returns & exchange policy** (period, conditions, who pays shipping)
- [ ] **Shipping**: real fees per governorate zone, free-shipping thresholds, delivery-time ranges you can actually meet,
      remote governorates (Red Sea, New Valley, Matrouh have no zone in the demo), store pickup address & hours if offered
- [ ] Cash-on-delivery rules (maximum order value? deposit for high-value laptops?)
- [ ] InstaPay address / bank account details if accepting transfers
- [ ] Stock reservation times (online payment hold, COD hold, transfer hold)
- [ ] Condition grade definitions as you apply them in the warehouse
- [ ] Inspection process description (published on “How we inspect devices”)
- [ ] Legal name, tax ID, commercial register (invoices); confirm e-invoicing (ETA) obligations with your accountant
- [ ] Privacy policy & terms reviewed by a lawyer
- [ ] Approved **logo** (replace the temporary text mark in `src/config/brand.ts` / `public/`)

## Data
- [ ] Real inventory imported (Admin → Import, CSV) with **real photos** (mark photos of the exact unit as “Actual unit”)
- [ ] Battery readings with date + method for units you measured (leave empty otherwise)
- [ ] Purchase costs (for profit reports — visible to manager/accountant/super admin only)
- [ ] Archive all sample products, delete the `DEMO5` coupon, replace sample policies and shipping fees
- [ ] Turn **Demo mode off** (Settings → General)

## Security & operations
- [ ] Change all demo staff passwords or deactivate the demo accounts; create real staff with the right roles
- [ ] `SESSION_SECRET` and Paymob secrets stored only in the hosting provider’s secret store
- [ ] Database backups enabled and a restore tested
- [ ] Test on staging: a real Paymob **test** card payment, a failed payment, a COD order through to *Delivered*, a return
- [ ] Run Lighthouse on the production domain (mobile) and fix anything below target
