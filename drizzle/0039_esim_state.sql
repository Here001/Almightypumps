-- 2026-11-24: the US state the customer wants their new eSIM number from (2-letter code; null for older orders / kept numbers).
ALTER TABLE esim_orders ADD COLUMN us_state text;
