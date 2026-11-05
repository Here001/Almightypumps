-- Admin → Users: suspend accounts, and keep a log of every admin action on a customer.
ALTER TABLE users ADD COLUMN suspended_at timestamptz;
ALTER TABLE users ADD COLUMN suspend_reason text;

CREATE TABLE admin_actions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id uuid NOT NULL REFERENCES users(id),
  user_id uuid NOT NULL REFERENCES users(id),
  action text NOT NULL,
  detail text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX admin_actions_user_idx ON admin_actions (user_id, created_at DESC);
