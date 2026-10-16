import { afterEach, describe, expect, it, vi } from "vitest";
import { autocompletePlaces, geocodeText, getPlaceDetails, parsePlace, searchFloristsNearby, searchFloristsText } from "./places";

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

describe("geocodeText", () => {
  it("returns lat/lng/label from a place response", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ places: [fixture] }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const result = await geocodeText("KEY", "Kurunegala");
    expect(result).toEqual({ ok: true, data: { lat: 7.48, lng: 80.36, label: "12 Main St, Kurunegala" } });
    const headers = (fetchMock.mock.calls[0] as [string, RequestInit])[1].headers as Record<string, string>;
    expect(headers["X-Goog-FieldMask"]).toContain("places.id");
  });
});

describe("getPlaceDetails", () => {
  it("GETs the place with an unprefixed field mask", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(fixture), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const result = await getPlaceDetails("KEY", "ChIJx");
    expect(result.ok && result.data.placeId).toBe("ChIJx");
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://places.googleapis.com/v1/places/ChIJx");
    expect(init.method).toBe("GET");
    const mask = (init.headers as Record<string, string>)["X-Goog-FieldMask"];
    expect(mask).toContain("googleMapsUri");
    expect(mask).not.toContain("places.");
  });
});

describe("autocompletePlaces", () => {
  it("parses suggestions", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ suggestions: [{ placePrediction: { placeId: "p1", text: { text: "Kandy, Sri Lanka" } } }, { queryPrediction: {} }] }), { status: 200 })));
    expect(await autocompletePlaces("KEY", "kan", "tok")).toEqual({ ok: true, data: [{ placeId: "p1", text: "Kandy, Sri Lanka" }] });
  });
});

describe("searchFloristsNearby", () => {
  it("clamps radius to 50000", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({}), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    await searchFloristsNearby("KEY", 7, 80, 90000);
    const body = JSON.parse(((fetchMock.mock.calls[0] as [string, RequestInit])[1].body) as string);
    expect(body.locationRestriction.circle.radius).toBe(50000);
  });
});
