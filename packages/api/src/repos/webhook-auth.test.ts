import { describe, expect, it } from "vitest";
import { timingSafeEqualStr } from "./webhook-auth";

describe("timingSafeEqualStr", () => {
  it("returns true for equal strings", () => {
    expect(timingSafeEqualStr("s3cret", "s3cret")).toBe(true);
  });
  it("returns false for different strings", () => {
    expect(timingSafeEqualStr("s3cret", "wrong")).toBe(false);
  });
  it("returns false for different lengths without throwing", () => {
    expect(timingSafeEqualStr("short", "longer-value")).toBe(false);
  });
  it("returns false for empty expected", () => {
    expect(timingSafeEqualStr("", "x")).toBe(false);
    expect(timingSafeEqualStr("x", "")).toBe(false);
  });
});
