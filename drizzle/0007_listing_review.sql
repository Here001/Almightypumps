-- Borderline listings wait for an admin ('pending'); admins can decline them ('declined').
ALTER TABLE listings DROP CONSTRAINT IF EXISTS listings_status_check;
ALTER TABLE listings ADD CONSTRAINT listings_status_check CHECK (status IN ('active', 'paused', 'removed', 'pending', 'declined'));
ALTER TABLE listings ADD COLUMN review_note text;
