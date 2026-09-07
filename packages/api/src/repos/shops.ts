/**
 * Shop repo — all data access for the `shops` table.
 *
 * Follows the established data-layer conventions:
 * - `db` first arg so callers compose transactions.
 * - Returns `ActionResult<T>` — no throws from business logic.
 * - Pure validation helpers are exported separately so they are unit-testable
 *   without a database (see shops.test.ts).
 */
import { eq } from "drizzle-orm";
import { schema } from "@flowers/db/client";
import type { Db } from "../db";
import { err, ok, isPgError, type ActionResult } from "../errors";
import { slugify } from "../slug";
import { DISTRICTS } from "../constants";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ShopType = "florist" | "grower";

export interface CreateShopInput {
  nameEn: string;
  nameSi?: string | null;
  descriptionEn?: string | null;
  descriptionSi?: string | null;
  district: string;
  city?: string | null;
  shopType?: ShopType | null;
}

export interface UpdateShopInput {
  nameEn?: string;
  nameSi?: string | null;
  descriptionEn?: string | null;
  descriptionSi?: string | null;
  city?: string | null;
}

export interface ShopRow {
  id: string;
  ownerUserId: string;
  slug: string;
  shopType: ShopType;
  nameEn: string;
  nameSi: string | null;
  descriptionEn: string | null;
  descriptionSi: string | null;
  district: string;
  city: string | null;
  verificationStatus: "unverified" | "pending" | "verified" | "rejected";
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

// ---------------------------------------------------------------------------
// Pure validation helpers (exported for unit tests)
// ---------------------------------------------------------------------------

const DISTRICT_SLUGS = new Set(DISTRICTS.map((d) => d.slug));
const SHOP_TYPES = new Set<ShopType>(["florist", "grower"]);

export interface ValidationError {
  field: string;
  message: string;
}

/**
 * Validates CreateShopInput without touching the database.
 * Returns an array of validation errors (empty = valid).
 */
export function validateCreateShopInput(input: CreateShopInput): ValidationError[] {
  const errors: ValidationError[] = [];

  const nameEn = input.nameEn?.trim() ?? "";
  if (!nameEn) {
    errors.push({ field: "nameEn", message: "Shop name (English) is required." });
  } else if (nameEn.length < 2) {
    errors.push({ field: "nameEn", message: "Shop name must be at least 2 characters." });
  } else if (nameEn.length > 100) {
    errors.push({ field: "nameEn", message: "Shop name must be at most 100 characters." });
  }

  if (!input.district || !DISTRICT_SLUGS.has(input.district)) {
    errors.push({ field: "district", message: "District must be a valid Sri Lanka district slug." });
  }

  if (input.shopType != null && !SHOP_TYPES.has(input.shopType)) {
    errors.push({ field: "shopType", message: "Shop type must be either florist or grower." });
  }

  return errors;
}

/**
 * Validates UpdateShopInput without touching the database.
 * Returns an array of validation errors (empty = valid).
 */
export function validateUpdateShopInput(input: UpdateShopInput): ValidationError[] {
  const errors: ValidationError[] = [];

  if (input.nameEn !== undefined) {
    const nameEn = input.nameEn.trim();
    if (!nameEn) {
      errors.push({ field: "nameEn", message: "Shop name (English) cannot be empty." });
    } else if (nameEn.length < 2) {
      errors.push({ field: "nameEn", message: "Shop name must be at least 2 characters." });
    } else if (nameEn.length > 100) {
      errors.push({ field: "nameEn", message: "Shop name must be at most 100 characters." });
    }
  }

  return errors;
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

export async function getShopByOwner(
  db: Db,
  ownerUserId: string,
): Promise<ShopRow | null> {
  const [row] = await db
    .select()
    .from(schema.shops)
    .where(eq(schema.shops.ownerUserId, ownerUserId))
    .limit(1);
  return row ? (row as ShopRow) : null;
}

export async function getShopBySlug(
  db: Db,
  slug: string,
): Promise<ShopRow | null> {
  const [row] = await db
    .select()
    .from(schema.shops)
    .where(eq(schema.shops.slug, slug))
    .limit(1);
  return row ? (row as ShopRow) : null;
}

// ---------------------------------------------------------------------------
// Mutations
// ---------------------------------------------------------------------------

/**
 * Create a shop for a user.
 *
 * - Validates input (nameEn 2–100 chars, valid district slug).
 * - Generates a unique slug from nameEn using a random suffix.
 * - Inserts shop with verification_status = 'pending'.
 * - Upgrades the owner's role to 'supplier' if currently 'buyer'.
 * - Returns conflict error if the user already owns a shop.
 *
 * Both the shop insert and role upgrade happen in one transaction.
 */
export async function createShop(
  db: Db,
  ownerUserId: string,
  input: CreateShopInput,
): Promise<ActionResult<{ id: string; slug: string }>> {
  const errors = validateCreateShopInput(input);
  if (errors.length > 0) {
    return err("validation", errors.map((e) => e.message).join(" "));
  }

  const nameEn = input.nameEn.trim();
  const base = slugify(nameEn) || "shop";
  // Append a short random suffix to keep slugs unique without a DB round-trip.
  const suffix = Math.random().toString(36).slice(2, 8);
  const slug = `${base}-${suffix}`;

  try {
    return await db.transaction(async (tx) => {
      // One shop per owner.
      const [existing] = await tx
        .select({ id: schema.shops.id })
        .from(schema.shops)
        .where(eq(schema.shops.ownerUserId, ownerUserId))
        .limit(1);

      if (existing) {
        return err("conflict", "You already have a shop.");
      }

      const [shop] = await tx
        .insert(schema.shops)
        .values({
          ownerUserId,
          slug,
          nameEn,
          nameSi: input.nameSi ?? null,
          descriptionEn: input.descriptionEn ?? null,
          descriptionSi: input.descriptionSi ?? null,
          district: input.district,
          city: input.city ?? null,
          shopType: input.shopType ?? "florist",
          verificationStatus: "pending",
        })
        .returning({ id: schema.shops.id, slug: schema.shops.slug });

      // Upgrade buyer → supplier in the same transaction.
      await tx
        .update(schema.users)
        .set({ role: "supplier", updatedAt: new Date() })
        .where(eq(schema.users.id, ownerUserId));

      return ok({ id: shop.id, slug: shop.slug });
    });
  } catch (e) {
    if (isPgError(e, "23505")) {
      return err("conflict", "You already have a shop.");
    }
    return err(
      "unknown",
      e instanceof Error ? e.message : "Could not create shop.",
    );
  }
}

/**
 * Update a shop's editable fields (owner-scoped).
 *
 * Slug and verification_status may NOT be changed via this function.
 */
export async function updateShop(
  db: Db,
  ownerUserId: string,
  patch: UpdateShopInput,
): Promise<ActionResult<{ id: string }>> {
  const errors = validateUpdateShopInput(patch);
  if (errors.length > 0) {
    return err("validation", errors.map((e) => e.message).join(" "));
  }

  // Build the update set, excluding slug and verificationStatus.
  type ShopUpdate = {
    updatedAt: Date;
    nameEn?: string;
    nameSi?: string | null;
    descriptionEn?: string | null;
    descriptionSi?: string | null;
    city?: string | null;
  };

  const updateSet: ShopUpdate = { updatedAt: new Date() };
  if (patch.nameEn !== undefined) updateSet.nameEn = patch.nameEn.trim();
  if ("nameSi" in patch) updateSet.nameSi = patch.nameSi ?? null;
  if ("descriptionEn" in patch) updateSet.descriptionEn = patch.descriptionEn ?? null;
  if ("descriptionSi" in patch) updateSet.descriptionSi = patch.descriptionSi ?? null;
  if ("city" in patch) updateSet.city = patch.city ?? null;

  try {
    const [row] = await db
      .select({ id: schema.shops.id })
      .from(schema.shops)
      .where(eq(schema.shops.ownerUserId, ownerUserId))
      .limit(1);

    if (!row) {
      return err("not_found", "Shop not found.");
    }

    await db
      .update(schema.shops)
      .set(updateSet)
      .where(eq(schema.shops.ownerUserId, ownerUserId));

    return ok({ id: row.id });
  } catch (e) {
    return err(
      "unknown",
      e instanceof Error ? e.message : "Could not update shop.",
    );
  }
}
