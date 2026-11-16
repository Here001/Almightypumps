-- 2026-11-16: buyers can ask the seller to cancel a P2P order (seller accepts = refund, refuses = dispute)
-- and report a seller to the admins.
ALTER TABLE trades ADD COLUMN cancel_status text CHECK (cancel_status IN ('pending','accepted','rejected','expired','closed'));
ALTER TABLE trades ADD COLUMN cancel_reason text;
ALTER TABLE trades ADD COLUMN cancel_requested_at timestamptz;
CREATE INDEX trades_cancel_pending_idx ON trades (cancel_requested_at) WHERE cancel_status = 'pending';

CREATE TABLE seller_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  public_id serial UNIQUE,
  trade_id uuid NOT NULL REFERENCES trades(id),
  reporter_id uuid NOT NULL REFERENCES users(id),
  seller_id uuid NOT NULL REFERENCES users(id),
  reason text NOT NULL,
  details text,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','closed')),
  admin_note text,
  closed_by uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  closed_at timestamptz,
  UNIQUE (trade_id, reporter_id)
);
CREATE INDEX seller_reports_open_idx ON seller_reports (created_at) WHERE status = 'open';
CREATE INDEX seller_reports_seller_idx ON seller_reports (seller_id);
