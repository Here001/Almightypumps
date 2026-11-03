-- Provider's display name for each service ("WhatsApp"), shown to customers.
ALTER TABLE sms_services ADD COLUMN label text;
ALTER TABLE sms_verifications ADD COLUMN label text;
-- Re-sync on the next cron run so the new names fill in.
UPDATE app_settings SET value = value - 'syncedAt' WHERE key = 'sms_verify';
