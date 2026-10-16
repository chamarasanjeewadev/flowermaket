/** Google Places API (New) client. fetch-only; never throws; never requests `reviews`. */
export interface PlaceSummary {
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
export type PlacesResult<T> = { ok: true; data: T } | { ok: false; message: string };

const BASE = "https://places.googleapis.com/v1";
const FIELDS = ["id", "displayName", "formattedAddress", "location", "nationalPhoneNumber", "rating", "userRatingCount", "googleMapsUri"];
const LIST_MASK = FIELDS.map(f => `places.${f}`).join(",");
const DETAIL_MASK = FIELDS.join(",");

type Obj = Record<string, unknown>;
function isObj(v: unknown): v is Obj { return typeof v === "object" && v !== null; }
function str(v: unknown): string | null { return typeof v === "string" && v.length > 0 ? v : null; }
function num(v: unknown): number | null { return typeof v === "number" && Number.isFinite(v) ? v : null; }

export function parsePlace(raw: unknown): PlaceSummary | null {
  if (!isObj(raw)) return null;
  const placeId = str(raw.id);
  const loc = raw.location;
  if (!placeId || !isObj(loc)) return null;
  const lat = num(loc.latitude); const lng = num(loc.longitude);
  if (lat === null || lng === null) return null;
  const displayName = isObj(raw.displayName) ? str(raw.displayName.text) : null;
  return {
    placeId, name: displayName ?? "", address: str(raw.formattedAddress), phone: str(raw.nationalPhoneNumber),
    lat, lng, rating: num(raw.rating), reviewCount: num(raw.userRatingCount), mapsUri: str(raw.googleMapsUri),
  };
}

async function call(apiKey: string, path: string, mask: string | null, init: { method: "GET" | "POST"; body?: unknown }): Promise<PlacesResult<unknown>> {
  try {
    const headers: Record<string, string> = { "X-Goog-Api-Key": apiKey };
    if (mask) headers["X-Goog-FieldMask"] = mask;
    if (init.body !== undefined) headers["Content-Type"] = "application/json";
    const response = await fetch(`${BASE}${path}`, { method: init.method, headers, body: init.body !== undefined ? JSON.stringify(init.body) : undefined });
    let data: unknown = null;
    try { data = await response.json(); } catch { /* non-JSON body */ }
    if (!response.ok) {
      const apiMessage = isObj(data) && isObj(data.error) ? str(data.error.message) : null;
      return { ok: false, message: `Google Places error (${response.status})${apiMessage ? `: ${apiMessage}` : ""}` };
    }
    return { ok: true, data };
  } catch {
    return { ok: false, message: "Could not reach Google Places." };
  }
}

function parsePlaces(data: unknown): PlaceSummary[] {
  const list = isObj(data) && Array.isArray(data.places) ? data.places : [];
  return list.map(parsePlace).filter((p): p is PlaceSummary => p !== null);
}

export async function searchFloristsText(apiKey: string, query: string, opts?: { lat: number; lng: number; radiusM: number }): Promise<PlacesResult<PlaceSummary[]>> {
  const body: Obj = { textQuery: query, regionCode: "lk" };
  if (opts) body.locationBias = { circle: { center: { latitude: opts.lat, longitude: opts.lng }, radius: opts.radiusM } };
  const r = await call(apiKey, "/places:searchText", LIST_MASK, { method: "POST", body });
  return r.ok ? { ok: true, data: parsePlaces(r.data) } : r;
}

export async function searchFloristsNearby(apiKey: string, lat: number, lng: number, radiusM: number): Promise<PlacesResult<PlaceSummary[]>> {
  const body = { includedTypes: ["florist"], locationRestriction: { circle: { center: { latitude: lat, longitude: lng }, radius: Math.min(Math.max(radiusM, 1), 50000) } } };
  const r = await call(apiKey, "/places:searchNearby", LIST_MASK, { method: "POST", body });
  return r.ok ? { ok: true, data: parsePlaces(r.data) } : r;
}

export async function getPlaceDetails(apiKey: string, placeId: string): Promise<PlacesResult<PlaceSummary>> {
  const r = await call(apiKey, `/places/${encodeURIComponent(placeId)}`, DETAIL_MASK, { method: "GET" });
  if (!r.ok) return r;
  const place = parsePlace(r.data);
  return place ? { ok: true, data: place } : { ok: false, message: "Place details were incomplete." };
}

export async function autocompletePlaces(apiKey: string, input: string, sessionToken: string): Promise<PlacesResult<{ placeId: string; text: string }[]>> {
  const r = await call(apiKey, "/places:autocomplete", null, { method: "POST", body: { input, sessionToken, includedRegionCodes: ["lk"] } });
  if (!r.ok) return r;
  const suggestions = isObj(r.data) && Array.isArray(r.data.suggestions) ? r.data.suggestions : [];
  const data: { placeId: string; text: string }[] = [];
  for (const s of suggestions) {
    if (!isObj(s) || !isObj(s.placePrediction)) continue;
    const placeId = str(s.placePrediction.placeId);
    const text = isObj(s.placePrediction.text) ? str(s.placePrediction.text.text) : null;
    if (placeId && text) data.push({ placeId, text });
  }
  return { ok: true, data };
}

export async function geocodeText(apiKey: string, text: string): Promise<PlacesResult<{ lat: number; lng: number; label: string }>> {
  const r = await call(apiKey, "/places:searchText", "places.id,places.displayName,places.formattedAddress,places.location", { method: "POST", body: { textQuery: text, regionCode: "lk", pageSize: 1 } });
  if (!r.ok) return r;
  const first = parsePlaces(r.data)[0];
  if (!first) return { ok: false, message: "No matching location found." };
  return { ok: true, data: { lat: first.lat, lng: first.lng, label: first.address ?? first.name } };
}
