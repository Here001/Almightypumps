-- P2P negotiable ads: no fixed price; buyers make offers (money held), sellers accept, decline or counter.
ALTER TABLE listings ALTER COLUMN price DROP NOT NULL;
ALTER TABLE listings ADD COLUMN negotiable boolean NOT NULL DEFAULT false;
ALTER TABLE listings ADD COLUMN guide_price bigint;      -- optional "asking around" shown to buyers (kobo per item)
ALTER TABLE listings ADD COLUMN min_offer bigint;        -- optional lowest offer per item, hidden from buyers (kobo)

CREATE TABLE offers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  public_id serial UNIQUE,
  listing_id uuid NOT NULL REFERENCES listings(id),
  buyer_id uuid NOT NULL REFERENCES users(id),
  seller_id uuid NOT NULL REFERENCES users(id),
  quantity integer NOT NULL CHECK (quantity > 0),
  unit_price bigint NOT NULL CHECK (unit_price > 0),       -- the buyer's offer per item (kobo); money held = unit_price × quantity
  counter_price bigint,                                    -- seller's counter per item, waiting for the buyer
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'countered', 'accepted', 'declined', 'withdrawn', 'expired')),
  hold_id uuid NOT NULL REFERENCES holds(id),
  note text,
  trade_id uuid REFERENCES trades(id),
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX offers_seller_idx ON offers (seller_id, status, created_at DESC);
CREATE INDEX offers_buyer_idx ON offers (buyer_id, status, created_at DESC);
CREATE INDEX offers_open_idx ON offers (expires_at) WHERE status IN ('pending', 'countered');
CREATE UNIQUE INDEX offers_one_open_per_buyer ON offers (listing_id, buyer_id) WHERE status IN ('pending', 'countered');
