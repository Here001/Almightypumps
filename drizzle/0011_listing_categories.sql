-- P2P categories managed by admins, each with its own questions for sellers.
CREATE TABLE listing_categories (
  slug text PRIMARY KEY,
  name text NOT NULL,
  description text NOT NULL DEFAULT '',
  -- [{id, label, type: text|textarea|number|select|yesno, required, options?, help?}]
  questions jsonb NOT NULL DEFAULT '[]',
  -- Ads in this category wait for an admin before going live.
  requires_review boolean NOT NULL DEFAULT false,
  active boolean NOT NULL DEFAULT true,
  position integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO listing_categories (slug, name, position, requires_review) VALUES
  ('digital-products', 'Digital products', 1, false),
  ('gift-cards-crypto', 'Gift cards & crypto', 2, true),
  ('services', 'Services', 3, false),
  ('phones-gadgets', 'Phones & gadgets', 4, false),
  ('fashion', 'Fashion', 5, false),
  ('beauty', 'Beauty', 6, false),
  ('home', 'Home', 7, false),
  ('other', 'Other', 8, false)
ON CONFLICT (slug) DO NOTHING;

-- Seller's answers to the category questions, shown to buyers.
ALTER TABLE listings ADD COLUMN answers jsonb NOT NULL DEFAULT '{}';
