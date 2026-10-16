import { describe, expect, it } from "vitest";
import { nextFulfilmentStatus, storeReviewChecklist } from "./supplier-workflow";

describe("available supplier fulfilment action", () => {
  it.each(["cancelled", "completed", "quoted", "unknown"])(
    "hides actions for %s orders", (status) => {
      expect(nextFulfilmentStatus(status, "preparing")).toBeUndefined();
    },
  );
  it.each(["unknown", "constructor", "toString", "__proto__", "completed"])(
    "does not treat %s as an actionable stage", (stage) => {
      expect(nextFulfilmentStatus("confirmed", stage)).toBeUndefined();
    },
  );
  it("offers the next authorized step", () => {
    expect(nextFulfilmentStatus("paid", "ready")).toBe("handed_over");
  });
});

describe("store review readiness", () => {
  const shop = {
    descriptionEn: "Local florist",
    serviceSettings: { areas: "Colombo", delivery: true, collection: false },
  };
  it("requires a description, service coverage and a product", () => {
    expect(storeReviewChecklist(shop, true).ready).toBe(true);
    expect(storeReviewChecklist(shop, false).ready).toBe(false);
    expect(storeReviewChecklist({ ...shop, descriptionEn: " " }, true).ready).toBe(false);
    expect(storeReviewChecklist({ ...shop, serviceSettings: null }, true).ready).toBe(false);
  });
  it("rejects whitespace coverage and services with no fulfilment option", () => {
    expect(storeReviewChecklist({ ...shop, serviceSettings: { ...shop.serviceSettings, areas: " " } }, true).services).toBe(false);
    expect(storeReviewChecklist({ ...shop, serviceSettings: { ...shop.serviceSettings, delivery: false } }, true).services).toBe(false);
  });
  it("allows collection without delivery", () => {
    expect(storeReviewChecklist({ ...shop, serviceSettings: { ...shop.serviceSettings, delivery: false, collection: true } }, true).ready).toBe(true);
  });
});
