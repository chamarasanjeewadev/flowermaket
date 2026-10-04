import { describe, expect, it } from "vitest";
import { buildPreview } from "./whatsapp";

describe("buildPreview", () => {
  it("uses the text for a text message", () => {
    expect(buildPreview("text", "Hello there")).toBe("Hello there");
  });
  it("truncates long text to 120 chars with an ellipsis", () => {
    const long = "a".repeat(200);
    const p = buildPreview("text", long);
    expect(p.length).toBe(121);
    expect(p.endsWith("…")).toBe(true);
  });
  it("labels an image with no caption", () => {
    expect(buildPreview("image", null)).toBe("📷 Photo");
  });
  it("labels an image with its caption", () => {
    expect(buildPreview("image", "fresh roses")).toBe("📷 fresh roses");
  });
  it("labels audio and documents and other", () => {
    expect(buildPreview("audio", null)).toBe("🎤 Voice message");
    expect(buildPreview("document", "invoice.pdf")).toBe("📄 invoice.pdf");
    expect(buildPreview("other", null)).toBe("Message");
  });
});
