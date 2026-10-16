import { err, ok, type ActionResult } from "../errors";
import {
  BUDGET_BANDS,
  CUSTOMER_DIGEST_INTERVAL_MS,
  type BudgetBandKey,
  type NeededWindow,
  type OfferStatus,
  type RequestStatus,
} from "./constants";

const COLOMBO_OFFSET_MS = 5.5 * 60 * 60 * 1000; // fixed UTC+05:30, no DST
const HOUR_MS = 60 * 60 * 1000;
const WINDOW_START_HOUR: Record<NeededWindow, number> = { morning: 8, afternoon: 12, evening: 16, any: 8 };

function parseDay(neededOn: string): [number, number, number] {
  const [y, m, d] = neededOn.split("-").map(Number);
  return [y ?? 1970, (m ?? 1) - 1, d ?? 1];
}

/** UTC instant for a local Asia/Colombo wall-clock time on `neededOn`. */
function colomboToUtc(neededOn: string, hour: number, min = 0, sec = 0): Date {
  const [y, m, d] = parseDay(neededOn);
  return new Date(Date.UTC(y, m, d, hour, min, sec) - COLOMBO_OFFSET_MS);
}

/** Quotes close 24h after opening, or 2h before the window starts, whichever is earlier; never under 1h. */
export function computeQuoteDeadline(openedAt: Date, neededOn: string, window: NeededWindow): Date {
  const windowStart = colomboToUtc(neededOn, WINDOW_START_HOUR[window]).getTime();
  const t = Math.min(openedAt.getTime() + 24 * HOUR_MS, windowStart - 2 * HOUR_MS);
  return new Date(Math.max(t, openedAt.getTime() + HOUR_MS));
}

export function endOfNeededDay(neededOn: string): Date {
  return colomboToUtc(neededOn, 23, 59, 59);
}

export function effectiveRequestStatus(
  r: { status: RequestStatus; neededOn: string },
  now: Date,
): RequestStatus {
  if (r.status === "open" && now.getTime() > endOfNeededDay(r.neededOn).getTime()) return "expired";
  return r.status;
}

const QUOTABLE: ReadonlySet<OfferStatus> = new Set(["sent", "viewed", "quoted", "declined", "send_failed"]);

export function canQuote(
  offer: { status: OfferStatus },
  req: { status: RequestStatus; quoteDeadlineAt: Date | null; neededOn: string },
  now: Date,
): ActionResult<void> {
  if (effectiveRequestStatus(req, now) !== "open") return err("validation", "closed");
  if (req.quoteDeadlineAt && now.getTime() > req.quoteDeadlineAt.getTime()) return err("validation", "closed");
  if (!QUOTABLE.has(offer.status)) return err("validation", "Offer cannot be quoted in its current state");
  return ok(undefined);
}

export function canAccept(
  offer: { status: OfferStatus; requestId: string },
  req: { id: string; status: RequestStatus; neededOn: string },
  now: Date,
): ActionResult<void> {
  if (req.status === "accepted") return err("conflict", "Request already accepted");
  if (offer.requestId !== req.id) return err("validation", "Offer does not belong to this request");
  if (offer.status !== "quoted") return err("validation", "Offer has no quote to accept");
  if (effectiveRequestStatus(req, now) !== "open") return err("validation", "Request is not open");
  return ok(undefined);
}

export function shouldNotifyCustomer(lastNotifiedAt: Date | null, now: Date): boolean {
  return lastNotifiedAt === null || now.getTime() - lastNotifiedAt.getTime() >= CUSTOMER_DIGEST_INTERVAL_MS;
}

export function parseRupeesToCents(input: string): number | null {
  const m = /^(?:rs\.?\s*)?(\d{1,3}(?:,\d{3})+|\d+)(?:\.(\d{1,2}))?$/i.exec(input.trim());
  if (!m) return null;
  const whole = Number((m[1] ?? "").replace(/,/g, ""));
  const frac = Number((m[2] ?? "").padEnd(2, "0") || "0");
  const cents = whole * 100 + frac;
  return Number.isSafeInteger(cents) && cents > 0 ? cents : null;
}

export function budgetBandFor(key: BudgetBandKey): { minCents: number; maxCents: number | null } {
  const band = BUDGET_BANDS.find((b) => b.key === key);
  if (!band) throw new Error(`Unknown budget band: ${key}`);
  return { minCents: band.minCents, maxCents: band.maxCents };
}

const REF_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function generateRequestRef(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(6));
  let s = "LR-";
  for (const b of bytes) s += REF_ALPHABET[b % REF_ALPHABET.length];
  return s;
}

export function generateAccessToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export async function hashAccessToken(token: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}
