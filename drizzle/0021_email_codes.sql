-- Email codes replace the Cloudflare robot check: a 6-digit code when signing up (proves the email is real)
-- and when logging in on a device we haven't seen before. Devices that passed are trusted for 30 days.
ALTER TABLE users ADD COLUMN email_verified_at timestamptz;
-- Accounts that already exist keep working without a code.
UPDATE users SET email_verified_at = created_at WHERE email_verified_at IS NULL;

CREATE TABLE email_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  purpose text NOT NULL CHECK (purpose IN ('signup', 'login')),
  code_hash text NOT NULL,                 -- HMAC of the code; the code itself is never stored
  attempts integer NOT NULL DEFAULT 0,
  remember boolean NOT NULL DEFAULT false, -- "Remember me" choice, applied once the code is right
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX email_codes_user_idx ON email_codes (user_id, created_at DESC);

CREATE TABLE trusted_devices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE,         -- sha256 of the random value in the ap_device cookie
  created_at timestamptz NOT NULL DEFAULT now(),
  last_used_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL
);
CREATE INDEX trusted_devices_user_idx ON trusted_devices (user_id);
