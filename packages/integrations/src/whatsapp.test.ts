import { describe, it, expect } from "vitest";
import {
  buildEnquiryText,
  buildWhatsappUrl,
  WHATSAPP_NUMBER,
  type EnquiryItem,
} from "./whatsapp";

const roses: EnquiryItem = {
  id: "p1",
  slug: "red-roses",
  nameEn: "Red Roses",
  nameSi: "රතු රෝස",
  price: 125000, // Rs 1,250
  listingType: "wholesale",
  qty: 50,
};

const bouquet: EnquiryItem = {
  id: "p2",
  slug: "spring-bouquet",
  nameEn: "Spring Bouquet",
  nameSi: null,
  price: 450000, // Rs 4,500
  listingType: "retail",
  qty: 1,
};

const SITE = "https://flowermarket.lk";

describe("buildEnquiryText", () => {
  it("degrades to a greeting when the list is empty", () => {
    const text = buildEnquiryText({ items: [], locale: "en", siteUrl: SITE });
    expect(text).toContain("Hello FlowerMarket.lk");
    expect(text).toContain("ask about your flowers");
    expect(text).not.toContain("1.");
  });

  it("lists each item with type, quantity, price and product URL", () => {
    const text = buildEnquiryText({
      items: [roses, bouquet],
      locale: "en",
      siteUrl: SITE,
    });
    expect(text).toContain("1. Red Roses (Wholesale) × 50 — Rs 1,250");
    expect(text).toContain("https://flowermarket.lk/en/products/red-roses");
    expect(text).toContain("2. Spring Bouquet (Retail) × 1 — Rs 4,500");
    expect(text).toContain("https://flowermarket.lk/en/products/spring-bouquet");
  });

  it("uses the Sinhala name and locale path when locale is si", () => {
    const text = buildEnquiryText({
      items: [roses],
      locale: "si",
      siteUrl: SITE,
    });
    expect(text).toContain("රතු රෝස");
    expect(text).toContain("/si/products/red-roses");
  });

  it("falls back to the English name when Sinhala is missing", () => {
    const text = buildEnquiryText({
      items: [bouquet],
      locale: "si",
      siteUrl: SITE,
    });
    expect(text).toContain("Spring Bouquet");
  });

  it("appends requirement fields only when provided", () => {
    const text = buildEnquiryText({
      items: [roses],
      locale: "en",
      siteUrl: SITE,
      form: {
        name: "Nimali",
        dateNeeded: "2026-10-01",
        deliveryArea: "Colombo 5",
        notes: "  ",
      },
    });
    expect(text).toContain("My requirements:");
    expect(text).toContain("Name: Nimali");
    expect(text).toContain("Date needed: 2026-10-01");
    expect(text).toContain("Delivery area: Colombo 5");
    // whitespace-only notes are dropped
    expect(text).not.toContain("Notes:");
  });

  it("omits the requirements block entirely when no fields are set", () => {
    const text = buildEnquiryText({ items: [roses], locale: "en", siteUrl: SITE });
    expect(text).not.toContain("My requirements:");
  });

  it("tolerates a trailing slash on siteUrl", () => {
    const text = buildEnquiryText({
      items: [roses],
      locale: "en",
      siteUrl: "https://flowermarket.lk/",
    });
    expect(text).toContain("https://flowermarket.lk/en/products/red-roses");
    expect(text).not.toContain("lk//en");
  });
});

describe("buildWhatsappUrl", () => {
  it("builds a wa.me link with URL-encoded text and the default number", () => {
    const url = buildWhatsappUrl("Hello world 🌸");
    expect(url).toBe(
      `https://wa.me/${WHATSAPP_NUMBER}?text=Hello%20world%20%F0%9F%8C%B8`,
    );
  });

  it("normalises a formatted number to digits only", () => {
    const url = buildWhatsappUrl("hi", "+94 77 854 0633");
    expect(url).toBe("https://wa.me/94778540633?text=hi");
  });
});
