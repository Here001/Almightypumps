-- The same service sold by two providers = same platform + type + name (letters/numbers only, any case).
-- Customers see one product per match_key at the cheapest price; disconnecting a provider switches
-- shared products to the other one automatically.
ALTER TABLE smm_services ADD COLUMN match_key text GENERATED ALWAYS AS (
  platform || '|' || kind || '|' || btrim(lower(regexp_replace(coalesce(nullif(display_name, ''), name), '[^[:alnum:]]+', ' ', 'g')))
) STORED;
CREATE INDEX smm_services_match_idx ON smm_services (match_key, rate_kobo) WHERE active;
