import { describe, expect, it } from "vitest";
import {
  assertEditable,
  docNoPrefix,
  nextDocNo,
  generatePublicToken,
} from "./documents";

describe("assertEditable — pure immutability guard", () => {
  it("blocks edits after issue", () => {
    expect(assertEditable({ issuedAt: new Date() }).ok).toBe(false);
  });

  it("allows edits on draft (issuedAt null)", () => {
    expect(assertEditable({ issuedAt: null }).ok).toBe(true);
  });
});

describe("docNoPrefix — document type to prefix mapping", () => {
  it("prefixes by type", () => {
    expect(docNoPrefix("quotation")).toBe("FM-Q");
    expect(docNoPrefix("invoice")).toBe("FM-INV");
    expect(docNoPrefix("receipt")).toBe("FM-RCP");
  });
});

describe("nextDocNo — document number formatting", () => {
  it("formats doc no with type, year, and zero-padded sequence", () => {
    expect(nextDocNo("invoice", 2026, 7)).toBe("FM-INV-2026-0007");
  });
});

describe("generatePublicToken — URL-safe random token", () => {
  it("token is url-safe and at least 32 chars", () => {
    const t = generatePublicToken();
    expect(t).toMatch(/^[A-Za-z0-9_-]{32,}$/);
  });

  it("generates unique tokens", () => {
    const tokens = new Set(Array.from({ length: 10 }, () => generatePublicToken()));
    expect(tokens.size).toBe(10);
  });
});
