import { describe, it, expect } from "vitest";
import { WHATSAPP_NUMBER } from "./config";

describe("marketplace config", () => {
  it("exposes the WhatsApp number as digits only", () => {
    expect(WHATSAPP_NUMBER).toBe("94760903845");
    expect(WHATSAPP_NUMBER).toMatch(/^\d+$/);
  });
});
