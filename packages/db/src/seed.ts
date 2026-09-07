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
import { eq, inArray } from "drizzle-orm";
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
  // Flower-type categories — skew wholesale (sold per stem). Occasion
  // categories above skew retail. The retail/wholesale split is surfaced via
  // the listing_type filter on the browse page, not the category list.
  { slug: "roses", nameEn: "Roses", nameSi: "රෝස මල්", sortOrder: 8 },
  { slug: "gerberas", nameEn: "Gerberas", nameSi: "ජර්බෙරා මල්", sortOrder: 9 },
  { slug: "orchids", nameEn: "Orchids", nameSi: "ඕකිඩ් මල්", sortOrder: 10 },
  {
    slug: "chrysanthemums",
    nameEn: "Chrysanthemums",
    nameSi: "චමන්ති මල්",
    sortOrder: 11,
  },
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

  if (process.env.SEED_CATALOG === "1") {
    console.log("SEED_CATALOG=1 — seeding flower catalog (shops + products)…");

    const growerUserId = "00000000-0000-0000-0000-000000000010";
    const floristUserId = "00000000-0000-0000-0000-000000000011";

    await db
      .insert(schema.users)
      .values([
        {
          id: growerUserId,
          role: "supplier",
          email: "grower@flowers.local",
          fullName: "Nuwara Eliya Blooms",
        },
        {
          id: floristUserId,
          role: "supplier",
          email: "florist@flowers.local",
          fullName: "Colombo Petals",
        },
      ])
      .onConflictDoNothing();

    await db
      .insert(schema.shops)
      .values([
        {
          ownerUserId: growerUserId,
          slug: "nuwara-eliya-blooms",
          shopType: "grower",
          nameEn: "Nuwara Eliya Blooms",
          nameSi: "නුවරඑළිය බ්ලූම්ස්",
          descriptionEn:
            "Highland flower farm selling stems direct — skip the 4am Manning Market run and buy straight from the grower.",
          descriptionSi:
            "කඳුකර මල් ගොවිපොළක් — උදෑසන මානිං වෙළඳපොළට යෑම අත්හැර, ගොවියාගෙන් කෙලින්ම මිලදී ගන්න.",
          district: "nuwara-eliya",
          city: "Nuwara Eliya",
          verificationStatus: "verified",
          isActive: true,
        },
        {
          ownerUserId: floristUserId,
          slug: "colombo-petals",
          shopType: "florist",
          nameEn: "Colombo Petals",
          nameSi: "කොළඹ පෙටල්ස්",
          descriptionEn:
            "City florist crafting fresh bouquets and arrangements for every occasion.",
          descriptionSi:
            "සෑම අවස්ථාවකටම නැවුම් මල් කළඹ හා සැකසුම් නිර්මාණය කරන නගර මල් සාප්පුවක්.",
          district: "colombo",
          city: "Colombo",
          verificationStatus: "verified",
          isActive: true,
        },
      ])
      .onConflictDoNothing({ target: schema.shops.slug });

    const shopRows = await db
      .select({ id: schema.shops.id, slug: schema.shops.slug })
      .from(schema.shops)
      .where(
        inArray(schema.shops.slug, ["nuwara-eliya-blooms", "colombo-petals"]),
      );
    const catRows = await db
      .select({ id: schema.categories.id, slug: schema.categories.slug })
      .from(schema.categories);

    const grower = shopRows.find((s) => s.slug === "nuwara-eliya-blooms")?.id;
    const florist = shopRows.find((s) => s.slug === "colombo-petals")?.id;
    const catId = (slug: string) => catRows.find((c) => c.slug === slug)?.id;

    type SeedProduct = {
      slug: string;
      categorySlug: string;
      owner: "grower" | "florist";
      nameEn: string;
      nameSi: string;
      descriptionEn: string;
      descriptionSi: string;
      price: number;
      compareAtPrice: number | null;
      listingType: "retail" | "wholesale";
      minOrderQty: number | null;
      stockQty: number | null;
      leadTimeDays: number | null;
      altEn: string;
    };

    // Prices in LKR cents; wholesale is per stem with compareAtPrice as the
    // retail/market reference that drives the "Save X%" badge.
    const CATALOG: SeedProduct[] = [
      {
        slug: "wholesale-red-rose-stem",
        categorySlug: "roses",
        owner: "grower",
        nameEn: "Red Rose (per stem)",
        nameSi: "රතු රෝස (කඳකට)",
        descriptionEn:
          "Farm-fresh red rose stems, cut to order. Ideal for weddings, events and florist resale.",
        descriptionSi:
          "ගොවිපොළෙන් නැවුම් රතු රෝස කඳ, ඇණවුමට කපනු ලැබේ. මංගල, උත්සව හා මල් සාප්පු නැවත විකිණීමට සුදුසුයි.",
        price: 6500,
        compareAtPrice: 9000,
        listingType: "wholesale",
        minOrderQty: 50,
        stockQty: null,
        leadTimeDays: 2,
        altEn: "Red rose stem",
      },
      {
        slug: "wholesale-pink-rose-stem",
        categorySlug: "roses",
        owner: "grower",
        nameEn: "Pink Rose (per stem)",
        nameSi: "රෝස පැහැ රෝස (කඳකට)",
        descriptionEn: "Soft pink rose stems by the bundle, direct from the highland farm.",
        descriptionSi: "කඳුකර ගොවිපොළෙන් කෙලින්ම, මෘදු රෝස පැහැ රෝස කඳ.",
        price: 7000,
        compareAtPrice: 9500,
        listingType: "wholesale",
        minOrderQty: 50,
        stockQty: null,
        leadTimeDays: 2,
        altEn: "Pink rose stem",
      },
      {
        slug: "wholesale-white-rose-stem",
        categorySlug: "roses",
        owner: "grower",
        nameEn: "White Rose (per stem)",
        nameSi: "සුදු රෝස (කඳකට)",
        descriptionEn: "Crisp white rose stems for elegant wedding work and bulk arrangements.",
        descriptionSi: "අලංකාර මංගල වැඩ හා තොග සැකසුම් සඳහා නැවුම් සුදු රෝස කඳ.",
        price: 7500,
        compareAtPrice: 10000,
        listingType: "wholesale",
        minOrderQty: 50,
        stockQty: null,
        leadTimeDays: 2,
        altEn: "White rose stem",
      },
      {
        slug: "wholesale-pink-gerbera-stem",
        categorySlug: "gerberas",
        owner: "grower",
        nameEn: "Pink Gerbera (per stem)",
        nameSi: "රෝස ජර්බෙරා (කඳකට)",
        descriptionEn: "Bright pink gerbera daisies, sold by the stem for events and shops.",
        descriptionSi: "දීප්තිමත් රෝස ජර්බෙරා මල්, උත්සව හා සාප්පු සඳහා කඳ අනුව.",
        price: 4000,
        compareAtPrice: 6000,
        listingType: "wholesale",
        minOrderQty: 25,
        stockQty: null,
        leadTimeDays: 2,
        altEn: "Pink gerbera stem",
      },
      {
        slug: "wholesale-orange-gerbera-stem",
        categorySlug: "gerberas",
        owner: "grower",
        nameEn: "Orange Gerbera (per stem)",
        nameSi: "තැඹිලි ජර්බෙරා (කඳකට)",
        descriptionEn: "Vivid orange gerbera stems, fresh cut and bundled to order.",
        descriptionSi: "දීප්තිමත් තැඹිලි ජර්බෙරා කඳ, නැවුම්ව කපා ඇණවුමට අසුරා ඇත.",
        price: 4000,
        compareAtPrice: 6000,
        listingType: "wholesale",
        minOrderQty: 25,
        stockQty: null,
        leadTimeDays: 2,
        altEn: "Orange gerbera stem",
      },
      {
        slug: "wholesale-dendrobium-stem",
        categorySlug: "orchids",
        owner: "grower",
        nameEn: "Dendrobium Orchid (per stem)",
        nameSi: "ඩෙන්ඩ්‍රොබියම් ඕකිඩ් (කඳකට)",
        descriptionEn: "Long-lasting Dendrobium orchid sprays, perfect for volume decor.",
        descriptionSi: "බොහෝ කල් පවතින ඩෙන්ඩ්‍රොබියම් ඕකිඩ්, තොග සැරසිලි සඳහා කදිමයි.",
        price: 1200,
        compareAtPrice: 2000,
        listingType: "wholesale",
        minOrderQty: 100,
        stockQty: null,
        leadTimeDays: 2,
        altEn: "Dendrobium orchid stem",
      },
      {
        slug: "wholesale-sonia-orchid-stem",
        categorySlug: "orchids",
        owner: "grower",
        nameEn: "Sonia Orchid (per stem)",
        nameSi: "සෝනියා ඕකිඩ් (කඳකට)",
        descriptionEn: "Deep pink Sonia orchid stems, a florist favourite for bulk buys.",
        descriptionSi: "තද රෝස සෝනියා ඕකිඩ් කඳ, තොග මිලදී ගැනීම් සඳහා මල් සාප්පු ප්‍රියතමයකි.",
        price: 1500,
        compareAtPrice: 2500,
        listingType: "wholesale",
        minOrderQty: 100,
        stockQty: null,
        leadTimeDays: 2,
        altEn: "Sonia orchid stem",
      },
      {
        slug: "wholesale-white-chrysanth-stem",
        categorySlug: "chrysanthemums",
        owner: "grower",
        nameEn: "White Chrysanthemum (per stem)",
        nameSi: "සුදු චමන්ති (කඳකට)",
        descriptionEn: "Classic white chrysanthemum stems for garlands, temple and events.",
        descriptionSi: "මල් මාලා, පන්සල් හා උත්සව සඳහා සම්භාව්‍ය සුදු චමන්ති කඳ.",
        price: 3000,
        compareAtPrice: 4500,
        listingType: "wholesale",
        minOrderQty: 30,
        stockQty: null,
        leadTimeDays: 2,
        altEn: "White chrysanthemum stem",
      },
      {
        slug: "wholesale-yellow-chrysanth-stem",
        categorySlug: "chrysanthemums",
        owner: "grower",
        nameEn: "Yellow Chrysanthemum (per stem)",
        nameSi: "කහ චමන්ති (කඳකට)",
        descriptionEn: "Sunny yellow chrysanthemum stems, bundled fresh from the farm.",
        descriptionSi: "ගොවිපොළෙන් නැවුම්ව අසුරන ලද, දීප්තිමත් කහ චමන්ති කඳ.",
        price: 3000,
        compareAtPrice: 4500,
        listingType: "wholesale",
        minOrderQty: 30,
        stockQty: null,
        leadTimeDays: 2,
        altEn: "Yellow chrysanthemum stem",
      },
      {
        slug: "retail-classic-red-rose-bouquet",
        categorySlug: "bouquets",
        owner: "florist",
        nameEn: "Classic Red Rose Bouquet",
        nameSi: "සම්භාව්‍ය රතු රෝස මල් කළඹ",
        descriptionEn: "A dozen fresh red roses, hand-arranged and gift-wrapped.",
        descriptionSi: "නැවුම් රතු රෝස දොළහක්, අතින් සකසා තෑගි ඔතා ඇත.",
        price: 350000,
        compareAtPrice: 450000,
        listingType: "retail",
        minOrderQty: null,
        stockQty: 15,
        leadTimeDays: 1,
        altEn: "Classic red rose bouquet",
      },
      {
        slug: "retail-mixed-gerbera-bouquet",
        categorySlug: "bouquets",
        owner: "florist",
        nameEn: "Mixed Gerbera Bouquet",
        nameSi: "මිශ්‍ර ජර්බෙරා මල් කළඹ",
        descriptionEn: "A cheerful mix of gerbera daisies in seasonal colours.",
        descriptionSi: "සෘතුමය වර්ණවලින් යුත් ප්‍රීතිමත් ජර්බෙරා මල් මිශ්‍රණයක්.",
        price: 280000,
        compareAtPrice: null,
        listingType: "retail",
        minOrderQty: null,
        stockQty: 15,
        leadTimeDays: 1,
        altEn: "Mixed gerbera bouquet",
      },
      {
        slug: "retail-wedding-orchid-arrangement",
        categorySlug: "wedding",
        owner: "florist",
        nameEn: "Wedding Orchid Arrangement",
        nameSi: "මංගල ඕකිඩ් සැකසුම",
        descriptionEn: "An elegant orchid centrepiece, made to order for your big day.",
        descriptionSi: "ඔබේ විශේෂ දිනය සඳහා ඇණවුමට සාදන ලද අලංකාර ඕකිඩ් මධ්‍යස්ථානයක්.",
        price: 850000,
        compareAtPrice: null,
        listingType: "retail",
        minOrderQty: null,
        stockQty: null,
        leadTimeDays: 3,
        altEn: "Wedding orchid arrangement",
      },
    ];

    if (!grower || !florist) {
      console.warn("  Could not find seeded shops — skipping catalog products.");
    } else {
      const values = CATALOG.map((p) => {
        const categoryId = catId(p.categorySlug);
        if (!categoryId) return null;
        return {
          shopId: p.owner === "grower" ? grower : florist,
          categoryId,
          slug: p.slug,
          nameEn: p.nameEn,
          nameSi: p.nameSi,
          descriptionEn: p.descriptionEn,
          descriptionSi: p.descriptionSi,
          price: p.price,
          compareAtPrice: p.compareAtPrice,
          stockQty: p.stockQty,
          leadTimeDays: p.leadTimeDays,
          listingType: p.listingType,
          minOrderQty: p.minOrderQty,
          status: "active" as const,
        };
      }).filter((v): v is NonNullable<typeof v> => v !== null);

      // Only newly-inserted rows are returned (onConflictDoNothing), so the
      // image insert below stays idempotent across re-runs.
      const inserted = await db
        .insert(schema.products)
        .values(values)
        .onConflictDoNothing({ target: schema.products.slug })
        .returning({ id: schema.products.id, slug: schema.products.slug });

      const altBySlug = new Map(CATALOG.map((p) => [p.slug, p.altEn]));
      if (inserted.length > 0) {
        await db.insert(schema.productImages).values(
          inserted.map((row) => ({
            productId: row.id,
            storagePath: "/placeholder-flower.svg",
            altText: altBySlug.get(row.slug) ?? null,
            sortOrder: 0,
            isPrimary: true,
          })),
        );
      }

      console.log(
        `  Catalog seeded: 2 shops, ${values.length} products (${inserted.length} new).`,
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
