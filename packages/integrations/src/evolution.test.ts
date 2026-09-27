import { describe, expect, it } from "vitest";
import { toWhatsappJid } from "./evolution";

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
