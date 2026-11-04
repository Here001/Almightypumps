-- Orders accepted while a supplier (SMM panel, Reloadly, eSIM Access) has no balance: the customer's money stays held,
-- the owner is emailed to top up, and the cron retries every 5 minutes until it goes through (refund after 72 hours).
ALTER TABLE smm_orders DROP CONSTRAINT IF EXISTS smm_orders_status_check;
ALTER TABLE smm_orders ADD CONSTRAINT smm_orders_status_check CHECK (status IN ('QUEUED', 'PENDING', 'PROCESSING', 'COMPLETED', 'PARTIAL', 'CANCELLED', 'FAILED'));
CREATE INDEX smm_orders_queued_idx ON smm_orders (created_at) WHERE status = 'QUEUED';
ALTER TABLE gift_orders ADD COLUMN waiting_funds boolean NOT NULL DEFAULT false;
ALTER TABLE topup_orders ADD COLUMN waiting_funds boolean NOT NULL DEFAULT false;
ALTER TABLE travel_esim_orders ADD COLUMN waiting_funds boolean NOT NULL DEFAULT false;
