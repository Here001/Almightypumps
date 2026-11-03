-- Seller applications: who they are, where to pay them, and an ID for verification.
-- ID numbers are personal data: only admins can read them (NDPR).
CREATE TABLE seller_profiles (
  user_id uuid PRIMARY KEY REFERENCES users(id),
  business_name text NOT NULL,
  contact_phone text NOT NULL,
  bank_name text NOT NULL,
  bank_code text NOT NULL,
  account_number text NOT NULL CHECK (account_number ~ '^[0-9]{10}$'),
  account_name text NOT NULL,
  id_type text NOT NULL CHECK (id_type IN ('nin', 'drivers_license', 'passport', 'voters_card')),
  id_number text NOT NULL,
  what_they_sell text NOT NULL DEFAULT '',
  review_note text,
  submitted_at timestamptz NOT NULL DEFAULT now(),
  decided_at timestamptz
);
