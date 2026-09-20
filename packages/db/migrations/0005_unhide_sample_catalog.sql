-- Reverses 0004_hide_sample_catalog: publish the seeded sample shops as real
-- marketplace inventory so the catalog is not empty pre-onboarding. These are
-- placeholder listings — replace with verified florists as they onboard.
UPDATE "shops"
SET
  "verification_status" = 'verified',
  "is_active" = true,
  "updated_at" = now()
WHERE "owner_user_id" IN (
  '00000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000010',
  '00000000-0000-0000-0000-000000000011'
);
--> statement-breakpoint
UPDATE "products"
SET
  "status" = 'active',
  "updated_at" = now()
WHERE "shop_id" IN (
  SELECT "id"
  FROM "shops"
  WHERE "owner_user_id" IN (
    '00000000-0000-0000-0000-000000000001',
    '00000000-0000-0000-0000-000000000010',
    '00000000-0000-0000-0000-000000000011'
  )
);
