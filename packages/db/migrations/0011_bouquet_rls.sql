-- RLS policies for bouquet_generations.
--
-- The table was created in 0008 without RLS. On Supabase-managed instances
-- the postgres role may not have BYPASSRLS (as discovered in 0009/0010), so
-- a SELECT in checkBouquetRateLimit was failing if the project has Force RLS
-- or if RLS was enabled on the table via the dashboard.
--
-- Fix: explicitly enable RLS and grant the postgres role (the app's DB
-- connection user) full access. No PostgREST exposure is needed here.
--
-- Re-runnable: IF NOT EXISTS guards make this idempotent.

ALTER TABLE "bouquet_generations" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'bouquet_generations'
      AND policyname = 'bouquet_gen_postgres_all'
  ) THEN
    EXECUTE '
      CREATE POLICY "bouquet_gen_postgres_all" ON public.bouquet_generations
        FOR ALL TO postgres
        USING (true) WITH CHECK (true)
    ';
  END IF;
END
$$;
