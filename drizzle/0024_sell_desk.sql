-- "Sell Gift Cards & Crypto": customers sell gift cards or crypto to the business for Naira. Manual review: the admin
-- checks the card / that the crypto arrived, then approves (wallet credited) or rejects with a reason.
CREATE TABLE trade_ins (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  public_id serial UNIQUE,
  user_id uuid NOT NULL REFERENCES users(id),
  kind text NOT NULL CHECK (kind IN ('giftcard', 'crypto')),
  item_id text NOT NULL,                 -- card or coin id from the admin's settings
  item_label text NOT NULL,              -- e.g. "Amazon (USA) · e-code" / "USDT (TRC20)"
  card_form text CHECK (card_form IN ('ecode', 'physical')),
  value numeric(14, 2) NOT NULL CHECK (value > 0),   -- card value in its currency, or US$ for crypto
  currency text NOT NULL,
  rate_kobo bigint NOT NULL CHECK (rate_kobo > 0),   -- ₦ per 1 unit at the time of the trade (kobo)
  payout_kobo bigint NOT NULL CHECK (payout_kobo > 0),
  proof text NOT NULL DEFAULT '',        -- e-code / transaction hash
  note text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'paid', 'rejected')),
  paid_kobo bigint,
  admin_note text,
  decided_by uuid REFERENCES users(id),
  decided_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX trade_ins_user_idx ON trade_ins (user_id, created_at DESC);
CREATE INDEX trade_ins_pending_idx ON trade_ins (status) WHERE status = 'pending';

-- Card photos / screenshots (kept in their own table so lists stay light).
CREATE TABLE trade_in_images (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trade_in_id uuid NOT NULL REFERENCES trade_ins(id) ON DELETE CASCADE,
  content_type text NOT NULL,
  data bytea NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX trade_in_images_trade_idx ON trade_in_images (trade_in_id);
