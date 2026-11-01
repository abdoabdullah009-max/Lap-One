-- LAP ONE — initial schema
-- Money is stored as BIGINT piasters (1 EGP = 100 piasters) to avoid floating-point errors.

CREATE TABLE roles (
  key          TEXT PRIMARY KEY,           -- super_admin, manager, sales, warehouse, accountant, support
  name_ar      TEXT NOT NULL,
  name_en      TEXT NOT NULL
);

CREATE TABLE users (
  id            SERIAL PRIMARY KEY,
  email         TEXT NOT NULL UNIQUE,
  name          TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  role_key      TEXT NOT NULL REFERENCES roles(key),
  active        BOOLEAN NOT NULL DEFAULT TRUE,
  failed_logins INT NOT NULL DEFAULT 0,
  locked_until  TIMESTAMPTZ,
  last_login_at TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE sessions (
  id_hash     TEXT PRIMARY KEY,             -- sha256 of the cookie token; raw token never stored
  user_id     INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  csrf_token  TEXT NOT NULL,
  ip          TEXT,
  user_agent  TEXT,
  expires_at  TIMESTAMPTZ NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX sessions_user_idx ON sessions(user_id);

CREATE TABLE customers (
  id                 SERIAL PRIMARY KEY,
  name               TEXT NOT NULL,
  phone              TEXT NOT NULL UNIQUE,    -- normalized 01XXXXXXXXX
  email              TEXT,
  marketing_consent  BOOLEAN NOT NULL DEFAULT FALSE,
  consent_at         TIMESTAMPTZ,
  source             TEXT,
  assigned_to        INT REFERENCES users(id),
  follow_up_status   TEXT NOT NULL DEFAULT 'none',
  notes              TEXT,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE addresses (
  id               SERIAL PRIMARY KEY,
  customer_id      INT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  governorate_code TEXT NOT NULL,
  city             TEXT NOT NULL,
  street           TEXT NOT NULL,
  building         TEXT,
  instructions     TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE brands (
  id        SERIAL PRIMARY KEY,
  slug      TEXT NOT NULL UNIQUE,
  name      TEXT NOT NULL,
  aliases   TEXT[] NOT NULL DEFAULT '{}',     -- Arabic spellings etc. for search
  sort      INT NOT NULL DEFAULT 0
);

CREATE TABLE categories (
  id        SERIAL PRIMARY KEY,
  slug      TEXT NOT NULL UNIQUE,             -- study, office, programming, engineering, graphics, gaming, workstation, budget, accessories
  name_ar   TEXT NOT NULL,
  name_en   TEXT NOT NULL,
  kind      TEXT NOT NULL DEFAULT 'usage',
  sort      INT NOT NULL DEFAULT 0
);

-- A product family = a model line/config group (ProductGroup). Variants = sellable configuration + grade.
CREATE TABLE product_families (
  id             SERIAL PRIMARY KEY,
  brand_id       INT NOT NULL REFERENCES brands(id),
  slug           TEXT NOT NULL UNIQUE,
  name           TEXT NOT NULL,                -- e.g. "Latitude 5420"
  series         TEXT,                          -- e.g. "Latitude"
  is_accessory   BOOLEAN NOT NULL DEFAULT FALSE,
  description_ar TEXT,
  description_en TEXT,
  is_sample      BOOLEAN NOT NULL DEFAULT FALSE,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE product_variants (
  id               SERIAL PRIMARY KEY,
  family_id        INT NOT NULL REFERENCES product_families(id),
  slug             TEXT NOT NULL UNIQUE,
  sku              TEXT NOT NULL UNIQUE,
  title            TEXT NOT NULL,
  inventory_mode   TEXT NOT NULL CHECK (inventory_mode IN ('unique','batch')),
  grade            TEXT,                        -- excellent | very_good | good | fair  (NULL for accessories)
  -- Specs: NULL means "not verified / unknown" and is displayed as such, never guessed.
  cpu_brand        TEXT,                        -- intel | amd | apple
  cpu_model        TEXT,                        -- e.g. "Core i7-1185G7"
  cpu_tier         TEXT,                        -- i3 i5 i7 i9 r5 r7 r9 m1 m2 ...
  cpu_gen          INT,
  cpu_cores        INT,
  ram_gb           INT,
  ram_type         TEXT,
  ram_max_gb       INT,
  storage_gb       INT,
  storage_type     TEXT,                        -- nvme | ssd | hdd
  gpu_brand        TEXT,                        -- intel | amd | nvidia | apple
  gpu_model        TEXT,
  gpu_dedicated    BOOLEAN,
  vram_gb          INT,
  screen_in        NUMERIC(4,1),
  resolution       TEXT,                        -- e.g. 1920x1080
  refresh_hz       INT,
  touch            BOOLEAN,
  convertible      BOOLEAN,
  os               TEXT,
  connectivity     TEXT,
  ports            TEXT,
  weight_kg        NUMERIC(4,2),
  charger_included BOOLEAN,
  keyboard_layout  TEXT,
  usages           TEXT[] NOT NULL DEFAULT '{}',
  price            BIGINT NOT NULL CHECK (price >= 0),
  compare_at_price BIGINT CHECK (compare_at_price IS NULL OR compare_at_price > price),
  warranty_months  INT,
  warranty_text_ar TEXT,
  warranty_text_en TEXT,
  is_offer         BOOLEAN NOT NULL DEFAULT FALSE,
  published        BOOLEAN NOT NULL DEFAULT FALSE,
  archived         BOOLEAN NOT NULL DEFAULT FALSE,
  is_sample        BOOLEAN NOT NULL DEFAULT FALSE,
  low_stock_threshold INT NOT NULL DEFAULT 1,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX variants_family_idx ON product_variants(family_id);
CREATE INDEX variants_published_idx ON product_variants(published) WHERE published AND NOT archived;

CREATE TABLE variant_categories (
  variant_id  INT NOT NULL REFERENCES product_variants(id) ON DELETE CASCADE,
  category_id INT NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
  PRIMARY KEY (variant_id, category_id)
);

-- Pricing history (the "Pricing" entity). Current price lives on the variant.
CREATE TABLE price_history (
  id          SERIAL PRIMARY KEY,
  variant_id  INT NOT NULL REFERENCES product_variants(id) ON DELETE CASCADE,
  old_price   BIGINT,
  new_price   BIGINT NOT NULL,
  changed_by  INT REFERENCES users(id),
  changed_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE upgrade_options (
  id          SERIAL PRIMARY KEY,
  variant_id  INT NOT NULL REFERENCES product_variants(id) ON DELETE CASCADE,
  kind        TEXT NOT NULL CHECK (kind IN ('ram','ssd','accessory')),
  label_ar    TEXT NOT NULL,
  label_en    TEXT NOT NULL,
  price       BIGINT NOT NULL CHECK (price >= 0),
  active      BOOLEAN NOT NULL DEFAULT TRUE,
  sort        INT NOT NULL DEFAULT 0
);

CREATE TYPE unit_status AS ENUM ('received','awaiting_inspection','available','reserved','sold','returned','under_maintenance','archived');

-- Every physical laptop is a row. 'unique' variants have exactly one; 'batch' variants have many.
CREATE TABLE inventory_units (
  id                 SERIAL PRIMARY KEY,
  variant_id         INT NOT NULL REFERENCES product_variants(id),
  internal_serial    TEXT UNIQUE,              -- confidential: never sent to storefront
  unit_sku           TEXT NOT NULL UNIQUE,
  status             unit_status NOT NULL DEFAULT 'received',
  purchase_cost      BIGINT,                   -- confidential
  warehouse_location TEXT,
  battery_health_pct INT CHECK (battery_health_pct BETWEEN 0 AND 100),
  battery_tested_at  DATE,
  battery_method     TEXT,
  battery_notes      TEXT,
  cosmetic_notes     TEXT,
  screen_notes       TEXT,
  keyboard_notes     TEXT,
  defects            TEXT,
  included_accessories TEXT,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX units_variant_status_idx ON inventory_units(variant_id, status);

CREATE TABLE inspections (
  id                SERIAL PRIMARY KEY,
  unit_id           INT NOT NULL REFERENCES inventory_units(id) ON DELETE CASCADE,
  inspector_id      INT REFERENCES users(id),
  inspected_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  functional_status TEXT NOT NULL CHECK (functional_status IN ('passed','passed_with_notes','failed')),
  checklist         JSONB NOT NULL DEFAULT '{}',   -- {"keyboard":true,"ports":true,...}
  notes             TEXT
);

CREATE TABLE product_images (
  id          SERIAL PRIMARY KEY,
  variant_id  INT NOT NULL REFERENCES product_variants(id) ON DELETE CASCADE,
  unit_id     INT REFERENCES inventory_units(id) ON DELETE SET NULL,
  url         TEXT NOT NULL,
  alt         TEXT,
  kind        TEXT NOT NULL CHECK (kind IN ('representative','actual_unit')),
  width       INT,
  height      INT,
  sort        INT NOT NULL DEFAULT 0
);
CREATE INDEX images_variant_idx ON product_images(variant_id, sort);

CREATE TABLE inventory_movements (
  id          SERIAL PRIMARY KEY,
  unit_id     INT NOT NULL REFERENCES inventory_units(id) ON DELETE CASCADE,
  from_status unit_status,
  to_status   unit_status NOT NULL,
  reason      TEXT NOT NULL,
  order_id    INT,
  user_id     INT REFERENCES users(id),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE carts (
  id            UUID PRIMARY KEY,
  visitor_id    TEXT NOT NULL,
  kind          TEXT NOT NULL DEFAULT 'cart' CHECK (kind IN ('cart','buy_now')),
  contact_phone TEXT,                -- captured at checkout start, used only with consent
  recovery_consent BOOLEAN NOT NULL DEFAULT FALSE,
  checkout_started_at TIMESTAMPTZ,
  converted_order_id INT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX carts_visitor_idx ON carts(visitor_id);

CREATE TABLE cart_items (
  id          SERIAL PRIMARY KEY,
  cart_id     UUID NOT NULL REFERENCES carts(id) ON DELETE CASCADE,
  variant_id  INT NOT NULL REFERENCES product_variants(id),
  qty         INT NOT NULL CHECK (qty BETWEEN 1 AND 20),
  option_ids  INT[] NOT NULL DEFAULT '{}',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (cart_id, variant_id, option_ids)
);

CREATE TABLE shipping_zones (
  id              SERIAL PRIMARY KEY,
  name_ar         TEXT NOT NULL,
  name_en         TEXT NOT NULL,
  governorates    TEXT[] NOT NULL,      -- governorate codes
  fee             BIGINT,               -- NULL = not configured (checkout blocks with a clear message)
  free_threshold  BIGINT,
  eta_min_days    INT,
  eta_max_days    INT,
  cod_allowed     BOOLEAN NOT NULL DEFAULT TRUE,
  active          BOOLEAN NOT NULL DEFAULT TRUE,
  sort            INT NOT NULL DEFAULT 0
);

CREATE TABLE coupons (
  id             SERIAL PRIMARY KEY,
  code           TEXT NOT NULL UNIQUE,     -- stored upper-case
  kind           TEXT NOT NULL CHECK (kind IN ('percent','fixed')),
  value          BIGINT NOT NULL CHECK (value > 0),  -- percent: whole number 1..100; fixed: piasters
  max_discount   BIGINT,
  min_order      BIGINT,
  starts_at      TIMESTAMPTZ,
  ends_at        TIMESTAMPTZ,
  max_uses       INT,
  per_phone_limit INT,
  used_count     INT NOT NULL DEFAULT 0,
  variant_ids    INT[] NOT NULL DEFAULT '{}',   -- empty = all products
  active         BOOLEAN NOT NULL DEFAULT TRUE,
  created_by     INT REFERENCES users(id),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TYPE order_status AS ENUM ('pending','awaiting_payment','confirmed','preparing','shipped','delivered','cancelled','returned','refunded');
CREATE TYPE payment_status AS ENUM ('unpaid','pending','awaiting_transfer','paid','failed','refunded','partially_refunded');

CREATE SEQUENCE order_number_seq START 10001;

CREATE TABLE orders (
  id               SERIAL PRIMARY KEY,
  number           TEXT NOT NULL UNIQUE,               -- LO-10001
  public_token     TEXT NOT NULL,                      -- random, for the confirmation URL
  idempotency_key  TEXT NOT NULL UNIQUE,
  customer_id      INT NOT NULL REFERENCES customers(id),
  status           order_status NOT NULL,
  payment_status   payment_status NOT NULL,
  payment_method   TEXT NOT NULL,
  subtotal         BIGINT NOT NULL,
  options_total    BIGINT NOT NULL DEFAULT 0,
  discount         BIGINT NOT NULL DEFAULT 0,
  shipping_fee     BIGINT NOT NULL DEFAULT 0,
  total            BIGINT NOT NULL CHECK (total >= 0),
  coupon_id        INT REFERENCES coupons(id),
  coupon_code      TEXT,
  shipping_zone_id INT REFERENCES shipping_zones(id),
  delivery_method  TEXT NOT NULL DEFAULT 'delivery' CHECK (delivery_method IN ('delivery','pickup')),
  address          JSONB NOT NULL,                     -- snapshot
  customer_snapshot JSONB NOT NULL,
  customer_notes   TEXT,
  assigned_to      INT REFERENCES users(id),
  source           TEXT NOT NULL DEFAULT 'web',
  locale           TEXT NOT NULL DEFAULT 'ar',
  cart_id          UUID,
  reservation_expires_at TIMESTAMPTZ,
  purchase_event_sent BOOLEAN NOT NULL DEFAULT FALSE,
  cancel_reason    TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX orders_created_idx ON orders(created_at);
CREATE INDEX orders_status_idx ON orders(status);

CREATE TABLE order_items (
  id            SERIAL PRIMARY KEY,
  order_id      INT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  variant_id    INT NOT NULL REFERENCES product_variants(id),
  unit_id       INT REFERENCES inventory_units(id),     -- one row per physical unit
  title         TEXT NOT NULL,
  unit_price    BIGINT NOT NULL,
  options       JSONB NOT NULL DEFAULT '[]',           -- [{id,label_ar,label_en,price}]
  options_total BIGINT NOT NULL DEFAULT 0,
  line_total    BIGINT NOT NULL,
  unit_cost     BIGINT                                  -- snapshot of purchase cost for profit reports
);
CREATE INDEX order_items_order_idx ON order_items(order_id);

CREATE TABLE order_events (
  id         SERIAL PRIMARY KEY,
  order_id   INT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  kind       TEXT NOT NULL,           -- status_change | note | payment | shipment | assignment
  from_value TEXT,
  to_value   TEXT,
  body       TEXT,
  internal   BOOLEAN NOT NULL DEFAULT TRUE,
  user_id    INT REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE stock_reservations (
  id          SERIAL PRIMARY KEY,
  unit_id     INT NOT NULL REFERENCES inventory_units(id),
  order_id    INT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  status      TEXT NOT NULL CHECK (status IN ('active','converted','released')),
  expires_at  TIMESTAMPTZ NOT NULL,
  released_reason TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- A unit can have at most one active reservation (DB-level double-sell guard)
CREATE UNIQUE INDEX one_active_reservation_per_unit ON stock_reservations(unit_id) WHERE status = 'active';

CREATE TABLE payments (
  id              SERIAL PRIMARY KEY,
  order_id        INT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  provider        TEXT NOT NULL,          -- cod | paymob | manual_transfer
  method          TEXT NOT NULL,          -- cod | card | wallet | instapay | bank_transfer
  amount          BIGINT NOT NULL,
  status          TEXT NOT NULL CHECK (status IN ('pending','paid','failed','cancelled','refunded')),
  provider_ref    TEXT,                   -- provider transaction id
  intention_ref   TEXT,                   -- provider intention / order id
  manual_reference TEXT,                  -- e.g. InstaPay reference recorded by staff
  recorded_by     INT REFERENCES users(id),
  paid_at         TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX payments_provider_ref_uq ON payments(provider, provider_ref) WHERE provider_ref IS NOT NULL;

CREATE TABLE payment_events (
  id                SERIAL PRIMARY KEY,
  payment_id        INT REFERENCES payments(id),
  provider          TEXT NOT NULL,
  provider_event_id TEXT NOT NULL,
  type              TEXT NOT NULL,
  signature_valid   BOOLEAN NOT NULL,
  payload           JSONB NOT NULL,
  processed         BOOLEAN NOT NULL DEFAULT FALSE,
  result            TEXT,
  received_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (provider, provider_event_id)
);

CREATE TABLE shipments (
  id           SERIAL PRIMARY KEY,
  order_id     INT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  carrier      TEXT,
  tracking_ref TEXT,
  status       TEXT NOT NULL DEFAULT 'created',
  shipped_at   TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE returns (
  id            SERIAL PRIMARY KEY,
  order_id      INT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  order_item_id INT REFERENCES order_items(id),
  reason        TEXT NOT NULL,
  status        TEXT NOT NULL DEFAULT 'requested' CHECK (status IN ('requested','approved','received','refunded','rejected')),
  refund_amount BIGINT,
  restock       BOOLEAN NOT NULL DEFAULT TRUE,
  created_by    INT REFERENCES users(id),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE reviews (
  id            SERIAL PRIMARY KEY,
  variant_id    INT NOT NULL REFERENCES product_variants(id) ON DELETE CASCADE,
  order_id      INT REFERENCES orders(id),     -- verified purchase link
  display_name  TEXT NOT NULL,
  rating        INT NOT NULL CHECK (rating BETWEEN 1 AND 5),
  body          TEXT,
  verified      BOOLEAN NOT NULL DEFAULT FALSE,
  approved      BOOLEAN NOT NULL DEFAULT FALSE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE wishlist_items (
  visitor_id  TEXT NOT NULL,
  variant_id  INT NOT NULL REFERENCES product_variants(id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (visitor_id, variant_id)
);

CREATE TABLE coupon_redemptions (
  id         SERIAL PRIMARY KEY,
  coupon_id  INT NOT NULL REFERENCES coupons(id),
  order_id   INT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  phone      TEXT NOT NULL,
  amount     BIGINT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE customer_leads (
  id          SERIAL PRIMARY KEY,
  source      TEXT NOT NULL,               -- whatsapp_product | whatsapp_cart | whatsapp_general | contact_form
  variant_id  INT REFERENCES product_variants(id),
  customer_id INT REFERENCES customers(id),
  name        TEXT,
  phone       TEXT,
  message     TEXT,
  page_url    TEXT,
  status      TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new','contacted','qualified','won','lost')),
  assigned_to INT REFERENCES users(id),
  notes       TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE audit_logs (
  id         BIGSERIAL PRIMARY KEY,
  user_id    INT REFERENCES users(id),
  action     TEXT NOT NULL,          -- product.price_change, unit.status_change, order.cancel, unit.cost_change ...
  entity     TEXT NOT NULL,
  entity_id  TEXT,
  before     JSONB,
  after      JSONB,
  ip         TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX audit_entity_idx ON audit_logs(entity, entity_id);
CREATE INDEX audit_created_idx ON audit_logs(created_at);

CREATE TABLE site_settings (
  key        TEXT PRIMARY KEY,
  value      JSONB NOT NULL,
  updated_by INT REFERENCES users(id),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE analytics_events (
  id         BIGSERIAL PRIMARY KEY,
  name       TEXT NOT NULL,         -- view_item, search, view_item_list, add_to_cart, begin_checkout, add_payment_info, purchase, generate_lead
  visitor_id TEXT,
  variant_id INT,
  order_id   INT,
  value      BIGINT,
  payload    JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- At most one purchase event per order (dedupe)
CREATE UNIQUE INDEX analytics_one_purchase_per_order ON analytics_events(order_id) WHERE name = 'purchase';
CREATE INDEX analytics_name_created_idx ON analytics_events(name, created_at);

CREATE TABLE IF NOT EXISTS schema_migrations (name TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now());
