/**
 * local-requests.ts — customer bouquet requests: create (pending_verification),
 * open after OTP verification (match florists + insert offers), and dispatch
 * WhatsApp notifications to florists.
 *
 * @flowers/api does not depend on @flowers/integrations, so message text is
 * produced by builder callbacks the caller injects through `DispatchDeps`.
 *
 * Tokens: the customer page token and every florist lead token are 32 random
 * bytes; only their SHA-256 hashes are stored. Plain tokens are handed to the
 * URL builders and never persisted or logged.
 *
 * Concurrency: the postgres pool is `max: 1`, so nothing here touches `db`
 * while a transaction is open, and no network send happens inside one.
 */
import { and, count, eq, gt, inArray, isNotNull } from "drizzle-orm";
import { schema } from "@flowers/db/client";
import type { BouquetDesign } from "@flowers/db/schema";
import type { Db } from "../db";
import { err, isPgError, ok, type ActionResult } from "../errors";
import { normalizeLkPhone } from "../invite-message";
import {
  BUDGET_BANDS,
  MAX_OPEN_REQUESTS_PER_PHONE,
  NEEDED_WINDOWS,
  OCCASIONS,
  WIDE_RADIUS_KM,
  type BudgetBandKey,
  type NeededWindow,
  type Occasion,
  type OfferStatus,
} from "../local-requests/constants";
import type { LatLng } from "../local-requests/geo";
import { selectFloristsForRequest, type MatchedFlorist } from "../local-requests/matching";
import {
  budgetBandFor,
  computeQuoteDeadline,
  generateAccessToken,
  generateRequestRef,
  hashAccessToken,
} from "../local-requests/rules";
import { listingsInBox } from "./florist-listings";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Lang = "en" | "si";

export interface CreateRequestInput {
  customerName: string;
  customerPhone: string;
  language: Lang;
  design: BouquetDesign;
  occasion: Occasion | null;
  budgetBand: BudgetBandKey;
  fulfilment: "delivery" | "pickup";
  point: LatLng;
  deliveryArea: string;
  deliveryAddress: string | null;
  neededOn: string;
  neededWindow: NeededWindow;
  bouquetGenerationId: string | null;
  utm: Record<string, string> | null;
}

/**
 * Structurally identical to `RequestSummary` in @flowers/integrations. Every
 * value is pre-formatted for display; it never carries customer details.
 */
export interface RequestSummaryInput {
  ref: string;
  area: string;
  distanceKm?: number;
  neededOn: string;
  window: string;
  occasion: string | null;
  budgetLabel: string;
  flowerLines: string[];
  addons: string[];
}

export type SendFn = (
  to: { phone: string; templateSid?: string; variables: Record<string, string> },
  text: string,
) => Promise<{ ok: true; providerId?: string } | { ok: false; message: string }>;

export interface DispatchDeps {
  send: SendFn;
  /** Florist lead page URL for a plain lead token. */
  leadUrl: (token: string) => string;
  /** Customer request page URL for the plain customer access token. */
  pageUrl: (accessToken: string) => string;
  /** Twilio template SIDs for registered-shop notifications, per language. */
  templates: { en?: string; si?: string };
  buildShopText: (i: { shopName: string; summary: RequestSummaryInput; leadUrl: string; lang: Lang }) => string;
  buildUnclaimedText: (i: { listingName: string; summary: RequestSummaryInput; leadUrl: string; lang: Lang }) => string;
  buildCustomerOpenedText: (i: { ref: string; floristCount: number; area: string; pageUrl: string; lang: Lang }) => string;
}

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

const SL_BBOX = { minLat: 5.85, maxLat: 9.9, minLng: 79.5, maxLng: 81.95 };
const MAX_DAYS_AHEAD = 60;
const DAY_MS = 24 * 60 * 60 * 1000;
const PENDING_WINDOW_MS = 30 * 60 * 1000;
const MAX_PENDING_PER_PHONE = 3;
const COLOMBO_OFFSET_MS = 5.5 * 60 * 60 * 1000;
const MAX_ERROR_LEN = 500;

/** Parse a strict YYYY-MM-DD calendar date to a UTC-midnight epoch, or null. */
function parseIsoDay(s: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]) - 1;
  const d = Number(m[3]);
  const t = Date.UTC(y, mo, d);
  const back = new Date(t);
  if (back.getUTCFullYear() !== y || back.getUTCMonth() !== mo || back.getUTCDate() !== d) return null;
  return t;
}

/** Today's date in Asia/Colombo as YYYY-MM-DD. */
export function colomboToday(now: Date): string {
  return new Date(now.getTime() + COLOMBO_OFFSET_MS).toISOString().slice(0, 10);
}

/**
 * Pure validation. Returns the input normalized (trimmed strings, canonical
 * 94XXXXXXXXX phone, null address for pickup). `today` is a Colombo YYYY-MM-DD.
 */
export function validateCreateRequest(
  i: CreateRequestInput,
  today: string,
): ActionResult<CreateRequestInput> {
  const name = i.customerName.trim();
  if (name.length < 2 || name.length > 80) return err("validation", "Please enter your name (2–80 characters).");

  const phone = normalizeLkPhone(i.customerPhone);
  if (!phone) return err("validation", "Please enter a valid Sri Lankan mobile number.");

  if (i.language !== "en" && i.language !== "si") return err("validation", "Unsupported language.");

  const hasFlower = i.design.flowers.some((f) => Number.isInteger(f.qty) && f.qty > 0);
  const notes = i.design.notes?.trim() ?? "";
  if (!hasFlower && notes.length < 10) {
    return err("validation", "Choose at least one flower or describe the bouquet (10+ characters).");
  }

  if (i.occasion !== null && !(OCCASIONS as readonly string[]).includes(i.occasion)) {
    return err("validation", "Unknown occasion.");
  }
  if (!BUDGET_BANDS.some((b) => b.key === i.budgetBand)) return err("validation", "Unknown budget band.");
  if (!(NEEDED_WINDOWS as readonly string[]).includes(i.neededWindow)) return err("validation", "Unknown time window.");
  if (i.fulfilment !== "delivery" && i.fulfilment !== "pickup") return err("validation", "Unknown fulfilment.");

  const todayT = parseIsoDay(today);
  const neededT = parseIsoDay(i.neededOn);
  if (todayT === null || neededT === null) return err("validation", "Please choose a valid date.");
  if (neededT < todayT) return err("validation", "The date can't be in the past.");
  if (neededT > todayT + MAX_DAYS_AHEAD * DAY_MS) {
    return err("validation", `Please choose a date within ${MAX_DAYS_AHEAD} days.`);
  }

  const { lat, lng } = i.point;
  if (
    !Number.isFinite(lat) || !Number.isFinite(lng) ||
    lat < SL_BBOX.minLat || lat > SL_BBOX.maxLat || lng < SL_BBOX.minLng || lng > SL_BBOX.maxLng
  ) {
    return err("validation", "The location must be in Sri Lanka.");
  }

  const area = i.deliveryArea.trim();
  if (area.length < 2 || area.length > 120) return err("validation", "Please enter the area (2–120 characters).");

  const address = i.deliveryAddress?.trim() ?? "";
  if (i.fulfilment === "delivery" && address.length === 0) {
    return err("validation", "Please enter the delivery address.");
  }

  return ok({
    ...i,
    customerName: name,
    customerPhone: phone,
    deliveryArea: area,
    deliveryAddress: i.fulfilment === "delivery" ? address : null,
  });
}

export function planOffers(matched: MatchedFlorist[]): {
  autoSendListingIds: string[];
  approvalListingIds: string[];
} {
  return {
    autoSendListingIds: matched.filter((m) => m.autoSend).map((m) => m.listingId),
    approvalListingIds: matched.filter((m) => !m.autoSend).map((m) => m.listingId),
  };
}

function groupThousands(n: number): string {
  return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

/** Budget band label: "Under Rs 3,000", "Rs 3,000–5,000", "Rs 20,000+". */
export function budgetLabel(minCents: number, maxCents: number | null): string {
  const min = groupThousands(Math.floor(minCents / 100));
  if (maxCents === null) return `Rs ${min}+`;
  const max = groupThousands(Math.floor(maxCents / 100));
  if (minCents <= 0) return `Under Rs ${max}`;
  return `Rs ${min}–${max}`;
}

const WINDOW_LABELS: Record<string, string> = {
  morning: "Morning",
  afternoon: "Afternoon",
  evening: "Evening",
  any: "Any time",
};
const OCCASION_LABELS: Record<string, string> = {
  birthday: "Birthday",
  anniversary: "Anniversary",
  love: "Love",
  congratulations: "Congratulations",
  get_well: "Get well",
  sympathy: "Sympathy",
  thank_you: "Thank you",
  wedding: "Wedding",
  other: "Other",
};
const ADDON_LABELS: Record<string, string> = {
  card: "Card",
  chocolates: "Chocolates",
  teddy: "Teddy bear",
  balloon: "Balloon",
  vase: "Vase",
};
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function formatDay(iso: string): string {
  const t = parseIsoDay(iso);
  if (t === null) return iso;
  const d = new Date(t);
  return `${WEEKDAYS[d.getUTCDay()]} ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

/** Fields of a request needed to build the shop-facing summary. */
export interface SummarySource {
  ref: string;
  deliveryArea: string;
  neededOn: string;
  neededWindow: string;
  occasion: string | null;
  budgetMinCents: number;
  budgetMaxCents: number | null;
  design: BouquetDesign;
}

/**
 * Shop-facing summary with display-ready values (English labels). Never
 * includes customer name, phone, address or card message.
 */
export function buildRequestSummary(r: SummarySource, distanceM?: number): RequestSummaryInput {
  const summary: RequestSummaryInput = {
    ref: r.ref,
    area: r.deliveryArea,
    neededOn: formatDay(r.neededOn),
    window: WINDOW_LABELS[r.neededWindow] ?? r.neededWindow,
    occasion: r.occasion === null ? null : (OCCASION_LABELS[r.occasion] ?? r.occasion),
    budgetLabel: budgetLabel(r.budgetMinCents, r.budgetMaxCents),
    flowerLines: [...r.design.flowers, ...r.design.fillers]
      .filter((f) => f.qty > 0)
      .map((f) => `${f.nameEn} × ${f.qty}`),
    addons: r.design.addons.map((a) => ADDON_LABELS[a] ?? a),
  };
  if (distanceM !== undefined) summary.distanceKm = Math.round(distanceM / 100) / 10;
  return summary;
}

function oneLineSummary(s: RequestSummaryInput): string {
  const parts = [s.area, `${s.neededOn} (${s.window})`];
  if (s.occasion) parts.push(s.occasion);
  parts.push(s.budgetLabel);
  return parts.join(" · ");
}

function truncateError(message: string): string {
  return message.length > MAX_ERROR_LEN ? message.slice(0, MAX_ERROR_LEN) : message;
}

// ---------------------------------------------------------------------------
// createRequest
// ---------------------------------------------------------------------------

export async function createRequest(
  db: Db,
  input: CreateRequestInput,
): Promise<ActionResult<{ id: string; ref: string; accessToken: string }>> {
  const v = validateCreateRequest(input, colomboToday(new Date()));
  if (!v.ok) return v;
  const i = v.data;
  const r = schema.bouquetRequests;

  try {
    const [{ openCount }] = await db
      .select({ openCount: count() })
      .from(r)
      .where(and(eq(r.customerPhone, i.customerPhone), eq(r.status, "open")));
    if (Number(openCount) >= MAX_OPEN_REQUESTS_PER_PHONE) {
      return err("conflict", `You already have ${MAX_OPEN_REQUESTS_PER_PHONE} open requests.`);
    }

    const [{ pendingCount }] = await db
      .select({ pendingCount: count() })
      .from(r)
      .where(
        and(
          eq(r.customerPhone, i.customerPhone),
          eq(r.status, "pending_verification"),
          gt(r.createdAt, new Date(Date.now() - PENDING_WINDOW_MS)),
        ),
      );
    if (Number(pendingCount) >= MAX_PENDING_PER_PHONE) {
      return err("conflict", "Too many unverified requests. Please try again later.");
    }

    const band = budgetBandFor(i.budgetBand);
    // Retry on the (unlikely) ref / token-hash collision.
    for (let attempt = 0; attempt < 3; attempt++) {
      const ref = generateRequestRef();
      const accessToken = generateAccessToken();
      const accessTokenHash = await hashAccessToken(accessToken);
      try {
        const [row] = await db
          .insert(r)
          .values({
            ref,
            accessTokenHash,
            status: "pending_verification",
            customerName: i.customerName,
            customerPhone: i.customerPhone,
            language: i.language,
            design: i.design,
            occasion: i.occasion,
            budgetMinCents: band.minCents,
            budgetMaxCents: band.maxCents,
            fulfilment: i.fulfilment,
            deliveryLat: i.point.lat,
            deliveryLng: i.point.lng,
            deliveryArea: i.deliveryArea,
            deliveryAddress: i.deliveryAddress,
            neededOn: i.neededOn,
            neededWindow: i.neededWindow,
            bouquetGenerationId: i.bouquetGenerationId,
            utm: i.utm,
          })
          .returning({ id: r.id });
        if (!row) return err("unknown", "Could not create the request.");
        return ok({ id: row.id, ref, accessToken });
      } catch (e) {
        if (isPgError(e, "23505")) continue;
        throw e;
      }
    }
    return err("unknown", "Could not create the request.");
  } catch {
    return err("unknown", "Could not create the request.");
  }
}

// ---------------------------------------------------------------------------
// openRequestAfterVerification
// ---------------------------------------------------------------------------

class OpenConflict extends Error {}

export async function openRequestAfterVerification(
  db: Db,
  requestId: string,
  accessToken: string,
  now: Date,
  deps: DispatchDeps,
): Promise<ActionResult<{ floristCount: number; pendingApproval: number }>> {
  const r = schema.bouquetRequests;
  const o = schema.bouquetRequestOffers;

  let request: typeof r.$inferSelect | undefined;
  let matched: { radiusKm: number; florists: MatchedFlorist[] };
  let offerIdsByListing: Map<string, string>;
  try {
    [request] = await db.select().from(r).where(eq(r.id, requestId)).limit(1);
    if (!request) return err("not_found", "Request not found.");
    if (request.status !== "pending_verification") return err("conflict", "Request is already open or closed.");
    if (request.phoneVerifiedAt === null) return err("validation", "Phone number is not verified.");

    const point = { lat: request.deliveryLat, lng: request.deliveryLng };
    const candidates = await listingsInBox(db, point, WIDE_RADIUS_KM);
    matched = selectFloristsForRequest(candidates, point);

    // Placeholder lead-token hashes: unique, never revealed. Every real send
    // replaces the hash with that of a fresh token.
    const placeholderHashes = await Promise.all(
      matched.florists.map(() => hashAccessToken(generateAccessToken())),
    );
    const deadline = computeQuoteDeadline(
      now,
      request.neededOn,
      request.neededWindow as NeededWindow,
    );

    offerIdsByListing = await db.transaction(async (tx) => {
      const [opened] = await tx
        .update(r)
        .set({
          status: "open",
          quoteDeadlineAt: deadline,
          radiusKm: matched.radiusKm,
          noFloristsInRange: matched.florists.length === 0,
          updatedAt: now,
        })
        .where(and(eq(r.id, requestId), eq(r.status, "pending_verification"), isNotNull(r.phoneVerifiedAt)))
        .returning({ id: r.id });
      if (!opened) throw new OpenConflict();

      const map = new Map<string, string>();
      if (matched.florists.length === 0) return map;
      const rows = await tx
        .insert(o)
        .values(
          matched.florists.map((f, idx) => ({
            requestId,
            listingId: f.listingId,
            shopId: f.shopId,
            distanceM: Math.round(f.distanceM),
            status: "pending_approval",
            tokenHash: placeholderHashes[idx] ?? "",
          })),
        )
        .returning({ id: o.id, listingId: o.listingId });
      for (const row of rows) map.set(row.listingId, row.id);
      return map;
    });
  } catch (e) {
    if (e instanceof OpenConflict) return err("conflict", "Request is already open or closed.");
    return err("unknown", "Could not open the request.");
  }

  // After commit: notify auto-send shops, then the customer.
  const plan = planOffers(matched.florists);
  const autoIds = plan.autoSendListingIds
    .map((id) => offerIdsByListing.get(id))
    .filter((id): id is string => id !== undefined);
  const dispatched = autoIds.length > 0 ? await dispatchOffers(db, autoIds, deps) : ok({ sent: 0, failed: 0 });
  const floristCount = dispatched.ok ? dispatched.data.sent : 0;

  try {
    const lang: Lang = request.language === "si" ? "si" : "en";
    const text = deps.buildCustomerOpenedText({
      ref: request.ref,
      floristCount,
      area: request.deliveryArea,
      pageUrl: deps.pageUrl(accessToken),
      lang,
    });
    await deps.send({ phone: request.customerPhone, variables: {} }, text);
  } catch {
    // A failed customer message must not fail the open.
  }

  return ok({ floristCount, pendingApproval: plan.approvalListingIds.length });
}

// ---------------------------------------------------------------------------
// dispatchOffers
// ---------------------------------------------------------------------------

const FIRST_SEND: ReadonlySet<string> = new Set<OfferStatus>(["pending_approval", "send_failed"]);
const NUDGE: ReadonlySet<string> = new Set<OfferStatus>(["sent", "viewed"]);
const NOT_CONTACTABLE = "listing not contactable";

/**
 * Send (or re-send) offers. First sends (pending_approval | send_failed) move
 * to `sent` or `send_failed`; nudges (sent | viewed) keep their status and only
 * record the outcome. Offers in other states, or on a request that is not
 * `open`, are skipped. Never throws.
 */
export async function dispatchOffers(
  db: Db,
  offerIds: string[],
  deps: DispatchDeps,
): Promise<ActionResult<{ sent: number; failed: number }>> {
  if (offerIds.length === 0) return ok({ sent: 0, failed: 0 });
  const o = schema.bouquetRequestOffers;
  const r = schema.bouquetRequests;
  const l = schema.floristListings;
  const s = schema.shops;

  let rows: {
    offer: typeof o.$inferSelect;
    request: typeof r.$inferSelect;
    listing: typeof l.$inferSelect;
    shop: typeof s.$inferSelect | null;
  }[];
  try {
    rows = await db
      .select({ offer: o, request: r, listing: l, shop: s })
      .from(o)
      .innerJoin(r, eq(r.id, o.requestId))
      .innerJoin(l, eq(l.id, o.listingId))
      .leftJoin(s, eq(s.id, o.shopId))
      .where(inArray(o.id, offerIds));
  } catch {
    return err("unknown", "Could not load offers.");
  }

  let sent = 0;
  let failed = 0;
  for (const { offer, request, listing, shop } of rows) {
    const firstSend = FIRST_SEND.has(offer.status);
    if (!firstSend && !NUDGE.has(offer.status)) continue;
    if (request.status !== "open") continue;

    const recordFailure = async (message: string) => {
      failed++;
      try {
        await db
          .update(o)
          .set({
            ...(firstSend ? { status: "send_failed" } : {}),
            notificationStatus: "failed",
            notificationError: truncateError(message),
            updatedAt: new Date(),
          })
          .where(eq(o.id, offer.id));
      } catch {
        // Best effort: the offer keeps its previous state.
      }
    };

    try {
      const shopEligible =
        offer.shopId !== null &&
        shop !== null &&
        shop.isActive &&
        shop.sellerTypes.includes("florist") &&
        shop.notificationConsentAt !== null &&
        shop.notificationVerifiedAt !== null &&
        shop.notificationPhone !== null;

      if (listing.status === "opted_out" || listing.status === "blocked") {
        await recordFailure(NOT_CONTACTABLE);
        continue;
      }
      const phone = shopEligible ? shop.notificationPhone : listing.phone;
      if (!phone) {
        await recordFailure(NOT_CONTACTABLE);
        continue;
      }

      const token = generateAccessToken();
      const tokenHash = await hashAccessToken(token);
      const leadUrl = deps.leadUrl(token);
      const summary = buildRequestSummary(request, offer.distanceM);

      let to: { phone: string; templateSid?: string; variables: Record<string, string> };
      let text: string;
      if (shopEligible) {
        const lang: Lang = shop.notificationLanguage === "si" ? "si" : "en";
        text = deps.buildShopText({ shopName: shop.nameEn, summary, leadUrl, lang });
        to = {
          phone,
          templateSid: deps.templates[lang],
          variables: { "1": shop.nameEn, "2": request.ref, "3": oneLineSummary(summary), "4": leadUrl },
        };
      } else {
        text = deps.buildUnclaimedText({ listingName: listing.name, summary, leadUrl, lang: "en" });
        to = { phone, variables: {} };
      }

      let result: Awaited<ReturnType<SendFn>>;
      try {
        result = await deps.send(to, text);
      } catch (e) {
        result = { ok: false, message: e instanceof Error ? e.message : "send failed" };
      }
      if (!result.ok) {
        await recordFailure(result.message);
        continue;
      }

      const now = new Date();
      await db
        .update(o)
        .set({
          ...(firstSend ? { status: "sent" } : {}),
          tokenHash,
          sentAt: now,
          providerId: result.providerId ?? null,
          notificationStatus: "sent",
          notificationError: null,
          updatedAt: now,
        })
        .where(eq(o.id, offer.id));
      sent++;
    } catch {
      await recordFailure("dispatch error");
    }
  }
  return ok({ sent, failed });
}
