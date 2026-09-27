/**
 * Document server functions — OTP gate + public document view.
 *
 * Ruling P2/P3: all DB + crypto access is confined to this server-only module.
 * The client route imports ONLY the function types, never barrel values.
 *
 * Security invariants:
 * - getPublicDocumentFn: emits document contents ONLY when the request carries
 *   a valid, token-scoped signed cookie. Otherwise returns { gated: true }.
 * - requestDocOtpFn: always returns generic success to prevent phone enumeration.
 * - verifyDocOtpFn: always returns the same generic error on any failure.
 */
import { createServerFn } from "@tanstack/react-start";
import { getCookies, setCookie } from "@tanstack/react-start/server";
import {
  getEnv,
  getPublicDocument,
  requestOtp,
  verifyOtp,
  verifyDocCookie,
  tryCreateDb,
  ok,
  err,
  type ActionResult,
} from "@flowers/api";
import {
  sendWhatsappText,
  buildOtpMessage,
  type EvolutionConfig,
} from "@flowers/integrations";
import type { PublicDocument } from "@flowers/api";

// ---------------------------------------------------------------------------
// Cookie helpers
// ---------------------------------------------------------------------------

/** Cookie name is scoped to the token so cookies are not cross-document. */
function cookieName(token: string): string {
  return `doc_access_${token}`;
}

/** Document-access cookie TTL: 24 hours in seconds. */
const COOKIE_MAX_AGE_S = 24 * 60 * 60;

// ---------------------------------------------------------------------------
// getPublicDocumentFn
// ---------------------------------------------------------------------------

export type PublicDocumentResult =
  | { gated: true }
  | { gated: false; doc: PublicDocument };

/**
 * Returns the public document if the request carries a valid doc-scoped cookie;
 * otherwise returns { gated: true } without emitting any document data.
 */
export const getPublicDocumentFn = createServerFn({ method: "GET" })
  .validator((token: string) => token)
  .handler(async ({ data: token }): Promise<PublicDocumentResult> => {
    const { DOC_ACCESS_SECRET } = getEnv();
    if (!DOC_ACCESS_SECRET) {
      return { gated: true };
    }

    // Read the token-scoped cookie
    const cookieValue = getCookies()[cookieName(token)];
    if (!cookieValue) {
      return { gated: true };
    }

    // Verify the signed cookie (token-bound, expiry-checked)
    const valid = await verifyDocCookie(cookieValue, token, DOC_ACCESS_SECRET);
    if (!valid) {
      return { gated: true };
    }

    // Cookie is valid — fetch and return the document
    const db = tryCreateDb();
    if (!db) {
      return { gated: true };
    }

    const result = await getPublicDocument(db, token);
    if (!result.ok) {
      // Document not found or DB error — treat as gated (fail closed)
      return { gated: true };
    }

    return { gated: false, doc: result.data };
  });

// ---------------------------------------------------------------------------
// requestDocOtpFn
// ---------------------------------------------------------------------------

/**
 * Issue an OTP for the given document token + phone number.
 * Always returns generic success (no enumeration).
 */
export const requestDocOtpFn = createServerFn({ method: "POST" })
  .validator((data: { token: string; phone: string }) => data)
  .handler(async ({ data }): Promise<ActionResult<{ sent: true }>> => {
    const env = getEnv();
    const { DOC_ACCESS_SECRET } = env;
    if (!DOC_ACCESS_SECRET) {
      // Generic success — don't reveal misconfiguration
      return ok({ sent: true as const });
    }

    const db = tryCreateDb();
    if (!db) {
      return ok({ sent: true as const });
    }

    const evolutionConfig: EvolutionConfig = {
      apiUrl: env.EVOLUTION_API_URL ?? "",
      apiKey: env.EVOLUTION_API_KEY ?? "",
      instance: env.EVOLUTION_INSTANCE ?? "",
    };

    await requestOtp(db, data.token, data.phone, {
      onCode: async (code) => {
        const message = buildOtpMessage({ code, locale: "en" });
        // Best-effort; failure is swallowed — code lands in server logs in dev
        await sendWhatsappText(evolutionConfig, data.phone, message);
      },
    });

    // Always return generic success regardless of outcome
    return ok({ sent: true as const });
  });

// ---------------------------------------------------------------------------
// verifyDocOtpFn
// ---------------------------------------------------------------------------

const GENERIC_OTP_ERROR = "Invalid or expired code. Please try again.";

/**
 * Verify an OTP code. On success, set a signed document-scoped cookie and
 * return success. On any failure, return ONE generic error (no enumeration).
 */
export const verifyDocOtpFn = createServerFn({ method: "POST" })
  .validator(
    (data: { token: string; phone: string; code: string }) => data,
  )
  .handler(
    async ({ data }): Promise<ActionResult<{ verified: true }>> => {
      const { DOC_ACCESS_SECRET } = getEnv();
      if (!DOC_ACCESS_SECRET) {
        return err("validation", GENERIC_OTP_ERROR);
      }

      const db = tryCreateDb();
      if (!db) {
        return err("validation", GENERIC_OTP_ERROR);
      }

      const result = await verifyOtp(
        db,
        data.token,
        data.phone,
        data.code,
        DOC_ACCESS_SECRET,
      );

      if (!result.ok) {
        // Always the same generic message — no enumeration
        return err("validation", GENERIC_OTP_ERROR);
      }

      // Set document-scoped, HttpOnly, Secure, SameSite=Lax cookie.
      // path=/d/<token> would scope to both /$locale/d/$token routes but
      // the cookie name already binds to the token, so path=/ is safe and
      // ensures the cookie is sent regardless of locale prefix.
      setCookie(cookieName(data.token), result.data.cookie, {
        httpOnly: true,
        secure: true,
        sameSite: "lax",
        path: "/",
        maxAge: COOKIE_MAX_AGE_S,
      });

      return ok({ verified: true as const });
    },
  );
