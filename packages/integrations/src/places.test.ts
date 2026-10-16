import { afterEach, describe, expect, it, vi } from "vitest";
import { parsePlace, searchFloristsText } from "./places";

const fixture = {
  id: "ChIJx", displayName: { text: "Rose Florist" }, formattedAddress: "12 Main St, Kurunegala",
  location: { latitude: 7.48, longitude: 80.36 }, nationalPhoneNumber: "077 123 4567",
  rating: 4.6, userRatingCount: 213, googleMapsUri: "https://maps.google.com/?cid=1",
};

afterEach(() => vi.unstubAllGlobals());

describe("parsePlace", () => {
  it("maps a Google place to PlaceSummary", () => {
    expect(parsePlace(fixture)).toEqual({
      placeId: "ChIJx", name: "Rose Florist", address: "12 Main St, Kurunegala", phone: "077 123 4567",
      lat: 7.48, lng: 80.36, rating: 4.6, reviewCount: 213, mapsUri: "https://maps.google.com/?cid=1",
    });
  });
  it("returns null without id or location", () => {
    expect(parsePlace({ ...fixture, id: undefined })).toBeNull();
    expect(parsePlace({ ...fixture, location: undefined })).toBeNull();
    expect(parsePlace(null)).toBeNull();
  });
});

describe("searchFloristsText", () => {
  it("sends key and field mask headers", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ places: [fixture] }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const result = await searchFloristsText("KEY", "florist kurunegala");
    expect(result.ok && result.data).toHaveLength(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://places.googleapis.com/v1/places:searchText");
    const headers = init.headers as Record<string, string>;
    expect(headers["X-Goog-Api-Key"]).toBe("KEY");
    expect(headers["X-Goog-FieldMask"]).toContain("places.googleMapsUri");
    expect(headers["X-Goog-FieldMask"]).not.toContain("reviews");
  });
  it("returns ok:false with API message on 403", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: { message: "API key invalid" } }), { status: 403 })));
    const result = await searchFloristsText("BAD", "x");
    expect(result).toEqual({ ok: false, message: expect.stringContaining("API key invalid") });
  });
  it("does not throw on network error", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("boom")));
    expect((await searchFloristsText("K", "x")).ok).toBe(false);
  });
});
