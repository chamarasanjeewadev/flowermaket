import { describe, it, expect } from "vitest";
import { WHATSAPP_NUMBER } from "./config";

describe("marketplace config", () => {
  it("exposes the WhatsApp number as digits only", () => {
    expect(WHATSAPP_NUMBER).toBe("94778540633");
    expect(WHATSAPP_NUMBER).toMatch(/^\d+$/);
  });
});
