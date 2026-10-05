-- Admin-managed flower categories + guaranteed flower-images bucket.
-- Additive + idempotent; applied manually (prod journal is drifted).
--
-- flower_species.category keeps storing a plain-text slug; the three enum-era
-- values are seeded here so every existing species resolves to a category.

CREATE TABLE IF NOT EXISTS "public"."flower_categories" (
  "slug" text PRIMARY KEY NOT NULL,
  "name_en" text NOT NULL,
  "name_si" text,
  "sort_order" integer DEFAULT 0 NOT NULL,
  "is_active" boolean DEFAULT true NOT NULL
);

INSERT INTO "public"."flower_categories" ("slug", "name_en", "name_si", "sort_order")
VALUES
  ('imported', 'Imported', 'ආනයනික', 10),
  ('tropical', 'Tropical', 'නිවර්තන', 20),
  ('local', 'Local', 'දේශීය', 30)
ON CONFLICT ("slug") DO NOTHING;

-- Any category value already used by a species but not seeded above.
INSERT INTO "public"."flower_categories" ("slug", "name_en", "sort_order")
SELECT DISTINCT s."category", initcap(s."category"), 100
FROM "public"."flower_species" s
ON CONFLICT ("slug") DO NOTHING;

ALTER TABLE "public"."flower_categories" ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies
                 WHERE schemaname = 'public' AND tablename = 'flower_categories'
                   AND policyname = 'flower_categories_postgres_all') THEN
    EXECUTE 'CREATE POLICY "flower_categories_postgres_all" ON public.flower_categories
               FOR ALL TO postgres USING (true) WITH CHECK (true)';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies
                 WHERE schemaname = 'public' AND tablename = 'flower_categories'
                   AND policyname = 'public_read_active_flower_categories') THEN
    EXECUTE 'CREATE POLICY "public_read_active_flower_categories" ON public.flower_categories
               FOR SELECT USING (is_active = true)';
  END IF;
END
$$;

-- Public bucket for variant photos. Uploads are client-compressed WebP, but
-- JPEG/PNG stay allowed as a fallback for browsers that cannot encode WebP.
INSERT INTO storage.buckets ("id", "name", "public", "file_size_limit", "allowed_mime_types")
VALUES ('flower-images', 'flower-images', true, 5242880,
        ARRAY['image/webp', 'image/jpeg', 'image/png'])
ON CONFLICT ("id") DO UPDATE
  SET "public" = true,
      "file_size_limit" = EXCLUDED."file_size_limit",
      "allowed_mime_types" = EXCLUDED."allowed_mime_types";
