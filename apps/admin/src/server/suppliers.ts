/**
 * Supplier provisioning + verification server functions for the Admin Portal.
 * Uses the Supabase service-role client to create auth accounts on behalf of
 * farmers/florists onboarded via WhatsApp or a field agent.
 */
import { createServerFn } from "@tanstack/react-start";
import {
  getEnv,
  tryCreateDb,
  adminCreateSupplier,
  getUserByEmail,
  listShopsForReview,
  reviewShop,
  type ActionResult,
  type ReviewableShop,
  type VerificationStatus,
  type CreateShopInput,
} from "@flowers/api";
import { createSupabaseAdminClient } from "@flowers/auth";
import { resolveAdminSession } from "./session";

async function requireAdmin() {
  const session = await resolveAdminSession();
  if (
    session.kind === "anonymous" ||
    session.kind === "config_error" ||
    session.kind === "forbidden"
  ) {
    throw new Error("Unauthorized");
  }
  return session;
}

/**
 * Phone-only accounts need a synthetic email: the handle_new_user trigger
 * copies auth.users.email into public.users.email (NOT NULL), so a phone-only
 * auth user would break it. Derive a stable placeholder from the digits.
 */
function resolveEmail(rawEmail: string | null, phone: string | null): string | null {
  if (rawEmail) return rawEmail;
  if (!phone) return null;
  const digits = phone.replace(/\D/g, "");
  return digits ? `${digits}@phone.flowermarket.lk` : null;
}

export const listSuppliersForReview = createServerFn({ method: "GET" })
  .validator((input: { status?: VerificationStatus } | undefined) => input ?? {})
  .handler(async ({ data }): Promise<ReviewableShop[]> => {
    await requireAdmin();
    const db = tryCreateDb();
    if (!db) return [];
    return listShopsForReview(db, data.status ? { status: data.status } : undefined);
  });

export interface CreateSupplierPayload {
  email: string | null;
  phone: string | null;
  fullName: string | null;
  shop: CreateShopInput;
  verificationStatus: VerificationStatus;
}

export const createSupplierFn = createServerFn({ method: "POST" })
  .validator((input: CreateSupplierPayload) => input)
  .handler(async ({ data }): Promise<ActionResult<{ shopId: string; slug: string }>> => {
    await requireAdmin();

    const db = tryCreateDb();
    if (!db) {
      return { ok: false, code: "db_unavailable", message: "Database is not configured." };
    }

    const env = getEnv();
    if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
      return {
        ok: false,
        code: "db_unavailable",
        message: "Supabase service-role is not configured; cannot provision accounts.",
      };
    }

    const rawEmail = data.email?.trim() || null;
    const phone = data.phone?.trim() || null;
    const email = resolveEmail(rawEmail, phone);
    if (!email) {
      return { ok: false, code: "validation", message: "An email or a phone number is required." };
    }

    const admin = createSupabaseAdminClient({
      url: env.SUPABASE_URL,
      serviceRoleKey: env.SUPABASE_SERVICE_ROLE_KEY,
    });

    // Provision (or reuse) the auth user.
    let userId: string | undefined;
    const { data: created, error } = await admin.auth.admin.createUser({
      email,
      phone: phone ?? undefined,
      email_confirm: true,
      phone_confirm: !!phone,
      user_metadata: data.fullName ? { full_name: data.fullName } : undefined,
    });

    if (created?.user) {
      userId = created.user.id;
    } else if (error) {
      // Likely already registered — reuse the existing user by email.
      const existing = await getUserByEmail(db, email);
      if (existing) userId = existing.id;
      if (!userId) {
        return { ok: false, code: "conflict", message: error.message };
      }
    }

    if (!userId) {
      return { ok: false, code: "unknown", message: "Could not resolve a user id." };
    }

    return adminCreateSupplier(db, {
      userId,
      email,
      phone,
      fullName: data.fullName,
      shop: data.shop,
      verificationStatus: data.verificationStatus,
    });
  });

export const reviewSupplierFn = createServerFn({ method: "POST" })
  .validator(
    (input: { shopId: string; status: VerificationStatus; notes?: string | null }) => input,
  )
  .handler(async ({ data }): Promise<ActionResult<{ id: string }>> => {
    const session = await requireAdmin();
    const reviewerId = session.kind === "admin" ? session.userId : null;
    const db = tryCreateDb();
    if (!db) {
      return { ok: false, code: "db_unavailable", message: "Database is not configured." };
    }
    return reviewShop(db, data.shopId, reviewerId, data.status, data.notes ?? null);
  });
