# Seller types (florist / supplier / farmer) — design

Sub-project 1 of the "seller-first marketplace" overhaul
(1 seller types → 2 buyer-site redesign → 3 supplier portal refresh → 4 admin refresh).

## Goal
A shop can be any combination of **florist** (arranges / sells retail),
**supplier** (wholesaler / trader reselling stems in bulk) and **farmer** (grows
flowers). Buyers can see and filter by these types; RFQ sourcing reaches farmers
and suppliers.

## Data model
- New pg enum `seller_type` = `florist | supplier | farmer`.
- `shops.seller_types seller_type[] NOT NULL DEFAULT '{florist}'`,
  `CHECK (cardinality(seller_types) > 0)`, GIN index.
- `supplier_invites.seller_types seller_type[]` (nullable — invite may leave it to the supplier).
- Migration `0019_seller_types.sql` (hand-written, journaled, idempotent because of
  the known journal drift): add columns → backfill (`florist`→`{florist}`,
  `grower`→`{farmer}`, `is_aggregator` → append `supplier`) → drop `shop_type`,
  `is_aggregator` on both tables → drop enum `shop_type`.
- `packages/api`: `SELLER_TYPES`, `SellerType`, `normalizeSellerTypes(input)` →
  de-duplicated, canonical order (florist, supplier, farmer), `null` when empty/invalid.

## Queries
- `listActiveShops(db, { sellerType? })`, `listActiveProducts(db, { …, sellerType? })`
  filter with `arrayContains(shops.sellerTypes, [type])`.
- `ShopSummary`, `ProductListItem` expose `sellerTypes: SellerType[]`.
- RFQ grower matching → `arrayOverlaps(shops.sellerTypes, ['farmer','supplier'])`.
- Shop / invite create + update validation uses `sellerTypes` (≥1 valid value).

## Inputs
- Supplier onboarding: three checkbox cards, ≥1 required, en/si labels.
- Supplier shop profile: seller types editable.
- Admin create supplier / invite: checkboxes replace type select + aggregator checkbox.
- Admin supplier list: type chips.

## Buyer site (minimal; full redesign is sub-project 2)
- One badge per type on shop cards, shop page, product detail.
- `?type=florist|supplier|farmer` filter on `/shops`; "Seller" filter on `/products`.
- JSON-LD `@type`: `Florist` when florist ∈ types, else `LocalBusiness`.

## Testing
vitest for `normalizeSellerTypes` + repo validation; `pnpm build && pnpm typecheck`;
verify prod backfill directly (Nuwara Eliya → farmer, Colombo shops → florist).

## Out of scope
Per-type product rules (e.g. farmer = wholesale only).
