-- Row Level Security for flowers.lk.
--
-- RLS is the source of truth for data access via PostgREST / supabase-js /
-- Realtime (anon + authenticated roles). The app's own server functions
-- connect through the pooler as the table owner, which bypasses RLS — that
-- path is guarded in the app layer.

-- ---------------------------------------------------------------------------
-- Compatibility shims so this migration also applies on plain Postgres
-- (local dev/CI without Supabase). On Supabase these already exist.
-- ---------------------------------------------------------------------------
CREATE SCHEMA IF NOT EXISTS auth;
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'auth' AND p.proname = 'uid'
  ) THEN
    -- Minimal stand-in for Supabase's auth.uid(); returns NULL outside Supabase.
    CREATE FUNCTION auth.uid() RETURNS uuid
      LANGUAGE sql STABLE
      AS $fn$ SELECT NULL::uuid $fn$;
  END IF;
END
$$;
--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- Helper: is the current (JWT-authenticated) user a platform admin?
-- SECURITY DEFINER so policies can consult public.users without recursion.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_admin() RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path = public
  AS $$
    SELECT EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid() AND u.role = 'admin'
    );
  $$;
--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- Mirror new Supabase auth users into public.users (buyer by default).
-- Guarded: only created when auth.users exists (i.e. on Supabase).
-- ---------------------------------------------------------------------------
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
          'buyer'
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

-- ---------------------------------------------------------------------------
-- Enable RLS on every table.
-- ---------------------------------------------------------------------------
ALTER TABLE "users" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "shops" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "categories" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "products" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "product_images" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- users: readable/updatable by self + admin.
-- ---------------------------------------------------------------------------
CREATE POLICY "users_select_own" ON "users"
  FOR SELECT USING (id = auth.uid());
--> statement-breakpoint
CREATE POLICY "users_update_own" ON "users"
  FOR UPDATE USING (id = auth.uid()) WITH CHECK (id = auth.uid());
--> statement-breakpoint
CREATE POLICY "users_admin_all" ON "users"
  FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());
--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- shops: public SELECT where is_active; owner ALL; admin ALL.
-- ---------------------------------------------------------------------------
CREATE POLICY "shops_public_read" ON "shops"
  FOR SELECT USING (is_active = true);
--> statement-breakpoint
CREATE POLICY "shops_owner_all" ON "shops"
  FOR ALL USING (owner_user_id = auth.uid()) WITH CHECK (owner_user_id = auth.uid());
--> statement-breakpoint
CREATE POLICY "shops_admin_all" ON "shops"
  FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());
--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- categories: public SELECT; admin write.
-- ---------------------------------------------------------------------------
CREATE POLICY "categories_public_read" ON "categories"
  FOR SELECT USING (true);
--> statement-breakpoint
CREATE POLICY "categories_admin_all" ON "categories"
  FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());
--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- products: public SELECT where status='active'; shop-owner ALL; admin ALL.
-- ---------------------------------------------------------------------------
CREATE POLICY "products_public_read" ON "products"
  FOR SELECT USING (status = 'active');
--> statement-breakpoint
CREATE POLICY "products_owner_all" ON "products"
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.shops s
      WHERE s.id = shop_id AND s.owner_user_id = auth.uid()
    )
  ) WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.shops s
      WHERE s.id = shop_id AND s.owner_user_id = auth.uid()
    )
  );
--> statement-breakpoint
CREATE POLICY "products_admin_all" ON "products"
  FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());
--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- product_images: public SELECT where product is active (via join);
-- shop-owner ALL; admin ALL.
-- ---------------------------------------------------------------------------
CREATE POLICY "product_images_public_read" ON "product_images"
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.products p
      WHERE p.id = product_id AND p.status = 'active'
    )
  );
--> statement-breakpoint
CREATE POLICY "product_images_owner_all" ON "product_images"
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.products p
      JOIN public.shops s ON s.id = p.shop_id
      WHERE p.id = product_id AND s.owner_user_id = auth.uid()
    )
  ) WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.products p
      JOIN public.shops s ON s.id = p.shop_id
      WHERE p.id = product_id AND s.owner_user_id = auth.uid()
    )
  );
--> statement-breakpoint
CREATE POLICY "product_images_admin_all" ON "product_images"
  FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());
