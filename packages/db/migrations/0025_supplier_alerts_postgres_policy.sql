-- 0023 enabled RLS on supplier_alerts without a policy for the Drizzle
-- pooler role, which leaves the app with deny-all access in production.
-- Mirrors the postgres policies added for the 0024 tables. Idempotent.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'supplier_alerts' AND policyname = 'supplier_alerts_postgres_all') THEN
    EXECUTE 'CREATE POLICY "supplier_alerts_postgres_all" ON public.supplier_alerts FOR ALL TO postgres USING (true) WITH CHECK (true)';
  END IF;
END
$$;
