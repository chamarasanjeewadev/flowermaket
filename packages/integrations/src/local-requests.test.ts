import { describe, expect, it } from "vitest";
import {
  STOP_KEYWORDS,
  buildCustomerAcceptedText,
  buildQuoteDigestText,
  buildRequestOpenedText,
  buildRequestOtpText,
  buildShopAcceptedText,
  buildShopNotSelectedText,
  buildShopRequestText,
  buildUnclaimedIntroText,
  isStopMessage,
  type RequestSummary,
} from "./local-requests";

const summary: RequestSummary = {
  ref: "LR-1042",
  area: "Nugegoda",
  distanceKm: 2.5,
  neededOn: "2026-10-20",
  window: "Morning",
  occasion: "Birthday",
  budgetLabel: "Rs 5,000 - 8,000",
  flowerLines: ["Red roses x12", "White lilies x6"],
  addons: ["Greeting card"],
};
const URL = "https://flowermarket.lk/l/abc123";
const langs = ["en", "si"] as const;

describe("builders include ref and url", () => {
  for (const lang of langs) {
    it(`${lang}`, () => {
      expect(buildRequestOpenedText({ ref: "LR-1", floristCount: 3, area: "Nugegoda", pageUrl: URL }, lang)).toContain("LR-1");
      expect(buildRequestOpenedText({ ref: "LR-1", floristCount: 3, area: "Nugegoda", pageUrl: URL }, lang)).toContain(URL);
      expect(buildRequestOpenedText({ ref: "LR-1", floristCount: 0, area: "Nugegoda", pageUrl: URL }, lang)).toContain("Nugegoda");
      const shop = buildShopRequestText({ shopName: "Rose Hut", summary, leadUrl: URL }, lang);
      expect(shop).toContain("LR-1042");
      expect(shop).toContain(URL);
      const intro = buildUnclaimedIntroText({ listingName: "Rose Hut", summary, leadUrl: URL }, lang);
      expect(intro).toContain("LR-1042");
      expect(intro).toContain(URL);
      for (const t of [
        buildQuoteDigestText({ ref: "LR-1", quoteCount: 2, pageUrl: URL, first: true }, lang),
        buildQuoteDigestText({ ref: "LR-1", quoteCount: 2, pageUrl: URL, first: false }, lang),
      ]) {
        expect(t).toContain("LR-1");
        expect(t).toContain(URL);
      }
      expect(
        buildShopAcceptedText(
          { ref: "LR-1", customerName: "Nimal", customerPhone: "94771112222", address: "12 Galle Rd", neededOn: "2026-10-20", window: "Morning", totalRupees: "6,500", leadUrl: URL },
          lang,
        ),
      ).toContain(URL);
      expect(buildShopNotSelectedText({ ref: "LR-1" }, lang)).toContain("LR-1");
      expect(buildRequestOtpText("123456", lang)).toContain("123456");
    });
  }
});

describe("privacy", () => {
  it("shop-facing texts carry only summary fields", () => {
    const s: RequestSummary = { ...summary, area: "Nugegoda 0771234567" };
    for (const lang of langs) {
      const a = buildShopRequestText({ shopName: "Rose Hut", summary: s, leadUrl: URL }, lang);
      const b = buildUnclaimedIntroText({ listingName: "Rose Hut", summary: s, leadUrl: URL }, lang);
      for (const t of [a, b]) {
        expect(t).not.toMatch(/Nimal|94771112222|12 Galle/);
        expect(t).toContain("Red roses x12");
        expect(t).toContain("Greeting card");
      }
    }
  });
  it("omits distance/occasion when absent", () => {
    const t = buildShopRequestText({ shopName: "S", summary: { ...summary, distanceKm: undefined, occasion: null }, leadUrl: URL }, "en");
    expect(t).not.toContain("undefined");
    expect(t).not.toContain("null");
  });
});

describe("copy", () => {
  it("unclaimed intro ends with STOP line in en", () => {
    expect(buildUnclaimedIntroText({ listingName: "Rose Hut", summary, leadUrl: URL }, "en").trimEnd().endsWith("Reply STOP and we won't message you again.")).toBe(true);
  });
  it("si unclaimed intro mentions STOP keyword", () => {
    expect(buildUnclaimedIntroText({ listingName: "Rose Hut", summary, leadUrl: URL }, "si")).toContain("STOP");
  });
  it("customer accepted says pay directly", () => {
    const t = buildCustomerAcceptedText({ ref: "LR-1", shopName: "Rose Hut", shopPhone: "94770000000", totalRupees: "6,500" }, "en");
    expect(t).toContain("You'll pay Rose Hut directly");
    expect(t).toContain("94770000000");
    expect(t).toContain("6,500");
  });
  it("shop accepted has customer details", () => {
    const t = buildShopAcceptedText({ ref: "LR-1", customerName: "Nimal", customerPhone: "94771112222", address: "12 Galle Rd", neededOn: "2026-10-20", window: "Morning", totalRupees: "6,500", leadUrl: URL }, "en");
    for (const x of ["Nimal", "94771112222", "12 Galle Rd", "6,500"]) expect(t).toContain(x);
  });
  it("opened with zero florists says finding", () => {
    expect(buildRequestOpenedText({ ref: "LR-1", floristCount: 0, area: "Kandy", pageUrl: URL }, "en")).toContain("We're finding florists near Kandy");
  });
  it("si differs from en and is non-empty", () => {
    const pairs = (l: "en" | "si") => [
      buildRequestOtpText("123456", l),
      buildRequestOpenedText({ ref: "LR-1", floristCount: 2, area: "Kandy", pageUrl: URL }, l),
      buildRequestOpenedText({ ref: "LR-1", floristCount: 0, area: "Kandy", pageUrl: URL }, l),
      buildShopRequestText({ shopName: "S", summary, leadUrl: URL }, l),
      buildUnclaimedIntroText({ listingName: "S", summary, leadUrl: URL }, l),
      buildQuoteDigestText({ ref: "LR-1", quoteCount: 2, pageUrl: URL, first: true }, l),
      buildQuoteDigestText({ ref: "LR-1", quoteCount: 2, pageUrl: URL, first: false }, l),
      buildCustomerAcceptedText({ ref: "LR-1", shopName: "S", shopPhone: "1", totalRupees: "1" }, l),
      buildShopAcceptedText({ ref: "LR-1", customerName: "N", customerPhone: "1", address: "A", neededOn: "d", window: "w", totalRupees: "1", leadUrl: URL }, l),
      buildShopNotSelectedText({ ref: "LR-1" }, l),
    ];
    const en = pairs("en");
    const si = pairs("si");
    si.forEach((t, i) => {
      expect(t.length).toBeGreaterThan(0);
      expect(t).not.toBe(en[i]);
    });
  });
});

describe("isStopMessage", () => {
  it("matches whole trimmed message case-insensitively", () => {
    expect(isStopMessage(" Stop ")).toBe(true);
    expect(isStopMessage("UNSUBSCRIBE")).toBe(true);
    expect(isStopMessage("නවත්වන්න")).toBe(true);
    expect(isStopMessage("please stop by")).toBe(false);
    expect(isStopMessage("")).toBe(false);
  });
  it("keywords", () => {
    expect([...STOP_KEYWORDS]).toEqual(["stop", "unsubscribe", "නවත්වන්න"]);
  });
});
