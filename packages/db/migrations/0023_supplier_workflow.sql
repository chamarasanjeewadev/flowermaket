-- Deliberate additive migration: existing generated snapshot predates custom 0018–0022.
ALTER TABLE public.shops ADD COLUMN service_settings jsonb;
ALTER TABLE public.shops ADD COLUMN notification_phone text;
ALTER TABLE public.shops ADD COLUMN notification_consent_at timestamptz;
ALTER TABLE public.shops ADD COLUMN notification_verified_at timestamptz;
ALTER TABLE public.shops ADD COLUMN notification_language text NOT NULL DEFAULT 'en';
ALTER TABLE public.rfqs ADD COLUMN quote_delivery_cost integer NOT NULL DEFAULT 0;
ALTER TABLE public.rfqs ADD COLUMN quote_revisions jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE public.rfqs ADD COLUMN supplier_questions jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE public.rfqs ADD COLUMN notification_status text NOT NULL DEFAULT 'pending';
ALTER TABLE public.rfqs ADD COLUMN notification_error text;
ALTER TABLE public.rfqs ADD COLUMN notification_attempted_at timestamptz;
ALTER TABLE public.order_item_awards ADD COLUMN fulfilment_status text NOT NULL DEFAULT 'confirmed';
ALTER TABLE public.order_item_awards ADD COLUMN fulfilment_history jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE public.shops ADD CONSTRAINT notification_language_valid CHECK (notification_language IN ('en', 'si'));
ALTER TABLE public.rfqs ADD CONSTRAINT quote_delivery_cost_nonnegative CHECK (quote_delivery_cost >= 0);
ALTER TABLE public.order_item_awards ADD CONSTRAINT fulfilment_status_valid CHECK (fulfilment_status IN ('confirmed', 'preparing', 'ready', 'handed_over', 'completed'));
-- Server-only settings/revisions/history: prevent direct authenticated writes bypassing guards.
-- Existing supplier reads still use the established tenant-scoped RLS policies.
REVOKE UPDATE ON public.shops, public.rfqs, public.order_item_awards FROM authenticated;
REVOKE INSERT, DELETE ON public.rfqs, public.order_item_awards FROM authenticated;
REVOKE INSERT ON public.shops FROM authenticated;
ALTER TABLE public.products ADD COLUMN flower_species_en text;
ALTER TABLE public.products ADD COLUMN occasion_tags_en text[] NOT NULL DEFAULT '{}';
CREATE TABLE public.supplier_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.orders(id),
  shop_id uuid NOT NULL REFERENCES public.shops(id),
  event_key text NOT NULL,
  message text NOT NULL,
  phone text,
  status text NOT NULL DEFAULT 'pending',
  error text,
  attempted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX supplier_alerts_event_shop_uq ON public.supplier_alerts(event_key, shop_id);
ALTER TABLE public.supplier_alerts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.supplier_alerts FROM anon, authenticated;
ALTER TABLE public.orders ADD COLUMN status_history jsonb NOT NULL DEFAULT '[]'::jsonb;
REVOKE INSERT, UPDATE, DELETE ON public.rfq_quote_lines, public.products, public.product_images FROM authenticated;
-- Public catalog DTOs are served through server functions; notification contact data is private.
REVOKE SELECT ON public.shops FROM anon, authenticated;
ALTER TABLE public.rfqs ADD COLUMN notification_provider_id text;
ALTER TABLE public.supplier_alerts ADD COLUMN provider_id text;

ALTER TABLE public.products ADD COLUMN flower_species_si text;
ALTER TABLE public.products ADD COLUMN occasion_tags_si text[];
