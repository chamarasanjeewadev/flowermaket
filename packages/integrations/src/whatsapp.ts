/**
 * WhatsApp flower-enquiry message builder.
 *
 * Pure and dependency-free so it is safe in the client bundle and unit-tested
 * in isolation. Turns a customer's enquiry list + optional requirement fields
 * into a `wa.me` deep link addressed to the marketplace number. There is no
 * backend order — this is a lead-gen handoff into WhatsApp.
 */

import { WHATSAPP_NUMBER } from "./config";
export { WHATSAPP_NUMBER };

export type EnquiryLocale = "en" | "si";
export type EnquiryListingType = "retail" | "wholesale";

export interface EnquiryItem {
  id: string;
  slug: string;
  nameEn: string;
  nameSi: string | null;
  /** Unit price in LKR cents. */
  price: number;
  listingType: EnquiryListingType;
  qty: number;
}

export interface EnquiryForm {
  name?: string;
  dateNeeded?: string;
  deliveryArea?: string;
  notes?: string;
}

/** "Rs 1,250" — deterministic thousands grouping (no Intl/locale dependency). */
function formatRupees(cents: number): string {
  const rupees = Math.round(cents / 100);
  const grouped = rupees.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `Rs ${grouped}`;
}

function itemName(item: EnquiryItem, locale: EnquiryLocale): string {
  return locale === "si" && item.nameSi ? item.nameSi : item.nameEn;
}

export interface BuildEnquiryTextInput {
  items: readonly EnquiryItem[];
  form?: EnquiryForm;
  locale: EnquiryLocale;
  /** Canonical site origin, e.g. `https://flowermarket.lk` (trailing slash ok). */
  siteUrl: string;
  /** Optional single line noting an attached AI bouquet design. */
  sourceShop?: { name: string; slug: string };
  designNote?: string;
  /** Public URL of the AI-generated bouquet image to include in the message. */
  designImageUrl?: string;
}

/**
 * Assemble the plain-text WhatsApp message. With no items it degrades to a
 * friendly greeting (used by the floating button before anything is added).
 */
export function buildEnquiryText(input: BuildEnquiryTextInput): string {
  const { items, form, locale, siteUrl, designNote, designImageUrl } = input;
  const base = siteUrl.replace(/\/$/, "");
  const lines: string[] = ["Hello FlowerMarket.lk 🌸", ""];
  if (input.sourceShop) lines.push(`Requested shop: ${input.sourceShop.name}`, `${base}/${locale}/shops/${input.sourceShop.slug}`, "");
  if (designNote?.trim()) lines.push(`— ${designNote.trim()} —`, "");
  if (designImageUrl?.trim()) lines.push(`🖼 AI bouquet design: ${designImageUrl.trim()}`, "");

  if (items.length === 0) {
    lines.push("I'd like to ask about your flowers.");
  } else {
    lines.push("I'd like to enquire about these flowers:", "");
    items.forEach((item, i) => {
      const type = item.listingType === "wholesale" ? "Wholesale" : "Retail";
      lines.push(
        `${i + 1}. ${itemName(item, locale)} (${type}) × ${item.qty} — ${formatRupees(item.price)}`,
      );
      lines.push(`   ${base}/${locale}/products/${item.slug}`);
    });
  }

  const details: string[] = [];
  if (form?.name?.trim()) details.push(`Name: ${form.name.trim()}`);
  if (form?.dateNeeded?.trim()) details.push(`Date needed: ${form.dateNeeded.trim()}`);
  if (form?.deliveryArea?.trim()) details.push(`Delivery area: ${form.deliveryArea.trim()}`);
  if (form?.notes?.trim()) details.push(`Notes: ${form.notes.trim()}`);
  if (details.length > 0) lines.push("", "My requirements:", ...details);

  return lines.join("\n");
}

/** Build a `wa.me` deep link; the number is normalised to digits only. */
export function buildWhatsappUrl(
  text: string,
  numberDigits: string = WHATSAPP_NUMBER,
): string {
  const digits = numberDigits.replace(/\D/g, "");
  return `https://wa.me/${digits}?text=${encodeURIComponent(text)}`;
}

export interface QuickRequestLine {
  name: string;
  qty: number;
  /** "stem" | "bunch" | "arrangement" | "item" */
  unit: string;
}

export interface BuildQuickRequestTextInput {
  lines: readonly QuickRequestLine[];
  /** Free-text list typed or pasted by the customer. */
  freeText?: string;
  name?: string;
  phone?: string;
  dateNeeded?: string;
  area?: string;
}

/** Home-page quick request: picked flowers and/or a free-text list → WhatsApp. */
export function buildQuickRequestText(input: BuildQuickRequestTextInput): string {
  const out: string[] = ["Hello FlowerMarket.lk 🌸", "", "I need a quote for these flowers:", ""];
  const lines = input.lines.filter((l) => l.name.trim() && l.qty > 0);
  lines.forEach((l, i) => {
    const plural = l.qty === 1 ? l.unit : l.unit === "bunch" ? "bunches" : `${l.unit}s`;
    out.push(`${i + 1}. ${l.name.trim()} × ${Math.floor(l.qty)} ${plural}`);
  });
  const free = input.freeText?.trim();
  if (free) out.push(...(lines.length ? [""] : []), free);
  const details: string[] = [];
  if (input.name?.trim()) details.push(`Name: ${input.name.trim()}`);
  if (input.phone?.trim()) details.push(`Phone: ${input.phone.trim()}`);
  if (input.dateNeeded?.trim()) details.push(`Date needed: ${input.dateNeeded.trim()}`);
  if (input.area?.trim()) details.push(`Delivery area: ${input.area.trim()}`);
  if (details.length) out.push("", ...details);
  return out.join("\n");
}
