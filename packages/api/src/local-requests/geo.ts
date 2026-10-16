export interface LatLng {
  lat: number;
  lng: number;
}

const EARTH_RADIUS_M = 6_371_000;
const toRad = (deg: number) => (deg * Math.PI) / 180;

/** Great-circle distance in metres. */
export function haversineMeters(a: LatLng, b: LatLng): number {
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Lat/lng rectangle enclosing a circle of `radiusKm` around `center`. */
export function boundingBox(
  center: LatLng,
  radiusKm: number,
): { minLat: number; maxLat: number; minLng: number; maxLng: number } {
  const dLat = (radiusKm * 1000) / EARTH_RADIUS_M;
  const cosLat = Math.max(Math.cos(toRad(center.lat)), 1e-6);
  const dLng = dLat / cosLat;
  const deg = (r: number) => (r * 180) / Math.PI;
  return {
    minLat: center.lat - deg(dLat),
    maxLat: center.lat + deg(dLat),
    minLng: center.lng - deg(dLng),
    maxLng: center.lng + deg(dLng),
  };
}
