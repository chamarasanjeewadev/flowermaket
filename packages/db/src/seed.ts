/**
 * Idempotent seed for flowers — run with `pnpm db:seed` once
 * DATABASE_URL points at the Supabase Postgres.
 *
 * Safe to re-run: every insert is keyed on a stable slug and uses
 * onConflictDoNothing.
 *
 * Set SEED_DEMO=1 to insert non-public demo records for local development.
 * Set SEED_CATALOG=1 to insert a larger non-public sample catalog.
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
        verificationStatus: "unverified",
        isActive: false,
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
            status: "draft",
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
            status: "draft",
          },
          {
            shopId: demoShop.id,
            categoryId: bouquetCat.id,
            slug: "demo-wholesale-roses",
            nameEn: "Wholesale Roses (50 stems)",
            nameSi: "තොග රෝස මල් (50 කඳු)",
            descriptionEn: "Fresh roses by the bundle for events and resellers.",
            price: 450000, // LKR 4,500.00 (~Rs 90/stem × 50)
            listingType: "wholesale",
            minOrderQty: 2,
            status: "draft",
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
    console.log(
      "SEED_CATALOG=1 — seeding non-public sample catalog (shops + products)…",
    );

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
          verificationStatus: "unverified",
          isActive: false,
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
          verificationStatus: "unverified",
          isActive: false,
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
      /** Absolute image URL (free Pexels stock); resolveImageUrl passes it through as-is. */
      imageUrl: string;
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
        price: 8000,
        compareAtPrice: 20000,
        listingType: "wholesale",
        minOrderQty: 50,
        stockQty: null,
        leadTimeDays: 2,
        altEn: "Red rose stem",
        imageUrl:
          "https://images.pexels.com/photos/38055799/pexels-photo-38055799.jpeg?auto=compress&cs=tinysrgb&w=1200",
      },
      {
        slug: "wholesale-pink-rose-stem",
        categorySlug: "roses",
        owner: "grower",
        nameEn: "Pink Rose (per stem)",
        nameSi: "රෝස පැහැ රෝස (කඳකට)",
        descriptionEn: "Soft pink rose stems by the bundle, direct from the highland farm.",
        descriptionSi: "කඳුකර ගොවිපොළෙන් කෙලින්ම, මෘදු රෝස පැහැ රෝස කඳ.",
        price: 8500,
        compareAtPrice: 22000,
        listingType: "wholesale",
        minOrderQty: 50,
        stockQty: null,
        leadTimeDays: 2,
        altEn: "Pink rose stem",
        imageUrl:
          "https://images.pexels.com/photos/5658424/pexels-photo-5658424.jpeg?auto=compress&cs=tinysrgb&w=1200",
      },
      {
        slug: "wholesale-white-rose-stem",
        categorySlug: "roses",
        owner: "grower",
        nameEn: "White Rose (per stem)",
        nameSi: "සුදු රෝස (කඳකට)",
        descriptionEn: "Crisp white rose stems for elegant wedding work and bulk arrangements.",
        descriptionSi: "අලංකාර මංගල වැඩ හා තොග සැකසුම් සඳහා නැවුම් සුදු රෝස කඳ.",
        price: 9000,
        compareAtPrice: 24000,
        listingType: "wholesale",
        minOrderQty: 50,
        stockQty: null,
        leadTimeDays: 2,
        altEn: "White rose stem",
        imageUrl:
          "https://images.pexels.com/photos/6257764/pexels-photo-6257764.jpeg?auto=compress&cs=tinysrgb&w=1200",
      },
      {
        slug: "wholesale-pink-gerbera-stem",
        categorySlug: "gerberas",
        owner: "grower",
        nameEn: "Pink Gerbera (per stem)",
        nameSi: "රෝස ජර්බෙරා (කඳකට)",
        descriptionEn: "Bright pink gerbera daisies, sold by the stem for events and shops.",
        descriptionSi: "දීප්තිමත් රෝස ජර්බෙරා මල්, උත්සව හා සාප්පු සඳහා කඳ අනුව.",
        price: 5000,
        compareAtPrice: 12000,
        listingType: "wholesale",
        minOrderQty: 25,
        stockQty: null,
        leadTimeDays: 2,
        altEn: "Pink gerbera stem",
        imageUrl:
          "https://images.pexels.com/photos/37188244/pexels-photo-37188244.jpeg?auto=compress&cs=tinysrgb&w=1200",
      },
      {
        slug: "wholesale-orange-gerbera-stem",
        categorySlug: "gerberas",
        owner: "grower",
        nameEn: "Orange Gerbera (per stem)",
        nameSi: "තැඹිලි ජර්බෙරා (කඳකට)",
        descriptionEn: "Vivid orange gerbera stems, fresh cut and bundled to order.",
        descriptionSi: "දීප්තිමත් තැඹිලි ජර්බෙරා කඳ, නැවුම්ව කපා ඇණවුමට අසුරා ඇත.",
        price: 5000,
        compareAtPrice: 12000,
        listingType: "wholesale",
        minOrderQty: 25,
        stockQty: null,
        leadTimeDays: 2,
        altEn: "Orange gerbera stem",
        imageUrl:
          "https://images.pexels.com/photos/11001622/pexels-photo-11001622.jpeg?auto=compress&cs=tinysrgb&w=1200",
      },
      {
        slug: "wholesale-dendrobium-stem",
        categorySlug: "orchids",
        owner: "grower",
        nameEn: "Dendrobium Orchid (per stem)",
        nameSi: "ඩෙන්ඩ්‍රොබියම් ඕකිඩ් (කඳකට)",
        descriptionEn: "Long-lasting Dendrobium orchid sprays, perfect for volume decor.",
        descriptionSi: "බොහෝ කල් පවතින ඩෙන්ඩ්‍රොබියම් ඕකිඩ්, තොග සැරසිලි සඳහා කදිමයි.",
        price: 9000,
        compareAtPrice: 20000,
        listingType: "wholesale",
        minOrderQty: 100,
        stockQty: null,
        leadTimeDays: 2,
        altEn: "Dendrobium orchid stem",
        imageUrl:
          "https://images.pexels.com/photos/33734514/pexels-photo-33734514.jpeg?auto=compress&cs=tinysrgb&w=1200",
      },
      {
        slug: "wholesale-sonia-orchid-stem",
        categorySlug: "orchids",
        owner: "grower",
        nameEn: "Sonia Orchid (per stem)",
        nameSi: "සෝනියා ඕකිඩ් (කඳකට)",
        descriptionEn: "Deep pink Sonia orchid stems, a florist favourite for bulk buys.",
        descriptionSi: "තද රෝස සෝනියා ඕකිඩ් කඳ, තොග මිලදී ගැනීම් සඳහා මල් සාප්පු ප්‍රියතමයකි.",
        price: 11000,
        compareAtPrice: 25000,
        listingType: "wholesale",
        minOrderQty: 100,
        stockQty: null,
        leadTimeDays: 2,
        altEn: "Sonia orchid stem",
        imageUrl:
          "https://images.pexels.com/photos/36273679/pexels-photo-36273679.jpeg?auto=compress&cs=tinysrgb&w=1200",
      },
      {
        slug: "wholesale-white-chrysanth-stem",
        categorySlug: "chrysanthemums",
        owner: "grower",
        nameEn: "White Chrysanthemum (per stem)",
        nameSi: "සුදු චමන්ති (කඳකට)",
        descriptionEn: "Classic white chrysanthemum stems for garlands, temple and events.",
        descriptionSi: "මල් මාලා, පන්සල් හා උත්සව සඳහා සම්භාව්‍ය සුදු චමන්ති කඳ.",
        price: 4000,
        compareAtPrice: 9000,
        listingType: "wholesale",
        minOrderQty: 30,
        stockQty: null,
        leadTimeDays: 2,
        altEn: "White chrysanthemum stem",
        imageUrl:
          "https://images.pexels.com/photos/32394954/pexels-photo-32394954.jpeg?auto=compress&cs=tinysrgb&w=1200",
      },
      {
        slug: "wholesale-yellow-chrysanth-stem",
        categorySlug: "chrysanthemums",
        owner: "grower",
        nameEn: "Yellow Chrysanthemum (per stem)",
        nameSi: "කහ චමන්ති (කඳකට)",
        descriptionEn: "Sunny yellow chrysanthemum stems, bundled fresh from the farm.",
        descriptionSi: "ගොවිපොළෙන් නැවුම්ව අසුරන ලද, දීප්තිමත් කහ චමන්ති කඳ.",
        price: 4000,
        compareAtPrice: 9000,
        listingType: "wholesale",
        minOrderQty: 30,
        stockQty: null,
        leadTimeDays: 2,
        altEn: "Yellow chrysanthemum stem",
        imageUrl:
          "https://images.pexels.com/photos/33702615/pexels-photo-33702615.jpeg?auto=compress&cs=tinysrgb&w=1200",
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
        imageUrl:
          "https://images.pexels.com/photos/34730769/pexels-photo-34730769.jpeg?auto=compress&cs=tinysrgb&w=1200",
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
        imageUrl:
          "https://images.pexels.com/photos/37632004/pexels-photo-37632004.jpeg?auto=compress&cs=tinysrgb&w=1200",
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
        imageUrl:
          "https://images.pexels.com/photos/37606382/pexels-photo-37606382.jpeg?auto=compress&cs=tinysrgb&w=1200",
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
          status: "draft" as const,
        };
      }).filter((v): v is NonNullable<typeof v> => v !== null);

      const inserted = await db
        .insert(schema.products)
        .values(values)
        .onConflictDoNothing({ target: schema.products.slug })
        .returning({ id: schema.products.id, slug: schema.products.slug });

      // Resolve ids for ALL catalog products (not just newly-inserted) so the
      // primary image is (re)set on every run — self-healing for rows that
      // predate real photos. Delete-then-insert keeps the primary image in
      // sync with CATALOG below without needing a unique key to upsert against.
      const slugs = CATALOG.map((p) => p.slug);
      const productRows = await db
        .select({ id: schema.products.id, slug: schema.products.slug })
        .from(schema.products)
        .where(inArray(schema.products.slug, slugs));

      const bySlug = new Map(CATALOG.map((p) => [p.slug, p]));
      const productIds = productRows.map((r) => r.id);
      if (productIds.length > 0) {
        await db
          .delete(schema.productImages)
          .where(inArray(schema.productImages.productId, productIds));
        await db.insert(schema.productImages).values(
          productRows.map((row) => {
            const p = bySlug.get(row.slug)!;
            return {
              productId: row.id,
              storagePath: p.imageUrl,
              altText: p.altEn,
              sortOrder: 0,
              isPrimary: true,
            };
          }),
        );
      }

      console.log(
        `  Catalog seeded: 2 shops, ${values.length} products (${inserted.length} new), ${productRows.length} primary images set.`,
      );
    }
  }

  // ---- Flower species --------------------------------------------------------
  console.log("Seeding flower species…");

  const SPECIES_SEED = [
    { id: "rose", nameEn: "Rose", nameSi: "රෝස", localName: null, category: "imported" as const, defaultUnit: "stem" as const, sortOrder: 10 },
    { id: "chrysanthemum", nameEn: "Chrysanthemum", nameSi: "ක්‍රිසෑන්තිමම්", localName: null, category: "imported" as const, defaultUnit: "stem" as const, sortOrder: 20 },
    { id: "lily", nameEn: "Lily", nameSi: "ලිලී", localName: null, category: "imported" as const, defaultUnit: "stem" as const, sortOrder: 30 },
    { id: "hydrangea", nameEn: "Hydrangea", nameSi: "හයිඩ්‍රේන්ජියා", localName: null, category: "imported" as const, defaultUnit: "stem" as const, sortOrder: 40 },
    { id: "statice", nameEn: "Statice", nameSi: "ස්ටැටිස්", localName: "Limonium", category: "imported" as const, defaultUnit: "bunch" as const, sortOrder: 50 },
    { id: "gerbera-daisy", nameEn: "Gerbera Daisy", nameSi: "ජර්බෙරා ඩේසි", localName: null, category: "imported" as const, defaultUnit: "stem" as const, sortOrder: 60 },
    { id: "carnation", nameEn: "Carnation", nameSi: "කාර්නේෂන්", localName: null, category: "imported" as const, defaultUnit: "stem" as const, sortOrder: 70 },
    { id: "orchid", nameEn: "Orchid", nameSi: "ඕකිඩ්", localName: null, category: "tropical" as const, defaultUnit: "stem" as const, sortOrder: 80 },
    { id: "alstroemeria", nameEn: "Alstroemeria", nameSi: "ඇස්ටොමාරිය", localName: "Astomariya", category: "imported" as const, defaultUnit: "stem" as const, sortOrder: 90 },
    { id: "michaelmas-daisy", nameEn: "Michaelmas Daisy", nameSi: "මිකේල් ඩේසි", localName: null, category: "imported" as const, defaultUnit: "stem" as const, sortOrder: 100 },
    { id: "super-daisy", nameEn: "Super Daisy", nameSi: "සුපර් ඩේසි", localName: null, category: "imported" as const, defaultUnit: "stem" as const, sortOrder: 110 },
    { id: "macrum-daisy", nameEn: "Macrum Daisy", nameSi: "මැක්‍රම් ඩේසි", localName: null, category: "imported" as const, defaultUnit: "stem" as const, sortOrder: 120 },
    { id: "babys-breath", nameEn: "Baby's Breath", nameSi: "බේබිස් බ්‍රෙත්", localName: null, category: "imported" as const, defaultUnit: "bunch" as const, sortOrder: 130 },
    { id: "goldenrod", nameEn: "Goldenrod", nameSi: "ගෝල්ඩ්නරොඩ්", localName: "Solidago", category: "imported" as const, defaultUnit: "bunch" as const, sortOrder: 140 },
    { id: "gladiolus", nameEn: "Gladiolus", nameSi: "ග්ලැඩියෝලස්", localName: null, category: "imported" as const, defaultUnit: "stem" as const, sortOrder: 150 },
    { id: "snapdragon", nameEn: "Snapdragon", nameSi: "ස්නෑප්ඩ්‍රැගන්", localName: null, category: "imported" as const, defaultUnit: "stem" as const, sortOrder: 160 },
    { id: "china-aster", nameEn: "China Aster", nameSi: "චයිනා ඇස්ටර්", localName: null, category: "imported" as const, defaultUnit: "stem" as const, sortOrder: 170 },
    { id: "star-of-bethlehem", nameEn: "Star of Bethlehem", nameSi: "ස්ටාර් ඔෆ් බෙත්ලෙහෙම්", localName: null, category: "imported" as const, defaultUnit: "stem" as const, sortOrder: 180 },
    { id: "anthurium", nameEn: "Anthurium", nameSi: "ඇන්තූරියම්", localName: null, category: "tropical" as const, defaultUnit: "stem" as const, sortOrder: 190 },
    { id: "calla-lily", nameEn: "Arum / Calla Lily", nameSi: "ආරම් / කල්ලා ලිලී", localName: null, category: "imported" as const, defaultUnit: "stem" as const, sortOrder: 200 },
    { id: "heliconia", nameEn: "Heliconia", nameSi: "හෙලිකෝනියා", localName: "Crab Claw", category: "tropical" as const, defaultUnit: "stem" as const, sortOrder: 210 },
    { id: "ginger-flower", nameEn: "Ginger Flower", nameSi: "ඉඟුරු මල", localName: null, category: "tropical" as const, defaultUnit: "stem" as const, sortOrder: 220 },
    { id: "lotus", nameEn: "Lotus", nameSi: "නෙළුම්", localName: "Nelum", category: "local" as const, defaultUnit: "stem" as const, sortOrder: 230 },
    { id: "blue-water-lily", nameEn: "Blue Water Lily", nameSi: "නිල් මානෙල්", localName: "Nil Manel", category: "local" as const, defaultUnit: "stem" as const, sortOrder: 240 },
    { id: "white-water-lily", nameEn: "White Water Lily", nameSi: "ඔළු", localName: "Olu", category: "local" as const, defaultUnit: "stem" as const, sortOrder: 250 },
    { id: "jasmine", nameEn: "Jasmine", nameSi: "පිච්ච", localName: "Pichcha / Saman Pichcha", category: "local" as const, defaultUnit: "bunch" as const, sortOrder: 260 },
    { id: "frangipani", nameEn: "Frangipani", nameSi: "අරලිය", localName: "Araliya", category: "local" as const, defaultUnit: "item" as const, sortOrder: 270 },
    { id: "marigold", nameEn: "Marigold", nameSi: "දාස් පෙතිය", localName: "Das Pethiya", category: "local" as const, defaultUnit: "bunch" as const, sortOrder: 280 },
  ] satisfies Array<typeof schema.flowerSpecies.$inferInsert>;

  await db.insert(schema.flowerSpecies).values(SPECIES_SEED).onConflictDoNothing();
  console.log(`  ${SPECIES_SEED.length} flower species seeded (skipped if already exist).`);

  // ---- Flower variants -------------------------------------------------------
  console.log("Seeding flower variants…");

  const VARIANTS_SEED = [
    // Rose — 2 colors
    { id: "red-rose", speciesId: "rose", colorEn: "Red", colorSi: "රතු", imagePath: "Red-Rose.webp", isFeatured: true, sortOrder: 10 },
    { id: "white-rose", speciesId: "rose", colorEn: "White", colorSi: "සුදු", imagePath: "White-Rose.webp", isFeatured: true, sortOrder: 11 },
    // Chrysanthemum — 2 colors
    { id: "white-chrysanthemum", speciesId: "chrysanthemum", colorEn: "White", colorSi: "සුදු", imagePath: "White-Chrysanthemum.webp", isFeatured: true, sortOrder: 20 },
    { id: "purple-chrysanthemum", speciesId: "chrysanthemum", colorEn: "Purple", colorSi: "දම්", imagePath: "Purple-Chrysanthemum.webp", isFeatured: true, sortOrder: 21 },
    // Lily
    { id: "pink-lily", speciesId: "lily", colorEn: "Pink", colorSi: "රෝස", imagePath: "Pink-Lily.webp", isFeatured: true, sortOrder: 30 },
    // Hydrangea
    { id: "green-hydrangea", speciesId: "hydrangea", colorEn: "Green", colorSi: "කොළ", imagePath: "Green-Hydrangea.webp", isFeatured: true, sortOrder: 40 },
    // Statice
    { id: "purple-statice", speciesId: "statice", colorEn: "Purple", colorSi: "දම්", imagePath: "Purple-Statice.webp", isFeatured: true, sortOrder: 50 },
    // Gerbera Daisy
    { id: "white-gerbera-daisy", speciesId: "gerbera-daisy", colorEn: "White", colorSi: "සුදු", imagePath: "White-Gerbera-Daisy.webp", isFeatured: true, sortOrder: 60 },
    // Single-variant species (no distinct color)
    { id: "carnation", speciesId: "carnation", colorEn: null, colorSi: null, imagePath: null, isFeatured: false, sortOrder: 70 },
    { id: "orchid", speciesId: "orchid", colorEn: null, colorSi: null, imagePath: null, isFeatured: false, sortOrder: 80 },
    { id: "alstroemeria", speciesId: "alstroemeria", colorEn: null, colorSi: null, imagePath: null, isFeatured: false, sortOrder: 90 },
    { id: "michaelmas-daisy", speciesId: "michaelmas-daisy", colorEn: null, colorSi: null, imagePath: null, isFeatured: false, sortOrder: 100 },
    { id: "super-daisy", speciesId: "super-daisy", colorEn: null, colorSi: null, imagePath: null, isFeatured: false, sortOrder: 110 },
    { id: "macrum-daisy", speciesId: "macrum-daisy", colorEn: null, colorSi: null, imagePath: null, isFeatured: false, sortOrder: 120 },
    { id: "babys-breath", speciesId: "babys-breath", colorEn: null, colorSi: null, imagePath: null, isFeatured: false, sortOrder: 130 },
    { id: "goldenrod", speciesId: "goldenrod", colorEn: null, colorSi: null, imagePath: null, isFeatured: false, sortOrder: 140 },
    { id: "gladiolus", speciesId: "gladiolus", colorEn: null, colorSi: null, imagePath: null, isFeatured: false, sortOrder: 150 },
    { id: "snapdragon", speciesId: "snapdragon", colorEn: null, colorSi: null, imagePath: null, isFeatured: false, sortOrder: 160 },
    { id: "china-aster", speciesId: "china-aster", colorEn: null, colorSi: null, imagePath: null, isFeatured: false, sortOrder: 170 },
    { id: "star-of-bethlehem", speciesId: "star-of-bethlehem", colorEn: null, colorSi: null, imagePath: null, isFeatured: false, sortOrder: 180 },
    { id: "anthurium", speciesId: "anthurium", colorEn: null, colorSi: null, imagePath: null, isFeatured: false, sortOrder: 190 },
    { id: "calla-lily", speciesId: "calla-lily", colorEn: null, colorSi: null, imagePath: null, isFeatured: false, sortOrder: 200 },
    { id: "heliconia", speciesId: "heliconia", colorEn: null, colorSi: null, imagePath: null, isFeatured: false, sortOrder: 210 },
    { id: "ginger-flower", speciesId: "ginger-flower", colorEn: null, colorSi: null, imagePath: null, isFeatured: false, sortOrder: 220 },
    { id: "lotus", speciesId: "lotus", colorEn: null, colorSi: null, imagePath: null, isFeatured: false, sortOrder: 230 },
    { id: "blue-water-lily", speciesId: "blue-water-lily", colorEn: null, colorSi: null, imagePath: null, isFeatured: false, sortOrder: 240 },
    { id: "white-water-lily", speciesId: "white-water-lily", colorEn: null, colorSi: null, imagePath: null, isFeatured: false, sortOrder: 250 },
    { id: "jasmine", speciesId: "jasmine", colorEn: null, colorSi: null, imagePath: null, isFeatured: false, sortOrder: 260 },
    { id: "frangipani", speciesId: "frangipani", colorEn: null, colorSi: null, imagePath: null, isFeatured: false, sortOrder: 270 },
    { id: "marigold", speciesId: "marigold", colorEn: null, colorSi: null, imagePath: null, isFeatured: false, sortOrder: 280 },
  ] satisfies Array<typeof schema.flowerVariants.$inferInsert>;

  await db.insert(schema.flowerVariants).values(VARIANTS_SEED).onConflictDoNothing();
  console.log(`  ${VARIANTS_SEED.length} flower variants seeded (skipped if already exist).`);

  console.log("Seed complete.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => sql.end());
