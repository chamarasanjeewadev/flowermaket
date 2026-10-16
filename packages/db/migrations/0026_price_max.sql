-- Optional upper bound so listings can show a market price range. Additive, idempotent.
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS price_max integer;
