/**
 * RFQ detail page — per-line quote submission.
 *
 * Ruling P2 compliance:
 * - "@flowers/api" barrel is NOT imported as a value here.
 * - Only "@flowers/api/money" (formatRupees) and type-only imports from
 *   "@flowers/api" are used on the client.
 */
import * as React from "react";
import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { formatRupees } from "@flowers/api/money";
import type { SupplierRfqDetail, SupplierRfqOrderItem, SupplierRfqQuoteLine } from "@flowers/api";
import { Button } from "@flowers/ui/components/button";
import { Input } from "@flowers/ui/components/input";
import { Label } from "@flowers/ui/components/label";
import { Textarea } from "@flowers/ui/components/textarea";
import { Badge } from "@flowers/ui/components/badge";
import { Alert, AlertDescription } from "@flowers/ui/components/alert";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@flowers/ui/components/table";
import { Loader2 } from "lucide-react";
import { getRfqFn, submitQuoteFn, declineRfqFn } from "../server/rfqs";
import { toast } from "../components/toaster";
import { useT } from "../i18n/react";

export const Route = createFileRoute("/rfqs/$rfqId")({
  loader: async ({ params }) => ({
    rfq: await getRfqFn({ data: params.rfqId }),
  }),
  component: RfqDetailPage,
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDate(date: Date | null | string | undefined): string {
  if (!date) return "—";
  const d = date instanceof Date ? date : new Date(date);
  return d.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

type RfqStatus =
  | "sent"
  | "viewed"
  | "quoted"
  | "declined"
  | "expired"
  | "awarded"
  | "closed";

function RfqStatusBadge({ status }: { status: string }) {
  const { t } = useT();
  const labels: Record<RfqStatus, string> = {
    sent: t.rfqs.statusSent,
    viewed: t.rfqs.statusViewed,
    quoted: t.rfqs.statusQuoted,
    declined: t.rfqs.statusDeclined,
    expired: t.rfqs.statusExpired,
    awarded: t.rfqs.statusAwarded,
    closed: t.rfqs.statusClosed,
  };
  const variants: Record<
    RfqStatus,
    "secondary" | "warning" | "success" | "outline" | "destructive"
  > = {
    sent: "warning",
    viewed: "secondary",
    quoted: "success",
    declined: "outline",
    expired: "outline",
    awarded: "success",
    closed: "outline",
  };
  const key = status as RfqStatus;
  return (
    <Badge variant={variants[key] ?? "secondary"}>
      {labels[key] ?? status}
    </Badge>
  );
}

// ---------------------------------------------------------------------------
// Per-line form state
// ---------------------------------------------------------------------------

interface LineState {
  orderItemId: string;
  availableQty: string; // raw input string
  unitPriceRupees: string; // raw input string (rupees, converted to cents on submit)
  leadTimeDays: string;
  notes: string;
}

function initLineState(items: SupplierRfqOrderItem[], quoteLines: SupplierRfqQuoteLine[]): LineState[] {
  const quoteMap = new Map<string, SupplierRfqQuoteLine>();
  for (const ql of quoteLines) {
    quoteMap.set(ql.orderItemId, ql);
  }
  return items.map((item) => {
    const existing = quoteMap.get(item.id);
    return {
      orderItemId: item.id,
      availableQty: existing ? String(existing.availableQty) : "",
      // existing unitPrice is in CENTS — display as rupees
      unitPriceRupees: existing ? String(existing.unitPrice / 100) : "",
      leadTimeDays: existing?.leadTimeDays != null ? String(existing.leadTimeDays) : "",
      notes: existing?.notes ?? "",
    };
  });
}

// ---------------------------------------------------------------------------
// Main page component
// ---------------------------------------------------------------------------

function RfqDetailPage() {
  const { t } = useT();
  const { rfq } = Route.useLoaderData();

  if (!rfq) {
    return (
      <div className="space-y-4">
        <Link to="/rfqs" className="text-sm text-muted-foreground hover:text-foreground">
          {t.rfqs.backToInbox}
        </Link>
        <p className="text-muted-foreground">{t.rfqs.notFound}</p>
      </div>
    );
  }

  // A quoted RFQ stays editable (re-submitting replaces the quote) until it is
  // awarded/closed — matches the server-side canSubmitQuote guard.
  const isEditable =
    rfq.status === "sent" || rfq.status === "viewed" || rfq.status === "quoted";
  const isRequoting = rfq.status === "quoted";

  return (
    <div className="space-y-6">
      {/* Back link */}
      <Link to="/rfqs" className="text-sm text-muted-foreground hover:text-foreground">
        {t.rfqs.backToInbox}
      </Link>

      {/* Header */}
      <div className="flex flex-wrap items-start gap-4">
        <div className="flex-1">
          <h1 className="font-display text-3xl sm:text-4xl">
            {t.rfqs.orderLabel}: {rfq.orderNo}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {t.rfqs.colSent}: {formatDate(rfq.sentAt)}
          </p>
        </div>
        <RfqStatusBadge status={rfq.status} />
      </div>

      {/* Admin message if any */}
      {rfq.message && (
        <Alert>
          <AlertDescription>{rfq.message}</AlertDescription>
        </Alert>
      )}

      {/* Already responded / re-quote notice */}
      {!isEditable && (
        <Alert>
          <AlertDescription>{t.rfqs.alreadyResponded}</AlertDescription>
        </Alert>
      )}
      {isRequoting && (
        <Alert>
          <AlertDescription>{t.rfqs.updateQuoteNotice}</AlertDescription>
        </Alert>
      )}

      {/* Items table + quote form or read-only display */}
      {isEditable ? (
        <QuoteForm rfq={rfq} />
      ) : (
        <ReadOnlyView rfq={rfq} />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Read-only view — for already-responded RFQs
// ---------------------------------------------------------------------------

function ReadOnlyView({ rfq }: { rfq: SupplierRfqDetail }) {
  const { t } = useT();
  const quoteMap = new Map<string, SupplierRfqQuoteLine>();
  for (const ql of rfq.quoteLines) {
    quoteMap.set(ql.orderItemId, ql);
  }

  return (
    <div className="space-y-6">
      {/* Order items */}
      <section className="space-y-3">
        <h2 className="text-lg font-semibold">{t.rfqs.itemsLabel}</h2>
        <div className="rounded-xl border border-border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t.rfqs.colItemDescription}</TableHead>
                <TableHead>{t.rfqs.colQtyRequested}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rfq.items.map((item) => (
                <TableRow key={item.id}>
                  <TableCell>
                    <div className="font-medium">{item.descriptionEn}</div>
                    {item.variant && (
                      <div className="text-xs text-muted-foreground">{item.variant}</div>
                    )}
                    {item.notes && (
                      <div className="text-xs text-muted-foreground">{item.notes}</div>
                    )}
                  </TableCell>
                  <TableCell>
                    {item.quantity} {item.unit}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </section>

      {/* Quote lines if quoted */}
      {rfq.quoteLines.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-lg font-semibold">{t.rfqs.existingQuote}</h2>
          <div className="rounded-xl border border-border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t.rfqs.colItemDescription}</TableHead>
                  <TableHead>{t.rfqs.colAvailableQty}</TableHead>
                  <TableHead>{t.rfqs.colUnitPrice}</TableHead>
                  <TableHead>{t.rfqs.colLeadTime}</TableHead>
                  <TableHead>{t.rfqs.colNotes}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rfq.items.map((item) => {
                  const ql = quoteMap.get(item.id);
                  if (!ql) return null;
                  return (
                    <TableRow key={item.id}>
                      <TableCell>{item.descriptionEn}</TableCell>
                      <TableCell>{ql.availableQty}</TableCell>
                      <TableCell>{formatRupees(ql.unitPrice)}</TableCell>
                      <TableCell>{ql.leadTimeDays ?? "—"}</TableCell>
                      <TableCell className="text-muted-foreground">{ql.notes ?? "—"}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
          {rfq.quoteNotes && (
            <p className="text-sm text-muted-foreground">
              <strong>{t.rfqs.notesLabel}:</strong> {rfq.quoteNotes}
            </p>
          )}
          {rfq.quoteValidUntil && (
            <p className="text-sm text-muted-foreground">
              <strong>{t.rfqs.validUntilLabel}:</strong>{" "}
              {formatDate(rfq.quoteValidUntil)}
            </p>
          )}
        </section>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Quote form — for sent/viewed RFQs
// ---------------------------------------------------------------------------

function QuoteForm({ rfq }: { rfq: SupplierRfqDetail }) {
  const { t } = useT();
  const router = useRouter();

  const isRequoting = rfq.status === "quoted";
  const [lines, setLines] = React.useState<LineState[]>(() =>
    initLineState(rfq.items, rfq.quoteLines),
  );
  const [quoteNotes, setQuoteNotes] = React.useState(rfq.quoteNotes ?? "");
  const [validUntil, setValidUntil] = React.useState(() =>
    rfq.quoteValidUntil
      ? new Date(rfq.quoteValidUntil).toISOString().slice(0, 10)
      : "",
  );
  const [submitting, setSubmitting] = React.useState(false);
  const [declining, setDeclining] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  function updateLine(
    index: number,
    field: keyof Omit<LineState, "orderItemId">,
    value: string,
  ) {
    setLines((prev) =>
      prev.map((l, i) => (i === index ? { ...l, [field]: value } : l)),
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    // Validate and convert rupees → cents
    const convertedLines = lines.map((l) => {
      const rupeesRaw = parseFloat(l.unitPriceRupees);
      const unitPriceCents = isNaN(rupeesRaw)
        ? 0
        : Math.round(rupeesRaw * 100);
      const availableQty = parseInt(l.availableQty, 10);
      const leadTimeDays =
        l.leadTimeDays.trim() !== ""
          ? parseInt(l.leadTimeDays, 10)
          : null;
      return {
        orderItemId: l.orderItemId,
        availableQty: isNaN(availableQty) ? 0 : availableQty,
        unitPrice: unitPriceCents,
        leadTimeDays: leadTimeDays != null && isNaN(leadTimeDays) ? null : leadTimeDays,
        notes: l.notes.trim() || null,
      };
    });

    setSubmitting(true);
    try {
      const result = await submitQuoteFn({
        data: {
          rfqId: rfq.id,
          lines: convertedLines,
          quoteNotes: quoteNotes.trim() || null,
          validUntil: validUntil || null,
        },
      });
      if (result.ok) {
        toast.success(t.rfqs.quoted);
        await router.invalidate();
      } else {
        setError(result.message ?? t.common.error);
      }
    } catch {
      setError(t.common.error);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDecline() {
    if (!confirm(t.rfqs.declineConfirm)) return;
    setError(null);
    setDeclining(true);
    try {
      const result = await declineRfqFn({ data: rfq.id });
      if (result.ok) {
        toast.success(t.rfqs.declined);
        await router.invalidate();
      } else {
        setError(result.message ?? t.common.error);
      }
    } catch {
      setError(t.common.error);
    } finally {
      setDeclining(false);
    }
  }

  return (
    <form onSubmit={(e) => void handleSubmit(e)} className="space-y-8">
      {/* Order items + per-line inputs */}
      <section className="space-y-3">
        <h2 className="text-lg font-semibold">{t.rfqs.itemsLabel}</h2>
        <div className="overflow-x-auto rounded-xl border border-border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="min-w-[180px]">{t.rfqs.colItemDescription}</TableHead>
                <TableHead>{t.rfqs.colQtyRequested}</TableHead>
                <TableHead className="min-w-[110px]">{t.rfqs.colAvailableQty}</TableHead>
                <TableHead className="min-w-[130px]">{t.rfqs.colUnitPrice}</TableHead>
                <TableHead className="min-w-[110px]">{t.rfqs.colLeadTime}</TableHead>
                <TableHead className="min-w-[180px]">{t.rfqs.colNotes}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rfq.items.map((item, idx) => {
                const line = lines[idx];
                if (!line) return null;
                return (
                  <TableRow key={item.id}>
                    {/* Item description */}
                    <TableCell>
                      <div className="font-medium">{item.descriptionEn}</div>
                      {item.variant && (
                        <div className="text-xs text-muted-foreground">{item.variant}</div>
                      )}
                      {item.notes && (
                        <div className="text-xs text-muted-foreground">{item.notes}</div>
                      )}
                    </TableCell>

                    {/* Qty requested — read-only */}
                    <TableCell className="text-muted-foreground">
                      {item.quantity} {item.unit}
                    </TableCell>

                    {/* Available qty */}
                    <TableCell>
                      <Input
                        type="number"
                        min="0"
                        step="1"
                        className="w-24"
                        value={line.availableQty}
                        onChange={(e) =>
                          updateLine(idx, "availableQty", e.target.value)
                        }
                        required
                      />
                    </TableCell>

                    {/* Unit price (rupees) */}
                    <TableCell>
                      <Input
                        type="number"
                        min="0"
                        step="0.01"
                        className="w-28"
                        placeholder={t.rfqs.unitPricePlaceholder}
                        value={line.unitPriceRupees}
                        onChange={(e) =>
                          updateLine(idx, "unitPriceRupees", e.target.value)
                        }
                        required
                      />
                    </TableCell>

                    {/* Lead time (days) */}
                    <TableCell>
                      <Input
                        type="number"
                        min="0"
                        step="1"
                        className="w-24"
                        value={line.leadTimeDays}
                        onChange={(e) =>
                          updateLine(idx, "leadTimeDays", e.target.value)
                        }
                      />
                    </TableCell>

                    {/* Notes */}
                    <TableCell>
                      <Input
                        type="text"
                        className="w-44"
                        value={line.notes}
                        onChange={(e) =>
                          updateLine(idx, "notes", e.target.value)
                        }
                      />
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </section>

      {/* Overall notes + validity */}
      <section className="space-y-4">
        <h2 className="text-lg font-semibold">{t.rfqs.quoteSection}</h2>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="quoteNotes">{t.rfqs.notesLabel}</Label>
            <Textarea
              id="quoteNotes"
              value={quoteNotes}
              onChange={(e) => setQuoteNotes(e.target.value)}
              placeholder={t.rfqs.notesPlaceholder}
              rows={3}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="validUntil">{t.rfqs.validUntilLabel}</Label>
            <Input
              id="validUntil"
              type="date"
              value={validUntil}
              onChange={(e) => setValidUntil(e.target.value)}
            />
          </div>
        </div>
      </section>

      {/* Error */}
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* Actions */}
      <div className="flex flex-wrap gap-3">
        <Button type="submit" variant="brand" disabled={submitting || declining}>
          {submitting ? (
            <>
              <Loader2 className="mr-2 size-4 animate-spin" />
              {t.rfqs.submittingQuote}
            </>
          ) : isRequoting ? (
            t.rfqs.updateQuote
          ) : (
            t.rfqs.submitQuote
          )}
        </Button>

        {/* Declining is only possible before a quote exists — the server
            rejects declineRfq once the RFQ is 'quoted'. */}
        {!isRequoting && (
          <Button
            type="button"
            variant="outline"
            disabled={submitting || declining}
            onClick={() => void handleDecline()}
          >
            {declining ? (
              <>
                <Loader2 className="mr-2 size-4 animate-spin" />
                {t.rfqs.decliningRfq}
              </>
            ) : (
              t.rfqs.declineRfq
            )}
          </Button>
        )}
      </div>
    </form>
  );
}
