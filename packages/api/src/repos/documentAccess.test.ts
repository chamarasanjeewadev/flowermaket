/**
 * documentAccess.test.ts
 *
 * Unit tests for pure/crypto helpers in documentAccess.ts:
 *   - generateOtpCode
 *   - hashOtp (determinism)
 *   - signDocCookie / verifyDocCookie
 *   - otpVerdict (pure decision helper)
 *
 * Per Ruling P5: no live-DB tests for requestOtp/verifyOtp.
 */
import { describe, expect, it } from "vitest";
import {
  generateOtpCode,
  hashOtp,
  signDocCookie,
  verifyDocCookie,
  otpVerdict,
} from "./documentAccess";

// ---------------------------------------------------------------------------
// generateOtpCode
// ---------------------------------------------------------------------------

describe("generateOtpCode", () => {
  it("otp is 6 digits", () => {
    expect(generateOtpCode()).toMatch(/^\d{6}$/);
  });

  it("generates within range 000000–999999", () => {
    const code = generateOtpCode();
    const n = parseInt(code, 10);
    expect(n).toBeGreaterThanOrEqual(0);
    expect(n).toBeLessThanOrEqual(999_999);
  });

  it("generates distinct codes over multiple calls (with very high probability)", () => {
    const codes = new Set(Array.from({ length: 20 }, () => generateOtpCode()));
    // In a fair 6-digit space the probability of 20 collisions in 20 draws is negligible
    expect(codes.size).toBeGreaterThan(1);
  });
});

// ---------------------------------------------------------------------------
// hashOtp
// ---------------------------------------------------------------------------

describe("hashOtp", () => {
  it("returns a non-empty string", async () => {
    const h = await hashOtp("123456", "secret");
    expect(typeof h).toBe("string");
    expect(h.length).toBeGreaterThan(0);
  });

  it("is deterministic: same code+secret → same hash", async () => {
    const a = await hashOtp("123456", "secret");
    const b = await hashOtp("123456", "secret");
    expect(a).toBe(b);
  });

  it("differs when code differs", async () => {
    const a = await hashOtp("123456", "secret");
    const b = await hashOtp("654321", "secret");
    expect(a).not.toBe(b);
  });

  it("differs when secret differs", async () => {
    const a = await hashOtp("123456", "secret1");
    const b = await hashOtp("123456", "secret2");
    expect(a).not.toBe(b);
  });
});

// ---------------------------------------------------------------------------
// signDocCookie / verifyDocCookie
// ---------------------------------------------------------------------------

describe("signDocCookie / verifyDocCookie", () => {
  it("valid cookie verifies", async () => {
    const c = await signDocCookie("tok", "secret");
    expect(await verifyDocCookie(c, "tok", "secret")).toBe(true);
  });

  it("cookie for another token fails", async () => {
    const c = await signDocCookie("tok", "secret");
    expect(await verifyDocCookie(c, "other", "secret")).toBe(false);
  });

  it("tampered cookie fails", async () => {
    const c = await signDocCookie("tok", "secret");
    expect(await verifyDocCookie(c + "x", "tok", "secret")).toBe(false);
  });

  it("cookie signed with different secret fails", async () => {
    const c = await signDocCookie("tok", "secret1");
    expect(await verifyDocCookie(c, "tok", "secret2")).toBe(false);
  });

  it("expired cookie fails", async () => {
    // Sign with a 1ms TTL and wait 2ms
    const c = await signDocCookie("tok", "secret", 1);
    await new Promise((r) => setTimeout(r, 5));
    expect(await verifyDocCookie(c, "tok", "secret")).toBe(false);
  });

  it("returns a non-empty string", async () => {
    const c = await signDocCookie("tok", "secret");
    expect(typeof c).toBe("string");
    expect(c.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// otpVerdict — pure decision helper
// ---------------------------------------------------------------------------

const FUTURE = new Date(Date.now() + 10 * 60 * 1000); // 10 min from now
const PAST   = new Date(Date.now() - 1);               // 1 ms ago

describe("otpVerdict", () => {
  it("accepts correct match within limits (happy path)", () => {
    const result = otpVerdict(
      { attempts: 0, maxAttempts: 5, expiresAt: FUTURE, consumedAt: null, matches: true },
      new Date(),
    );
    expect(result.ok).toBe(true);
  });

  it("rejects when attempts >= maxAttempts (brute-force cap)", () => {
    const result = otpVerdict(
      { attempts: 5, maxAttempts: 5, expiresAt: FUTURE, consumedAt: null, matches: true },
      new Date(),
    );
    expect(result.ok).toBe(false);
  });

  it("rejects when attempts > maxAttempts", () => {
    const result = otpVerdict(
      { attempts: 6, maxAttempts: 5, expiresAt: FUTURE, consumedAt: null, matches: true },
      new Date(),
    );
    expect(result.ok).toBe(false);
  });

  it("rejects when expired", () => {
    const result = otpVerdict(
      { attempts: 0, maxAttempts: 5, expiresAt: PAST, consumedAt: null, matches: true },
      new Date(),
    );
    expect(result.ok).toBe(false);
  });

  it("rejects when already consumed (replay prevention)", () => {
    const result = otpVerdict(
      { attempts: 0, maxAttempts: 5, expiresAt: FUTURE, consumedAt: new Date(), matches: true },
      new Date(),
    );
    expect(result.ok).toBe(false);
  });

  it("rejects when code does not match", () => {
    const result = otpVerdict(
      { attempts: 0, maxAttempts: 5, expiresAt: FUTURE, consumedAt: null, matches: false },
      new Date(),
    );
    expect(result.ok).toBe(false);
  });

  it("rejects when both expired and wrong code — expired takes precedence", () => {
    const result = otpVerdict(
      { attempts: 0, maxAttempts: 5, expiresAt: PAST, consumedAt: null, matches: false },
      new Date(),
    );
    expect(result.ok).toBe(false);
  });

  it("rejects even on attempts=4 (one short of cap) when already consumed", () => {
    const result = otpVerdict(
      { attempts: 4, maxAttempts: 5, expiresAt: FUTURE, consumedAt: new Date(), matches: true },
      new Date(),
    );
    expect(result.ok).toBe(false);
  });
});
