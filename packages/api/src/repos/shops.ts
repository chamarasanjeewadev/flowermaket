/**
 * Shop repo — all data access for the `shops` table.
 *
 * Follows the established data-layer conventions:
 * - `db` first arg so callers compose transactions.
 * - Returns `ActionResult<T>` — no throws from business logic.
 * - Pure validation helpers are exported separately so they are unit-testable
 *   without a database (see shops.test.ts).
 */
import { desc, eq } from "drizzle-orm";
import { schema } from "@flowers/db/client";
import type { Db } from "../db";
import { err, ok, isPgError, type ActionResult } from "../errors";
import { slugify } from "../slug";
import { DISTRICTS } from "../constants";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ShopType = "florist" | "grower";

export type VerificationStatus =
  | "unverified"
  | "pending"
  | "verified"
  | "rejected";

export interface CreateShopInput {
  nameEn: string;
  nameSi?: string | null;
  descriptionEn?: string | null;
  descriptionSi?: string | null;
  district: string;
  city?: string | null;
  shopType?: ShopType | null;
  isAggregator?: boolean | null;
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
  verificationStatus: VerificationStatus;
  isAggregator: boolean;
  plan: string;
  verificationNotes: string | null;
  verificationProof: unknown;
  verificationSubmittedAt: Date | null;
  verificationReviewedAt: Date | null;
  verificationReviewedBy: string | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Single choke point for "may this shop list/sell?". Verification must be
 * `verified` and the shop active. The `plan` seam is accepted for future
 * gating but intentionally not enforced yet (everyone is on "free").
 */
export function canSellCheck(shop: {
  verificationStatus: VerificationStatus;
  isActive: boolean;
  plan?: string;
}): boolean {
  return shop.verificationStatus === "verified" && shop.isActive;
}

// ---------------------------------------------------------------------------
// Pure validation helpers (exported for unit tests)
// ---------------------------------------------------------------------------

const DISTRICT_SLUGS = new Set(DISTRICTS.map((d) => d.slug));
const SHOP_TYPES = new Set<ShopType>(["florist", "grower"]);
const VERIFICATION_STATUSES = new Set<VerificationStatus>([
  "unverified",
  "pending",
  "verified",
  "rejected",
]);

export interface ValidationError {
  field: string;
  message: string;
}

/** Validates a verification-review status without touching the database. */
export function validateReviewInput(input: { status: string }): ValidationError[] {
  const errors: ValidationError[] = [];
  if (!VERIFICATION_STATUSES.has(input.status as VerificationStatus)) {
    errors.push({
      field: "status",
      message: "Status must be a valid verification status.",
    });
  }
  return errors;
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
  opts?: { verificationStatus?: VerificationStatus },
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
          isAggregator: input.isAggregator ?? false,
          verificationStatus: opts?.verificationStatus ?? "pending",
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

// ---------------------------------------------------------------------------
// Verification review (admin)
// ---------------------------------------------------------------------------

export interface ReviewableShop {
  id: string;
  slug: string;
  nameEn: string;
  nameSi: string | null;
  shopType: ShopType;
  isAggregator: boolean;
  district: string;
  city: string | null;
  descriptionEn: string | null;
  descriptionSi: string | null;
  verificationStatus: VerificationStatus;
  verificationNotes: string | null;
  verificationSubmittedAt: Date | null;
  ownerEmail: string;
  ownerFullName: string | null;
  ownerPhone: string | null;
  createdAt: Date;
}

/** List shops for the admin verification queue, newest first; optional status filter. */
export async function listShopsForReview(
  db: Db,
  filter?: { status?: VerificationStatus },
): Promise<ReviewableShop[]> {
  const where = filter?.status
    ? eq(schema.shops.verificationStatus, filter.status)
    : undefined;

  const rows = await db
    .select({
      id: schema.shops.id,
      slug: schema.shops.slug,
      nameEn: schema.shops.nameEn,
      nameSi: schema.shops.nameSi,
      shopType: schema.shops.shopType,
      isAggregator: schema.shops.isAggregator,
      district: schema.shops.district,
      city: schema.shops.city,
      descriptionEn: schema.shops.descriptionEn,
      descriptionSi: schema.shops.descriptionSi,
      verificationStatus: schema.shops.verificationStatus,
      verificationNotes: schema.shops.verificationNotes,
      verificationSubmittedAt: schema.shops.verificationSubmittedAt,
      ownerEmail: schema.users.email,
      ownerFullName: schema.users.fullName,
      ownerPhone: schema.users.phone,
      createdAt: schema.shops.createdAt,
    })
    .from(schema.shops)
    .innerJoin(schema.users, eq(schema.users.id, schema.shops.ownerUserId))
    .where(where)
    .orderBy(desc(schema.shops.createdAt));

  return rows as ReviewableShop[];
}

/** Flip a shop's verification status and record the reviewer + notes. */
export async function reviewShop(
  db: Db,
  shopId: string,
  reviewerId: string | null,
  status: VerificationStatus,
  notes?: string | null,
): Promise<ActionResult<{ id: string }>> {
  const errors = validateReviewInput({ status });
  if (errors.length > 0) {
    return err("validation", errors.map((e) => e.message).join(" "));
  }
  try {
    const [row] = await db
      .update(schema.shops)
      .set({
        verificationStatus: status,
        verificationNotes: notes ?? null,
        verificationReviewedBy: reviewerId,
        verificationReviewedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(schema.shops.id, shopId))
      .returning({ id: schema.shops.id });

    if (!row) return err("not_found", "Shop not found.");
    return ok({ id: row.id });
  } catch (e) {
    return err(
      "unknown",
      e instanceof Error ? e.message : "Could not update verification.",
    );
  }
}

// ---------------------------------------------------------------------------
// Admin provisioning (create a supplier on behalf of a farmer/florist)
// ---------------------------------------------------------------------------

export interface AdminCreateSupplierInput {
  /** The already-provisioned auth user id (from Supabase service-role createUser). */
  userId?: string;
  email: string | null;
  phone?: string | null;
  fullName?: string | null;
  shop: CreateShopInput;
  verificationStatus: VerificationStatus;
}

export function validateAdminCreateSupplierInput(
  input: AdminCreateSupplierInput,
): ValidationError[] {
  const errors: ValidationError[] = [];
  const hasEmail = !!input.email?.trim();
  const hasPhone = !!input.phone?.trim();
  if (!hasEmail && !hasPhone) {
    errors.push({ field: "contact", message: "An email or a phone number is required." });
  }
  errors.push(...validateCreateShopInput(input.shop));
  if (!VERIFICATION_STATUSES.has(input.verificationStatus)) {
    errors.push({ field: "verificationStatus", message: "Invalid verification status." });
  }
  return errors;
}

/**
 * Provision a supplier shop for an auth user the admin already created via the
 * service-role client. Upserts the `users` row (role → supplier) and inserts
 * the shop in one transaction. Returns `conflict` if the user already owns a shop.
 */
export async function adminCreateSupplier(
  db: Db,
  params: AdminCreateSupplierInput & { userId: string; email: string },
): Promise<ActionResult<{ shopId: string; slug: string }>> {
  const errors = validateAdminCreateSupplierInput(params);
  if (errors.length > 0) {
    return err("validation", errors.map((e) => e.message).join(" "));
  }

  const nameEn = params.shop.nameEn.trim();
  const base = slugify(nameEn) || "shop";
  const suffix = Math.random().toString(36).slice(2, 8);
  const slug = `${base}-${suffix}`;

  try {
    return await db.transaction(async (tx) => {
      const [existing] = await tx
        .select({ id: schema.shops.id })
        .from(schema.shops)
        .where(eq(schema.shops.ownerUserId, params.userId))
        .limit(1);
      if (existing) return err("conflict", "This user already owns a shop.");

      // Upsert the users row (the handle_new_user trigger usually created it).
      await tx
        .insert(schema.users)
        .values({
          id: params.userId,
          email: params.email,
          role: "supplier",
          fullName: params.fullName ?? null,
          phone: params.phone ?? null,
        })
        .onConflictDoUpdate({
          target: schema.users.id,
          set: {
            role: "supplier",
            fullName: params.fullName ?? null,
            phone: params.phone ?? null,
            updatedAt: new Date(),
          },
        });

      const [shop] = await tx
        .insert(schema.shops)
        .values({
          ownerUserId: params.userId,
          slug,
          nameEn,
          nameSi: params.shop.nameSi ?? null,
          descriptionEn: params.shop.descriptionEn ?? null,
          descriptionSi: params.shop.descriptionSi ?? null,
          district: params.shop.district,
          city: params.shop.city ?? null,
          shopType: params.shop.shopType ?? "florist",
          isAggregator: params.shop.isAggregator ?? false,
          verificationStatus: params.verificationStatus,
          verificationReviewedAt: new Date(),
        })
        .returning({ id: schema.shops.id, slug: schema.shops.slug });

      return ok({ shopId: shop.id, slug: shop.slug });
    });
  } catch (e) {
    if (isPgError(e, "23505")) return err("conflict", "This user already owns a shop.");
    return err("unknown", e instanceof Error ? e.message : "Could not create supplier.");
  }
}
