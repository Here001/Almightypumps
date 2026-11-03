-- Anonymous page/section views for the admin Insights page.
-- visitor is a random id from a first-party cookie; no IP addresses or user agents are stored.
CREATE TABLE site_events (
  id bigserial PRIMARY KEY,
  at timestamptz NOT NULL DEFAULT now(),
  visitor text NOT NULL,
  user_id uuid REFERENCES users(id),
  section text NOT NULL,
  path text NOT NULL
);
CREATE INDEX site_events_at_idx ON site_events(at);
