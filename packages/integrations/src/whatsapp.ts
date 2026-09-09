/**
 * WhatsApp flower-enquiry message builder.
 *
 * Pure and dependency-free so it is safe in the client bundle and unit-tested
 * in isolation. Turns a customer's enquiry list + optional requirement fields
 * into a `wa.me` deep link addressed to the marketplace number. There is no
 * backend order — this is a lead-gen handoff into WhatsApp.
 */

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

/** Marketplace WhatsApp number that receives enquiries (digits only). */
export const WHATSAPP_NUMBER = "94778540633";

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
}

/**
 * Assemble the plain-text WhatsApp message. With no items it degrades to a
 * friendly greeting (used by the floating button before anything is added).
 */
export function buildEnquiryText(input: BuildEnquiryTextInput): string {
  const { items, form, locale, siteUrl } = input;
  const base = siteUrl.replace(/\/$/, "");
  const lines: string[] = ["Hello FlowerMarket.lk 🌸", ""];

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
