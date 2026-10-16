import { haversineMeters, type LatLng } from "./geo";
import type { MatchCandidate } from "./matching-types";
import { LOCAL_RADIUS_KM, MAX_FLORISTS, MIN_FLORISTS, WIDE_RADIUS_KM } from "./constants";

export interface MatchedFlorist {
  listingId: string;
  shopId: string | null;
  distanceM: number;
  autoSend: boolean;
}

export function selectFloristsForRequest(
  cands: MatchCandidate[],
  point: LatLng,
): { radiusKm: 10 | 25; florists: MatchedFlorist[] } {
  const scored = cands
    .filter((c) => c.status !== "opted_out" && c.status !== "blocked" && c.phone !== null)
    .map((c) => ({
      c,
      distanceM: haversineMeters(point, { lat: c.lat, lng: c.lng }),
      autoSend: c.shopEligible && c.shopId !== null,
    }));
  const inner = scored.filter((s) => s.distanceM <= LOCAL_RADIUS_KM * 1000);
  const useWide = inner.length < MIN_FLORISTS;
  const radiusKm: 10 | 25 = useWide ? WIDE_RADIUS_KM : LOCAL_RADIUS_KM;
  const pool = useWide ? scored.filter((s) => s.distanceM <= WIDE_RADIUS_KM * 1000) : inner;
  pool.sort(
    (a, b) =>
      Number(b.autoSend) - Number(a.autoSend) ||
      a.distanceM - b.distanceM ||
      (b.c.googleRating ?? -1) - (a.c.googleRating ?? -1),
  );
  return {
    radiusKm,
    florists: pool.slice(0, MAX_FLORISTS).map((s) => ({
      listingId: s.c.listingId,
      shopId: s.c.shopId,
      distanceM: s.distanceM,
      autoSend: s.autoSend,
    })),
  };
}
