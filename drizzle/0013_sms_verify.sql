-- "Get Verification Code": one-time SMS numbers from TextVerified, resold with a markup.
ALTER TABLE holds DROP CONSTRAINT IF EXISTS holds_purpose_check;
ALTER TABLE holds ADD CONSTRAINT holds_purpose_check CHECK (purpose IN ('smm_order', 'escrow', 'withdrawal', 'shop_order', 'sms_verify'));

-- Services TextVerified can receive codes for (WhatsApp, Telegram, ...). Price is cached on demand.
CREATE TABLE sms_services (
  name text PRIMARY KEY,                 -- provider's serviceName, e.g. "whatsapp"
  hidden boolean NOT NULL DEFAULT false, -- admin can hide one
  cost_usd_milli integer,                -- provider price in 1/1000 US$, null = not priced yet
  priced_at timestamptz,
  seen_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE sms_verifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id),
  service_name text NOT NULL,
  provider_id text UNIQUE,
  number text,
  -- pending (waiting for code) | completed (code received, charged) | refunded (no code / cancelled) | failed (never started)
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'refunded', 'failed')),
  price_kobo bigint NOT NULL,
  cost_usd_milli integer NOT NULL,
  hold_id uuid REFERENCES holds(id),
  code text,
  sms_text text,
  ends_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX sms_verifications_user_idx ON sms_verifications (user_id, created_at DESC);
CREATE INDEX sms_verifications_pending_idx ON sms_verifications (status) WHERE status = 'pending';

-- Markup for verification codes: 30000 bps = +300% (customer pays 4x our cost).
INSERT INTO app_settings (key, value) VALUES ('sms_verify', '{"markupBps": 30000, "enabled": true}') ON CONFLICT (key) DO NOTHING;
