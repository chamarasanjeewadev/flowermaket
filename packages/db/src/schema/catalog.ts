import {
  boolean,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { listingType, productStatus } from "./enums";
import { shops } from "./shops";

export const categories = pgTable("categories", {
  id: uuid("id").primaryKey().defaultRandom(),
  slug: text("slug").unique().notNull(),
  nameEn: text("name_en").notNull(),
  nameSi: text("name_si"),
  sortOrder: integer("sort_order").notNull().default(0),
  isActive: boolean("is_active").notNull().default(true),
});

export const products = pgTable(
  "products",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    shopId: uuid("shop_id")
      .references(() => shops.id)
      .notNull(),
    categoryId: uuid("category_id")
      .references(() => categories.id)
      .notNull(),
    slug: text("slug").unique().notNull(),
    nameEn: text("name_en").notNull(),
    nameSi: text("name_si"),
    descriptionEn: text("description_en"),
    descriptionSi: text("description_si"),
    /** Price in LKR minor units (cents). */
    price: integer("price").notNull(),
    compareAtPrice: integer("compare_at_price"),
    /** null = made-to-order */
    stockQty: integer("stock_qty"),
    leadTimeDays: integer("lead_time_days"),
    listingType: listingType("listing_type").notNull().default("retail"),
    minOrderQty: integer("min_order_qty"),
    status: productStatus("status").notNull().default("draft"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("products_shop_id_idx").on(t.shopId),
    index("products_category_id_status_idx").on(t.categoryId, t.status),
  ],
);

export const productImages = pgTable(
  "product_images",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    productId: uuid("product_id")
      .references(() => products.id, { onDelete: "cascade" })
      .notNull(),
    storagePath: text("storage_path").notNull(),
    altText: text("alt_text"),
    sortOrder: integer("sort_order").notNull().default(0),
    isPrimary: boolean("is_primary").notNull().default(false),
  },
  (t) => [index("product_images_product_id_idx").on(t.productId)],
);
