-- Local florist requests: listings, requests, offers, request OTPs.
-- Hand-applied, idempotent (prod journal is drifted; not in _journal.json).

CREATE TABLE IF NOT EXISTS public.florist_listings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  google_place_id text,
  shop_id uuid REFERENCES public.shops(id),
  name text NOT NULL,
  phone text,
  address text,
  district text,
  city text,
  lat double precision NOT NULL,
  lng double precision NOT NULL,
  location_source text DEFAULT 'google' NOT NULL,
  google_rating real,
  google_review_count integer,
  google_maps_uri text,
  google_synced_at timestamptz,
  status text DEFAULT 'unclaimed' NOT NULL,
  supplier_invite_id uuid REFERENCES public.supplier_invites(id),
  opted_out_at timestamptz,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT florist_listings_google_place_id_unique UNIQUE (google_place_id),
  CONSTRAINT florist_listings_shop_id_unique UNIQUE (shop_id)
);

CREATE TABLE IF NOT EXISTS public.bouquet_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  ref text NOT NULL,
  access_token_hash text NOT NULL,
  status text DEFAULT 'pending_verification' NOT NULL,
  customer_name text NOT NULL,
  customer_phone text NOT NULL,
  phone_verified_at timestamptz,
  language public.language NOT NULL,
  design jsonb NOT NULL,
  occasion text,
  budget_min_cents integer NOT NULL,
  budget_max_cents integer,
  fulfilment text NOT NULL,
  delivery_lat double precision NOT NULL,
  delivery_lng double precision NOT NULL,
  delivery_area text NOT NULL,
  delivery_address text,
  needed_on date NOT NULL,
  needed_window text NOT NULL,
  radius_km integer DEFAULT 10 NOT NULL,
  quote_deadline_at timestamptz,
  no_florists_in_range boolean DEFAULT false NOT NULL,
  accepted_offer_id uuid,
  customer_notified_at timestamptz,
  bouquet_generation_id uuid REFERENCES public.bouquet_generations(id),
  utm jsonb,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT bouquet_requests_ref_unique UNIQUE (ref),
  CONSTRAINT bouquet_requests_access_token_hash_unique UNIQUE (access_token_hash)
);

CREATE TABLE IF NOT EXISTS public.bouquet_request_offers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  request_id uuid NOT NULL REFERENCES public.bouquet_requests(id) ON DELETE CASCADE,
  listing_id uuid NOT NULL REFERENCES public.florist_listings(id),
  shop_id uuid REFERENCES public.shops(id),
  distance_m integer NOT NULL,
  status text DEFAULT 'pending_approval' NOT NULL,
  token_hash text NOT NULL,
  price_cents integer,
  delivery_fee_cents integer DEFAULT 0 NOT NULL,
  ready_at timestamptz,
  message text,
  photo_path text,
  decline_reason text,
  sent_at timestamptz,
  viewed_at timestamptz,
  quoted_at timestamptz,
  accepted_at timestamptz,
  notification_status text,
  notification_error text,
  provider_id text,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT bouquet_request_offers_token_hash_unique UNIQUE (token_hash)
);

CREATE TABLE IF NOT EXISTS public.bouquet_request_otps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  request_id uuid NOT NULL REFERENCES public.bouquet_requests(id) ON DELETE CASCADE,
  phone text NOT NULL,
  code_hash text NOT NULL,
  expires_at timestamptz NOT NULL,
  attempts integer DEFAULT 0 NOT NULL,
  max_attempts integer DEFAULT 5 NOT NULL,
  consumed_at timestamptz,
  created_at timestamptz DEFAULT now() NOT NULL
);

-- Indexes
CREATE INDEX IF NOT EXISTS florist_listings_lat_lng_idx ON public.florist_listings (lat, lng);
CREATE INDEX IF NOT EXISTS florist_listings_status_idx ON public.florist_listings (status);
CREATE INDEX IF NOT EXISTS florist_listings_phone_idx ON public.florist_listings (phone);
CREATE INDEX IF NOT EXISTS bouquet_requests_status_idx ON public.bouquet_requests (status);
CREATE INDEX IF NOT EXISTS bouquet_requests_customer_phone_idx ON public.bouquet_requests (customer_phone);
CREATE UNIQUE INDEX IF NOT EXISTS bouquet_request_offers_req_listing_uq ON public.bouquet_request_offers (request_id, listing_id);
CREATE INDEX IF NOT EXISTS bouquet_request_offers_listing_idx ON public.bouquet_request_offers (listing_id);
CREATE INDEX IF NOT EXISTS bouquet_request_offers_shop_idx ON public.bouquet_request_offers (shop_id);
CREATE INDEX IF NOT EXISTS bouquet_request_offers_status_idx ON public.bouquet_request_offers (status);

-- CHECK constraints (guarded: ADD CONSTRAINT has no IF NOT EXISTS)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'florist_listings_status_check') THEN
    ALTER TABLE public.florist_listings ADD CONSTRAINT florist_listings_status_check
      CHECK (status IN ('unclaimed','invited','claimed','opted_out','blocked'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'florist_listings_location_source_check') THEN
    ALTER TABLE public.florist_listings ADD CONSTRAINT florist_listings_location_source_check
      CHECK (location_source IN ('google','owner','admin'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'bouquet_requests_status_check') THEN
    ALTER TABLE public.bouquet_requests ADD CONSTRAINT bouquet_requests_status_check
      CHECK (status IN ('pending_verification','open','accepted','expired','cancelled','completed'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'bouquet_requests_fulfilment_check') THEN
    ALTER TABLE public.bouquet_requests ADD CONSTRAINT bouquet_requests_fulfilment_check
      CHECK (fulfilment IN ('delivery','pickup'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'bouquet_requests_needed_window_check') THEN
    ALTER TABLE public.bouquet_requests ADD CONSTRAINT bouquet_requests_needed_window_check
      CHECK (needed_window IN ('morning','afternoon','evening','any'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'bouquet_requests_budget_max_check') THEN
    ALTER TABLE public.bouquet_requests ADD CONSTRAINT bouquet_requests_budget_max_check
      CHECK (budget_max_cents IS NULL OR budget_max_cents > budget_min_cents);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'bouquet_request_offers_status_check') THEN
    ALTER TABLE public.bouquet_request_offers ADD CONSTRAINT bouquet_request_offers_status_check
      CHECK (status IN ('pending_approval','skipped','sent','send_failed','viewed','quoted','declined','accepted','not_selected','expired'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'bouquet_request_offers_price_check') THEN
    ALTER TABLE public.bouquet_request_offers ADD CONSTRAINT bouquet_request_offers_price_check
      CHECK (price_cents IS NULL OR price_cents > 0);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'bouquet_request_offers_delivery_fee_check') THEN
    ALTER TABLE public.bouquet_request_offers ADD CONSTRAINT bouquet_request_offers_delivery_fee_check
      CHECK (delivery_fee_cents >= 0);
  END IF;
END
$$;

-- RLS: deny anon/authenticated; explicit policy for the postgres role used by
-- the Drizzle pooler connection (see 0011 / rls-postgres-policy-required).
ALTER TABLE public.florist_listings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bouquet_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bouquet_request_offers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bouquet_request_otps ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'florist_listings' AND policyname = 'florist_listings_postgres_all') THEN
    EXECUTE 'CREATE POLICY "florist_listings_postgres_all" ON public.florist_listings FOR ALL TO postgres USING (true) WITH CHECK (true)';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'bouquet_requests' AND policyname = 'bouquet_requests_postgres_all') THEN
    EXECUTE 'CREATE POLICY "bouquet_requests_postgres_all" ON public.bouquet_requests FOR ALL TO postgres USING (true) WITH CHECK (true)';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'bouquet_request_offers' AND policyname = 'bouquet_request_offers_postgres_all') THEN
    EXECUTE 'CREATE POLICY "bouquet_request_offers_postgres_all" ON public.bouquet_request_offers FOR ALL TO postgres USING (true) WITH CHECK (true)';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'bouquet_request_otps' AND policyname = 'bouquet_request_otps_postgres_all') THEN
    EXECUTE 'CREATE POLICY "bouquet_request_otps_postgres_all" ON public.bouquet_request_otps FOR ALL TO postgres USING (true) WITH CHECK (true)';
  END IF;
END
$$;

REVOKE ALL ON public.florist_listings, public.bouquet_requests, public.bouquet_request_offers, public.bouquet_request_otps FROM anon, authenticated;

-- Public-read bucket for florist example photos (uploads go through the server).
INSERT INTO storage.buckets ("id", "name", "public", "file_size_limit", "allowed_mime_types")
VALUES ('lead-photos', 'lead-photos', true, 5242880,
        ARRAY['image/webp', 'image/jpeg', 'image/png'])
ON CONFLICT ("id") DO NOTHING;
