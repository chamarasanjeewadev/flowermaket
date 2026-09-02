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
