-- Security fix: revoke column-level SELECT privileges on sensitive shop columns
-- from the anon and authenticated roles (PostgREST / supabase-js surface).
--
-- The app's own server functions connect as the table owner via the postgres
-- connection (DATABASE_URL) and bypass RLS entirely, so app code is unaffected.
-- Only PostgREST / supabase-js anon-key queries are restricted.
--
-- Re-runnable: REVOKE is idempotent — revoking a privilege that is not granted
-- is a no-op on Postgres.

REVOKE SELECT (bank_details, commission_rate_bps) ON public.shops FROM anon, authenticated;
