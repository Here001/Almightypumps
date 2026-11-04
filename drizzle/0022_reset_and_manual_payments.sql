-- 1) "Forgot password": email codes can also be for a password reset.
ALTER TABLE email_codes DROP CONSTRAINT IF EXISTS email_codes_purpose_check;
ALTER TABLE email_codes ADD CONSTRAINT email_codes_purpose_check CHECK (purpose IN ('signup', 'login', 'reset'));

-- 2) Manual top-ups (bank transfer / crypto) while card payments are pending: the customer pays to the details the
-- admin set up, taps "I have made payment", admins get an email, and an admin confirms (wallet credited) or rejects.
CREATE TABLE manual_deposits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  public_id serial UNIQUE,
  user_id uuid NOT NULL REFERENCES users(id),
  method_id text NOT NULL,
  method_label text NOT NULL,              -- e.g. "USDT (TRC20)" / "Bank transfer: Opay"
  kind text NOT NULL CHECK (kind IN ('bank', 'crypto')),
  amount_kobo bigint NOT NULL CHECK (amount_kobo > 0),  -- what the customer asked to be credited
  pay_amount text NOT NULL,                -- what they were told to send, e.g. "31.25 USDT" or "₦50,000.00"
  proof text NOT NULL,                     -- transaction ID / hash, or the sender's name for a bank transfer
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'rejected')),
  credited_kobo bigint,
  admin_note text,
  decided_by uuid REFERENCES users(id),
  decided_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX manual_deposits_user_idx ON manual_deposits (user_id, created_at DESC);
CREATE INDEX manual_deposits_pending_idx ON manual_deposits (status) WHERE status = 'pending';
