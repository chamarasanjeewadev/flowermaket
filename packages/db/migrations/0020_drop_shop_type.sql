-- Drop legacy shop_type / is_aggregator after the seller_types code is deployed.
-- Re-runs the backfill guard first so it is safe even if 0019 ran long before.
UPDATE "shops" SET "seller_types" = '{florist}' WHERE cardinality("seller_types") = 0;

ALTER TABLE "shops" DROP COLUMN IF EXISTS "shop_type";
ALTER TABLE "shops" DROP COLUMN IF EXISTS "is_aggregator";
ALTER TABLE "supplier_invites" DROP COLUMN IF EXISTS "shop_type";
ALTER TABLE "supplier_invites" DROP COLUMN IF EXISTS "is_aggregator";
DROP TYPE IF EXISTS "shop_type";
