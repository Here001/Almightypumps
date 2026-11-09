-- Name of the limit each counter belongs to, so Admin › Limits & usage can show requests and blocks per rule.
ALTER TABLE rate_limits ADD COLUMN rule text;
CREATE INDEX rate_limits_rule_idx ON rate_limits (rule, window_start);
