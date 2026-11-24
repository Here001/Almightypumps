-- 2026-11-24: free "check my phone" for US eSIMs. A customer sends an IMEI (no money needed); an admin checks it
-- with the supplier and answers compatible / not compatible.
CREATE TABLE imei_checks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  public_id serial UNIQUE,
  user_id uuid NOT NULL REFERENCES users(id),
  imei text NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','compatible','incompatible')),
  note text,
  checked_by uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  checked_at timestamptz
);
CREATE INDEX imei_checks_user_idx ON imei_checks (user_id, created_at DESC);
CREATE INDEX imei_checks_pending_idx ON imei_checks (created_at) WHERE status = 'pending';
CREATE INDEX imei_checks_imei_idx ON imei_checks (imei, checked_at DESC);
