-- Almighty Pumps: initial schema. Money columns are integer kobo.
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL UNIQUE,
  password_hash text NOT NULL,
  name text NOT NULL,
  phone text,
  role text NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'admin')),
  seller_status text NOT NULL DEFAULT 'none' CHECK (seller_status IN ('none', 'pending', 'verified', 'rejected')),
  is_system boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE wallets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE REFERENCES users(id) ON DELETE RESTRICT,
  available bigint NOT NULL DEFAULT 0 CHECK (available >= 0),
  held bigint NOT NULL DEFAULT 0 CHECK (held >= 0),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE holds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet_id uuid NOT NULL REFERENCES wallets(id),
  amount bigint NOT NULL CHECK (amount > 0),
  settled bigint NOT NULL DEFAULT 0 CHECK (settled >= 0 AND settled <= amount),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'captured', 'released', 'partial')),
  purpose text NOT NULL CHECK (purpose IN ('smm_order', 'escrow', 'withdrawal')),
  ref_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  closed_at timestamptz
);
CREATE INDEX holds_wallet_idx ON holds(wallet_id);

CREATE TABLE ledger_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet_id uuid NOT NULL REFERENCES wallets(id),
  kind text NOT NULL,
  available_change bigint NOT NULL,
  held_change bigint NOT NULL,
  available_after bigint NOT NULL,
  held_after bigint NOT NULL,
  ref_type text,
  ref_id text,
  memo text,
  idempotency_key text UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ledger_wallet_idx ON ledger_entries(wallet_id, created_at DESC);

CREATE TABLE payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id),
  reference text NOT NULL UNIQUE,
  amount bigint NOT NULL CHECK (amount > 0),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'success', 'failed')),
  provider text NOT NULL DEFAULT 'paystack',
  raw jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  paid_at timestamptz
);

CREATE TABLE withdrawals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id),
  amount bigint NOT NULL CHECK (amount > 0),
  hold_id uuid NOT NULL REFERENCES holds(id),
  bank_code text NOT NULL,
  account_number text NOT NULL,
  account_name text NOT NULL,
  status text NOT NULL DEFAULT 'requested' CHECK (status IN ('requested', 'paid', 'rejected')),
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  decided_at timestamptz
);

CREATE TABLE smm_providers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  api_url text NOT NULL,
  api_key_env text NOT NULL,
  currency text NOT NULL DEFAULT 'NGN',
  fx_kobo_per_unit integer NOT NULL DEFAULT 100 CHECK (fx_kobo_per_unit > 0),
  markup_bps integer NOT NULL DEFAULT 3000 CHECK (markup_bps >= 0),
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE smm_services (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  public_id serial UNIQUE,
  provider_id uuid NOT NULL REFERENCES smm_providers(id),
  provider_service_id text NOT NULL,
  name text NOT NULL,
  category text NOT NULL,
  type text NOT NULL DEFAULT 'Default',
  provider_rate text NOT NULL,
  rate_kobo bigint NOT NULL CHECK (rate_kobo > 0),
  min_qty integer NOT NULL,
  max_qty integer NOT NULL,
  refill boolean NOT NULL DEFAULT false,
  cancel boolean NOT NULL DEFAULT false,
  active boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (provider_id, provider_service_id)
);

CREATE TABLE api_keys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id),
  key_hash text NOT NULL UNIQUE,
  prefix text NOT NULL,
  label text NOT NULL DEFAULT 'Default',
  created_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz
);

CREATE TABLE smm_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  public_id serial UNIQUE,
  user_id uuid NOT NULL REFERENCES users(id),
  service_id uuid NOT NULL REFERENCES smm_services(id),
  link text NOT NULL,
  quantity integer NOT NULL CHECK (quantity > 0),
  cost bigint NOT NULL CHECK (cost > 0),
  charged bigint NOT NULL DEFAULT 0,
  hold_id uuid NOT NULL REFERENCES holds(id),
  provider_order_id text,
  status text NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'PROCESSING', 'COMPLETED', 'PARTIAL', 'CANCELLED', 'FAILED')),
  start_count integer,
  remains integer,
  error text,
  api_key_id uuid REFERENCES api_keys(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX smm_orders_user_idx ON smm_orders(user_id, created_at DESC);
CREATE INDEX smm_orders_open_idx ON smm_orders(status) WHERE status IN ('PENDING', 'PROCESSING');

CREATE TABLE listings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  seller_id uuid NOT NULL REFERENCES users(id),
  title text NOT NULL,
  description text NOT NULL,
  category text NOT NULL,
  delivery_type text NOT NULL,
  price bigint NOT NULL CHECK (price > 0),
  stock integer NOT NULL CHECK (stock >= 0),
  min_qty integer NOT NULL DEFAULT 1,
  max_qty integer NOT NULL DEFAULT 1,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused', 'removed')),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX listings_browse_idx ON listings(status, category, created_at DESC);

CREATE TABLE trades (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  public_id serial UNIQUE,
  listing_id uuid NOT NULL REFERENCES listings(id),
  buyer_id uuid NOT NULL REFERENCES users(id),
  seller_id uuid NOT NULL REFERENCES users(id),
  quantity integer NOT NULL CHECK (quantity > 0),
  amount bigint NOT NULL CHECK (amount > 0),
  fee bigint NOT NULL DEFAULT 0,
  hold_id uuid NOT NULL REFERENCES holds(id),
  status text NOT NULL DEFAULT 'PAID' CHECK (status IN ('PAID', 'SHIPPED', 'DISPUTED', 'COMPLETED', 'CANCELLED', 'REFUNDED')),
  ship_by timestamptz NOT NULL,
  shipped_at timestamptz,
  inspection_ends_at timestamptz,
  closed_at timestamptz,
  delivery_proof text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (buyer_id <> seller_id)
);
CREATE INDEX trades_buyer_idx ON trades(buyer_id, created_at DESC);
CREATE INDEX trades_seller_idx ON trades(seller_id, created_at DESC);
CREATE INDEX trades_timer_idx ON trades(status, ship_by, inspection_ends_at) WHERE status IN ('PAID', 'SHIPPED');

CREATE TABLE trade_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trade_id uuid NOT NULL REFERENCES trades(id),
  actor_id uuid REFERENCES users(id),
  action text NOT NULL,
  from_status text,
  to_status text NOT NULL,
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX trade_events_trade_idx ON trade_events(trade_id, created_at);

CREATE TABLE trade_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trade_id uuid NOT NULL REFERENCES trades(id),
  sender_id uuid NOT NULL REFERENCES users(id),
  body text NOT NULL CHECK (char_length(body) BETWEEN 1 AND 2000),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX trade_messages_trade_idx ON trade_messages(trade_id, created_at);

CREATE TABLE disputes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trade_id uuid NOT NULL UNIQUE REFERENCES trades(id),
  opened_by uuid NOT NULL REFERENCES users(id),
  reason text NOT NULL,
  resolution text,
  resolved_by uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz
);

-- The platform's own wallet receives fees and SMM revenue.
INSERT INTO users (email, password_hash, name, role, is_system)
VALUES ('platform@almightypumps.internal', '!', 'Almighty Pumps Platform', 'admin', true);
INSERT INTO wallets (user_id) SELECT id FROM users WHERE is_system = true;
