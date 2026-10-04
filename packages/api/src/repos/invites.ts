/**
 * Supplier invite repo — outbound WhatsApp invitations + tokenized join flow.
 *
 * Pure helpers (token, validation, message builder) are exported separately so
 * they are unit-testable without a database (see invites.test.ts).
 */
import { and, eq } from "drizzle-orm";
import { schema } from "@flowers/db/client";
import type { Db } from "../db";
import { err, ok, isPgError, type ActionResult } from "../errors";
import type { ShopType, ValidationError } from "./shops";

export type InviteLanguage = "en" | "si";

const SHOP_TYPE_SET = new Set<ShopType>(["florist", "grower"]);
const LANGUAGE_SET = new Set<InviteLanguage>(["en", "si"]);

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

const TOKEN_ALPHABET =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";

/** Generate a 24-char url-safe invite token using the Web Crypto API. */
export function generateInviteToken(): string {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  let out = "";
  for (const b of bytes) out += TOKEN_ALPHABET[b % TOKEN_ALPHABET.length];
  return out;
}

export function validateInviteInput(input: {
  phone: string;
  shopType: string;
  language: string;
}): ValidationError[] {
  const errors: ValidationError[] = [];
  const digits = (input.phone ?? "").replace(/\D/g, "");
  if (!digits) {
    errors.push({ field: "phone", message: "A phone number is required." });
  } else if (digits.length < 9) {
    errors.push({ field: "phone", message: "Phone number looks too short." });
  }
  if (!SHOP_TYPE_SET.has(input.shopType as ShopType)) {
    errors.push({ field: "shopType", message: "Shop type must be florist or grower." });
  }
  if (!LANGUAGE_SET.has(input.language as InviteLanguage)) {
    errors.push({ field: "language", message: "Language must be en or si." });
  }
  return errors;
}

/**
 * Build the tokenized join URL from the supplier-portal origin. Returns null
 * when the origin is missing/empty so callers can refuse to send a dead link.
 */
export function buildJoinUrl(
  portalUrl: string | undefined | null,
  token: string,
): string | null {
  const origin = (portalUrl ?? "").trim().replace(/\/$/, "");
  if (!origin) return null;
  return `${origin}/join/${token}`;
}

export interface BuildInviteMessageInput {
  nameEn?: string | null;
  shopType: ShopType;
  isAggregator?: boolean | null;
  language: InviteLanguage;
  joinUrl: string;
}

/** Build a bilingual, type-aware benefits message with the join link. */
export function buildInviteMessage(input: BuildInviteMessageInput): string {
  const name = input.nameEn?.trim() || null;

  if (input.language === "si") {
    const hi = name ? `ආයුබෝවන් ${name},` : "ආයුබෝවන්,";
    let pitch: string;
    if (input.shopType === "florist") {
      pitch =
        "ඔබේ මල් වෙළඳසැලට FlowerMarket.lk හි ඔබේම අන්තර්ජාල වෙළඳසැලක් ලබාගෙන වැඩි ඇණවුම් ලබාගන්න.";
    } else if (input.isAggregator) {
      pitch =
        "FlowerMarket.lk හරහා තොග ඇණවුම් සහ වැඩි ගැනුම්කරුවන් එක තැනකින් කළමනාකරණය කරන්න.";
    } else {
      pitch =
        "FlowerMarket.lk හරහා ඔබේ මල් ගැනුම්කරුවන් සමඟ සෘජුවම සම්බන්ධ වන්න — හොඳ මිල ගණන් සහ නොමිලේ ලැයිස්තුගත කිරීම.";
    }
    return `${hi} ${pitch} මෙතැනින් එක්වන්න: ${input.joinUrl}`;
  }

  const hi = name ? `Hi ${name},` : "Hi there,";
  let pitch: string;
  if (input.shopType === "florist") {
    pitch =
      "FlowerMarket.lk gives your flower shop its own online storefront and brings you more orders online.";
  } else if (input.isAggregator) {
    pitch =
      "FlowerMarket.lk helps aggregators reach more buyers and handle bulk orders and RFQs in one place.";
  } else {
    pitch =
      "FlowerMarket.lk connects growers like you directly with buyers across Sri Lanka — better prices, no middlemen, and a free listing.";
  }
  return `${hi} ${pitch} Join here: ${input.joinUrl}`;
}

// ---------------------------------------------------------------------------
// Data access
// ---------------------------------------------------------------------------

export interface InviteRow {
  id: string;
  phone: string;
  nameEn: string | null;
  shopType: ShopType | null;
  isAggregator: boolean;
  language: InviteLanguage;
  token: string;
  status: string;
  acceptedShopId: string | null;
  expiresAt: Date | null;
}

export interface CreateInviteParams {
  phone: string;
  nameEn?: string | null;
  shopType: ShopType;
  isAggregator?: boolean | null;
  language: InviteLanguage;
  token: string;
  sentBy: string | null;
  expiresAt: Date;
}

/** Insert an invite row. Refuses if an active (sent) invite already exists for the phone. */
export async function createInvite(
  db: Db,
  params: CreateInviteParams,
): Promise<ActionResult<{ id: string; token: string }>> {
  const errors = validateInviteInput(params);
  if (errors.length > 0) {
    return err("validation", errors.map((e) => e.message).join(" "));
  }
  try {
    const [active] = await db
      .select({ id: schema.supplierInvites.id })
      .from(schema.supplierInvites)
      .where(
        and(
          eq(schema.supplierInvites.phone, params.phone),
          eq(schema.supplierInvites.status, "sent"),
        ),
      )
      .limit(1);
    if (active) {
      return err("conflict", "An active invite already exists for this number.");
    }

    const [row] = await db
      .insert(schema.supplierInvites)
      .values({
        phone: params.phone,
        nameEn: params.nameEn ?? null,
        shopType: params.shopType,
        isAggregator: params.isAggregator ?? false,
        language: params.language,
        token: params.token,
        sentBy: params.sentBy,
        expiresAt: params.expiresAt,
      })
      .returning({ id: schema.supplierInvites.id, token: schema.supplierInvites.token });

    return ok({ id: row.id, token: row.token });
  } catch (e) {
    if (isPgError(e, "23505")) {
      return err("conflict", "That invite token already exists.");
    }
    return err("unknown", e instanceof Error ? e.message : "Could not create invite.");
  }
}

export async function getInviteByToken(
  db: Db,
  token: string,
): Promise<InviteRow | null> {
  const [row] = await db
    .select()
    .from(schema.supplierInvites)
    .where(eq(schema.supplierInvites.token, token))
    .limit(1);
  return row ? (row as InviteRow) : null;
}

/** Mark an invite accepted and link the created shop. */
export async function markInviteAccepted(
  db: Db,
  token: string,
  shopId: string,
): Promise<ActionResult<{ id: string }>> {
  try {
    const [row] = await db
      .update(schema.supplierInvites)
      .set({ status: "accepted", acceptedShopId: shopId, acceptedAt: new Date() })
      .where(eq(schema.supplierInvites.token, token))
      .returning({ id: schema.supplierInvites.id });
    if (!row) return err("not_found", "Invite not found.");
    return ok({ id: row.id });
  } catch (e) {
    return err("unknown", e instanceof Error ? e.message : "Could not update invite.");
  }
}
