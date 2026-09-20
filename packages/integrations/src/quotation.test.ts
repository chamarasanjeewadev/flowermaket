import { describe, expect, it } from "vitest";
import {
  buildQuotationText,
  formatQuotationRupees,
  quotationLineTotal,
  quotationTotal,
  type QuotationLine,
} from "./quotation";

const roses: QuotationLine = {
  id: "line-1",
  name: "Red roses",
  quantity: 120,
  unitPrice: 7500,
  unit: "stem",
  productSlug: "red-rose-stems",
};

const orchids: QuotationLine = {
  id: "line-2",
  name: "White orchids",
  quantity: 20,
  unitPrice: 15000,
  unit: "stem",
};

describe("quotation calculations", () => {
  it("calculates line and quotation totals in cents", () => {
    expect(quotationLineTotal(roses)).toBe(900000);
    expect(quotationTotal([roses, orchids])).toBe(1200000);
    expect(formatQuotationRupees(1200000)).toBe("Rs 12,000");
  });

  it("does not allow invalid values to create negative totals", () => {
    expect(
      quotationLineTotal({ ...roses, quantity: -4, unitPrice: Infinity }),
    ).toBe(0);
  });
});

describe("buildQuotationText", () => {
  it("includes item calculations, listing links, event details, and total", () => {
    const text = buildQuotationText({
      lines: [roses, orchids],
      locale: "en",
      siteUrl: "https://flowermarket.lk/",
      details: {
        plannerName: "Nimali Events",
        clientName: "Asha and Ravi",
        eventDate: "2026-12-12",
        venue: "Colombo 7",
      },
    });

    expect(text).toContain("120 stems x Rs 75 = Rs 9,000");
    expect(text).toContain("/en/products/red-rose-stems");
    expect(text).toContain("Estimated total: Rs 12,000");
    expect(text).toContain("Planner/contact: Nimali Events");
    expect(text).toContain("Client/couple: Asha and Ravi");
    expect(text).toContain("Event date: 2026-12-12");
    expect(text).toContain("Venue/delivery area: Colombo 7");
    expect(text).toContain("Please confirm availability");
  });

  it("drops empty lines from the message", () => {
    const text = buildQuotationText({
      lines: [{ ...roses, name: "  " }],
      locale: "si",
      siteUrl: "https://flowermarket.lk",
    });
    expect(text).toContain("help preparing a flower quotation");
    expect(text).not.toContain("Estimated total:");
  });
});
