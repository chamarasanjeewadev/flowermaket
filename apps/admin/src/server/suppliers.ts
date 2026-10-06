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
  adminSetShopSellerTypes,
  createInvite,
  generateInviteToken,
  buildInviteMessage,
  buildJoinUrl,
  applyInviteLink,
  normalizeLkPhone,
  getActiveInviteByPhone,
  getInviteByToken,
  INVITE_LINK_PLACEHOLDER,
  recordOutboundMessage,
  type ActionResult,
  type ReviewableShop,
  type VerificationStatus,
  type CreateShopInput,
  type SellerType,
  type InviteLanguage,
} from "@flowers/api";
import { createSupabaseAdminClient } from "@flowers/auth";
import {
  getWhatsappStatus,
  sendWhatsappText,
  type EvolutionConfig,
  type WhatsappStatus,
} from "@flowers/integrations";
import { resolveAdminSession } from "./session";

const INVITE_TTL_DAYS = 30;

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

export interface InvitePayload {
  phone: string;
  nameEn: string | null;
  /** null = let the supplier choose at registration. */
  sellerTypes: SellerType[] | null;
  language: InviteLanguage;
  /**
   * The admin-reviewed message. `{link}` is replaced with the join URL; when
   * null the default template is used.
   */
  message: string | null;
  /** "whatsapp" sends via Evolution; "link" only creates the invite. */
  delivery: "whatsapp" | "link";
}

export type InviteDelivery =
  | { status: "sent" }
  | { status: "skipped" }
  | { status: "failed"; detail: string };

export interface InviteResult {
  token: string;
  joinUrl: string;
  phone: string;
  message: string;
  delivery: InviteDelivery;
}

function evolutionConfig(): EvolutionConfig {
  const env = getEnv();
  // Empty strings make sendWhatsappText / getWhatsappStatus report "not configured".
  return {
    apiUrl: env.EVOLUTION_API_URL ?? "",
    apiKey: env.EVOLUTION_API_KEY ?? "",
    instance: env.EVOLUTION_INSTANCE ?? "",
  };
}

/** Live Evolution connection state, shown on the invite screen before sending. */
export const getWhatsappStatusFn = createServerFn({ method: "GET" }).handler(
  async (): Promise<WhatsappStatus> => {
    await requireAdmin();
    return getWhatsappStatus(evolutionConfig());
  },
);

async function deliverInvite(
  db: NonNullable<ReturnType<typeof tryCreateDb>>,
  phone: string,
  message: string,
): Promise<InviteDelivery> {
  const res = await sendWhatsappText(evolutionConfig(), phone, message);
  if (!res.ok) return { status: "failed", detail: res.message };
  try {
    await recordOutboundMessage(db, { phone, text: message });
  } catch {
    // logging into the inbox is best-effort; never fail the invite
  }
  return { status: "sent" };
}

/**
 * Create a tokenized invite and (optionally) send the admin-reviewed message
 * over WhatsApp. The invite row is created first; a send failure is reported
 * with Evolution's reason and the admin can retry via {@link resendInviteFn}.
 */
export const inviteSupplierFn = createServerFn({ method: "POST" })
  .validator((input: InvitePayload) => input)
  .handler(async ({ data }): Promise<ActionResult<InviteResult>> => {
    const session = await requireAdmin();
    const db = tryCreateDb();
    if (!db) {
      return { ok: false, code: "db_unavailable", message: "Database is not configured." };
    }

    const phone = normalizeLkPhone(data.phone);
    if (!phone) {
      return {
        ok: false,
        code: "validation",
        message: "Enter a Sri Lankan mobile number, e.g. 0771234567.",
      };
    }

    const token = generateInviteToken();
    const env = getEnv();
    // Refuse before creating a dead invite if the portal origin is missing.
    const joinUrl = buildJoinUrl(env.SUPPLIER_PORTAL_URL, token);
    if (!joinUrl) {
      return {
        ok: false,
        code: "db_unavailable",
        message:
          "Supplier portal URL (SUPPLIER_PORTAL_URL) is not configured; cannot build a join link.",
      };
    }

    const template =
      data.message?.trim() ||
      buildInviteMessage({
        nameEn: data.nameEn,
        sellerTypes: data.sellerTypes,
        language: data.language,
        joinUrl: INVITE_LINK_PLACEHOLDER,
      });
    const message = applyInviteLink(template, joinUrl);

    const expiresAt = new Date(Date.now() + INVITE_TTL_DAYS * 24 * 60 * 60 * 1000);
    const created = await createInvite(db, {
      phone,
      nameEn: data.nameEn,
      sellerTypes: data.sellerTypes,
      language: data.language,
      token,
      sentBy: session.kind === "admin" ? session.userId : null,
      expiresAt,
    });
    if (!created.ok) return created;

    const delivery: InviteDelivery =
      data.delivery === "whatsapp"
        ? await deliverInvite(db, phone, message)
        : { status: "skipped" };

    return { ok: true, data: { token, joinUrl, phone, message, delivery } };
  });

/**
 * Look up the pending invite for a number so the admin can resend it instead
 * of hitting the one-active-invite-per-number rule.
 */
export const getPendingInviteFn = createServerFn({ method: "GET" })
  .validator((input: { phone: string }) => input)
  .handler(async ({ data }): Promise<{ token: string; joinUrl: string } | null> => {
    await requireAdmin();
    const db = tryCreateDb();
    const phone = normalizeLkPhone(data.phone);
    if (!db || !phone) return null;
    const invite = await getActiveInviteByPhone(db, phone);
    const joinUrl = invite ? buildJoinUrl(getEnv().SUPPLIER_PORTAL_URL, invite.token) : null;
    return invite && joinUrl ? { token: invite.token, joinUrl } : null;
  });

/** (Re)send an existing invite's message — after a failed send or a typo fix. */
export const resendInviteFn = createServerFn({ method: "POST" })
  .validator((input: { token: string; message: string }) => input)
  .handler(async ({ data }): Promise<ActionResult<InviteResult>> => {
    await requireAdmin();
    const db = tryCreateDb();
    if (!db) {
      return { ok: false, code: "db_unavailable", message: "Database is not configured." };
    }
    const invite = await getInviteByToken(db, data.token);
    if (!invite || invite.status !== "sent") {
      return { ok: false, code: "not_found", message: "This invite is no longer pending." };
    }
    const joinUrl = buildJoinUrl(getEnv().SUPPLIER_PORTAL_URL, invite.token);
    if (!joinUrl) {
      return {
        ok: false,
        code: "db_unavailable",
        message: "Supplier portal URL (SUPPLIER_PORTAL_URL) is not configured.",
      };
    }
    const message = applyInviteLink(data.message, joinUrl);
    const delivery = await deliverInvite(db, invite.phone, message);
    return {
      ok: true,
      data: { token: invite.token, joinUrl, phone: invite.phone, message, delivery },
    };
  });

/** Change an existing shop's seller types (florist / supplier / farmer). */
export const setSupplierSellerTypesFn = createServerFn({ method: "POST" })
  .validator((input: { shopId: string; sellerTypes: SellerType[] }) => input)
  .handler(
    async ({ data }): Promise<ActionResult<{ id: string; sellerTypes: SellerType[] }>> => {
      await requireAdmin();
      const db = tryCreateDb();
      if (!db) {
        return { ok: false, code: "db_unavailable", message: "Database is not configured." };
      }
      return adminSetShopSellerTypes(db, data.shopId, data.sellerTypes);
    },
  );
