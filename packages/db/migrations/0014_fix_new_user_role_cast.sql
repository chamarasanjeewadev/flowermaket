-- Fix "Database error saving new user" on Google OAuth signup (round 2).
--
-- Migration 0009 added a CASE expression to pick the role (admin for the
-- bootstrap email, buyer otherwise). A CASE over bare string literals resolves
-- to type `text`, and Postgres has NO implicit cast from text to the
-- `user_role` enum, so EVERY signup INSERT failed with:
--
--   column "role" is of type user_role but expression is of type text
--
-- GoTrue surfaces that as "Database error saving new user". A bare literal
-- (the original trigger) worked because an unknown-typed literal coerces to
-- the column type; a CASE result does not.
--
-- Fix: cast the CASE result explicitly to public.user_role.
--
-- Re-runnable: CREATE OR REPLACE is idempotent.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'auth' AND table_name = 'users'
  ) THEN
    CREATE OR REPLACE FUNCTION public.handle_new_user() RETURNS trigger
      LANGUAGE plpgsql SECURITY DEFINER
      SET search_path = public
      AS $fn$
      BEGIN
        -- Bypass RLS so this trigger can always insert regardless of caller role.
        SET LOCAL row_security = OFF;

        INSERT INTO public.users (id, email, full_name, role)
        VALUES (
          NEW.id,
          NEW.email,
          COALESCE(
            NEW.raw_user_meta_data ->> 'full_name',
            NEW.raw_user_meta_data ->> 'name',
            NULL
          ),
          (CASE
            WHEN NEW.email = 'flowermarketplacesl@gmail.com' THEN 'admin'
            ELSE 'buyer'
          END)::public.user_role
        )
        ON CONFLICT DO NOTHING;

        RETURN NEW;
      EXCEPTION
        WHEN OTHERS THEN
          -- Never let a profile-creation failure block the auth signup.
          RETURN NEW;
      END;
      $fn$;

    DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
    CREATE TRIGGER on_auth_user_created
      AFTER INSERT ON auth.users
      FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
  END IF;
END
$$;
