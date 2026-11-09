-- WhatsApp agent: customers link their WhatsApp number to their account, chat with the AI assistant, and buy with "YES".
CREATE TABLE whatsapp_links (
  phone text PRIMARY KEY,                                   -- digits only, international format (e.g. 2348031234567)
  user_id uuid NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  linked_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE whatsapp_link_codes (
  user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  code_hash text NOT NULL,
  expires_at timestamptz NOT NULL
);

CREATE TABLE whatsapp_chats (
  phone text PRIMARY KEY,
  history jsonb NOT NULL DEFAULT '[]'::jsonb,              -- last turns as [{role, text}]
  pending jsonb,                                            -- a purchase waiting for the customer's YES
  pending_at timestamptz,
  last_in_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE whatsapp_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  wa_id text UNIQUE,                                        -- WhatsApp message id (incoming), stops double replies
  phone text NOT NULL,
  user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  direction text NOT NULL CHECK (direction IN ('in', 'out')),
  body text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX whatsapp_messages_phone_idx ON whatsapp_messages (phone, created_at DESC);
CREATE INDEX whatsapp_messages_created_idx ON whatsapp_messages (created_at DESC);

CREATE TABLE whatsapp_ai_usage (
  day date PRIMARY KEY,                                     -- Lagos day
  replies integer NOT NULL DEFAULT 0,
  input_tokens bigint NOT NULL DEFAULT 0,
  output_tokens bigint NOT NULL DEFAULT 0,
  cost_micro_usd bigint NOT NULL DEFAULT 0
);
