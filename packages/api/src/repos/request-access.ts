/**
 * request-access.ts — WhatsApp OTP issue/verify + signed cookie for bouquet
 * requests. Mirrors documentAccess.ts (same limits, generic errors, hashing);
 * the cookie is signed over `lr:<requestId>` so a document cookie can never
 * validate for a request and vice versa. No network I/O: the caller dispatches
 * the code via `opts.onCode`.
 */

import { and, count, desc, eq, gt, isNull } from "drizzle-orm";
import { schema } from "@flowers/db/client";
import type { Db } from "../db";
import { err, ok, type ActionResult } from "../errors";
import { getEnv } from "../env";
import {
  generateOtpCode,
  hashOtp,
  otpVerdict,
  phoneMatchesCustomer,
  signDocCookie,
  type RequestOtpOpts,
} from "./documentAccess";

const OTP_TTL_MS = 10 * 60 * 1000;
const RATE_WINDOW_MS = 30 * 60 * 1000;
const MAX_PENDING_OTPS = 3;
const DEFAULT_MAX_ATTEMPTS = 5;

/** Generic error message — never leaks phone/code/request info. */
const GENERIC_ERROR = "OTP verification failed. Please request a new code.";

/** Cookie name for a request's access cookie. */
export function requestCookieName(requestId: string): string {
  return `lr_access_${requestId}`;
}

/**
 * Issue an OTP for a bouquet request. The phone must match the request's
 * customerPhone. Fails closed without DOC_ACCESS_SECRET.
 */
export async function requestRequestOtp(
  db: Db,
  requestId: string,
  phone: string,
  opts: RequestOtpOpts,
): Promise<ActionResult<void>> {
  try {
    const { DOC_ACCESS_SECRET } = getEnv();
    if (!DOC_ACCESS_SECRET) return err("validation", GENERIC_ERROR);

    const [req] = await db
      .select({
        id: schema.bouquetRequests.id,
        customerPhone: schema.bouquetRequests.customerPhone,
      })
      .from(schema.bouquetRequests)
      .where(eq(schema.bouquetRequests.id, requestId))
      .limit(1);
    if (!req) return err("validation", GENERIC_ERROR);

    if (!phoneMatchesCustomer(phone, req.customerPhone)) {
      return err("validation", GENERIC_ERROR);
    }

    // Rate limit: only unconsumed AND still-valid OTPs count.
    const rateWindowMs = opts.rateWindowMs ?? RATE_WINDOW_MS;
    const maxPending = opts.maxPendingOtps ?? MAX_PENDING_OTPS;
    const windowStart = new Date(Date.now() - rateWindowMs);

    const [{ pendingCount }] = await db
      .select({ pendingCount: count() })
      .from(schema.bouquetRequestOtps)
      .where(
        and(
          eq(schema.bouquetRequestOtps.requestId, req.id),
          isNull(schema.bouquetRequestOtps.consumedAt),
          gt(schema.bouquetRequestOtps.createdAt, windowStart),
          gt(schema.bouquetRequestOtps.expiresAt, new Date()),
        ),
      );
    if (Number(pendingCount) >= maxPending) {
      return err("validation", GENERIC_ERROR);
    }

    const code = generateOtpCode();
    const codeHash = await hashOtp(code, DOC_ACCESS_SECRET);
    const expiresAt = new Date(Date.now() + (opts.ttlMs ?? OTP_TTL_MS));

    const [inserted] = await db
      .insert(schema.bouquetRequestOtps)
      .values({
        requestId: req.id,
        phone,
        codeHash,
        expiresAt,
        attempts: 0,
        maxAttempts: opts.maxAttempts ?? DEFAULT_MAX_ATTEMPTS,
        consumedAt: null,
      })
      .returning({ id: schema.bouquetRequestOtps.id });

    // An undeliverable code must not consume the pending-OTP rate limit.
    try {
      await opts.onCode(code);
    } catch {
      await db
        .delete(schema.bouquetRequestOtps)
        .where(eq(schema.bouquetRequestOtps.id, inserted.id));
      return err("validation", GENERIC_ERROR);
    }

    return ok(undefined);
  } catch {
    return err("validation", GENERIC_ERROR);
  }
}

/**
 * Verify a submitted OTP. On success consumes the code, sets phoneVerifiedAt
 * if this is the first verification, and returns the signed request cookie.
 */
export async function verifyRequestOtp(
  db: Db,
  requestId: string,
  phone: string,
  code: string,
  secret: string,
): Promise<ActionResult<{ cookie: string; firstVerification: boolean }>> {
  try {
    if (!secret) return err("validation", GENERIC_ERROR);

    const [req] = await db
      .select({
        id: schema.bouquetRequests.id,
        phoneVerifiedAt: schema.bouquetRequests.phoneVerifiedAt,
      })
      .from(schema.bouquetRequests)
      .where(eq(schema.bouquetRequests.id, requestId))
      .limit(1);
    if (!req) return err("validation", GENERIC_ERROR);

    return await db.transaction(async (tx) => {
      const [otp] = await tx
        .select({
          id: schema.bouquetRequestOtps.id,
          codeHash: schema.bouquetRequestOtps.codeHash,
          attempts: schema.bouquetRequestOtps.attempts,
          maxAttempts: schema.bouquetRequestOtps.maxAttempts,
          expiresAt: schema.bouquetRequestOtps.expiresAt,
          consumedAt: schema.bouquetRequestOtps.consumedAt,
        })
        .from(schema.bouquetRequestOtps)
        .where(
          and(
            eq(schema.bouquetRequestOtps.requestId, req.id),
            eq(schema.bouquetRequestOtps.phone, phone),
            isNull(schema.bouquetRequestOtps.consumedAt),
          ),
        )
        // Most recently issued code is the one the user just received.
        .orderBy(desc(schema.bouquetRequestOtps.createdAt))
        .limit(1);
      if (!otp) return err("validation", GENERIC_ERROR);

      const newAttempts = otp.attempts + 1;
      await tx
        .update(schema.bouquetRequestOtps)
        .set({ attempts: newAttempts })
        .where(eq(schema.bouquetRequestOtps.id, otp.id));

      const suppliedHash = await hashOtp(code, secret);
      const verdict = otpVerdict(
        {
          attempts: newAttempts,
          maxAttempts: otp.maxAttempts,
          expiresAt: otp.expiresAt,
          consumedAt: otp.consumedAt,
          matches: suppliedHash === otp.codeHash,
        },
        new Date(),
      );
      if (!verdict.ok) return err("validation", GENERIC_ERROR);

      const now = new Date();
      await tx
        .update(schema.bouquetRequestOtps)
        .set({ consumedAt: now })
        .where(eq(schema.bouquetRequestOtps.id, otp.id));

      const firstVerification = req.phoneVerifiedAt === null;
      if (firstVerification) {
        await tx
          .update(schema.bouquetRequests)
          .set({ phoneVerifiedAt: now })
          .where(eq(schema.bouquetRequests.id, req.id));
      }

      const cookie = await signDocCookie(`lr:${req.id}`, secret);
      return ok({ cookie, firstVerification });
    });
  } catch {
    return err("validation", GENERIC_ERROR);
  }
}
