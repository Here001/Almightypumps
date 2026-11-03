-- Admin-set fixed price for one app (kobo). NULL = use the markup.
ALTER TABLE sms_services ADD COLUMN fixed_price_kobo bigint CHECK (fixed_price_kobo IS NULL OR fixed_price_kobo > 0);
