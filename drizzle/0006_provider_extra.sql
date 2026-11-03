-- Non-standard fields a provider sends per service (e.g. its "recommended" badge), kept for inspection.
ALTER TABLE smm_services ADD COLUMN provider_extra jsonb;
