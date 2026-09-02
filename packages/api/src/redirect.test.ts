import { describe, expect, it } from "vitest";
import { safeRedirectPath } from "./redirect";

describe("safeRedirectPath", () => {
  it('rejects "/\\evil.com" (backslash — browsers normalise to //)', () => {
    expect(safeRedirectPath("/\\evil.com")).toBe("/");
  });

  it('rejects "//evil.com" (double-slash open redirect)', () => {
    expect(safeRedirectPath("//evil.com")).toBe("/");
  });

  it('accepts "/ok/path"', () => {
    expect(safeRedirectPath("/ok/path")).toBe("/ok/path");
  });

  it('accepts "/"', () => {
    expect(safeRedirectPath("/")).toBe("/");
  });

  it("accepts nested paths", () => {
    expect(safeRedirectPath("/en/login?redirect=%2Fprofile")).toBe(
      "/en/login?redirect=%2Fprofile",
    );
  });

  it("falls back for undefined", () => {
    expect(safeRedirectPath(undefined)).toBe("/");
  });

  it("falls back for absolute URL", () => {
    expect(safeRedirectPath("http://evil.com")).toBe("/");
  });

  it("falls back for empty string", () => {
    expect(safeRedirectPath("")).toBe("/");
  });
});
