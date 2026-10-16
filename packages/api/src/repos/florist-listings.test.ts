import { describe, expect, it } from "vitest";
import { isListingStale, listingFromPlace, type PlaceInput } from "./florist-listings";

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
