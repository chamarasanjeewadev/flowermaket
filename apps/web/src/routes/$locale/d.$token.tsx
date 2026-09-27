/**
 * Public OTP-gated document view.
 *
 * Route: /$locale/d/$token
 *
 * Security:
 * - The loader calls getPublicDocumentFn which verifies the doc-scoped signed
 *   cookie before emitting any document data. If the cookie is absent or
 *   invalid, { gated: true } is returned — no document contents leak.
 * - OTP errors always show ONE generic message (no enumeration).
 * - The route is noindex (private link, not for search engines).
 *
 * Ruling P2: NO barrel value imports in this file. Money formatting uses the
 * subpath export @flowers/api/money. Server fns come from ../server/documents.
 */
import * as React from "react";
import { createFileRoute, useRouter } from "@tanstack/react-router";
import { formatRupees } from "@flowers/api/money";
import { Button } from "@flowers/ui/components/button";
import { Input } from "@flowers/ui/components/input";
import { Label } from "@flowers/ui/components/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@flowers/ui/components/card";
import { Alert, AlertDescription } from "@flowers/ui/components/alert";
import { Separator } from "@flowers/ui/components/separator";
import { FileText, Printer } from "lucide-react";
import type { PublicDocument } from "@flowers/api";
import type { PublicDocumentResult } from "../../server/documents";
import {
  getPublicDocumentFn,
  requestDocOtpFn,
  verifyDocOtpFn,
} from "../../server/documents";

// ---------------------------------------------------------------------------
// Route
// ---------------------------------------------------------------------------

export const Route = createFileRoute("/$locale/d/$token")({
  loader: async ({ params }): Promise<PublicDocumentResult> => {
    return getPublicDocumentFn({ data: params.token });
  },
  head: () => ({
    meta: [
      { title: "Document | FlowerMarket.lk" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: DocumentPage,
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function docTypeLabel(
  type: PublicDocument["type"],
  locale: string,
): string {
  if (locale === "si") {
    if (type === "quotation") return "මිල ඇස්තමේන්තු";
    if (type === "invoice") return "ඉන්වොයිස්";
    return "රිසිට්";
  }
  if (type === "quotation") return "Quotation";
  if (type === "invoice") return "Invoice";
  return "Receipt";
}

function statusLabel(
  status: PublicDocument["status"],
  locale: string,
): string {
  if (locale === "si") {
    const labels: Record<PublicDocument["status"], string> = {
      draft: "කෙටුම්පත",
      sent: "යවා ඇත",
      viewed: "නරඹා ඇත",
      accepted: "ස්වීකාර කළා",
      paid: "ගෙවා ඇත",
      void: "අවලංගු",
    };
    return labels[status];
  }
  const labels: Record<PublicDocument["status"], string> = {
    draft: "Draft",
    sent: "Sent",
    viewed: "Viewed",
    accepted: "Accepted",
    paid: "Paid",
    void: "Void",
  };
  return labels[status];
}

function formatDate(d: Date | null, locale: string): string {
  if (!d) return "—";
  return new Date(d).toLocaleDateString(locale === "si" ? "si-LK" : "en-GB", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

// ---------------------------------------------------------------------------
// OTP Challenge UI
// ---------------------------------------------------------------------------

const PHONE_RE = /^\+?[\d\s\-()]{7,15}$/;
const GENERIC_OTP_ERROR = "Invalid or expired code. Please try again.";

type OtpStep = "phone" | "code";

function OtpChallenge({ token }: { token: string }) {
  const router = useRouter();
  const [step, setStep] = React.useState<OtpStep>("phone");
  const [phone, setPhone] = React.useState("");
  const [code, setCode] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(false);

  async function handleRequestOtp(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!PHONE_RE.test(phone.trim())) {
      setError("Please enter a valid phone number.");
      return;
    }
    setLoading(true);
    try {
      // Always shows generic success — never reveals whether phone is known
      await requestDocOtpFn({ data: { token, phone: phone.trim() } });
      setStep("code");
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  async function handleVerifyOtp(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!/^\d{6}$/.test(code.trim())) {
      setError(GENERIC_OTP_ERROR);
      return;
    }
    setLoading(true);
    try {
      const result = await verifyDocOtpFn({
        data: { token, phone: phone.trim(), code: code.trim() },
      });
      if (!result.ok) {
        // Always the same generic message
        setError(GENERIC_OTP_ERROR);
        return;
      }
      // Cookie is now set — reload so the loader re-runs with the new cookie
      await router.invalidate();
    } catch {
      setError(GENERIC_OTP_ERROR);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto flex min-h-[60vh] max-w-md items-center justify-center px-4 py-16">
      <Card className="w-full">
        <CardHeader>
          <CardTitle className="font-display text-2xl">
            View Your Document
          </CardTitle>
          <CardDescription>
            {step === "phone"
              ? "Enter the phone number associated with your order to receive a verification code."
              : "Enter the 6-digit code sent to your WhatsApp."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {error && (
            <Alert variant="destructive" className="mb-4">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {step === "phone" ? (
            <form onSubmit={handleRequestOtp} className="space-y-4" noValidate>
              <div className="space-y-1.5">
                <Label htmlFor="phone">Phone number</Label>
                <Input
                  id="phone"
                  name="phone"
                  type="tel"
                  autoComplete="tel"
                  placeholder="+94 77 123 4567"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  disabled={loading}
                />
              </div>
              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? "Sending code…" : "Send verification code"}
              </Button>
            </form>
          ) : (
            <form onSubmit={handleVerifyOtp} className="space-y-4" noValidate>
              <div className="space-y-1.5">
                <Label htmlFor="code">Verification code</Label>
                <Input
                  id="code"
                  name="code"
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={6}
                  placeholder="000000"
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                  disabled={loading}
                />
              </div>
              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? "Verifying…" : "Verify code"}
              </Button>
              <Button
                type="button"
                variant="ghost"
                className="w-full"
                disabled={loading}
                onClick={() => {
                  setStep("phone");
                  setCode("");
                  setError(null);
                }}
              >
                Use a different number
              </Button>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Document View
// ---------------------------------------------------------------------------

function DocumentView({
  doc,
  token,
  locale,
}: {
  doc: PublicDocument;
  token: string;
  locale: string;
}) {
  const typeLabel = docTypeLabel(doc.type, locale);
  const isEn = locale !== "si";

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 print:px-0 print:py-0">
      {/* Actions bar (hidden in print) */}
      <div className="mb-6 flex items-center justify-between print:hidden">
        <div className="flex items-center gap-2 text-muted-foreground">
          <FileText className="size-5" aria-hidden="true" />
          <span className="text-sm">FlowerMarket.lk Document</span>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => window.print()}
          >
            <Printer className="mr-1.5 size-4" aria-hidden="true" />
            Print
          </Button>
          <Button asChild size="sm">
            <a href={`/${locale}/d/${token}/pdf`}>Download PDF</a>
          </Button>
        </div>
      </div>

      {/* Document */}
      <div className="rounded-lg border border-border bg-background p-8 shadow-sm print:rounded-none print:border-0 print:shadow-none">
        {/* Header */}
        <div className="mb-8 flex items-start justify-between">
          <div>
            <p className="font-display text-2xl font-semibold text-foreground">
              FlowerMarket<span className="text-brand">.lk</span>
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              Sri Lanka&apos;s online flower marketplace
            </p>
          </div>
          <div className="text-right">
            <p className="text-lg font-semibold text-foreground">{typeLabel}</p>
            <p className="text-sm text-muted-foreground">{doc.docNo}</p>
            <span
              className={[
                "mt-1 inline-block rounded-full px-2.5 py-0.5 text-xs font-medium",
                doc.status === "paid"
                  ? "bg-green-100 text-green-800"
                  : doc.status === "void"
                    ? "bg-red-100 text-red-800"
                    : "bg-amber-100 text-amber-800",
              ].join(" ")}
            >
              {statusLabel(doc.status, locale)}
            </span>
          </div>
        </div>

        <Separator className="mb-6" />

        {/* Meta row */}
        <div className="mb-8 grid grid-cols-2 gap-4 text-sm sm:grid-cols-3">
          <div>
            <p className="font-medium text-muted-foreground">
              {isEn ? "Issue date" : "නිකුත් කළ දිනය"}
            </p>
            <p className="text-foreground">{formatDate(doc.issuedAt, locale)}</p>
          </div>
          {doc.validUntil && (
            <div>
              <p className="font-medium text-muted-foreground">
                {isEn ? "Valid until" : "වලංගු කාලය"}
              </p>
              <p className="text-foreground">{formatDate(doc.validUntil, locale)}</p>
            </div>
          )}
          {doc.paidAt && (
            <div>
              <p className="font-medium text-muted-foreground">
                {isEn ? "Paid on" : "ගෙවූ දිනය"}
              </p>
              <p className="text-foreground">{formatDate(doc.paidAt, locale)}</p>
            </div>
          )}
          <div>
            <p className="font-medium text-muted-foreground">
              {isEn ? "Currency" : "මුදල්"}
            </p>
            <p className="text-foreground">{doc.currency}</p>
          </div>
        </div>

        {/* Customer block */}
        <div className="mb-8">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {isEn ? "Bill To" : "ලිපිනය"}
          </p>
          <p className="font-medium text-foreground">{doc.customerSnapshot.name}</p>
          {doc.customerSnapshot.email && (
            <p className="text-sm text-muted-foreground">{doc.customerSnapshot.email}</p>
          )}
          <p className="text-sm text-muted-foreground">{doc.customerSnapshot.phone}</p>
          {doc.customerSnapshot.address && (
            <p className="text-sm text-muted-foreground">{doc.customerSnapshot.address}</p>
          )}
          {(doc.customerSnapshot.city || doc.customerSnapshot.district) && (
            <p className="text-sm text-muted-foreground">
              {[doc.customerSnapshot.city, doc.customerSnapshot.district]
                .filter(Boolean)
                .join(", ")}
            </p>
          )}
        </div>

        <Separator className="mb-6" />

        {/* Line items */}
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              <th className="pb-2 pr-4">{isEn ? "Description" : "විස්තරය"}</th>
              <th className="pb-2 pr-4 text-center">{isEn ? "Qty" : "ගණන"}</th>
              <th className="pb-2 pr-4 text-center">{isEn ? "Unit" : "ඒකකය"}</th>
              <th className="pb-2 pr-4 text-right">{isEn ? "Unit price" : "ඒකක මිල"}</th>
              <th className="pb-2 text-right">{isEn ? "Line total" : "රේඛා එකතුව"}</th>
            </tr>
          </thead>
          <tbody>
            {doc.lineSnapshot.map((line, i) => {
              const desc =
                locale === "si" && line.descriptionSi
                  ? line.descriptionSi
                  : line.descriptionEn;
              return (
                <tr key={i} className="border-b border-border/40 last:border-0">
                  <td className="py-2.5 pr-4 font-medium text-foreground">
                    {desc}
                    {line.variant && (
                      <span className="ml-1.5 text-xs text-muted-foreground">
                        ({line.variant})
                      </span>
                    )}
                  </td>
                  <td className="py-2.5 pr-4 text-center text-muted-foreground">
                    {line.qty}
                  </td>
                  <td className="py-2.5 pr-4 text-center text-muted-foreground">
                    {line.unit}
                  </td>
                  <td className="py-2.5 pr-4 text-right text-muted-foreground">
                    {formatRupees(line.unitPrice)}
                  </td>
                  <td className="py-2.5 text-right font-medium text-foreground">
                    {formatRupees(line.lineTotal)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        {/* Totals */}
        <div className="mt-6 flex justify-end">
          <dl className="w-full max-w-xs space-y-1.5 text-sm">
            <div className="flex justify-between">
              <dt className="text-muted-foreground">{isEn ? "Subtotal" : "උප එකතුව"}</dt>
              <dd className="font-medium text-foreground">{formatRupees(doc.subtotal)}</dd>
            </div>
            {doc.discount !== 0 && (
              <div className="flex justify-between">
                <dt className="text-muted-foreground">{isEn ? "Discount" : "වට්ටම"}</dt>
                <dd className="font-medium text-foreground">
                  -{formatRupees(doc.discount)}
                </dd>
              </div>
            )}
            {doc.deliveryFee !== 0 && (
              <div className="flex justify-between">
                <dt className="text-muted-foreground">{isEn ? "Delivery" : "බෙදාහැරීම"}</dt>
                <dd className="font-medium text-foreground">{formatRupees(doc.deliveryFee)}</dd>
              </div>
            )}
            {doc.taxAmount !== 0 && (
              <div className="flex justify-between">
                <dt className="text-muted-foreground">{isEn ? "Tax" : "බදු"}</dt>
                <dd className="font-medium text-foreground">{formatRupees(doc.taxAmount)}</dd>
              </div>
            )}
            <Separator />
            <div className="flex justify-between pt-1">
              <dt className="text-base font-semibold text-foreground">
                {isEn ? "Total" : "එකතුව"}
              </dt>
              <dd className="text-base font-semibold text-foreground">
                {formatRupees(doc.total)}
              </dd>
            </div>
          </dl>
        </div>

        {/* Footer */}
        <div className="mt-10 border-t border-border pt-6">
          <p className="text-center text-xs text-muted-foreground">
            {isEn
              ? "Thank you for choosing FlowerMarket.lk — Sri Lanka's online flower marketplace."
              : "FlowerMarket.lk — ශ්‍රී ලංකාවේ මාර්ගගත මල් වෙළඳ ව්‍යාපාරය — ඔබගේ සහාය ස්තූතිය."}
          </p>
          <p className="mt-1 text-center text-xs text-muted-foreground">
            hi@flowermarket.lk
          </p>
        </div>
      </div>

      {/* Print styles */}
      <style>{`
        @media print {
          nav, header, footer, .print\\:hidden { display: none !important; }
          body { background: white; }
        }
      `}</style>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page component
// ---------------------------------------------------------------------------

function DocumentPage() {
  const loaderData = Route.useLoaderData();
  const { token, locale } = Route.useParams();

  if (loaderData.gated) {
    return <OtpChallenge token={token} />;
  }

  return <DocumentView doc={loaderData.doc} token={token} locale={locale} />;
}
