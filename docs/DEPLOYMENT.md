# Production deployment

## Recommended setup

| Component | Recommendation |
|---|---|
| App | A long-running Node 22 container: **Railway, Render, Fly.io, DigitalOcean App Platform or a VPS** |
| Database | Managed PostgreSQL 16: **Neon, Supabase, Railway Postgres, AWS RDS** (daily backups + point-in-time recovery) |
| Uploads | A persistent volume mounted at `UPLOAD_DIR`, or add an S3/Cloudflare R2 adapter (Phase 2) |
| TLS / CDN | Cloudflare in front of the app (cache `/assets/*`, `/img/*`, `/uploads/*`) |

**Why not Vercel?** The app runs a background job (reservation expiry every minute) and serves uploaded files from disk.
Serverless platforms would need a cron route and object storage. A small always-on container is simpler and cheaper here.

## Steps

1. **Create the database** and copy its connection string (add `?sslmode=require`).
2. **Set environment variables** (see `.env.example`):
   - `NODE_ENV=production`, `PUBLIC_BASE_URL=https://your-domain`, `DATABASE_URL=…`
   - `SESSION_SECRET` — `openssl rand -hex 32`
   - `DB_DRIVER=pg` (recommended in production after `npm install`)
   - `TRUST_PROXY=true` behind Cloudflare/a load balancer (correct client IPs for rate limiting)
   - Paymob: `PAYMOB_MODE=test` first, then `live`; `PAYMOB_SECRET_KEY`, `PAYMOB_PUBLIC_KEY`, `PAYMOB_HMAC_SECRET`,
     `PAYMOB_CARD_INTEGRATION_ID`, `PAYMOB_WALLET_INTEGRATION_ID`
3. **Build & deploy** with the included `Dockerfile` (`docker build -t lapone .`). The container runs migrations on start.
4. **Create the first admin** once: `SEED_ADMIN_PASSWORD='<strong password>' node dist/seed.js` creates roles, staff accounts
   and demo data. To start with **no** demo data, run the seed, then archive the sample products (or `seed:reset` on staging only).
5. **Paymob dashboard**: set the transaction-processed callback to `https://your-domain/webhooks/paymob` and the response
   callback to your domain. Run a test card payment and confirm the order becomes *Paid / Confirmed* in Admin.
6. **Search Console**: verify the domain (DNS) and submit `https://your-domain/sitemap.xml`.
7. **Backups**: confirm automated DB backups, and back up the uploads volume.

## Scaling notes

- The catalog read model is cached in memory for 30 seconds and invalidated on writes — fine for one or two instances.
  With several instances, lower the TTL or add a pub/sub invalidation.
- Rate limits are in-memory per instance; move them to Redis when running more than one instance.
- The reservation sweep uses `FOR UPDATE SKIP LOCKED`, so running it on several instances at once is safe.

## Operations

- Health check: `GET /healthz`
- Logs: stdout (errors include method + URL; no card data ever reaches the server)
- Security headers: CSP with per-request nonces, HSTS (production), `X-Frame-Options: DENY`, `nosniff`
- Admin sessions: 12 h, `HttpOnly`, `Secure`, `SameSite=Lax`, path-scoped to `/admin`; 5 failed logins → 15-minute lock
