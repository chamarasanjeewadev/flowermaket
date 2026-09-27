import { describe, it, expect } from "vitest";
import { renderDocumentPdf } from "./pdf";

describe("renderDocumentPdf", () => {

it("produces a PDF byte stream", async () => {
  const bytes = await renderDocumentPdf({
    type: "invoice",
    docNo: "FM-INV-2026-0001",
    issuedAt: "2026-09-27",
    customer: {
      name: "Nimal",
      phone: "0771234567",
      address: null,
      email: null,
      district: null,
      city: null,
    },
    lines: [
      {
        descriptionEn: "White Roses",
        descriptionSi: null,
        variant: "white",
        qty: 100,
        unit: "stem",
        unitPrice: 125,
        lineTotal: 12500,
      },
    ],
    subtotal: 12500,
    discount: 0,
    deliveryFee: 0,
    taxAmount: 0,
    total: 12500,
    currency: "LKR",
  });
  expect(bytes.length).toBeGreaterThan(100);
  expect(new TextDecoder().decode(bytes.slice(0, 5))).toBe("%PDF-");
});

});
