import { describe, expect, it } from "vitest";
import {
  buildInviteMessage,
  buildJoinUrl,
  generateInviteToken,
  validateInviteInput,
} from "./invites";

describe("buildJoinUrl", () => {
  it("builds a join URL from a configured portal origin", () => {
    expect(buildJoinUrl("https://supplier.flowermarket.lk", "tok123")).toBe(
      "https://supplier.flowermarket.lk/join/tok123",
    );
  });

  it("strips a trailing slash from the origin", () => {
    expect(buildJoinUrl("https://supplier.flowermarket.lk/", "tok123")).toBe(
      "https://supplier.flowermarket.lk/join/tok123",
    );
  });

  it("returns null when the portal URL is undefined", () => {
    expect(buildJoinUrl(undefined, "tok123")).toBeNull();
  });

  it("returns null when the portal URL is empty", () => {
    expect(buildJoinUrl("", "tok123")).toBeNull();
  });
});

describe("generateInviteToken", () => {
  it("returns a non-empty url-safe token", () => {
    const token = generateInviteToken();
    expect(token.length).toBeGreaterThanOrEqual(16);
    expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it("returns a different token each call", () => {
    expect(generateInviteToken()).not.toBe(generateInviteToken());
  });
});

describe("validateInviteInput", () => {
  const valid = { phone: "94771234567", shopType: "grower" as const, language: "en" as const };

  it("passes for valid input", () => {
    expect(validateInviteInput(valid)).toEqual([]);
  });

  it("rejects a missing phone", () => {
    const errors = validateInviteInput({ ...valid, phone: "" });
    expect(errors.some((e) => e.field === "phone")).toBe(true);
  });

  it("rejects a phone with too few digits", () => {
    const errors = validateInviteInput({ ...valid, phone: "123" });
    expect(errors.some((e) => e.field === "phone")).toBe(true);
  });

  it("rejects an invalid shopType", () => {
    const errors = validateInviteInput({ ...valid, shopType: "wizard" as never });
    expect(errors.some((e) => e.field === "shopType")).toBe(true);
  });

  it("rejects an invalid language", () => {
    const errors = validateInviteInput({ ...valid, language: "fr" as never });
    expect(errors.some((e) => e.field === "language")).toBe(true);
  });
});

describe("buildInviteMessage", () => {
  const joinUrl = "https://supplier.flowermarket.lk/join/abc123";

  it("includes the join link", () => {
    const msg = buildInviteMessage({
      shopType: "grower",
      language: "en",
      joinUrl,
    });
    expect(msg).toContain(joinUrl);
  });

  it("greets by name when provided", () => {
    const msg = buildInviteMessage({
      nameEn: "Sunil",
      shopType: "grower",
      language: "en",
      joinUrl,
    });
    expect(msg).toContain("Sunil");
  });

  it("uses grower benefits for a farmer (English)", () => {
    const msg = buildInviteMessage({ shopType: "grower", language: "en", joinUrl });
    expect(msg.toLowerCase()).toContain("buyers");
  });

  it("uses florist benefits for a florist (English)", () => {
    const msg = buildInviteMessage({ shopType: "florist", language: "en", joinUrl });
    expect(msg.toLowerCase()).toContain("storefront");
  });

  it("uses aggregator wording when isAggregator (English)", () => {
    const msg = buildInviteMessage({
      shopType: "grower",
      isAggregator: true,
      language: "en",
      joinUrl,
    });
    expect(msg.toLowerCase()).toContain("bulk");
  });

  it("renders Sinhala when language is si", () => {
    const msg = buildInviteMessage({ shopType: "grower", language: "si", joinUrl });
    // Contains at least one Sinhala-script character.
    expect(msg).toMatch(/[඀-෿]/);
    expect(msg).toContain(joinUrl);
  });
});
