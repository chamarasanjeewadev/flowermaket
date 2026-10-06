import { describe, expect, it } from "vitest";
import {
  INVITE_LINK_PLACEHOLDER,
  applyInviteLink,
  formatLkPhone,
  normalizeLkPhone,
} from "./invite-message";

const url = "https://supplier.flowermarket.lk/join/abc";

describe("applyInviteLink", () => {
  it("replaces the placeholder with the join URL", () => {
    expect(applyInviteLink(`Join: ${INVITE_LINK_PLACEHOLDER}`, url)).toBe(`Join: ${url}`);
  });

  it("appends the link when the admin removed the placeholder", () => {
    expect(applyInviteLink("Hello there", url)).toBe(`Hello there\n\n${url}`);
  });

  it("does not duplicate a link that is already present", () => {
    expect(applyInviteLink(`Go ${url}`, url)).toBe(`Go ${url}`);
  });
});

describe("normalizeLkPhone", () => {
  it.each([
    ["0717303216", "94717303216"],
    ["+94 71 730 3216", "94717303216"],
    ["717303216", "94717303216"],
  ])("normalizes %s", (input, out) => {
    expect(normalizeLkPhone(input)).toBe(out);
  });

  it("rejects too-short numbers", () => {
    expect(normalizeLkPhone("07173")).toBeNull();
  });

  it("formats for display", () => {
    expect(formatLkPhone("94717303216")).toBe("+94 71 730 3216");
  });
});
