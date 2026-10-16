import { describe, expect, it } from "vitest";
import { boundingBox, haversineMeters } from "./geo";

describe("haversineMeters", () => {
  it("Colombo Fort to Kandy is about 95.8 km", () => {
    const d = haversineMeters({ lat: 6.9344, lng: 79.8428 }, { lat: 7.2906, lng: 80.6337 });
    expect(d).toBeGreaterThan(95800 * 0.99);
    expect(d).toBeLessThan(95800 * 1.01);
  });
  it("is zero for identical points", () => {
    expect(haversineMeters({ lat: 7, lng: 80 }, { lat: 7, lng: 80 })).toBe(0);
  });
});

describe("boundingBox", () => {
  it("10 km radius spans ~0.1799 degrees of latitude", () => {
    const b = boundingBox({ lat: 7, lng: 80 }, 10);
    expect(Math.abs(b.maxLat - b.minLat - 0.1799)).toBeLessThan(0.001);
    expect(b.minLng).toBeLessThan(80);
    expect(b.maxLng).toBeGreaterThan(80);
  });
});
