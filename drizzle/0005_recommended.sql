-- provider_recommended: the provider flags it (refreshed every sync).
-- featured: an admin starred it in /admin/services (kept across syncs).
-- Customers see recommended/featured services first, then cheapest.
ALTER TABLE smm_services ADD COLUMN provider_recommended boolean NOT NULL DEFAULT false;
ALTER TABLE smm_services ADD COLUMN featured boolean NOT NULL DEFAULT false;
