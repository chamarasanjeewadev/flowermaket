# Admin product moderation + "Manage as owner" — design

## Goal
Admins can see every product, approve / block it, and do anything a shop owner
can (products, photos, store profile, logo/banner, seller types) for any shop.

## Moderation
- New enum `moderation_status` = `pending | approved | blocked` on `products`:
  `moderation_status NOT NULL DEFAULT 'pending'`, `moderation_note text`,
  `moderated_at timestamptz`, `moderated_by uuid → users`.
- Migration `0021_product_moderation.sql` (manual, idempotent, additive):
  existing rows backfilled to `approved` so nothing disappears.
- Public visibility = `status = 'active' AND moderation_status = 'approved'`
  (+ verified, active shop) — single `publicConditions()` in catalog repo;
  directory counts / category counts / cover images / sitemap use the same rule.
- Supplier create → `pending`. Supplier update touching name/description/price/
  compareAtPrice/category/listing type, or adding an image → back to `pending`
  (stock, lead time, min-qty, status pause/activate do not). Blocked products stay
  blocked on supplier edits (only an admin unblocks).
- Admin acting as owner: creates/edits are `approved` (opt `{ moderation: "approved" }`).
- Repo: `listProductsForModeration(db, filter)`, `moderateProduct(db, id, adminId, status, note)`,
  `moderationCounts(db)`.

## Admin UI
- Sidebar "Products": tabs Pending / Live / Blocked / All with counts, filters (shop,
  seller type, category), search; table with thumbnail, name, shop, price, status,
  moderation. Detail sheet: images, prices, description, shop link, storefront link,
  Approve / Block (reason) / Unblock.
- Supplier sheet: product summary + "Manage as owner" + "View products".
- Dashboard: pending products, pending shops, verified shops with no live products.

## Manage as owner (supplier portal)
- `GET /act-as/$shopId` (supplier app): admin-only; sets httpOnly cookie
  `fm_act_as=<shopId>` (8h) and redirects to `/`. `/act-as/exit` clears it.
- `resolveSupplierSession`: role admin + valid cookie → session for that shop with
  `actingAs: { adminUserId }`; `userId` stays the admin's. Owner-scoped writes
  (updateShop, setShopMedia) gain shop-id variants used for everyone
  (`updateShopById`, `setShopMediaById`) so acting works.
- Banner in supplier layout: "Acting as <shop> · Exit".
- Supplier product list shows moderation badge + block reason.

## Testing
vitest: moderation transitions (`nextModerationOnSupplierEdit`), public visibility
conditions unchanged for approved rows; local Postgres migration run; build +
typecheck; browser check on local dev.
