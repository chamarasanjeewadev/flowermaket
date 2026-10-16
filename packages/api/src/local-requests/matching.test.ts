import { describe, expect, it } from "vitest";
import { selectFloristsForRequest } from "./matching";
import type { MatchCandidate } from "./matching-types";

const P = { lat: 6.9, lng: 79.86 };
// ~111.19 km per degree latitude
const atKm = (km: number) => ({ lat: P.lat + km / 111.19, lng: P.lng });
let n = 0;
const cand = (km: number, o: Partial<MatchCandidate> = {}): MatchCandidate => ({
  listingId: `l${++n}`, shopId: null, ...atKm(km), googleRating: 4, status: "unclaimed",
  phone: "94770000000", shopEligible: false, ...o,
});

describe("selectFloristsForRequest", () => {
  it("uses 10km when >=3 inside", () => {
    const r = selectFloristsForRequest([2, 4, 6, 8].map((k) => cand(k)), P);
    expect(r.radiusKm).toBe(10);
    expect(r.florists).toHaveLength(4);
  });
  it("widens to 25km when <3 inside", () => {
    const r = selectFloristsForRequest([1, 5, 15, 18, 20, 30].map((k) => cand(k)), P);
    expect(r.radiusKm).toBe(25);
    expect(r.florists).toHaveLength(5);
  });
  it("ranks eligible shops first with autoSend", () => {
    const near = cand(1);
    const shop = cand(9, { shopId: "s1", shopEligible: true });
    const r = selectFloristsForRequest([near, shop, cand(3), cand(4)], P);
    expect(r.florists[0]?.listingId).toBe(shop.listingId);
    expect(r.florists[0]?.autoSend).toBe(true);
  });
  it("caps at 8", () => {
    const r = selectFloristsForRequest(Array.from({ length: 12 }, (_, i) => cand(i * 0.5 + 0.5)), P);
    expect(r.florists).toHaveLength(8);
  });
  it("drops opted_out, blocked and phoneless", () => {
    const bad = [cand(1, { status: "opted_out" }), cand(1, { status: "blocked" }), cand(1, { phone: null })];
    expect(selectFloristsForRequest(bad, P).florists).toEqual([]);
  });
  it("empty", () => {
    expect(selectFloristsForRequest([], P)).toEqual({ radiusKm: 25, florists: [] });
  });
});
