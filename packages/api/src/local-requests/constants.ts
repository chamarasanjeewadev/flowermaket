export const LOCAL_RADIUS_KM = 10;
export const WIDE_RADIUS_KM = 25;
export const MIN_FLORISTS = 3;
export const MAX_FLORISTS = 8;
export const MAX_OPEN_REQUESTS_PER_PHONE = 3;
export const CUSTOMER_DIGEST_INTERVAL_MS = 2 * 60 * 60 * 1000;

export const BUDGET_BANDS = [
  { key: "under_3k", minCents: 0, maxCents: 300000 },
  { key: "3k_5k", minCents: 300000, maxCents: 500000 },
  { key: "5k_10k", minCents: 500000, maxCents: 1000000 },
  { key: "10k_20k", minCents: 1000000, maxCents: 2000000 },
  { key: "20k_plus", minCents: 2000000, maxCents: null },
] as const;
export type BudgetBandKey = (typeof BUDGET_BANDS)[number]["key"];

export const WRAPPING_OPTIONS = ["kraft", "cellophane", "jute", "box", "basket", "florist_choice"] as const;
export const ADDON_OPTIONS = ["card", "chocolates", "teddy", "balloon", "vase"] as const;
export const OCCASIONS = [
  "birthday", "anniversary", "love", "congratulations", "get_well",
  "sympathy", "thank_you", "wedding", "other",
] as const;
/** Local start hours: 8, 12, 16, 8. */
export const NEEDED_WINDOWS = ["morning", "afternoon", "evening", "any"] as const;
export type NeededWindow = (typeof NEEDED_WINDOWS)[number];
export const DECLINE_REASONS = ["busy", "out_of_stock", "too_far", "budget_too_low", "other"] as const;

export type RequestStatus =
  | "pending_verification" | "open" | "accepted" | "expired" | "cancelled" | "completed";
export type OfferStatus =
  | "pending_approval" | "skipped" | "sent" | "send_failed" | "viewed"
  | "quoted" | "declined" | "accepted" | "not_selected" | "expired";
