-- Bootstrap the first admin account.
--
-- New Supabase auth users are mirrored into public.users by handle_new_user
-- (see 0001_rls_policies.sql), which defaults everyone to 'buyer'. This
-- migration teaches that trigger to grant 'admin' to the bootstrap email on
-- first login, and promotes the row directly in case it already exists (e.g.
-- the user signed in before this migration ran).
--
-- Re-runnable: CREATE OR REPLACE + a plain UPDATE are both idempotent.

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
        INSERT INTO public.users (id, email, full_name, role)
        VALUES (
          NEW.id,
          NEW.email,
          COALESCE(NEW.raw_user_meta_data ->> 'full_name', NULL),
          CASE
            WHEN NEW.email = 'flowermarketplacesl@gmail.com' THEN 'admin'
            ELSE 'buyer'
          END
        )
        -- No conflict target: users has UNIQUE constraints on both id and
        -- email; a collision on either should no-op, not raise.
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
--> statement-breakpoint

-- Promote the bootstrap admin if the row already exists.
UPDATE public.users
SET role = 'admin'
WHERE email = 'flowermarketplacesl@gmail.com';
