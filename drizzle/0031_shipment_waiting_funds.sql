-- Packages whose booking failed only because the Terminal Africa wallet was empty now wait (money held) instead of
-- being refunded; they're booked when the admin taps "Retry all now" (or by the next automatic retry).
ALTER TABLE shipments DROP CONSTRAINT IF EXISTS shipments_status_check;
ALTER TABLE shipments ADD CONSTRAINT shipments_status_check CHECK (status IN ('quoted', 'booking', 'waiting_funds', 'booked', 'in_transit', 'delivered', 'cancelled', 'failed'));
