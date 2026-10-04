import { describe, expect, it } from "vitest";
import { toWhatsappJid, buildWhatsappLink } from "./evolution";

describe("buildWhatsappLink", () => {
  it("builds a wa.me link from a 94 number", () => {
    expect(buildWhatsappLink("94771234567")).toBe("https://wa.me/94771234567");
  });

  it("normalizes a local 0-prefixed number", () => {
    expect(buildWhatsappLink("0771234567")).toBe("https://wa.me/94771234567");
  });

  it("appends a url-encoded prefilled message", () => {
    expect(buildWhatsappLink("94771234567", "Hi there")).toBe(
      "https://wa.me/94771234567?text=Hi%20there",
    );
  });

  it("returns null for a missing/empty number", () => {
    expect(buildWhatsappLink("")).toBeNull();
    expect(buildWhatsappLink(null)).toBeNull();
    expect(buildWhatsappLink("   ")).toBeNull();
  });
});

describe("toWhatsappJid", () => {
  it("keeps a 94-prefixed number", () => {
    expect(toWhatsappJid("94771234567")).toBe("94771234567@s.whatsapp.net");
  });

  it("converts local 0-prefixed", () => {
    expect(toWhatsappJid("0771234567")).toBe("94771234567@s.whatsapp.net");
  });

  it("strips spaces and +", () => {
    expect(toWhatsappJid("+94 77 123 4567")).toBe("94771234567@s.whatsapp.net");
  });
});
