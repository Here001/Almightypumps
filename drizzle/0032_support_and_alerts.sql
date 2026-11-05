-- Support chat (one conversation per customer) + "email me about my orders" setting.
ALTER TABLE users ADD COLUMN notify_orders boolean NOT NULL DEFAULT true;

CREATE TABLE support_threads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE REFERENCES users(id),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed')),
  unread_admin boolean NOT NULL DEFAULT false,      -- customer wrote something the admins haven't read
  unread_customer boolean NOT NULL DEFAULT false,   -- an admin replied and the customer hasn't read it
  last_message_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX support_threads_inbox_idx ON support_threads (unread_admin DESC, last_message_at DESC);

CREATE TABLE support_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id uuid NOT NULL REFERENCES support_threads(id) ON DELETE CASCADE,
  sender text NOT NULL CHECK (sender IN ('customer', 'admin')),
  admin_id uuid REFERENCES users(id),
  body text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX support_messages_thread_idx ON support_messages (thread_id, created_at);
