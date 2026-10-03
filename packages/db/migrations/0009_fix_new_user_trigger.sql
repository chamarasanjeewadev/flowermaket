-- Fix "Database error saving new user" on Google OAuth signup.
--
-- The handle_new_user trigger runs SECURITY DEFINER but Supabase's managed
-- postgres role may not have BYPASSRLS, so the INSERT into public.users is
-- blocked by RLS (there is no INSERT policy for non-admins). Adding
-- SET LOCAL row_security = OFF inside the function body bypasses RLS for the
-- duration of the trigger regardless of the caller's role.
--
-- Also adds a 'name' raw_user_meta_data fallback so Google OAuth users
-- (who send 'name', not 'full_name') get their name stored correctly.
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
          CASE
            WHEN NEW.email = 'flowermarketplacesl@gmail.com' THEN 'admin'
            ELSE 'buyer'
          END
        )
        ON CONFLICT DO NOTHING;
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
