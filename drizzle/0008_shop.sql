-- Platform shop: admin-managed categories and products (eSIMs, gift cards, ...).
ALTER TABLE holds DROP CONSTRAINT IF EXISTS holds_purpose_check;
ALTER TABLE holds ADD CONSTRAINT holds_purpose_check CHECK (purpose IN ('smm_order', 'escrow', 'withdrawal', 'shop_order'));

CREATE TABLE shop_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  name text NOT NULL,
  description text NOT NULL DEFAULT '',
  icon text NOT NULL DEFAULT 'bag',
  show_on_hub boolean NOT NULL DEFAULT true,
  active boolean NOT NULL DEFAULT true,
  position integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE shop_products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  public_id serial UNIQUE,
  category_id uuid NOT NULL REFERENCES shop_categories(id),
  name text NOT NULL,
  description text NOT NULL DEFAULT '',
  price bigint NOT NULL CHECK (price > 0),
  -- 'code': each buyer instantly gets the next code from shop_codes; 'manual': an admin delivers.
  delivery text NOT NULL CHECK (delivery IN ('code', 'manual')),
  -- Optional question for the buyer at checkout, e.g. "Email for your eSIM".
  ask_customer text,
  -- Manual products only: how many can still be sold (NULL = unlimited).
  stock_limit integer CHECK (stock_limit IS NULL OR stock_limit >= 0),
  active boolean NOT NULL DEFAULT true,
  position integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX shop_products_category_idx ON shop_products(category_id);

CREATE TABLE shop_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES shop_products(id),
  code text NOT NULL,
  order_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  used_at timestamptz,
  UNIQUE (product_id, code)
);
CREATE INDEX shop_codes_available_idx ON shop_codes(product_id) WHERE order_id IS NULL;

CREATE TABLE shop_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  public_id serial UNIQUE,
  user_id uuid NOT NULL REFERENCES users(id),
  product_id uuid NOT NULL REFERENCES shop_products(id),
  amount bigint NOT NULL CHECK (amount > 0),
  hold_id uuid NOT NULL REFERENCES holds(id),
  status text NOT NULL CHECK (status IN ('pending', 'delivered', 'refunded')),
  customer_input text,
  -- What the buyer receives: the code, or the admin's delivery message.
  delivered_content text,
  admin_note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX shop_orders_user_idx ON shop_orders(user_id, created_at DESC);
CREATE INDEX shop_orders_pending_idx ON shop_orders(status) WHERE status = 'pending';
