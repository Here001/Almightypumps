-- Add providers from the admin page: the API key is stored encrypted (AES-256-GCM, see src/server/secretBox.ts).
-- api_key_env stays for providers whose key lives in Vercel (e.g. Owlet); '' when the key is stored here.
ALTER TABLE smm_providers ADD COLUMN api_key_enc text;
ALTER TABLE smm_providers ADD COLUMN api_key_hint text;
-- For non-Naira panels: take the exchange rate from the site's dollar rate on every sync.
ALTER TABLE smm_providers ADD COLUMN fx_auto boolean NOT NULL DEFAULT false;
