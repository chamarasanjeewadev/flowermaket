import { boolean, index, integer, pgTable, text } from "drizzle-orm/pg-core";

/**
 * Admin-managed flower categories (Imported, Tropical, Local, …).
 * `flower_species.category` stores the slug (no FK — kept as plain text so the
 * original enum-era rows keep working).
 */
export const flowerCategories = pgTable("flower_categories", {
  slug: text("slug").primaryKey(),
  nameEn: text("name_en").notNull(),
  nameSi: text("name_si"),
  sortOrder: integer("sort_order").notNull().default(0),
  isActive: boolean("is_active").notNull().default(true),
});

export const flowerSpecies = pgTable("flower_species", {
  id: text("id").primaryKey(),
  nameEn: text("name_en").notNull(),
  nameSi: text("name_si").notNull(),
  localName: text("local_name"),
  /** flower_categories.slug */
  category: text("category").notNull(),
  defaultUnit: text("default_unit", {
    enum: ["stem", "bunch", "arrangement", "item"],
  }).notNull(),
  sortOrder: integer("sort_order").notNull().default(0),
  isActive: boolean("is_active").notNull().default(true),
});

export const flowerVariants = pgTable(
  "flower_variants",
  {
    id: text("id").primaryKey(),
    speciesId: text("species_id")
      .notNull()
      .references(() => flowerSpecies.id),
    colorEn: text("color_en"),
    colorSi: text("color_si"),
    imagePath: text("image_path"),
    isFeatured: boolean("is_featured").notNull().default(false),
    isActive: boolean("is_active").notNull().default(true),
    sortOrder: integer("sort_order").notNull().default(0),
  },
  (t) => [index("flower_variants_species_id_idx").on(t.speciesId)],
);
