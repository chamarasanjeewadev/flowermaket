/**
 * Florist directory server functions for the Admin Portal: Google Places
 * search/import, listing management and invites.
 */
import { createServerFn } from "@tanstack/react-start";
import {
  getEnv,
  tryCreateDb,
  err,
  ok,
  importListingFromPlace,
  listListings,
  linkListingToShop,
  setListingLocation,
  setListingStatus,
  refreshListingFromPlace,
  listStaleListingIds,
  getListingInviteInfo,
  markListingInvited,
  listShopsForReview,
  createInvite,
  generateInviteToken,
  buildJoinUrl,
  applyInviteLink,
  normalizeLkPhone,
  recordOutboundMessage,
  type ActionResult,
  type FloristListingDTO,
  type ListingStatus,
} from "@flowers/api";
import {
  getPlaceDetails,
  notificationConfigFromEnv,
  searchFloristsNearby,
  searchFloristsText,
  sendSupplierNotification,
  type PlaceSummary,
} from "@flowers/integrations";
import { resolveAdminSession } from "./session";

const INVITE_TTL_DAYS = 30;
const MAX_REFRESH = 50;
const MISSING_KEY = "Places API key not configured (GOOGLE_PLACES_API_KEY).";
const NO_DB = "Database is not configured.";

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

function placesKey(): string | null {
  const key = getEnv().GOOGLE_PLACES_API_KEY?.trim();
  return key ? key : null;
}

function isLatLng(lat: number, lng: number): boolean {
  return Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180;
}

export interface SearchPayload {
  query?: string;
  lat?: number;
  lng?: number;
  radiusKm?: number;
}

export interface SearchResultRow extends PlaceSummary {
  imported: boolean;
}

export const searchGoogleFloristsFn = createServerFn({ method: "POST" })
  .validator((input: SearchPayload) => input)
  .handler(async ({ data }): Promise<ActionResult<SearchResultRow[]>> => {
    await requireAdmin();
    const key = placesKey();
    if (!key) return err("validation", MISSING_KEY);

    const hasPin = data.lat !== undefined && data.lng !== undefined;
    if (hasPin && !isLatLng(data.lat as number, data.lng as number)) {
      return err("validation", "Latitude/longitude are out of range.");
    }
    const radiusM = Math.min(Math.max(data.radiusKm ?? 10, 1), 50) * 1000;
    const query = data.query?.trim() ?? "";
    if (!query && !hasPin) return err("validation", "Enter a search term or a lat,lng.");

    const near = hasPin ? { lat: data.lat as number, lng: data.lng as number } : null;
    const res =
      query.length > 0
        ? await searchFloristsText(key, query, near ? { ...near, radiusM } : undefined)
        : await searchFloristsNearby(key, (near as { lat: number }).lat, (near as { lng: number }).lng, radiusM);
    if (!res.ok) return err("unknown", res.message);

    const db = tryCreateDb();
    const known = new Set<string>();
    if (db) {
      for (const l of await listListings(db, {})) if (l.googlePlaceId) known.add(l.googlePlaceId);
    }
    return ok(res.data.map((p) => ({ ...p, imported: known.has(p.placeId) })));
  });

export const importFloristFn = createServerFn({ method: "POST" })
  .validator((input: { placeId: string }) => input)
  .handler(async ({ data }): Promise<ActionResult<{ id: string; created: boolean }>> => {
    await requireAdmin();
    const key = placesKey();
    if (!key) return err("validation", MISSING_KEY);
    const db = tryCreateDb();
    if (!db) return err("db_unavailable", NO_DB);
    if (!data.placeId?.trim()) return err("validation", "placeId is required.");
    const details = await getPlaceDetails(key, data.placeId.trim());
    if (!details.ok) return err("unknown", details.message);
    return importListingFromPlace(db, details.data);
  });

export interface ListFilters {
  district?: string;
  status?: ListingStatus;
  hasShop?: boolean;
  limit?: number;
}

export const listFloristsFn = createServerFn({ method: "POST" })
  .validator((input: ListFilters) => input)
  .handler(async ({ data }): Promise<ActionResult<FloristListingDTO[]>> => {
    await requireAdmin();
    if (!placesKey()) return err("validation", MISSING_KEY);
    const db = tryCreateDb();
    if (!db) return err("db_unavailable", NO_DB);
    try {
      return ok(await listListings(db, data));
    } catch (e) {
      return err("unknown", e instanceof Error ? e.message : "Failed to load florists.");
    }
  });

export interface ShopOption {
  id: string;
  nameEn: string;
  district: string;
}

/** Shops that can be linked to a listing (florist shops first). */
export const listShopOptionsFn = createServerFn({ method: "GET" }).handler(
  async (): Promise<ActionResult<ShopOption[]>> => {
    await requireAdmin();
    const db = tryCreateDb();
    if (!db) return err("db_unavailable", NO_DB);
    try {
      const shops = await listShopsForReview(db);
      return ok(
        [...shops]
          .sort((a, b) => Number(b.sellerTypes.includes("florist")) - Number(a.sellerTypes.includes("florist")))
          .map((s) => ({ id: s.id, nameEn: s.nameEn, district: s.district })),
      );
    } catch (e) {
      return err("unknown", e instanceof Error ? e.message : "Failed to load shops.");
    }
  },
);

export const linkFloristToShopFn = createServerFn({ method: "POST" })
  .validator((input: { listingId: string; shopId: string }) => input)
  .handler(async ({ data }): Promise<ActionResult<void>> => {
    await requireAdmin();
    if (!placesKey()) return err("validation", MISSING_KEY);
    const db = tryCreateDb();
    if (!db) return err("db_unavailable", NO_DB);
    return linkListingToShop(db, data.listingId, data.shopId);
  });

export const setFloristLocationFn = createServerFn({ method: "POST" })
  .validator((input: { listingId: string; lat: number; lng: number }) => input)
  .handler(async ({ data }): Promise<ActionResult<void>> => {
    await requireAdmin();
    if (!placesKey()) return err("validation", MISSING_KEY);
    if (!isLatLng(data.lat, data.lng)) return err("validation", "Latitude/longitude are out of range.");
    const db = tryCreateDb();
    if (!db) return err("db_unavailable", NO_DB);
    return setListingLocation(db, data.listingId, { lat: data.lat, lng: data.lng }, "admin");
  });

export const setFloristStatusFn = createServerFn({ method: "POST" })
  .validator((input: { listingId: string; status: "unclaimed" | "opted_out" | "blocked" }) => input)
  .handler(async ({ data }): Promise<ActionResult<void>> => {
    await requireAdmin();
    if (!placesKey()) return err("validation", MISSING_KEY);
    if (data.status !== "unclaimed" && data.status !== "opted_out" && data.status !== "blocked") {
      return err("validation", "Invalid status.");
    }
    const db = tryCreateDb();
    if (!db) return err("db_unavailable", NO_DB);
    return setListingStatus(db, data.listingId, data.status);
  });

export const refreshStaleFloristsFn = createServerFn({ method: "POST" })
  .validator((input: { limit: number }) => input)
  .handler(
    async ({ data }): Promise<ActionResult<{ refreshed: number; failed: number }>> => {
      await requireAdmin();
      const key = placesKey();
      if (!key) return err("validation", MISSING_KEY);
      const db = tryCreateDb();
      if (!db) return err("db_unavailable", NO_DB);
      const limit = Math.min(Math.max(Math.floor(data.limit) || 0, 1), MAX_REFRESH);
      const ids = await listStaleListingIds(db, new Date(), limit);
      let refreshed = 0;
      let failed = 0;
      const placeIds = new Map((await listListings(db, {})).map((r) => [r.id, r.googlePlaceId]));
      for (const id of ids) {
        const placeId = placeIds.get(id);
        if (!placeId) {
          failed++;
          continue;
        }
        const details = await getPlaceDetails(key, placeId);
        if (!details.ok) {
          failed++;
          continue;
        }
        const res = await refreshListingFromPlace(db, id, details.data);
        if (res.ok) refreshed++;
        else failed++;
      }
      return ok({ refreshed, failed });
    },
  );

export type FloristInviteDelivery =
  | { status: "sent" }
  | { status: "failed"; detail: string };

export const inviteFloristFn = createServerFn({ method: "POST" })
  .validator((input: { listingId: string; message: string }) => input)
  .handler(
    async ({ data }): Promise<ActionResult<{ joinUrl: string; delivery: FloristInviteDelivery }>> => {
      const session = await requireAdmin();
      if (!placesKey()) return err("validation", MISSING_KEY);
      const db = tryCreateDb();
      if (!db) return err("db_unavailable", NO_DB);

      const listing = await getListingInviteInfo(db, data.listingId);
      if (!listing) return err("not_found", "Listing not found.");
      if (listing.status !== "unclaimed" && listing.status !== "invited") {
        return err("validation", `A ${listing.status.replace("_", " ")} listing cannot be invited.`);
      }
      const phone = listing.phone ? normalizeLkPhone(listing.phone) : null;
      if (!phone) return err("validation", "This listing has no valid mobile number.");
      const template = data.message?.trim();
      if (!template) return err("validation", "The message can't be empty.");

      const env = getEnv();
      const token = generateInviteToken();
      const joinUrl = buildJoinUrl(env.SUPPLIER_PORTAL_URL, token);
      if (!joinUrl) {
        return err("db_unavailable", "Supplier portal URL (SUPPLIER_PORTAL_URL) is not configured.");
      }
      const message = applyInviteLink(template, joinUrl);

      const created = await createInvite(db, {
        phone,
        nameEn: listing.name,
        sellerTypes: ["florist"],
        language: "en",
        token,
        sentBy: session.kind === "admin" ? session.userId : null,
        expiresAt: new Date(Date.now() + INVITE_TTL_DAYS * 24 * 60 * 60 * 1000),
      });
      if (!created.ok) return created;

      const sent = await sendSupplierNotification(notificationConfigFromEnv(env), {
        phone,
        text: message,
        variables: {},
      });
      if (!sent.ok) {
        return ok({ joinUrl, delivery: { status: "failed", detail: sent.message } });
      }
      try {
        await recordOutboundMessage(db, { phone, text: message });
      } catch {
        // inbox logging is best-effort
      }
      const marked = await markListingInvited(db, listing.id, created.data.id);
      if (!marked.ok) return marked;
      return ok({ joinUrl, delivery: { status: "sent" } });
    },
  );
