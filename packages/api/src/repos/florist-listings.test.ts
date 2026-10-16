import { describe, expect, it } from "vitest";
import { isListingStale, linkDecision, listingFromPlace, type PlaceInput } from "./florist-listings";

const now = new Date("2026-10-16T00:00:00Z");
const daysAgo = (n: number) => new Date(now.getTime() - n * 86_400_000);
const place: PlaceInput = {
  placeId: "p1",
  name: "Rose Florist",
  address: "12 Main St, Kurunegala",
  phone: "077 123 4567",
  lat: 7.48,
  lng: 80.36,
  rating: 4.5,
  reviewCount: 10,
  mapsUri: "https://maps.example/p1",
};

describe("listingFromPlace", () => {
  it("maps a place to a new listing", () => {
    const l = listingFromPlace(place, now);
    expect(l.phone).toBe("94771234567");
    expect(l.locationSource).toBe("google");
    expect(l.status).toBe("unclaimed");
    expect(l.googleSyncedAt).toEqual(now);
    expect(l.googlePlaceId).toBe("p1");
    expect(l.city).toBeNull();
  });
  it("derives district from address", () => {
    expect(listingFromPlace(place, now).district).toBe("kurunegala");
  });
  it("district null when address missing", () => {
    expect(listingFromPlace({ ...place, address: null }, now).district).toBeNull();
  });
});

describe("isListingStale", () => {
  it("null is stale", () => expect(isListingStale(null, now)).toBe(true));
  it("29 days is fresh", () => expect(isListingStale(daysAgo(29), now)).toBe(false));
  it("31 days is stale", () => expect(isListingStale(daysAgo(31), now)).toBe(true));
});

describe("linkDecision", () => {
  const link = (status: "unclaimed" | "invited" | "opted_out" | "blocked", shopId: string | null, to = "s1") =>
    linkDecision({ status, shopId }, to);
  it("unclaimed -> claimed", () => expect(link("unclaimed", null)).toEqual({ ok: true, data: { status: "claimed" } }));
  it("invited -> claimed", () => expect(link("invited", null)).toEqual({ ok: true, data: { status: "claimed" } }));
  it("opted_out stays", () => expect(link("opted_out", null)).toEqual({ ok: true, data: { status: "opted_out" } }));
  it("blocked stays", () => expect(link("blocked", null)).toEqual({ ok: true, data: { status: "blocked" } }));
  it("other shop conflicts", () => expect(link("unclaimed", "s2").ok).toBe(false));
  it("same shop ok", () => expect(link("unclaimed", "s1").ok).toBe(true));
});
