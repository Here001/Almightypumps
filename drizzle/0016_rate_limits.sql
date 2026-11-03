-- Fixed-window request counters for rate limiting (keys are hashed; no raw IPs or emails stored).
CREATE TABLE rate_limits (
  key text NOT NULL,
  window_start timestamptz NOT NULL,
  count integer NOT NULL DEFAULT 1,
  PRIMARY KEY (key, window_start)
);
CREATE INDEX rate_limits_window_idx ON rate_limits (window_start);
