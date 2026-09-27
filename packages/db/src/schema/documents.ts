import {
  index, integer, jsonb, pgTable, text, timestamp, uniqueIndex, uuid,
} from "drizzle-orm/pg-core";
import { documentStatus, documentType } from "./enums";
import { orders } from "./orders";
import { users } from "./users";

export interface DocumentLineSnapshot {
  descriptionEn: string;
  descriptionSi: string | null;
  variant: string | null;
  qty: number;
  unit: string;
  unitPrice: number; // customer price, LKR cents
  lineTotal: number; // LKR cents
}

export interface DocumentCustomerSnapshot {
  name: string;
  phone: string;
  email: string | null;
  address: string | null;
  district: string | null;
  city: string | null;
}

export const documents = pgTable(
  "documents",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orderId: uuid("order_id").references(() => orders.id).notNull(),
    type: documentType("type").notNull(),
    docNo: text("doc_no").unique().notNull(),
    status: documentStatus("status").notNull().default("draft"),
    currency: text("currency").notNull().default("LKR"),
    subtotal: integer("subtotal").notNull().default(0),
    discount: integer("discount").notNull().default(0),
    deliveryFee: integer("delivery_fee").notNull().default(0),
    taxAmount: integer("tax_amount").notNull().default(0),
    total: integer("total").notNull().default(0),
    lineSnapshot: jsonb("line_snapshot").$type<DocumentLineSnapshot[]>().notNull(),
    customerSnapshot: jsonb("customer_snapshot").$type<DocumentCustomerSnapshot>().notNull(),
    notes: text("notes"),
    validUntil: timestamp("valid_until", { withTimezone: true }),
    publicToken: text("public_token").unique().notNull(),
    issuedAt: timestamp("issued_at", { withTimezone: true }),
    paidAt: timestamp("paid_at", { withTimezone: true }),
    paymentMethod: text("payment_method"),
    paymentRef: text("payment_ref"),
    pdfPath: text("pdf_path"),
    supersededByDocumentId: uuid("superseded_by_document_id"),
    createdByUserId: uuid("created_by_user_id").references(() => users.id).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("documents_order_idx").on(t.orderId),
    uniqueIndex("documents_public_token_uq").on(t.publicToken),
  ],
);

export const documentOtps = pgTable(
  "document_otps",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    documentId: uuid("document_id").references(() => documents.id, { onDelete: "cascade" }).notNull(),
    phone: text("phone").notNull(),
    codeHash: text("code_hash").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    attempts: integer("attempts").notNull().default(0),
    maxAttempts: integer("max_attempts").notNull().default(5),
    consumedAt: timestamp("consumed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("document_otps_doc_created_idx").on(t.documentId, t.createdAt)],
);
