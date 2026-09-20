-- Sample shops use reserved owner UUIDs and local-only email addresses.
-- Keep the rows for development reference, but prevent them from appearing
-- as real sellers or listings on the public marketplace.
UPDATE "shops"
SET
  "verification_status" = 'unverified',
  "is_active" = false,
  "updated_at" = now()
WHERE "owner_user_id" IN (
  '00000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000010',
  '00000000-0000-0000-0000-000000000011'
);
--> statement-breakpoint
UPDATE "products"
SET
  "status" = 'archived',
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
