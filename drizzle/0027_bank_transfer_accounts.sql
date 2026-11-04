-- Automatic bank-transfer top-ups through Flutterwave virtual account numbers.
-- 'onetime' = a temporary account for one exact amount (no BVN); 'permanent' = the customer's own account
-- number (needs their BVN once; the BVN itself is never stored).
CREATE TABLE virtual_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id),
  kind text NOT NULL CHECK (kind IN ('onetime', 'permanent')),
  tx_ref text NOT NULL UNIQUE,
  account_number text NOT NULL,
  bank_name text NOT NULL,
  account_name text,
  amount_kobo bigint,                    -- onetime only: the exact amount to send
  expires_at timestamptz,                -- onetime only
  flw_ref text,
  order_ref text,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paid', 'expired')),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX virtual_accounts_user_idx ON virtual_accounts (user_id, created_at DESC);
CREATE UNIQUE INDEX virtual_accounts_one_permanent ON virtual_accounts (user_id) WHERE kind = 'permanent';
