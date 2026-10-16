import { describe, expect, it } from "vitest";
import {
  budgetLabel,
  buildRequestSummary,
  planOffers,
  validateCreateRequest,
  type CreateRequestInput,
} from "./local-requests";

const TODAY = "2026-10-16";

function fixture(over: Partial<CreateRequestInput> = {}): CreateRequestInput {
  return {
    customerName: "Nimal Perera",
    customerPhone: "077 123 4567",
    language: "en",
    design: {
      flowers: [{ flowerId: "f1", nameEn: "Red roses", qty: 12 }],
      fillers: [],
      wrapping: "kraft",
      addons: ["card"],
      cardMessage: "Happy birthday",
      notes: null,
    },
    occasion: "birthday",
    budgetBand: "3k_5k",
    fulfilment: "delivery",
    point: { lat: 6.9271, lng: 79.8612 },
    deliveryArea: "Colombo 07",
    deliveryAddress: "12 Flower Rd, Colombo 07",
    neededOn: "2026-10-20",
    neededWindow: "morning",
    bouquetGenerationId: null,
    utm: null,
    ...over,
  };
}

describe("validateCreateRequest", () => {
  it("accepts a valid fixture and canonicalizes the phone", () => {
    const r = validateCreateRequest(fixture(), TODAY);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.data.customerPhone).toBe("94771234567");
  });

  it("accepts today and today+60d", () => {
    expect(validateCreateRequest(fixture({ neededOn: TODAY }), TODAY).ok).toBe(true);
    expect(validateCreateRequest(fixture({ neededOn: "2026-12-15" }), TODAY).ok).toBe(true);
  });

  it("rejects a past date", () => {
    const r = validateCreateRequest(fixture({ neededOn: "2026-10-15" }), TODAY);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("validation");
  });

  it("rejects a date 61 days out", () => {
    expect(validateCreateRequest(fixture({ neededOn: "2026-12-16" }), TODAY).ok).toBe(false);
  });

  it("rejects a malformed date", () => {
    expect(validateCreateRequest(fixture({ neededOn: "2026-02-31" }), TODAY).ok).toBe(false);
    expect(validateCreateRequest(fixture({ neededOn: "next week" }), TODAY).ok).toBe(false);
  });

  it("rejects a point outside Sri Lanka (Chennai)", () => {
    expect(validateCreateRequest(fixture({ point: { lat: 13.08, lng: 80.27 } }), TODAY).ok).toBe(false);
  });

  it("rejects delivery without an address", () => {
    expect(validateCreateRequest(fixture({ deliveryAddress: null }), TODAY).ok).toBe(false);
    expect(validateCreateRequest(fixture({ deliveryAddress: "  " }), TODAY).ok).toBe(false);
  });

  it("allows pickup without an address", () => {
    expect(
      validateCreateRequest(fixture({ fulfilment: "pickup", deliveryAddress: null }), TODAY).ok,
    ).toBe(true);
  });

  it("rejects an empty design", () => {
    const empty = { flowers: [], fillers: [], wrapping: null, addons: [], cardMessage: null, notes: null };
    expect(validateCreateRequest(fixture({ design: empty }), TODAY).ok).toBe(false);
    expect(
      validateCreateRequest(fixture({ design: { ...empty, notes: "too short" } }), TODAY).ok,
    ).toBe(false);
  });

  it("accepts a notes-only design with ≥10 chars", () => {
    const d = { flowers: [], fillers: [], wrapping: null, addons: [], cardMessage: null, notes: "Pastel mix, lots of lilies" };
    expect(validateCreateRequest(fixture({ design: d }), TODAY).ok).toBe(true);
  });

  it("rejects bad names and phones", () => {
    expect(validateCreateRequest(fixture({ customerName: "N" }), TODAY).ok).toBe(false);
    expect(validateCreateRequest(fixture({ customerName: "x".repeat(81) }), TODAY).ok).toBe(false);
    expect(validateCreateRequest(fixture({ customerPhone: "12345" }), TODAY).ok).toBe(false);
  });
});

describe("planOffers", () => {
  it("splits matched florists on autoSend", () => {
    const r = planOffers([
      { listingId: "a", shopId: "s1", distanceM: 100, autoSend: true },
      { listingId: "b", shopId: null, distanceM: 200, autoSend: false },
      { listingId: "c", shopId: "s3", distanceM: 300, autoSend: true },
      { listingId: "d", shopId: "s4", distanceM: 400, autoSend: false },
    ]);
    expect(r).toEqual({ autoSendListingIds: ["a", "c"], approvalListingIds: ["b", "d"] });
  });

  it("handles no florists", () => {
    expect(planOffers([])).toEqual({ autoSendListingIds: [], approvalListingIds: [] });
  });
});

describe("budgetLabel", () => {
  it("formats the bands", () => {
    expect(budgetLabel(0, 300000)).toBe("Under Rs 3,000");
    expect(budgetLabel(300000, 500000)).toBe("Rs 3,000–5,000");
    expect(budgetLabel(1000000, 2000000)).toBe("Rs 10,000–20,000");
    expect(budgetLabel(2000000, null)).toBe("Rs 20,000+");
  });
});

describe("buildRequestSummary", () => {
  const req = {
    ref: "LR-ABC234",
    deliveryArea: "Colombo 07",
    neededOn: "2026-10-20",
    neededWindow: "morning",
    occasion: "get_well",
    budgetMinCents: 300000,
    budgetMaxCents: 500000,
    design: {
      flowers: [{ flowerId: "f1", nameEn: "Red roses", qty: 12 }],
      fillers: [{ flowerId: "f2", nameEn: "Baby's breath", qty: 3 }],
      wrapping: "kraft",
      addons: ["card", "teddy"],
      cardMessage: "secret message",
      notes: null,
    },
  };

  it("pre-formats every field", () => {
    expect(buildRequestSummary(req, 2345)).toEqual({
      ref: "LR-ABC234",
      area: "Colombo 07",
      distanceKm: 2.3,
      neededOn: "Tue 20 Oct 2026",
      window: "Morning",
      occasion: "Get well",
      budgetLabel: "Rs 3,000–5,000",
      flowerLines: ["Red roses × 12", "Baby's breath × 3"],
      addons: ["Card", "Teddy bear"],
    });
  });

  it("omits distance when not given and handles null occasion", () => {
    const s = buildRequestSummary({ ...req, occasion: null, budgetMinCents: 0, budgetMaxCents: 300000 });
    expect(s.distanceKm).toBeUndefined();
    expect(s.occasion).toBeNull();
    expect(s.budgetLabel).toBe("Under Rs 3,000");
  });

  it("never includes customer details or the card message", () => {
    expect(JSON.stringify(buildRequestSummary(req, 100))).not.toContain("secret message");
  });
});
