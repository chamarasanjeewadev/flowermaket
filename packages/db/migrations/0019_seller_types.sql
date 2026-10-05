-- Seller types: shops can be any combination of florist / supplier / farmer.
-- Replaces shop_type (florist|grower) + is_aggregator. Idempotent (prod journal
-- is drifted — applied manually like 0018). Additive: legacy columns are
-- dropped separately in 0020 once code reading them is no longer deployed.
DO $$ BEGIN
  CREATE TYPE "seller_type" AS ENUM ('florist', 'supplier', 'farmer');
EXCEPTION WHEN duplicate_object THEN null; END $$;

ALTER TABLE "shops" ADD COLUMN IF NOT EXISTS "seller_types" "seller_type"[];
ALTER TABLE "supplier_invites" ADD COLUMN IF NOT EXISTS "seller_types" "seller_type"[];

-- Backfill from the legacy columns (only while they still exist).
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_schema = 'public' AND table_name = 'shops' AND column_name = 'shop_type') THEN
    UPDATE "shops" SET "seller_types" =
      (CASE WHEN "shop_type"::text = 'grower' THEN ARRAY['farmer']::seller_type[]
            ELSE ARRAY['florist']::seller_type[] END)
      || (CASE WHEN "is_aggregator" THEN ARRAY['supplier']::seller_type[]
               ELSE ARRAY[]::seller_type[] END)
    WHERE "seller_types" IS NULL;
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_schema = 'public' AND table_name = 'supplier_invites' AND column_name = 'shop_type') THEN
    UPDATE "supplier_invites" SET "seller_types" =
      CASE
        WHEN "shop_type" IS NULL AND NOT "is_aggregator" THEN NULL
        ELSE
          (CASE "shop_type"::text WHEN 'grower' THEN ARRAY['farmer']::seller_type[]
                                  WHEN 'florist' THEN ARRAY['florist']::seller_type[]
                                  ELSE ARRAY[]::seller_type[] END)
          || (CASE WHEN "is_aggregator" THEN ARRAY['supplier']::seller_type[]
                   ELSE ARRAY[]::seller_type[] END)
      END
    WHERE "seller_types" IS NULL;
  END IF;
END $$;

UPDATE "shops" SET "seller_types" = '{florist}' WHERE "seller_types" IS NULL OR cardinality("seller_types") = 0;
ALTER TABLE "shops" ALTER COLUMN "seller_types" SET DEFAULT '{florist}'::seller_type[];
ALTER TABLE "shops" ALTER COLUMN "seller_types" SET NOT NULL;

DO $$ BEGIN
  ALTER TABLE "shops" ADD CONSTRAINT "shops_seller_types_nonempty" CHECK (cardinality("seller_types") > 0);
EXCEPTION WHEN duplicate_object THEN null; END $$;

CREATE INDEX IF NOT EXISTS "shops_seller_types_idx" ON "shops" USING gin ("seller_types");

