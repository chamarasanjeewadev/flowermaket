/**
 * Gated PDF download for a public document.
 *
 * Route: /$locale/d/$token/pdf   (TanStack file-route naming → d.$token.pdf.ts)
 *
 * Security gate: the request MUST carry a `doc_access_<token>` cookie that was
 * set by the OTP-verify flow in d.$token.tsx / server/documents.ts.  That
 * cookie is a token-bound HMAC-SHA256 signed value; `verifyDocCookie` validates
 * it (token binding + expiry + signature).  Any request without a valid cookie
 * is redirected to the human-readable document view so the user can authenticate.
 *
 * No supplier cost ever reaches this route: `getPublicDocument` returns an
 * explicit customer-facing projection with no margin, cost, or award data.
 *
 * Ruling P1 / bundle safety:
 *   - `renderDocumentPdf` is imported from `@flowers/integrations/pdf` (subpath),
 *     NOT the barrel.  This is a server-only route file (no component export),
 *     so pdf-lib never reaches the client bundle.
 *
 * PDF caching to Supabase Storage (pdf_path column):
 *   GENERATE-ON-DEMAND — not cached to storage.  Reason: wiring the
 *   Supabase service-role storage client requires adding a new dependency
 *   (supabase-js or manual fetch + service-role JWT) and a new env var, which
 *   is out of scope for this task.  PDF generation with pdf-lib on Cloudflare
 *   Workers is fast (~5–30 ms for a single A4 page) and the response is
 *   `Cache-Control: private, no-store`, so edge and browser caches are bypassed.
 *   Adding storage caching is deferred to a follow-up (annotated below).
 */

import { createFileRoute } from "@tanstack/react-router";
import {
  getEnv,
  getPublicDocument,
  verifyDocCookie,
  tryCreateDb,
} from "@flowers/api";
import { renderDocumentPdf } from "@flowers/integrations/pdf";
import type { DocumentPdfInput } from "@flowers/integrations/pdf";

// ---------------------------------------------------------------------------
// Cookie helpers (mirrors the logic in server/documents.ts)
// ---------------------------------------------------------------------------

/** Parse a single cookie value by name from a raw Cookie header string. */
function parseCookieHeader(header: string | null, name: string): string | null {
  if (!header) return null;
  for (const part of header.split(";")) {
    const eq = part.indexOf("=");
    if (eq < 0) continue;
    const k = part.slice(0, eq).trim();
    if (k === name) {
      return decodeURIComponent(part.slice(eq + 1).trim());
    }
  }
  return null;
}

/** Cookie name is scoped to the token (mirrors server/documents.ts). */
function cookieName(token: string): string {
  return `doc_access_${token}`;
}

// ---------------------------------------------------------------------------
// Date → ISO date string for the PDF header
// ---------------------------------------------------------------------------

function toIsoDate(d: Date | null): string {
  if (!d) return new Date().toISOString().slice(0, 10);
  return new Date(d).toISOString().slice(0, 10);
}

// ---------------------------------------------------------------------------
// Route
// ---------------------------------------------------------------------------

export const Route = createFileRoute("/$locale/d/$token/pdf")({
  server: {
    handlers: {
      GET: async (ctx) => {
        const { locale, token } = ctx.params;

        // -----------------------------------------------------------------------
        // 1. Verify the doc-scoped signed cookie — GATE
        //
        // Fail closed on any of:
        //   - missing DOC_ACCESS_SECRET
        //   - missing cookie
        //   - cookie that fails HMAC / expiry / token-binding checks
        // -----------------------------------------------------------------------
        const env = getEnv();
        const { DOC_ACCESS_SECRET } = env;
        if (!DOC_ACCESS_SECRET) {
          // Misconfiguration — redirect to the view for OTP; never emit PDF
          return Response.redirect(`/${locale}/d/${token}`, 302);
        }

        const cookieHeader = ctx.request.headers.get("cookie");
        const cookieValue = parseCookieHeader(cookieHeader, cookieName(token));
        if (!cookieValue) {
          return Response.redirect(`/${locale}/d/${token}`, 302);
        }

        const valid = await verifyDocCookie(cookieValue, token, DOC_ACCESS_SECRET);
        if (!valid) {
          return Response.redirect(`/${locale}/d/${token}`, 302);
        }

        // -----------------------------------------------------------------------
        // 2. Load the public document (customer-facing snapshot, no supplier cost)
        // -----------------------------------------------------------------------
        const db = tryCreateDb();
        if (!db) {
          return new Response("Service temporarily unavailable.", { status: 503 });
        }

        const result = await getPublicDocument(db, token);
        if (!result.ok) {
          // Token not found or DB error — 404
          return new Response("Document not found.", { status: 404 });
        }

        const doc = result.data;

        // -----------------------------------------------------------------------
        // 3. Build DocumentPdfInput (all money is integer LKR cents — no floats)
        // -----------------------------------------------------------------------
        const input: DocumentPdfInput = {
          type: doc.type,
          docNo: doc.docNo,
          issuedAt: toIsoDate(doc.issuedAt),
          customer: {
            name: doc.customerSnapshot.name,
            phone: doc.customerSnapshot.phone,
            email: doc.customerSnapshot.email,
            address: doc.customerSnapshot.address,
            district: doc.customerSnapshot.district,
            city: doc.customerSnapshot.city,
          },
          lines: doc.lineSnapshot.map((line) => ({
            descriptionEn: line.descriptionEn,
            descriptionSi: line.descriptionSi,
            variant: line.variant,
            qty: line.qty,
            unit: line.unit,
            unitPrice: line.unitPrice,
            lineTotal: line.lineTotal,
          })),
          subtotal: doc.subtotal,
          discount: doc.discount,
          deliveryFee: doc.deliveryFee,
          taxAmount: doc.taxAmount,
          total: doc.total,
          currency: doc.currency,
        };

        // -----------------------------------------------------------------------
        // 4. Render PDF on demand and stream the bytes
        //
        // NOTE (future): to cache to Supabase Storage, check doc.pdfPath here —
        // if set, fetch the stored bytes and stream them; otherwise render, upload
        // (PATCH documents.pdf_path), then stream.  That path requires a
        // service-role Supabase storage client (new env var SUPABASE_SERVICE_KEY).
        // -----------------------------------------------------------------------
        const pdfBytes = await renderDocumentPdf(input);
        // Cast the Uint8Array buffer to ArrayBuffer — BodyInit accepts
        // ArrayBuffer in all TS/DOM lib versions without generic-type friction.
        const body: ArrayBuffer = pdfBytes.buffer as ArrayBuffer;

        return new Response(body, {
          headers: {
            "Content-Type": "application/pdf",
            "Content-Disposition": `inline; filename="${doc.docNo}.pdf"`,
            "Cache-Control": "private, no-store",
          },
        });
      },
    },
  },
});
