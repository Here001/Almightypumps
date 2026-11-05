-- Ad photos move to Vercel Blob file storage: new photos keep only their public URL here (data stays NULL).
-- Older photos keep their bytes until the cron moves them across.
ALTER TABLE listing_images ADD COLUMN url text;
ALTER TABLE listing_images ALTER COLUMN data DROP NOT NULL;
ALTER TABLE listing_images ADD CONSTRAINT listing_images_has_photo CHECK (data IS NOT NULL OR url IS NOT NULL);
