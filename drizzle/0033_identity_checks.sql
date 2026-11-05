-- Identity check before withdrawals, admin-approved name changes, bank account name check on withdrawals.
ALTER TABLE users ADD COLUMN identity_status text NOT NULL DEFAULT 'none'
  CHECK (identity_status IN ('none', 'pending', 'info_needed', 'verified', 'rejected'));
ALTER TABLE users ADD COLUMN identity_verified_at timestamptz;

-- One identity check per customer (re-submitting updates it). ID number is stored encrypted (secretBox); last 4 shown.
CREATE TABLE identity_checks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE REFERENCES users(id),
  id_type text NOT NULL,
  id_number_enc text NOT NULL,
  id_last4 text NOT NULL,
  id_hash text NOT NULL,     -- HMAC of type+number, to spot one ID used on several accounts
  name_on_id text NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'info_needed', 'verified', 'rejected')),
  admin_note text,          -- question for the customer (info_needed) or reason (rejected)
  customer_reply text,      -- customer's answer to the admin's question
  submitted_at timestamptz NOT NULL DEFAULT now(),
  decided_at timestamptz,
  decided_by uuid REFERENCES users(id)
);
CREATE INDEX identity_checks_hash_idx ON identity_checks (id_hash);
CREATE INDEX identity_checks_status_idx ON identity_checks (status, submitted_at);

-- Name changes wait for an admin. At most one open request per customer.
CREATE TABLE name_change_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id),
  old_name text NOT NULL,
  new_name text NOT NULL,
  reason text NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'info_needed', 'approved', 'rejected', 'cancelled')),
  admin_note text,
  customer_reply text,
  created_at timestamptz NOT NULL DEFAULT now(),
  decided_at timestamptz,
  decided_by uuid REFERENCES users(id)
);
CREATE UNIQUE INDEX name_change_one_open ON name_change_requests (user_id) WHERE status IN ('pending', 'info_needed');
CREATE INDEX name_change_status_idx ON name_change_requests (status, created_at);

-- Private photos for both (ID front/back, selfie, extra documents). Admin-only.
CREATE TABLE kyc_files (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id),
  ref_type text NOT NULL CHECK (ref_type IN ('identity', 'name_change')),
  ref_id uuid NOT NULL,
  kind text NOT NULL CHECK (kind IN ('id_front', 'id_back', 'selfie', 'extra')),
  content_type text NOT NULL,
  data bytea NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX kyc_files_ref_idx ON kyc_files (ref_type, ref_id);

-- Withdrawals: the account name the bank reported (Flutterwave lookup) and whether it matched the profile name.
ALTER TABLE withdrawals ADD COLUMN bank_account_name text;
ALTER TABLE withdrawals ADD COLUMN name_check text CHECK (name_check IN ('match', 'unchecked'));
