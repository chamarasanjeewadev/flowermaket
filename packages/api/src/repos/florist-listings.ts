/**
 * florist-listings.ts — directory of every florist we know about (Google Places
 * seeded, registered or claimed). Distance is computed in TypeScript; SQL only
 * narrows by bounding box.
 */
import { and, between, eq, isNotNull, isNull, lt, notInArray, or, sql } from "drizzle-orm";
import { schema } from "@flowers/db/client";
import type { Db } from "../db";
import { DISTRICTS } from "../constants";
import { err, isPgError, ok, type ActionResult } from "../errors";
import { normalizeLkPhone } from "../invite-message";
import { boundingBox, haversineMeters, type LatLng } from "../local-requests/geo";
import type { ListingStatus, MatchCandidate } from "../local-requests/matching-types";

export type { ListingStatus } from "../local-requests/matching-types";

/**
 * Structurally identical to `PlaceSummary` in @flowers/integrations (packages/api
 * does not depend on that package, so the shape is declared locally).
 */
export interface PlaceInput {
  placeId: string;
  name: string;
  address: string | null;
  phone: string | null;
  lat: number;
  lng: number;
  rating: number | null;
  reviewCount: number | null;
  mapsUri: string | null;
}

export type NewListingValues = typeof schema.floristListings.$inferInsert;

export type LocationSource = "google" | "owner" | "admin";

export interface FloristListingDTO {
  id: string;
  googlePlaceId: string | null;
  shopId: string | null;
  shopName: string | null;
  name: string;
  phone: string | null;
  address: string | null;
  district: string | null;
  city: string | null;
  lat: number;
  lng: number;
  locationSource: LocationSource;
  googleRating: number | null;
  googleReviewCount: number | null;
  googleMapsUri: string | null;
  googleSyncedAt: Date | null;
  status: ListingStatus;
  isStale: boolean;
}

const STALE_MS = 30 * 24 * 60 * 60 * 1000;
const EXCLUDED_STATUSES: ListingStatus[] = ["opted_out", "blocked"];

const STATUSES: readonly ListingStatus[] = ["unclaimed", "invited", "claimed", "opted_out", "blocked"];
const asStatus = (s: string): ListingStatus => (STATUSES.find((x) => x === s) ?? "unclaimed");
const asSource = (s: string): LocationSource => (s === "owner" || s === "admin" ? s : "google");

/** > 30 days since the last Google sync, or never synced. */
export function isListingStale(syncedAt: Date | null, now: Date): boolean {
  if (!syncedAt) return true;
  return now.getTime() - syncedAt.getTime() > STALE_MS;
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Slug of the first district whose English name appears as a whole word in the address. */
function districtFromAddress(address: string | null): string | null {
  if (!address) return null;
  for (const d of DISTRICTS) {
    if (new RegExp(`\\b${escapeRegExp(d.nameEn)}\\b`, "i").test(address)) return d.slug;
  }
  return null;
}

export function listingFromPlace(place: PlaceInput, now: Date): NewListingValues {
  return {
    googlePlaceId: place.placeId,
    name: place.name,
    phone: place.phone ? normalizeLkPhone(place.phone) : null,
    address: place.address,
    district: districtFromAddress(place.address),
    city: null,
    lat: place.lat,
    lng: place.lng,
    locationSource: "google",
    googleRating: place.rating,
    googleReviewCount: place.reviewCount,
    googleMapsUri: place.mapsUri,
    googleSyncedAt: now,
    status: "unclaimed",
  };
}

/**
 * Fields to apply when re-syncing an existing listing from Google. Never
 * touches status, and leaves lat/lng alone when an owner/admin set the location.
 * Null phone/district from Google do not erase known values.
 */
function syncPatch(
  place: PlaceInput,
  existingSource: LocationSource,
  now: Date,
): Partial<NewListingValues> {
  const fresh = listingFromPlace(place, now);
  const patch: Partial<NewListingValues> = {
    name: fresh.name,
    address: fresh.address,
    googleRating: fresh.googleRating,
    googleReviewCount: fresh.googleReviewCount,
    googleMapsUri: fresh.googleMapsUri,
    googleSyncedAt: now,
    updatedAt: now,
  };
  if (fresh.phone) patch.phone = fresh.phone;
  if (fresh.district) patch.district = fresh.district;
  if (existingSource === "google") {
    patch.lat = fresh.lat;
    patch.lng = fresh.lng;
  }
  return patch;
}

/** Upsert by google_place_id. */
export async function importListingFromPlace(
  db: Db,
  place: PlaceInput,
): Promise<ActionResult<{ id: string; created: boolean }>> {
  try {
    const now = new Date();
    const [existing] = await db
      .select({ id: schema.floristListings.id, locationSource: schema.floristListings.locationSource })
      .from(schema.floristListings)
      .where(eq(schema.floristListings.googlePlaceId, place.placeId))
      .limit(1);
    if (existing) {
      await db
        .update(schema.floristListings)
        .set(syncPatch(place, asSource(existing.locationSource), now))
        .where(eq(schema.floristListings.id, existing.id));
      return ok({ id: existing.id, created: false });
    }
    const [row] = await db
      .insert(schema.floristListings)
      .values(listingFromPlace(place, now))
      .returning({ id: schema.floristListings.id });
    if (!row) return err("unknown", "Insert returned no row.");
    return ok({ id: row.id, created: true });
  } catch (e) {
    if (isPgError(e, "23505")) return err("conflict", "Listing was created concurrently.");
    return err("unknown", e instanceof Error ? e.message : "Failed to import listing.");
  }
}

export async function refreshListingFromPlace(
  db: Db,
  listingId: string,
  place: PlaceInput,
): Promise<ActionResult<void>> {
  try {
    const [existing] = await db
      .select({ locationSource: schema.floristListings.locationSource })
      .from(schema.floristListings)
      .where(eq(schema.floristListings.id, listingId))
      .limit(1);
    if (!existing) return err("not_found", "Listing not found.");
    await db
      .update(schema.floristListings)
      .set(syncPatch(place, asSource(existing.locationSource), new Date()))
      .where(eq(schema.floristListings.id, listingId));
    return ok(undefined);
  } catch (e) {
    return err("unknown", e instanceof Error ? e.message : "Failed to refresh listing.");
  }
}

export async function listListings(
  db: Db,
  f: {
    near?: LatLng & { radiusKm: number };
    district?: string;
    status?: ListingStatus;
    hasShop?: boolean;
    limit?: number;
  },
): Promise<FloristListingDTO[]> {
  const t = schema.floristListings;
  const conditions = [];
  if (f.near) {
    const box = boundingBox(f.near, f.near.radiusKm);
    conditions.push(between(t.lat, box.minLat, box.maxLat), between(t.lng, box.minLng, box.maxLng));
  }
  if (f.district) conditions.push(eq(t.district, f.district));
  if (f.status) conditions.push(eq(t.status, f.status));
  if (f.hasShop === true) conditions.push(isNotNull(t.shopId));
  if (f.hasShop === false) conditions.push(isNull(t.shopId));

  const rows = await db
    .select({ listing: t, shopName: schema.shops.nameEn })
    .from(t)
    .leftJoin(schema.shops, eq(schema.shops.id, t.shopId))
    .where(conditions.length ? and(...conditions) : undefined);

  const now = new Date();
  let out = rows.map(({ listing: l, shopName }) => ({
    dto: {
      id: l.id,
      googlePlaceId: l.googlePlaceId,
      shopId: l.shopId,
      shopName,
      name: l.name,
      phone: l.phone,
      address: l.address,
      district: l.district,
      city: l.city,
      lat: l.lat,
      lng: l.lng,
      locationSource: asSource(l.locationSource),
      googleRating: l.googleRating,
      googleReviewCount: l.googleReviewCount,
      googleMapsUri: l.googleMapsUri,
      googleSyncedAt: l.googleSyncedAt,
      status: asStatus(l.status),
      isStale: l.googlePlaceId ? isListingStale(l.googleSyncedAt, now) : false,
    } satisfies FloristListingDTO,
    distance: f.near ? haversineMeters(f.near, l) : 0,
  }));
  if (f.near) {
    const maxM = f.near.radiusKm * 1000;
    out = out.filter((r) => r.distance <= maxM).sort((a, b) => a.distance - b.distance);
  }
  const dtos = out.map((r) => r.dto);
  return f.limit !== undefined ? dtos.slice(0, f.limit) : dtos;
}

/**
 * Candidates inside the bounding box (not opted out/blocked, with a phone).
 * Precise distance filtering is left to the caller.
 */
export async function listingsInBox(
  db: Db,
  center: LatLng,
  radiusKm: number,
): Promise<MatchCandidate[]> {
  const t = schema.floristListings;
  const s = schema.shops;
  const box = boundingBox(center, radiusKm);
  const rows = await db
    .select({ listing: t, shop: s })
    .from(t)
    .leftJoin(s, eq(s.id, t.shopId))
    .where(
      and(
        between(t.lat, box.minLat, box.maxLat),
        between(t.lng, box.minLng, box.maxLng),
        notInArray(t.status, EXCLUDED_STATUSES),
        isNotNull(t.phone),
      ),
    );
  return rows.map(({ listing: l, shop }) => ({
    listingId: l.id,
    shopId: l.shopId,
    lat: l.lat,
    lng: l.lng,
    googleRating: l.googleRating,
    status: asStatus(l.status),
    phone: l.phone,
    shopEligible:
      shop !== null &&
      shop.isActive &&
      shop.sellerTypes.includes("florist") &&
      shop.notificationConsentAt !== null &&
      shop.notificationVerifiedAt !== null &&
      shop.notificationPhone !== null,
  }));
}

export async function linkListingToShop(
  db: Db,
  listingId: string,
  shopId: string,
): Promise<ActionResult<void>> {
  try {
    const rows = await db
      .update(schema.floristListings)
      .set({ shopId, status: "claimed", updatedAt: new Date() })
      .where(eq(schema.floristListings.id, listingId))
      .returning({ id: schema.floristListings.id });
    if (rows.length === 0) return err("not_found", "Listing not found.");
    return ok(undefined);
  } catch (e) {
    if (isPgError(e, "23505")) return err("conflict", "That shop is already linked to a listing.");
    return err("unknown", e instanceof Error ? e.message : "Failed to link listing.");
  }
}

export async function setListingLocation(
  db: Db,
  listingId: string,
  loc: LatLng,
  source: "owner" | "admin",
): Promise<ActionResult<void>> {
  const rows = await db
    .update(schema.floristListings)
    .set({ lat: loc.lat, lng: loc.lng, locationSource: source, updatedAt: new Date() })
    .where(eq(schema.floristListings.id, listingId))
    .returning({ id: schema.floristListings.id });
  return rows.length === 0 ? err("not_found", "Listing not found.") : ok(undefined);
}

export async function setListingStatus(
  db: Db,
  listingId: string,
  status: "unclaimed" | "opted_out" | "blocked",
): Promise<ActionResult<void>> {
  const now = new Date();
  const rows = await db
    .update(schema.floristListings)
    .set({ status, optedOutAt: status === "opted_out" ? now : null, updatedAt: now })
    .where(eq(schema.floristListings.id, listingId))
    .returning({ id: schema.floristListings.id });
  return rows.length === 0 ? err("not_found", "Listing not found.") : ok(undefined);
}

/** Opt out every listing with this phone. Returns rows updated. */
export async function optOutByPhone(db: Db, rawPhone: string): Promise<number> {
  const phone = normalizeLkPhone(rawPhone);
  if (!phone) return 0;
  const now = new Date();
  const rows = await db
    .update(schema.floristListings)
    .set({ status: "opted_out", optedOutAt: now, updatedAt: now })
    .where(
      and(
        eq(schema.floristListings.phone, phone),
        notInArray(schema.floristListings.status, ["opted_out"]),
      ),
    )
    .returning({ id: schema.floristListings.id });
  return rows.length;
}

/** Google-sourced listings not synced in 30+ days (never-synced first). */
export async function listStaleListingIds(db: Db, now: Date, limit: number): Promise<string[]> {
  const t = schema.floristListings;
  const cutoff = new Date(now.getTime() - STALE_MS);
  const rows = await db
    .select({ id: t.id })
    .from(t)
    .where(
      and(
        isNotNull(t.googlePlaceId),
        notInArray(t.status, EXCLUDED_STATUSES),
        or(isNull(t.googleSyncedAt), lt(t.googleSyncedAt, cutoff)),
      ),
    )
    .orderBy(sql`${t.googleSyncedAt} asc nulls first`)
    .limit(limit);
  return rows.map((r) => r.id);
}
