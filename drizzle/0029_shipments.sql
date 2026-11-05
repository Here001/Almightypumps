-- "Send a Package": real parcel delivery through Terminal Africa (T-Ship). A row starts as a quote (addresses, parcel and
-- the carriers' prices), becomes 'booked' once the customer pays and a pickup is arranged, then follows tracking updates.
ALTER TABLE holds DROP CONSTRAINT IF EXISTS holds_purpose_check;
ALTER TABLE holds ADD CONSTRAINT holds_purpose_check CHECK (purpose IN
  ('smm_order', 'escrow', 'withdrawal', 'shop_order', 'sms_verify', 'esim_order', 'gift_card', 'airtime', 'travel_esim', 'shipping'));

CREATE TABLE shipments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,                 -- our tracking number shown to customers, e.g. AP7K3Q9M2X
  user_id uuid NOT NULL REFERENCES users(id),
  status text NOT NULL DEFAULT 'quoted' CHECK (status IN ('quoted', 'booking', 'booked', 'in_transit', 'delivered', 'cancelled', 'failed')),
  from_address jsonb NOT NULL,
  to_address jsonb NOT NULL,
  parcel jsonb NOT NULL,                     -- {description, items[], weightKg, valueKobo|valueUsd}
  provider_from_id text,
  provider_to_id text,
  provider_parcel_id text,
  rates jsonb NOT NULL DEFAULT '[]',         -- carriers' offers with our price
  rate_id text,
  carrier text,
  carrier_logo text,
  delivery_time text,
  price_kobo bigint,                         -- what the customer paid
  cost_kobo bigint,                          -- what the carrier charged us
  hold_id uuid REFERENCES holds(id),
  provider_shipment_id text,
  carrier_tracking text,
  tracking_url text,
  label_url text,
  events jsonb NOT NULL DEFAULT '[]',
  last_tracked_at timestamptz,
  error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  delivered_at timestamptz
);
CREATE INDEX shipments_user_idx ON shipments (user_id, created_at DESC);
CREATE INDEX shipments_active_idx ON shipments (status) WHERE status IN ('booked', 'in_transit');
CREATE INDEX shipments_carrier_tracking_idx ON shipments (carrier_tracking);
