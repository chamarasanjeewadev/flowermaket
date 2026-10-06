/**
 * Supplier invite message templates — pure and dependency-free, so the admin
 * client can render (and let the admin edit) the exact WhatsApp text before it
 * is sent. Import via `@flowers/api/invite-message`, never the barrel.
 */
import type { SellerType } from "./constants";

export type InviteLanguage = "en" | "si";

/**
 * Placeholder the admin keeps in an edited message; the server swaps it for the
 * real tokenized join URL (the token only exists once the invite is created).
 */
export const INVITE_LINK_PLACEHOLDER = "{link}";

export interface BuildInviteMessageInput {
  nameEn?: string | null;
  sellerTypes?: readonly SellerType[] | null;
  language: InviteLanguage;
  joinUrl: string;
}

/** Which pitch fits best: supplier (bulk) > farmer > florist. */
function invitePitch(types: readonly SellerType[] | null | undefined) {
  if (types?.includes("supplier")) return "supplier" as const;
  if (types?.includes("florist") && !types.includes("farmer")) return "florist" as const;
  return "farmer" as const;
}

/** Build a bilingual, type-aware benefits message with the join link. */
export function buildInviteMessage(input: BuildInviteMessageInput): string {
  const name = input.nameEn?.trim() || null;
  const pitchKind = invitePitch(input.sellerTypes);

  if (input.language === "si") {
    const hi = name ? `ආයුබෝවන් ${name},` : "ආයුබෝවන්,";
    let pitch: string;
    if (pitchKind === "florist") {
      pitch =
        "ඔබේ මල් වෙළඳසැලට FlowerMarket.lk හි ඔබේම අන්තර්ජාල වෙළඳසැලක් ලබාගෙන වැඩි ඇණවුම් ලබාගන්න.";
    } else if (pitchKind === "supplier") {
      pitch =
        "FlowerMarket.lk හරහා තොග ඇණවුම් සහ වැඩි ගැනුම්කරුවන් එක තැනකින් කළමනාකරණය කරන්න.";
    } else {
      pitch =
        "FlowerMarket.lk හරහා ඔබේ මල් ගැනුම්කරුවන් සමඟ සෘජුවම සම්බන්ධ වන්න — හොඳ මිල ගණන් සහ නොමිලේ ලැයිස්තුගත කිරීම.";
    }
    return `${hi}\n\n${pitch}\n\nමෙතැනින් එක්වන්න: ${input.joinUrl}`;
  }

  const hi = name ? `Hi ${name},` : "Hi there,";
  let pitch: string;
  if (pitchKind === "florist") {
    pitch =
      "FlowerMarket.lk gives your flower shop its own online storefront and brings you more orders online.";
  } else if (pitchKind === "supplier") {
    pitch =
      "FlowerMarket.lk helps suppliers reach more buyers and handle bulk orders and RFQs in one place.";
  } else {
    pitch =
      "FlowerMarket.lk connects growers like you directly with buyers across Sri Lanka — better prices, no middlemen, and a free listing.";
  }
  return `${hi}\n\n${pitch}\n\nJoin here: ${input.joinUrl}`;
}

/**
 * Resolve an admin-edited message into the final text: replace every
 * {@link INVITE_LINK_PLACEHOLDER} with the join URL, or append the URL when the
 * admin removed the placeholder, so the invite is never sent without its link.
 */
export function applyInviteLink(message: string, joinUrl: string): string {
  const text = message.trim();
  if (text.includes(INVITE_LINK_PLACEHOLDER)) {
    return text.split(INVITE_LINK_PLACEHOLDER).join(joinUrl);
  }
  if (text.includes(joinUrl)) return text;
  return `${text}\n\n${joinUrl}`;
}

/**
 * Normalize a Sri Lankan number for display/validation: digits with a 94
 * country code (e.g. "0717303216" → "94717303216"). Returns null when there
 * are too few digits to be a mobile number.
 */
export function normalizeLkPhone(phone: string): string | null {
  let d = phone.replace(/\D/g, "");
  if (d.startsWith("0")) d = `94${d.slice(1)}`;
  if (!d.startsWith("94")) d = `94${d}`;
  return d.length === 11 ? d : null;
}

/** Pretty-print a normalized 94XXXXXXXXX number as "+94 71 730 3216". */
export function formatLkPhone(normalized: string): string {
  const m = /^94(\d{2})(\d{3})(\d{4})$/.exec(normalized);
  return m ? `+94 ${m[1]} ${m[2]} ${m[3]}` : `+${normalized}`;
}
