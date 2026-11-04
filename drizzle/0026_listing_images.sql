-- Photos on P2P ads (up to 6 per ad), stored in the database like shop pictures until we move to file storage.
CREATE TABLE listing_images (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id uuid NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
  position integer NOT NULL DEFAULT 0,
  content_type text NOT NULL,
  data bytea NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX listing_images_listing_idx ON listing_images (listing_id, position);
