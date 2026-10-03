-- Belt-and-suspenders fix for "Database error saving new user" on Google OAuth.
--
-- Migration 0009 added SET LOCAL row_security = OFF inside the trigger body.
-- This migration adds an explicit INSERT policy so the trigger works even if
-- the postgres role lacks BYPASSRLS in Supabase's managed environment.
--
-- Security note: the policy is scoped TO postgres (the SECURITY DEFINER
-- function owner), so it does not open an INSERT hole for anon/authenticated
-- roles via PostgREST.
--
-- Re-runnable: DROP + CREATE is idempotent for policies.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'users'
      AND policyname = 'users_insert_trigger'
  ) THEN
    EXECUTE '
      CREATE POLICY "users_insert_trigger" ON public.users
        FOR INSERT TO postgres
        WITH CHECK (true)
    ';
  END IF;
END
$$;

-- Also grant the supabase_auth_admin role INSERT access (the role GoTrue uses
-- to run auth operations). This ensures the trigger INSERT succeeds regardless
-- of which internal role executes the trigger context.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'supabase_auth_admin') THEN
    EXECUTE '
      GRANT INSERT ON public.users TO supabase_auth_admin
    ';
  END IF;
END
$$;
