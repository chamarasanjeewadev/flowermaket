-- Security fix: stop signed-in users promoting themselves to admin.
-- "users_update_own" (0001) lets a user UPDATE their own row with no column
-- restriction, and Supabase grants table-level UPDATE on public tables to
-- anon/authenticated by default. So PATCH /rest/v1/users?id=eq.<self>
-- {"role":"admin"} with the anon key + the user's JWT succeeded, and
-- public.is_admin() then opened every *_admin_all policy.
--
-- The apps write public.users only through Drizzle (postgres role, unaffected)
-- and the signup trigger (supabase_auth_admin, granted INSERT in 0010). Keep
-- self-service UPDATE only for profile columns; role, email and id stay
-- server-managed. Idempotent: REVOKE/GRANT of an already-revoked/granted
-- privilege is a no-op.
REVOKE INSERT, UPDATE, DELETE ON public.users FROM anon, authenticated;
GRANT UPDATE (full_name, phone, preferred_language, updated_at) ON public.users TO authenticated;
