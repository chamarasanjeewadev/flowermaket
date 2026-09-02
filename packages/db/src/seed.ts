/**
 * Idempotent seed for flowers — run with `pnpm db:seed` once
 * DATABASE_URL points at the Supabase Postgres.
 *
 * Safe to re-run: every insert is keyed on a stable slug and uses
 * onConflictDoNothing.
 *
 * Set SEED_DEMO=1 to also insert a demo shop and 3 demo products.
 */
import { drizzle } from "drizzle-orm/postgres-js";
import { eq } from "drizzle-orm";
import postgres from "postgres";
import * as schema from "./schema/index";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error(
    "DATABASE_URL is not set. Set it to your Supabase Postgres connection string before running the seed.",
  );
  process.exit(1);
}

const sql = postgres(url, { max: 1, prepare: false });
const db = drizzle(sql, { schema });

const CATEGORIES: Array<{
  slug: string;
  nameEn: string;
  nameSi: string;
  sortOrder: number;
}> = [
  { slug: "bouquets", nameEn: "Bouquets", nameSi: "මල් කළඹ", sortOrder: 1 },
  { slug: "wedding", nameEn: "Wedding", nameSi: "මංගල මල්", sortOrder: 2 },
  { slug: "funeral", nameEn: "Funeral", nameSi: "අවමංගල්‍ය මල්", sortOrder: 3 },
  { slug: "garlands", nameEn: "Garlands", nameSi: "මල් මාලා", sortOrder: 4 },
  {
    slug: "poya-temple",
    nameEn: "Poya & Temple",
    nameSi: "පෝය/පන්සල් මල්",
    sortOrder: 5,
  },
  {
    slug: "loose-flowers",
    nameEn: "Loose Flowers",
    nameSi: "ලිහිල් මල්",
    sortOrder: 6,
  },
  { slug: "plants", nameEn: "Plants", nameSi: "පැළ", sortOrder: 7 },
];

async function main() {
  console.log("Seeding categories…");
  await db
    .insert(schema.categories)
    .values(CATEGORIES)
    .onConflictDoNothing({ target: schema.categories.slug });
  console.log(`  ${CATEGORIES.length} categories seeded (skipped if already exist).`);

  if (process.env.SEED_DEMO === "1") {
    console.log("SEED_DEMO=1 — seeding demo shop and products…");

    // Demo shop requires a real user row first.
    // We insert a minimal demo owner user (idempotent on email).
    const demoEmail = "demo-owner@flowers.local";
    const demoUserId = "00000000-0000-0000-0000-000000000001";

    await db
      .insert(schema.users)
      .values({
        id: demoUserId,
        role: "supplier",
        email: demoEmail,
        fullName: "Demo Shop Owner",
      })
      // No conflict target: users has UNIQUE constraints on both id and
      // email; a collision on either should no-op. All other seed inserts
      // use an explicit target because slug is their single natural key.
      .onConflictDoNothing();

    const demoShopSlug = "demo-florist";
    await db
      .insert(schema.shops)
      .values({
        ownerUserId: demoUserId,
        slug: demoShopSlug,
        shopType: "florist",
        nameEn: "Demo Florist",
        nameSi: "ආදර්ශ මල් වෙළඳසැල",
        descriptionEn: "A demo flower shop for development and testing.",
        district: "Colombo",
        city: "Colombo",
        verificationStatus: "verified",
        isActive: true,
      })
      .onConflictDoNothing({ target: schema.shops.slug });

    const [demoShop] = await db
      .select({ id: schema.shops.id })
      .from(schema.shops)
      .where(eq(schema.shops.slug, demoShopSlug));

    const [bouquetCat] = await db
      .select({ id: schema.categories.id })
      .from(schema.categories)
      .where(eq(schema.categories.slug, "bouquets"));

    if (demoShop && bouquetCat) {
      await db
        .insert(schema.products)
        .values([
          {
            shopId: demoShop.id,
            categoryId: bouquetCat.id,
            slug: "demo-rose-bouquet",
            nameEn: "Classic Rose Bouquet",
            nameSi: "සම්භාව්‍ය රෝස මල් කළඹ",
            descriptionEn: "A dozen fresh red roses, beautifully arranged.",
            price: 350000, // LKR 3,500.00
            listingType: "retail",
            status: "active",
          },
          {
            shopId: demoShop.id,
            categoryId: bouquetCat.id,
            slug: "demo-mixed-seasonal",
            nameEn: "Mixed Seasonal Bouquet",
            nameSi: "සෘතුමය මල් කළඹ",
            descriptionEn: "Seasonal flowers hand-picked from local growers.",
            price: 250000, // LKR 2,500.00
            listingType: "retail",
            status: "active",
          },
          {
            shopId: demoShop.id,
            categoryId: bouquetCat.id,
            slug: "demo-wholesale-roses",
            nameEn: "Wholesale Roses (50 stems)",
            nameSi: "තොග රෝස මල් (50 කඳු)",
            descriptionEn: "Fresh roses by the bundle for events and resellers.",
            price: 800000, // LKR 8,000.00
            listingType: "wholesale",
            minOrderQty: 2,
            status: "active",
          },
        ])
        .onConflictDoNothing({ target: schema.products.slug });
      console.log("  Demo shop and 3 demo products seeded.");
    } else {
      console.warn(
        "  Could not find demo shop or bouquets category — skipping demo products.",
      );
    }
  }

  console.log("Seed complete.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => sql.end());
