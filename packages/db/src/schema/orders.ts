import {
  date, index, integer, pgTable, text, timestamp, uniqueIndex, uuid,
} from "drizzle-orm/pg-core";
import { awardStatus, language, orderSource, orderStatus, rfqStatus } from "./enums";
import { users } from "./users";
import { categories } from "./catalog";
import { shops } from "./shops";
import { flowerVariants } from "./flowers";

export const orders = pgTable(
  "orders",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orderNo: text("order_no").unique().notNull(),
    source: orderSource("source").notNull().default("whatsapp"),
    buyerUserId: uuid("buyer_user_id").references(() => users.id),
    customerName: text("customer_name").notNull(),
    customerPhone: text("customer_phone").notNull(),
    customerEmail: text("customer_email"),
    customerLocale: language("customer_locale").notNull().default("en"),
    deliveryAddress: text("delivery_address"),
    deliveryDistrict: text("delivery_district"),
    deliveryCity: text("delivery_city"),
    neededByDate: date("needed_by_date"),
    notesInternal: text("notes_internal"),
    notesCustomer: text("notes_customer"),
    status: orderStatus("status").notNull().default("draft"),
    createdByUserId: uuid("created_by_user_id").references(() => users.id).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("orders_status_idx").on(t.status),
    index("orders_created_by_idx").on(t.createdByUserId),
  ],
);

export const orderItems = pgTable(
  "order_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orderId: uuid("order_id").references(() => orders.id, { onDelete: "cascade" }).notNull(),
    categoryId: uuid("category_id").references(() => categories.id),
    descriptionEn: text("description_en").notNull(),
    descriptionSi: text("description_si"),
    variant: text("variant"),
    /** Optional link to a flower variant in the catalog (picker-selected). flower_variants.id is text. */
    flowerVariantId: text("flower_variant_id").references(() => flowerVariants.id),
    quantity: integer("quantity").notNull(),
    unit: text("unit").notNull().default("stem"),
    notes: text("notes"),
    sortOrder: integer("sort_order").notNull().default(0),
  },
  (t) => [index("order_items_order_id_idx").on(t.orderId)],
);

export const rfqs = pgTable(
  "rfqs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orderId: uuid("order_id").references(() => orders.id, { onDelete: "cascade" }).notNull(),
    supplierShopId: uuid("supplier_shop_id").references(() => shops.id).notNull(),
    status: rfqStatus("status").notNull().default("sent"),
    message: text("message"),
    quoteNotes: text("quote_notes"),
    quoteValidUntil: timestamp("quote_valid_until", { withTimezone: true }),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    viewedAt: timestamp("viewed_at", { withTimezone: true }),
    respondedAt: timestamp("responded_at", { withTimezone: true }),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("rfqs_order_supplier_uq").on(t.orderId, t.supplierShopId),
    index("rfqs_supplier_idx").on(t.supplierShopId),
  ],
);

export const rfqQuoteLines = pgTable(
  "rfq_quote_lines",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    rfqId: uuid("rfq_id").references(() => rfqs.id, { onDelete: "cascade" }).notNull(),
    orderItemId: uuid("order_item_id").references(() => orderItems.id).notNull(),
    availableQty: integer("available_qty").notNull(),
    unitPrice: integer("unit_price").notNull(),
    leadTimeDays: integer("lead_time_days"),
    notes: text("notes"),
  },
  (t) => [
    index("rfq_quote_lines_rfq_idx").on(t.rfqId),
    index("rfq_quote_lines_item_idx").on(t.orderItemId),
  ],
);

export const orderItemAwards = pgTable(
  "order_item_awards",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orderItemId: uuid("order_item_id").references(() => orderItems.id, { onDelete: "cascade" }).notNull(),
    supplierShopId: uuid("supplier_shop_id").references(() => shops.id).notNull(),
    rfqQuoteLineId: uuid("rfq_quote_line_id").references(() => rfqQuoteLines.id),
    awardedQty: integer("awarded_qty").notNull(),
    unitCost: integer("unit_cost").notNull(),
    status: awardStatus("status").notNull().default("pending"),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("order_item_awards_item_idx").on(t.orderItemId),
    index("order_item_awards_supplier_idx").on(t.supplierShopId),
  ],
);
