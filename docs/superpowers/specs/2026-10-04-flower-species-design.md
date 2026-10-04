# Flower Species & Variants — Canonical Data Layer

**Date:** 2026-10-04  
**Status:** Approved for implementation

## Problem

Flower data lives in two disconnected places:

1. `apps/web/src/lib/flower-catalog.ts` — 29 hardcoded `FlowerType` objects used by `/en/fresh-flowers-near-me` and `/en/fresh-flower-quotation-generator`. Images are either local webps (8 flowers) or random Unsplash URLs (21 flowers). Only changeable via code deploy.
2. Supabase `products` table — supplier listings used by `/en/design` and `/en/products`. No link to flower types.

The quotation generator bridges them with a fragile name-match: `listings.find(p => p.name_en.toLowerCase() === flower.name_en.toLowerCase())`. Colors are conflated with species (Red Rose and White Rose are treated as sibling "species"). No admin can manage any of this.

## Goal

A single canonical `flower_species` + `flower_variants` table in the DB. Every page that shows flowers reads from this source. Admin can add species, add color variants, and upload images without a code deploy.

## Data Model

### `flower_species`

```
id           text PRIMARY KEY       -- slug, e.g. "rose", "chrysanthemum", "lotus"
name_en      text NOT NULL          -- species name, e.g. "Rose"
name_si      text NOT NULL
local_name   text nullable          -- e.g. "Nelum" (Lotus), "Araliya" (Frangipani)
category     text NOT NULL          -- enum: imported | tropical | local
default_unit text NOT NULL          -- enum: stem | bunch | arrangement | item
sort_order   integer NOT NULL DEFAULT 0
is_active    boolean NOT NULL DEFAULT true
```

### `flower_variants`

```
id           text PRIMARY KEY       -- slug, e.g. "red-rose", "white-rose", "pink-lily", "lotus"
species_id   text NOT NULL REFERENCES flower_species(id)
color_en     text nullable          -- "Red", "White", "Purple"; null for single-color flowers
color_si     text nullable
image_path   text nullable          -- Supabase Storage path, e.g. "flowers/red-rose.webp"
is_featured  boolean NOT NULL DEFAULT false  -- drives fresh-flowers-near-me showcase (target: 8)
is_active    boolean NOT NULL DEFAULT true
sort_order   integer NOT NULL DEFAULT 0
```

**Display name rule:**
- `colorEn` present: `"{colorEn} {species.nameEn}"` → "Red Rose", "Purple Chrysanthemum"
- `colorEn` null: `"{species.nameEn}"` → "Lotus", "Baby's Breath"

### `products` table addition

```
flower_variant_id  text nullable REFERENCES flower_variants(id) ON DELETE SET NULL
```

Nullable. Existing products remain valid without a variant link. New supplier listings should reference a variant so the quotation builder can auto-price by variant.

## Initial Seed

Convert 29 entries from `apps/web/src/lib/flower-catalog.ts` into species + variants:

| Species | Variants |
|---|---|
| Rose | red-rose, white-rose |
| Chrysanthemum | white-chrysanthemum, purple-chrysanthemum |
| Lily | pink-lily |
| Hydrangea | green-hydrangea |
| Statice (Limonium) | purple-statice |
| Gerbera Daisy | white-gerbera-daisy |
| Carnation | carnation |
| Orchid | orchid |
| Alstroemeria | alstroemeria |
| Michael Daisy | michaelmas-daisy |
| Super Daisy | super-daisy |
| Macrum Daisy | macrum-daisy |
| Baby's Breath | babys-breath |
| Goldenrod (Solidago) | goldenrod |
| Gladiolus | gladiolus |
| Snapdragon | snapdragon |
| China Aster | china-aster |
| Star of Bethlehem | star-of-bethlehem |
| Anthurium | anthurium |
| Arum / Calla Lily | calla-lily |
| Heliconia (Crab Claw) | heliconia |
| Ginger Flower | ginger-flower |
| Lotus (Nelum) | lotus |
| Blue Water Lily (Nil Manel) | blue-water-lily |
| White Water Lily (Olu) | white-water-lily |
| Jasmine (Pichcha) | jasmine |
| Frangipani (Araliya) | frangipani |
| Marigold (Das Pethiya) | marigold |

Featured variants (is_featured=true, maps to current FEATURED_FLOWERS): red-rose, purple-statice, white-chrysanthemum, green-hydrangea, white-gerbera-daisy, purple-chrysanthemum, pink-lily, white-rose.

## Image Strategy

**Storage bucket:** `flower-images` (public read) in Supabase.  
**URL pattern:** `${SUPABASE_URL}/storage/v1/object/public/flower-images/${imagePath}`  
**Seed behaviour:**
- 8 flowers with existing local webps (`/flowers/*.webp`) → upload to Storage on seed, set `image_path`
- 21 Unsplash-sourced flowers → `image_path = null` initially; admin uploads real photos via admin panel
- Fallback in UI: missing image → `/placeholder-flower.svg`

## API Layer

New file: `packages/api/src/repos/flowers.ts`

All functions return `FlowerVariantRow`: variant fields + joined species fields (`nameEn`, `nameSi`, `localName`, `category`, `defaultUnit`). Public image URL is derived server-side as a helper.

| Function | Returns | Used by |
|---|---|---|
| `listFlowerVariants(db)` | All active variants, ordered by `sort_order` | Quotation generator full gallery |
| `listFeaturedVariants(db)` | `is_featured = true` variants, ordered by `sort_order` | Fresh-flowers-near-me showcase |
| `listDesignerVariants(db)` | Variants with ≥1 active product in `DESIGNER_CATEGORY_SLUGS` | Bouquet designer picker |
| `listSpeciesWithVariants(db)` | Species rows each with their variants array | Admin management |
| `upsertFlowerSpecies(db, data)` | void | Admin CRUD |
| `upsertFlowerVariant(db, data)` | void | Admin CRUD |

Helper exported from `packages/api/src/repos/flowers.ts`:

```ts
export function variantDisplayName(v: FlowerVariantRow, locale: "en" | "si"): string
// Returns "{color} {species}" or just species name when color is null
```

## Page Changes

### `/en/fresh-flowers-near-me`

**Before:** `import { FEATURED_FLOWERS } from "../../lib/flower-catalog"`  
**After:** loader calls `listFeaturedVariants(db)`, passes result to `FlowerShowcase`

### `/en/fresh-flower-quotation-generator`

**Before:** imports `FLOWER_CATALOG` + `FEATURED_FLOWERS` from static TS file  
**After:** loader calls `listFlowerVariants(db)`; the featured showcase at the top uses the first 8 `is_featured` variants from the same result set (no second query). The name-match hack is replaced: `product.flowerVariantId === variant.id` for auto-pricing.

### `/en/design`

**Before:** `listDesignerFlowers(db)` returns `ProductListItem[]` (supplier products)  
**After:** `listDesignerVariants(db)` returns `FlowerVariantRow[]`. `BouquetDesigner` receives variants. The WhatsApp message still describes selected flowers by display name; pricing is dropped from the picker (variants have no price — prices live in products).

### `FlowerShowcase` component

**Before:** `flowers: FlowerType[]`  
**After:** `flowers: FlowerVariantRow[]`, `locale: Locale`, `getHref` / `onEnquire` props unchanged. Image rendered from Storage URL when `imagePath` set, else `/placeholder-flower.svg`.

### Delete

`apps/web/src/lib/flower-catalog.ts` — removed once all three pages are migrated.

## Admin CRUD

### Route: `/flowers` (species list)

Table showing: species name (EN/SI), category, variant count, active toggle.  
Actions: add species (modal form), click row → variants view, toggle active.

### Route: `/flowers/$speciesId` (variant list)

Table showing: display name, color, has-image indicator, featured toggle, active toggle, sort order.  
Actions: add variant (inline form), edit variant, upload image.

### Image Upload Flow

1. Admin selects file in variant form
2. Multipart POST to server function in `apps/admin/src/server/flowers.ts`
3. Server function: `supabase.storage.from("flower-images").upload(path, buffer, { upsert: true })`
4. Path format: `{variantId}/{filename}` (e.g., `red-rose/red-rose.webp`)
5. On success: `UPDATE flower_variants SET image_path = $path WHERE id = $id`
6. Client reloads variant; image URL derived from path

## UI Design

Target: the clean grid visible in the provided screenshots. All flower grids site-wide use this style.

- **Grid:** 2 columns mobile, 3 sm, 4 lg — `grid-cols-2 sm:grid-cols-3 lg:grid-cols-4`
- **Image:** `aspect-square w-full object-contain` on cream background, no card border or shadow
- **Name:** `font-display text-xl font-bold` (Fraunces), dark ink
- **Subtitle:** `text-sm text-muted-foreground` — "Fresh bouquet arrangement"
- **CTA:** tangerine brand color, `"Add to quote →"` (quotation builder) or `"Enquire →"` (other pages)

`FlowerShowcase` already implements this shape. It is the single shared component for all flower grids. CTA behaviour (link vs button) is controlled by `getHref` / `onEnquire` props as today.

## Migration Plan

1. Drizzle schema: add `flower_species`, `flower_variants` to `packages/db/src/schema/flowers.ts`; add `flowerVariantId` to `products` schema
2. `pnpm db:generate` → new migration file
3. Write RLS policies migration for the two new tables (public SELECT; admin INSERT/UPDATE)
4. Update seed script: insert species + variants; upload 8 webps to Storage
5. Implement `packages/api/src/repos/flowers.ts`
6. Migrate three web pages (near-me, quotation-generator, design)
7. Update `FlowerShowcase` component type
8. Delete `apps/web/src/lib/flower-catalog.ts`
9. Implement admin routes + server functions

## Out of Scope

- Seasonality / availability flags (future)
- Per-variant occasion tags (wedding, temple, etc.) (future)
- Linking existing supplier `products` rows to variants (admin can do this manually via the supplier portal; the FK column is added but backfill is not automated)
