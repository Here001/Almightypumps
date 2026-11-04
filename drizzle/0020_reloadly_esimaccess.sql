-- Instant products from APIs:
--   Reloadly: gift cards (codes) and Nigerian airtime + data.
--   eSIM Access: travel data eSIMs.
-- Pay-on-delivery like the rest of the site: hold on order, capture when the provider delivers, release if it fails.
ALTER TABLE holds DROP CONSTRAINT IF EXISTS holds_purpose_check;
ALTER TABLE holds ADD CONSTRAINT holds_purpose_check CHECK (purpose IN
  ('smm_order', 'escrow', 'withdrawal', 'shop_order', 'sms_verify', 'esim_order', 'gift_card', 'airtime', 'travel_esim'));

-- Reloadly gift card catalogue (synced daily for the countries chosen in /admin/gift-cards).
CREATE TABLE gift_products (
  product_id integer PRIMARY KEY,
  country text NOT NULL,                     -- ISO code, e.g. US
  name text NOT NULL,
  brand text NOT NULL,
  data jsonb NOT NULL,                       -- denominations, fees, currency, logo, redeem instructions
  hidden boolean NOT NULL DEFAULT false,     -- admin can hide one
  featured boolean NOT NULL DEFAULT false,   -- admin star: shown first
  seen_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX gift_products_country_idx ON gift_products (country);

CREATE TABLE gift_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  public_id serial UNIQUE,
  user_id uuid NOT NULL REFERENCES users(id),
  product_id integer NOT NULL,
  product_name text NOT NULL,
  country text NOT NULL,
  face_value numeric(12, 2) NOT NULL,        -- card value in its own currency
  face_currency text NOT NULL,
  price_kobo bigint NOT NULL CHECK (price_kobo > 0),
  cost numeric(14, 4),                       -- what Reloadly charged us, in cost_currency
  cost_currency text,
  hold_id uuid NOT NULL REFERENCES holds(id),
  -- pending (sent / waiting for codes) | delivered (codes shown, charged) | refunded | failed (never sent)
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'delivered', 'refunded', 'failed')),
  provider_tx text,
  codes_enc text,                            -- card numbers + PINs, encrypted
  error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX gift_orders_user_idx ON gift_orders (user_id, created_at DESC);
CREATE INDEX gift_orders_pending_idx ON gift_orders (status) WHERE status = 'pending';

-- Airtime and data top-ups (Nigeria) through Reloadly.
CREATE TABLE topup_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  public_id serial UNIQUE,
  user_id uuid NOT NULL REFERENCES users(id),
  kind text NOT NULL CHECK (kind IN ('airtime', 'data')),
  network text NOT NULL,                     -- MTN, Airtel, Glo, 9mobile
  operator_id integer NOT NULL,
  phone text NOT NULL,                       -- 0803…
  description text NOT NULL,                 -- "₦1,000 airtime" / data plan name
  send_amount numeric(14, 4) NOT NULL,       -- amount sent to Reloadly, in send_currency
  send_currency text NOT NULL,
  price_kobo bigint NOT NULL CHECK (price_kobo > 0),
  hold_id uuid NOT NULL REFERENCES holds(id),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'delivered', 'refunded', 'failed')),
  provider_tx text,
  error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX topup_orders_user_idx ON topup_orders (user_id, created_at DESC);
CREATE INDEX topup_orders_pending_idx ON topup_orders (status) WHERE status = 'pending';

-- eSIM Access travel data packages (synced daily).
CREATE TABLE travel_packages (
  code text PRIMARY KEY,                     -- packageCode
  slug text,
  name text NOT NULL,
  price_e4 integer NOT NULL,                 -- wholesale price in US$ × 10,000
  volume_bytes bigint NOT NULL,
  duration integer NOT NULL,
  duration_unit text NOT NULL DEFAULT 'DAY',
  locations text[] NOT NULL DEFAULT '{}',    -- ISO country codes covered
  description text NOT NULL DEFAULT '',
  hidden boolean NOT NULL DEFAULT false,
  seen_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX travel_packages_locations_idx ON travel_packages USING gin (locations);

CREATE TABLE travel_esim_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  public_id serial UNIQUE,
  user_id uuid NOT NULL REFERENCES users(id),
  package_code text NOT NULL,
  package_name text NOT NULL,
  price_kobo bigint NOT NULL CHECK (price_kobo > 0),
  cost_e4 integer NOT NULL,
  hold_id uuid NOT NULL REFERENCES holds(id),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'delivered', 'refunded', 'failed')),
  provider_order_no text,
  esim_tran_no text,
  iccid text,
  lpa text,                                  -- activation code LPA:1$…
  error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX travel_esim_orders_user_idx ON travel_esim_orders (user_id, created_at DESC);
CREATE INDEX travel_esim_orders_pending_idx ON travel_esim_orders (status) WHERE status = 'pending';

-- Settings (markups in basis points: 1500 = +15%). Editable in the admin.
INSERT INTO app_settings (key, value) VALUES
  ('gift_cards', '{"markupBps": 1500, "enabled": true, "countries": ["US", "GB", "CA", "NG"]}'),
  ('airtime', '{"airtimeMarkupBps": 0, "dataMarkupBps": 0, "enabled": true}'),
  ('travel_esim', '{"markupBps": 15000, "enabled": true}')
ON CONFLICT (key) DO NOTHING;
