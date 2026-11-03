-- Why a service is off sale: NULL = on sale, 'admin' = hidden by an admin (survives syncs),
-- 'policy' = not allowed (src/core/catalog.ts isRestricted), 'provider' = provider dropped it / priced it at 0.
ALTER TABLE smm_services ADD COLUMN hidden_reason text CHECK (hidden_reason IN ('admin', 'policy', 'provider'));
UPDATE smm_services SET hidden_reason = 'provider' WHERE NOT active;
