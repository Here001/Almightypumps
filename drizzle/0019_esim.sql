-- eSIMs sold by hand: the admin sets up plans and prices, customers order, the admin buys the eSIM from the
-- supplier and delivers the number + activation code/QR. Money is held on order, captured on delivery,
-- refunded if the admin cancels.
ALTER TABLE holds DROP CONSTRAINT IF EXISTS holds_purpose_check;
ALTER TABLE holds ADD CONSTRAINT holds_purpose_check CHECK (purpose IN ('smm_order', 'escrow', 'withdrawal', 'shop_order', 'sms_verify', 'esim_order'));

CREATE TABLE esim_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,                       -- e.g. "USA eSIM"
  network text NOT NULL DEFAULT '',         -- e.g. "AT&T network"
  description text NOT NULL DEFAULT '',
  -- Offer "keep your existing number" (port-in) and what it costs extra.
  allow_keep_number boolean NOT NULL DEFAULT true,
  keep_number_fee bigint NOT NULL DEFAULT 0 CHECK (keep_number_fee >= 0),
  active boolean NOT NULL DEFAULT true,
  position integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- One price per data size and length, e.g. 3GB for 3 months = ₦12,000.
CREATE TABLE esim_prices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id uuid NOT NULL REFERENCES esim_plans(id) ON DELETE CASCADE,
  data_label text NOT NULL,                 -- "1GB", "Unlimited"
  months integer NOT NULL CHECK (months BETWEEN 1 AND 24),
  price bigint NOT NULL CHECK (price > 0),
  active boolean NOT NULL DEFAULT true,
  UNIQUE (plan_id, data_label, months)
);

CREATE TABLE esim_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  public_id serial UNIQUE,
  user_id uuid NOT NULL REFERENCES users(id),
  plan_id uuid NOT NULL REFERENCES esim_plans(id),
  plan_name text NOT NULL,
  data_label text NOT NULL,
  months integer NOT NULL,
  amount bigint NOT NULL CHECK (amount > 0),
  hold_id uuid NOT NULL REFERENCES holds(id),
  imei text NOT NULL,
  number_mode text NOT NULL CHECK (number_mode IN ('new', 'keep')),
  -- Port-in details (number, carrier, account no., PIN, ZIP) encrypted; wiped after delivery/refund.
  port_enc text,
  port_number text,                         -- the number being kept (not secret), for the admin list
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'delivered', 'refunded')),
  phone_number text,                        -- the US number the eSIM got
  lpa text,                                 -- activation code (QR content)
  qr_image bytea,                           -- or a QR picture from the supplier
  qr_type text,
  customer_note text,                       -- instructions shown to the customer
  admin_note text,                          -- refund reason etc.
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX esim_orders_user_idx ON esim_orders (user_id, created_at DESC);
CREATE INDEX esim_orders_pending_idx ON esim_orders (status) WHERE status = 'pending';
