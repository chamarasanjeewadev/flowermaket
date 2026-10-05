-- Product moderation (pending | approved | blocked). Additive + idempotent;
-- applied manually (prod journal is drifted). Existing products are approved so
-- nothing disappears from the public site.
DO $$ BEGIN
  CREATE TYPE "public"."moderation_status" AS ENUM ('pending', 'approved', 'blocked');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_schema = 'public' AND table_name = 'products'
                   AND column_name = 'moderation_status') THEN
    -- Add with an 'approved' default so existing rows backfill as approved,
    -- then switch the default to 'pending' for new rows.
    ALTER TABLE "public"."products" ADD COLUMN "moderation_status" "public"."moderation_status" NOT NULL DEFAULT 'approved';
    ALTER TABLE "public"."products" ALTER COLUMN "moderation_status" SET DEFAULT 'pending';
  END IF;
END $$;

ALTER TABLE "public"."products" ADD COLUMN IF NOT EXISTS "moderation_note" text;
ALTER TABLE "public"."products" ADD COLUMN IF NOT EXISTS "moderated_at" timestamp with time zone;
ALTER TABLE "public"."products" ADD COLUMN IF NOT EXISTS "moderated_by" uuid;

DO $$ BEGIN
  ALTER TABLE "public"."products" ADD CONSTRAINT "products_moderated_by_users_id_fk"
    FOREIGN KEY ("moderated_by") REFERENCES "public"."users"("id");
EXCEPTION WHEN duplicate_object THEN null; END $$;

CREATE INDEX IF NOT EXISTS "products_moderation_status_idx" ON "public"."products" ("moderation_status");
