-- Shop picture (display picture) for sellers. Small square image, resized in the browser.
-- Kept in its own table so seller/profile queries never load the image bytes.
CREATE TABLE seller_avatars (
  user_id uuid PRIMARY KEY REFERENCES users(id),
  content_type text NOT NULL,
  data bytea NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
