import { pgEnum } from "drizzle-orm/pg-core";

export const userRole = pgEnum("user_role", ["buyer", "supplier", "admin"]);

export const language = pgEnum("language", ["en", "si"]);

export const verificationStatus = pgEnum("verification_status", [
  "unverified",
  "pending",
  "verified",
  "rejected",
]);

export const shopType = pgEnum("shop_type", ["florist", "grower"]);

export const productStatus = pgEnum("product_status", [
  "draft",
  "active",
  "paused",
  "archived",
]);

export const listingType = pgEnum("listing_type", ["retail", "wholesale"]);

export const orderStatus = pgEnum("order_status", [
  "draft", "sourcing", "quoted", "confirmed",
  "invoiced", "paid", "fulfilling", "completed", "cancelled",
]);

export const rfqStatus = pgEnum("rfq_status", [
  "sent", "viewed", "quoted", "declined", "expired", "awarded", "closed",
]);

export const awardStatus = pgEnum("award_status", ["pending", "confirmed", "cancelled"]);

export const documentType = pgEnum("document_type", ["quotation", "invoice", "receipt"]);

export const documentStatus = pgEnum("document_status", [
  "draft", "sent", "viewed", "accepted", "paid", "void",
]);

export const orderSource = pgEnum("order_source", ["whatsapp", "phone", "web", "walk_in"]);
