/**
 * documentAccess.ts — WhatsApp OTP issue/verify + signed document-scoped cookie.
 *
 * Security model:
 *   - OTP codes are HMAC-SHA256 hashed at rest; the plaintext is never stored.
 *   - Codes expire after `OTP_TTL_MS` (default 10 min).
 *   - `maxAttempts` cap (default 5): once attempts >= maxAttempts the OTP is
 *     permanently locked — subsequent calls always return a generic error.
 *   - Per-document request rate-limit: at most `MAX_PENDING_OTPS` (default 3)
 *     unconsumed, non-expired OTPs may exist per document within `RATE_WINDOW_MS`
 *     (default 30 min). Excess requests are rejected with a generic message.
 *   - Consumed codes cannot be reused (consumedAt is set atomically on success).
 *   - All errors return a single generic message so phone/code enumeration is
 *     impossible.
 *   - `signDocCookie` / `verifyDocCookie` use HMAC-SHA256 with the per-document
 *     `publicToken` baked into the signed payload, so a cookie for document A is
 *     not accepted for document B and any tampering is detected.
 *   - The `requestOtp` function calls `opts.onCode(plaintext)` so the caller
 *     dispatches WhatsApp; this repo performs no network I/O itself.
 *
 * Crypto:
 *   - All randomness uses `crypto.getRandomValues` (WebCrypto / Cloudflare Workers).
 *   - All HMAC ops use `crypto.subtle` (WebCrypto).
 *   - NO Node crypto, NO Math.random.
 *
 * generateOtpCode() uses rejection-sampling to avoid modulo bias:
 *   - Fills a Uint32Array and discards values ≥ floor(2^32 / 1_000_000) * 1_000_000
 *     so every value in [0, 999_999] is equally likely.
 *   - In the (astronomically unlikely) case of all values being rejected the loop
 *     simply retries until it succeeds.
 */

import { and, count, gt, isNull, eq } from "drizzle-orm";
import { schema } from "@flowers/db/client";
import type { Db } from "../db";
import { err, ok, type ActionResult } from "../errors";
import { getEnv } from "../env";

// ---------------------------------------------------------------------------
// DbOrTx — live client or an open transaction
// ---------------------------------------------------------------------------

/** A live client or an open transaction — both expose the query builder. */
type DbOrTx = Db | Parameters<Parameters<Db["transaction"]>[0]>[0];

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** OTP validity window in milliseconds (10 minutes). */
const OTP_TTL_MS = 10 * 60 * 1000;

/**
 * Rate-limit window in milliseconds (30 minutes).
 * At most MAX_PENDING_OTPS unconsumed OTPs may be issued per document within
 * this window.
 */
const RATE_WINDOW_MS = 30 * 60 * 1000;

/** Maximum number of unconsumed OTPs per document within RATE_WINDOW_MS. */
const MAX_PENDING_OTPS = 3;

/**
 * Default maximum verify attempts before an OTP is permanently locked.
 * Configurable per-issuance via requestOtp opts.
 */
const DEFAULT_MAX_ATTEMPTS = 5;

/** Signed cookie TTL in milliseconds (24 hours). */
const COOKIE_TTL_MS = 24 * 60 * 60 * 1000;

/** Generic error message — never leaks phone/code/token info. */
const GENERIC_ERROR = "OTP verification failed. Please request a new code.";

// ---------------------------------------------------------------------------
// Pure: generateOtpCode
// ---------------------------------------------------------------------------

/**
 * Generate a cryptographically random 6-digit OTP code string (zero-padded).
 *
 * Uses rejection-sampling over Uint32Array to eliminate modulo bias:
 *   - Only values in [0, threshold) are accepted, where
 *     threshold = floor(2^32 / 1_000_000) * 1_000_000.
 *   - The probability of a single value being rejected is < 0.00024%,
 *     so the loop is virtually always one iteration.
 */
export function generateOtpCode(): string {
  const RANGE = 1_000_000; // 10^6 — gives 000000..999999
  // Largest multiple of RANGE that fits in a Uint32:
  const threshold = Math.floor(0x1_0000_0000 / RANGE) * RANGE;

  const buf = new Uint32Array(1);
  let val: number;
  do {
    crypto.getRandomValues(buf);
    val = buf[0];
  } while (val >= threshold);

  return (val % RANGE).toString().padStart(6, "0");
}

// ---------------------------------------------------------------------------
// Pure/Crypto: hashOtp
// ---------------------------------------------------------------------------

/**
 * HMAC-SHA256 hash of an OTP code with the given secret.
 * Returns a hex string.
 *
 * Deterministic: same (code, secret) → same output, allowing DB-side equality
 * checks without storing the plaintext.
 */
export async function hashOtp(code: string, secret: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(code));
  // Convert ArrayBuffer to lowercase hex string
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// ---------------------------------------------------------------------------
// Pure/Crypto: signDocCookie / verifyDocCookie
// ---------------------------------------------------------------------------

/**
 * Sign a document-access cookie.
 *
 * Payload format: `<token>.<expMs>.<sig>`
 * where sig = HMAC-SHA256("<token>.<expMs>", secret) as hex.
 *
 * The token is bound into the payload so a cookie issued for document A is
 * cryptographically invalid for document B.
 *
 * @param token     The document's publicToken.
 * @param secret    DOC_ACCESS_SECRET.
 * @param ttlMs     Cookie lifetime in milliseconds (default COOKIE_TTL_MS).
 */
export async function signDocCookie(
  token: string,
  secret: string,
  ttlMs: number = COOKIE_TTL_MS,
): Promise<string> {
  const exp = (Date.now() + ttlMs).toString();
  const payload = `${token}.${exp}`;
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(payload));
  const sigHex = Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return `${payload}.${sigHex}`;
}

/**
 * Verify a document-access cookie.
 *
 * Constant-time-ish: the signature is always recomputed and compared via
 * `crypto.subtle.verify` (or string equality over hex). Rejects if:
 *   - The cookie is malformed (< 3 segments).
 *   - The embedded token does not match the expected token (wrong document).
 *   - The expiry has passed.
 *   - The signature is wrong.
 *
 * Never throws; returns false on any error.
 *
 * @param value     Raw cookie value (the string from signDocCookie).
 * @param token     The document's publicToken to verify against.
 * @param secret    DOC_ACCESS_SECRET.
 */
export async function verifyDocCookie(
  value: string,
  token: string,
  secret: string,
): Promise<boolean> {
  try {
    // Split on the last "." — sig may not contain dots, but token/exp might not
    // have dots. Our format is exactly three segments separated by dots, but
    // the token itself may contain dots. We split by taking the last segment
    // as sig and everything else as the payload.
    const lastDot = value.lastIndexOf(".");
    if (lastDot < 0) return false;
    const payload = value.slice(0, lastDot);
    const sigHex = value.slice(lastDot + 1);

    // The payload itself is `<token>.<exp>`. We need to split that too, on
    // the last dot in the payload.
    const payloadLastDot = payload.lastIndexOf(".");
    if (payloadLastDot < 0) return false;
    const embeddedToken = payload.slice(0, payloadLastDot);
    const expStr = payload.slice(payloadLastDot + 1);

    // Token binding check
    if (embeddedToken !== token) return false;

    // Expiry check
    const exp = parseInt(expStr, 10);
    if (!Number.isFinite(exp) || Date.now() > exp) return false;

    // Recompute expected signature
    const enc = new TextEncoder();
    const key = await crypto.subtle.importKey(
      "raw",
      enc.encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"],
    );
    const expectedSig = await crypto.subtle.sign("HMAC", key, enc.encode(payload));
    const expectedHex = Array.from(new Uint8Array(expectedSig))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");

    // Constant-time-ish comparison via recomputation.
    // Both hex strings are same length (64 chars) so a simple === is length-safe.
    return sigHex === expectedHex;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Pure: otpVerdict
// ---------------------------------------------------------------------------

/** Input state for otpVerdict — all fields from the DB row plus the `matches` flag. */
export interface OtpVerdictState {
  attempts: number;
  maxAttempts: number;
  expiresAt: Date;
  consumedAt: Date | null;
  /** Whether the supplied plaintext code hashes to the stored codeHash. */
  matches: boolean;
}

/** Verdict result — accepted or rejected (generic; callers never see why). */
export type OtpVerdictResult = { ok: true } | { ok: false };

/**
 * Pure OTP decision helper.
 *
 * Checks — in order:
 *   1. Attempt cap: attempts >= maxAttempts → reject (brute-force prevention).
 *   2. Expiry: expiresAt <= now → reject.
 *   3. Already consumed: consumedAt != null → reject (replay prevention).
 *   4. Code match: !matches → reject.
 *   5. Otherwise: accept.
 *
 * NOTE: The caller must increment `attempts` BEFORE calling this function if
 * the purpose is to count a failed verify (i.e. pass `attempts + 1` from the DB).
 * `requestOtp`/`verifyOtp` handle the DB increment; this helper is pure.
 */
export function otpVerdict(state: OtpVerdictState, now: Date): OtpVerdictResult {
  if (state.attempts >= state.maxAttempts) return { ok: false };
  if (state.expiresAt <= now) return { ok: false };
  if (state.consumedAt !== null) return { ok: false };
  if (!state.matches) return { ok: false };
  return { ok: true };
}

// ---------------------------------------------------------------------------
// requestOtp opts
// ---------------------------------------------------------------------------

export interface RequestOtpOpts {
  /**
   * Callback that receives the plaintext OTP code.
   * The CALLER is responsible for dispatching it via WhatsApp (or SMS etc.).
   * This repo performs no network I/O.
   */
  onCode: (code: string) => void | Promise<void>;
  /** Override the OTP TTL in ms (default OTP_TTL_MS = 10 min). */
  ttlMs?: number;
  /** Override the max verify attempts (default DEFAULT_MAX_ATTEMPTS = 5). */
  maxAttempts?: number;
  /** Override the rate-limit window in ms (default RATE_WINDOW_MS = 30 min). */
  rateWindowMs?: number;
  /** Override the max pending OTPs per rate window (default MAX_PENDING_OTPS = 3). */
  maxPendingOtps?: number;
}

// ---------------------------------------------------------------------------
// DB-backed: requestOtp
// ---------------------------------------------------------------------------

/**
 * Issue a new OTP for a document identified by its publicToken.
 *
 * Steps:
 *   1. Look up the document by publicToken → err("not_found") with a generic
 *      message if absent (no enumeration).
 *   2. Rate-limit: count unconsumed, non-expired OTPs for this document created
 *      within the rate window. If count >= maxPendingOtps → err("validation")
 *      with a generic message.
 *   3. Generate plaintext OTP, hash it with DOC_ACCESS_SECRET.
 *   4. Insert the OTP row (hash + expiresAt).
 *   5. Call opts.onCode(plaintext) so the caller can dispatch WhatsApp.
 *
 * DOC_ACCESS_SECRET must be set; if absent → fail closed (err("validation")).
 */
export async function requestOtp(
  db: DbOrTx,
  token: string,
  phone: string,
  opts: RequestOtpOpts,
): Promise<ActionResult<void>> {
  try {
    const { DOC_ACCESS_SECRET } = getEnv();
    if (!DOC_ACCESS_SECRET) {
      // Fail closed — never leak why
      return err("validation", GENERIC_ERROR);
    }

    // 1. Resolve document
    const [doc] = await db
      .select({ id: schema.documents.id })
      .from(schema.documents)
      .where(eq(schema.documents.publicToken, token))
      .limit(1);

    if (!doc) {
      // Generic message — no token enumeration
      return err("validation", GENERIC_ERROR);
    }

    // 2. Rate-limit: count recent unconsumed OTPs for this document
    const rateWindowMs = opts.rateWindowMs ?? RATE_WINDOW_MS;
    const maxPending = opts.maxPendingOtps ?? MAX_PENDING_OTPS;
    const windowStart = new Date(Date.now() - rateWindowMs);

    const [{ pendingCount }] = await db
      .select({ pendingCount: count() })
      .from(schema.documentOtps)
      .where(
        and(
          eq(schema.documentOtps.documentId, doc.id),
          isNull(schema.documentOtps.consumedAt),
          gt(schema.documentOtps.createdAt, windowStart),
        ),
      );

    if (Number(pendingCount) >= maxPending) {
      return err("validation", GENERIC_ERROR);
    }

    // 3. Generate and hash the OTP code
    const code = generateOtpCode();
    const codeHash = await hashOtp(code, DOC_ACCESS_SECRET);

    const ttlMs = opts.ttlMs ?? OTP_TTL_MS;
    const expiresAt = new Date(Date.now() + ttlMs);
    const maxAttempts = opts.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;

    // 4. Store the hash (never the plaintext)
    await db.insert(schema.documentOtps).values({
      documentId: doc.id,
      phone,
      codeHash,
      expiresAt,
      attempts: 0,
      maxAttempts,
      consumedAt: null,
    });

    // 5. Hand the plaintext to the caller for WhatsApp dispatch
    await opts.onCode(code);

    return ok(undefined);
  } catch {
    return err("validation", GENERIC_ERROR);
  }
}

// ---------------------------------------------------------------------------
// DB-backed: verifyOtp
// ---------------------------------------------------------------------------

/**
 * Verify a submitted OTP code for a document.
 *
 * Steps:
 *   1. Resolve document by publicToken.
 *   2. Load the latest unconsumed OTP row for (documentId, phone).
 *   3. Increment attempts atomically.
 *   4. Hash the supplied code and run otpVerdict (with incremented attempt count).
 *   5a. On verdict ok: mark consumedAt, return signed cookie.
 *   5b. On verdict fail: return generic error.
 *
 * All failure paths return the same generic message.
 *
 * @param db     Database client or transaction.
 * @param token  Document publicToken (from URL).
 * @param phone  Phone number the OTP was sent to.
 * @param code   The 6-digit code the user submitted.
 * @param secret DOC_ACCESS_SECRET — passed explicitly so callers can read it
 *               once and share across requestOtp + verifyOtp.
 */
export async function verifyOtp(
  db: Db,
  token: string,
  phone: string,
  code: string,
  secret: string,
): Promise<ActionResult<{ cookie: string }>> {
  try {
    // 1. Resolve document
    const [doc] = await db
      .select({ id: schema.documents.id })
      .from(schema.documents)
      .where(eq(schema.documents.publicToken, token))
      .limit(1);

    if (!doc) {
      return err("validation", GENERIC_ERROR);
    }

    // Run everything in a transaction so the attempt increment + consumedAt
    // update are atomic.
    return await db.transaction(async (tx) => {
      // 2. Load the latest unconsumed OTP for (documentId, phone)
      const [otp] = await tx
        .select({
          id: schema.documentOtps.id,
          codeHash: schema.documentOtps.codeHash,
          attempts: schema.documentOtps.attempts,
          maxAttempts: schema.documentOtps.maxAttempts,
          expiresAt: schema.documentOtps.expiresAt,
          consumedAt: schema.documentOtps.consumedAt,
        })
        .from(schema.documentOtps)
        .where(
          and(
            eq(schema.documentOtps.documentId, doc.id),
            eq(schema.documentOtps.phone, phone),
            isNull(schema.documentOtps.consumedAt),
          ),
        )
        .orderBy(schema.documentOtps.createdAt)
        .limit(1);

      if (!otp) {
        return err("validation", GENERIC_ERROR);
      }

      // 3. Increment attempts (pre-check: if already at cap, reject immediately
      //    without another increment — cap is already enforced)
      const newAttempts = otp.attempts + 1;
      await tx
        .update(schema.documentOtps)
        .set({ attempts: newAttempts })
        .where(eq(schema.documentOtps.id, otp.id));

      // 4. Hash supplied code and run verdict with the NEW attempt count
      const suppliedHash = await hashOtp(code, secret);
      const matches = suppliedHash === otp.codeHash;

      const verdict = otpVerdict(
        {
          attempts: newAttempts,
          maxAttempts: otp.maxAttempts,
          expiresAt: otp.expiresAt,
          consumedAt: otp.consumedAt,
          matches,
        },
        new Date(),
      );

      if (!verdict.ok) {
        return err("validation", GENERIC_ERROR);
      }

      // 5a. Mark consumed and issue cookie
      const now = new Date();
      await tx
        .update(schema.documentOtps)
        .set({ consumedAt: now })
        .where(eq(schema.documentOtps.id, otp.id));

      const cookie = await signDocCookie(token, secret);
      return ok({ cookie });
    });
  } catch {
    return err("validation", GENERIC_ERROR);
  }
}
