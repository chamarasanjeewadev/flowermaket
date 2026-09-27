import { describe, expect, it } from "vitest";
import { assertEditable } from "./documents";

describe("assertEditable — pure immutability guard", () => {
  it("blocks edits after issue", () => {
    expect(assertEditable({ issuedAt: new Date() }).ok).toBe(false);
  });

  it("allows edits on draft (issuedAt null)", () => {
    expect(assertEditable({ issuedAt: null }).ok).toBe(true);
  });
});
