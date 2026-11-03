-- Browse columns for the customer catalogue, filled in at sync time from src/core/catalog.ts.
ALTER TABLE smm_services ADD COLUMN platform text NOT NULL DEFAULT 'More services';
ALTER TABLE smm_services ADD COLUMN kind text NOT NULL DEFAULT 'Other';
ALTER TABLE smm_services ADD COLUMN display_name text NOT NULL DEFAULT '';
CREATE INDEX smm_services_browse_idx ON smm_services(platform, kind, rate_kobo) WHERE active;
