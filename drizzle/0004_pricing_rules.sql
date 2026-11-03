-- Markup overrides. Most specific wins: platform+kind, then platform (kind NULL), then the provider's markup.
CREATE TABLE smm_pricing_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  platform text NOT NULL,
  kind text,
  markup_bps integer NOT NULL CHECK (markup_bps >= 0 AND markup_bps <= 50000),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX smm_pricing_rules_scope ON smm_pricing_rules(platform, coalesce(kind, ''));

-- Small admin-editable settings (e.g. min_order_kobo).
CREATE TABLE app_settings (
  key text PRIMARY KEY,
  value jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
