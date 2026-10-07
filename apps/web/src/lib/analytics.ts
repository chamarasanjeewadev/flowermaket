/**
 * Google Tag Manager + GA4 tracking for the public site.
 *
 * GTM is loaded only in production builds (VITE_GTM_ID overrides the default
 * container), so `pnpm dev` traffic never reaches the GA4 property. Every helper below
 * is a safe no-op on the server and when GTM is absent.
 *
 * Page views are NOT pushed from here: GA4's enhanced measurement ("page
 * changes based on browser history events") records TanStack Router
 * client-side navigations automatically. Pushing our own would double-count.
 *
 * Event names follow GA4's recommended ecommerce schema (view_item,
 * add_to_cart, …) so the built-in Monetization reports populate, even though
 * the "checkout" here is a WhatsApp enquiry rather than a payment. Values are
 * in LKR rupees (GA4 expects currency units, not cents). See
 * docs/analytics-tracking-plan.md for the full plan.
 */
import type { EnquiryItem } from "@flowers/integrations";

/** flowermarket.lk container (account flowermarketplacesl@gmail.com). Public. */
const DEFAULT_GTM_ID = "GTM-5ZHCP658";

export const GTM_ID: string | undefined = import.meta.env.PROD
  ? import.meta.env.VITE_GTM_ID || DEFAULT_GTM_ID
  : undefined;

const CURRENCY = "LKR";

/** Inline bootstrap script, rendered in <head>. */
export function gtmHeadScript(id: string): string {
  return `(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src='https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);})(window,document,'script','dataLayer','${id}');`;
}

type DataLayerValue = string | number | boolean | null | undefined | object;
type DataLayerEvent = { event: string } & Record<string, DataLayerValue>;

declare global {
  interface Window {
    dataLayer?: Array<Record<string, DataLayerValue>>;
  }
}

/**
 * Every event parameter the GTM container reads. GTM's data-layer model keeps
 * keys from earlier pushes, and one GA4 tag forwards all of them, so they are
 * reset before each event to stop e.g. a lead_source leaking onto a later
 * view_item. Keep in sync with docs/gtm-container.json.
 */
const PARAM_KEYS = [
  "ecommerce",
  "lead_source",
  "enquiry_item_count",
  "add_source",
  "search_term",
  "result_count",
  "stems",
  "flower_count",
  "outcome",
  "line_count",
  "method",
  "value",
  "currency",
] as const;

// undefined (not null): GA4 drops undefined params but would send "null".
const RESET: Record<string, undefined> = Object.fromEntries(
  PARAM_KEYS.map((k) => [k, undefined]),
);

function push(payload: DataLayerEvent): void {
  if (typeof window === "undefined" || !GTM_ID) return;
  window.dataLayer = window.dataLayer ?? [];
  window.dataLayer.push(RESET);
  window.dataLayer.push(payload);
}

/** Minimal product shape shared by catalog DTOs and enquiry items. */
export interface TrackedProduct {
  id: string;
  nameEn: string;
  price: number; // LKR cents
  listingType: "retail" | "wholesale";
  categoryEn?: string;
  shopEn?: string;
}

/** Map a catalog list row (ProductListItemDTO) to the tracked shape. */
export function fromListItem(p: {
  id: string;
  nameEn: string;
  price: number;
  listingType: "retail" | "wholesale";
  categorySlug: string;
  shopNameEn: string;
}): TrackedProduct {
  return {
    id: p.id,
    nameEn: p.nameEn,
    price: p.price,
    listingType: p.listingType,
    categoryEn: p.categorySlug,
    shopEn: p.shopNameEn,
  };
}

const rupees = (cents: number): number => Math.round(cents) / 100;

function toItem(p: TrackedProduct, quantity = 1, index?: number) {
  return {
    item_id: p.id,
    item_name: p.nameEn,
    item_category: p.categoryEn,
    item_brand: p.shopEn,
    item_variant: p.listingType,
    price: rupees(p.price),
    quantity,
    index,
  };
}

function enquiryValue(items: readonly EnquiryItem[]): number {
  return rupees(items.reduce((sum, i) => sum + i.price * i.qty, 0));
}

/** Where a WhatsApp chat was started from — tells us which surface converts. */
export type WhatsappSource =
  | "floating_button"
  | "enquiry_page"
  | "bouquet_designer"
  | "quotation_generator"
  | "design_limit";

export const track = {
  viewItem(p: TrackedProduct): void {
    push({
      event: "view_item",
      ecommerce: { currency: CURRENCY, value: rupees(p.price), items: [toItem(p)] },
    });
  },

  viewItemList(listId: string, listName: string, products: readonly TrackedProduct[]): void {
    push({
      event: "view_item_list",
      ecommerce: {
        item_list_id: listId,
        item_list_name: listName,
        items: products.slice(0, 50).map((p, i) => toItem(p, 1, i)),
      },
    });
  },

  search(term: string, resultCount: number): void {
    push({ event: "search", search_term: term, result_count: resultCount });
  },

  addToEnquiry(p: TrackedProduct, quantity: number, source: string): void {
    push({
      event: "add_to_cart",
      add_source: source,
      ecommerce: {
        currency: CURRENCY,
        value: rupees(p.price * quantity),
        items: [toItem(p, quantity)],
      },
    });
  },

  removeFromEnquiry(item: EnquiryItem): void {
    push({
      event: "remove_from_cart",
      ecommerce: {
        currency: CURRENCY,
        value: rupees(item.price * item.qty),
        items: [toItem(item, item.qty)],
      },
    });
  },

  viewEnquiry(items: readonly EnquiryItem[]): void {
    push({
      event: "view_cart",
      ecommerce: {
        currency: CURRENCY,
        value: enquiryValue(items),
        items: items.map((i) => toItem(i, i.qty)),
      },
    });
  },

  /**
   * The key conversion: a visitor opened WhatsApp to talk to us. Sent as
   * GA4's `generate_lead` (mark it as a key event in GA4 Admin) plus the
   * originating surface.
   */
  whatsappLead(source: WhatsappSource, items: readonly EnquiryItem[] = []): void {
    push({
      event: "generate_lead",
      lead_source: source,
      enquiry_item_count: items.length,
      currency: CURRENCY,
      value: enquiryValue(items),
    });
  },

  bouquetGenerated(stems: number, flowerCount: number, outcome: string): void {
    push({
      event: "bouquet_generated",
      stems,
      flower_count: flowerCount,
      outcome,
    });
  },

  quotationSent(lineCount: number, totalCents: number): void {
    push({
      event: "quotation_sent",
      line_count: lineCount,
      currency: CURRENCY,
      value: rupees(totalCents),
    });
  },

  signUp(method: "email" | "google"): void {
    push({ event: "sign_up", method });
  },

  login(method: "email" | "google"): void {
    push({ event: "login", method });
  },
};
