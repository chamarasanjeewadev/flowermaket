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
import { askQuestionFn } from "../server/portal";
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
  const { t, locale } = useT();
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
    (rfq.status === "sent" || rfq.status === "viewed" || rfq.status === "quoted") && (!rfq.expiresAt || new Date(rfq.expiresAt) > new Date());
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

      <Alert><AlertDescription>{locale === "si" ? "මෙය මිල ඉල්ලීමකි. FlowerMarket ඇණවුම තහවුරු කරන තෙක් මල් සකස් කිරීම ආරම්භ නොකරන්න." : "This is an enquiry, not a confirmed order. FlowerMarket reviews your quote and confirms whether work is assigned to you. Do not start preparing flowers yet."}</AlertDescription></Alert>
      <dl className="grid gap-3 rounded-xl border border-border p-4 text-sm sm:grid-cols-3">
        <div><dt className="text-muted-foreground">{locale === "si" ? "අවශ්‍ය දිනය" : "Required date"}</dt><dd>{rfq.neededByDate ?? "—"}</dd></div>
        <div><dt className="text-muted-foreground">{locale === "si" ? "බෙදාහැරීමේ ප්‍රදේශය" : "Delivery area"}</dt><dd>{rfq.deliveryArea ?? "—"}</dd></div>
        <div><dt className="text-muted-foreground">{locale === "si" ? "ප්‍රතිචාර අවසාන දිනය" : "Response deadline"}</dt><dd>{formatDate(rfq.expiresAt)}</dd></div>
      </dl>
      {!!rfq.revisions?.length && <details className="rounded-xl border border-border p-4"><summary className="cursor-pointer py-2">{locale === "si" ? "මිල යෝජනා ඉතිහාසය" : "Quote revision history"} ({rfq.revisions.length})</summary>{rfq.revisions.map((revision, i) => <div key={revision.submittedAt} className="mt-3 border-t border-border pt-3 text-sm"><p>#{i + 1} · {formatDate(revision.submittedAt)} · {formatRupees(revision.lines.reduce((sum, line) => sum + line.availableQty * line.unitPrice, revision.deliveryCost))}</p><p>{revision.notes}</p></div>)}</details>}
      {!!rfq.questions?.length && <section className="rounded-xl border border-border p-4 text-sm"><h2 className="font-semibold">{locale === "si" ? "FlowerMarket වෙත ප්‍රශ්න" : "Questions for FlowerMarket"}</h2>{rfq.questions.map(question => <p key={question.createdAt} className="mt-2">{question.text}</p>)}</section>}
      {rfq.customerNotes && <Alert><AlertDescription>{rfq.customerNotes}</AlertDescription></Alert>}
      {/* Admin message if any */}
      {rfq.message && (
        <Alert>
          <AlertDescription>{rfq.message}</AlertDescription>
        </Alert>
      )}

      {rfq.orderStatus === "cancelled" && <Alert variant="destructive"><AlertDescription>{locale === "si" ? "පාරිභෝගික ඉල්ලීම අවලංගු කර ඇත." : "The customer enquiry has been cancelled. Quotes are closed."}</AlertDescription></Alert>}
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
        <QuoteForm key={rfq.id} rfq={rfq} />
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
  const { t, locale } = useT();
  const router = useRouter();

  const isRequoting = rfq.status === "quoted";
  const [lines, setLines] = React.useState<LineState[]>(() =>
    initLineState(rfq.items, rfq.quoteLines),
  );
  const [deliveryCost, setDeliveryCost] = React.useState(String((rfq.deliveryCost ?? 0) / 100));
  const [question, setQuestion] = React.useState("");
  const [asking, setAsking] = React.useState(false);
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
    if (submitting || declining || asking) return;
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
          validUntil: validUntil ? `${validUntil}T23:59:59+05:30` : null,
          deliveryCost: Math.round(Number(deliveryCost) * 100),
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
        <div className="space-y-4">
          {rfq.items.map((item, idx) => {
            const line = lines[idx]; if (!line) return null;
            const fields = [
              { field: "availableQty", label: t.rfqs.colAvailableQty, type: "number", step: "1", required: true },
              { field: "unitPriceRupees", label: t.rfqs.colUnitPrice, type: "number", step: "0.01", required: true },
              { field: "leadTimeDays", label: t.rfqs.colLeadTime, type: "number", step: "1", required: false },
              { field: "notes", label: t.rfqs.colNotes, type: "text", required: false },
            ] as const;
            return <article key={item.id} className="rounded-xl border border-border bg-card p-4">
              <h3 className="font-semibold">{item.descriptionEn} {item.variant && `· ${item.variant}`}</h3>
              <p className="mt-1 text-sm text-muted-foreground">{t.rfqs.colQtyRequested}: {item.quantity} {item.unit} {item.notes && `· ${item.notes}`}</p>
              <div className="mt-4 grid gap-4 sm:grid-cols-2">{fields.map(field => <div key={field.field} className="space-y-2"><Label htmlFor={`${item.id}-${field.field}`}>{field.label}</Label><Input id={`${item.id}-${field.field}`} className="min-h-11" type={field.type} min={field.type === "number" ? 0 : undefined} step={"step" in field ? field.step : undefined} required={field.required} value={line[field.field]} onChange={e => updateLine(idx, field.field, e.target.value)} /></div>)}</div>
            </article>;
          })}
        </div>
      </section>

      {/* Overall notes + validity */}
      <section className="space-y-4">
        <h2 className="text-lg font-semibold">{t.rfqs.quoteSection}</h2>

        <div className="space-y-2"><Label htmlFor="delivery-cost">{locale === "si" ? "බෙදාහැරීමේ මිල (රු.)" : "Delivery cost (LKR), if you offer delivery"}</Label><Input id="delivery-cost" type="number" min="0" step="0.01" required value={deliveryCost} onChange={e => setDeliveryCost(e.target.value)} /><p className="text-sm text-muted-foreground">{locale === "si" ? "බෙදාහැරීම පිළිබඳ විස්තර සටහන් කරන්න." : "State delivery or collection arrangements in your notes. FlowerMarket must confirm responsibility."}</p></div>
        <p className="text-sm text-muted-foreground">{locale === "si" ? "මෙය ඔබේ සැපයුම් මිලයි. පාරිභෝගික මිල FlowerMarket තීරණය කරයි. ගෙවීම් කොන්දේසි වෙනම තහවුරු කළ යුතුයි." : "These are your supply prices to FlowerMarket. FlowerMarket sets the customer offer; payment and settlement terms require separate confirmation."}</p>
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

      <section className="space-y-2 rounded-xl border border-border p-4">
        <Label htmlFor="supplier-question">{locale === "si" ? "FlowerMarket වෙත ප්‍රශ්නයක්" : "Ask FlowerMarket a question"}</Label>
        <Textarea id="supplier-question" maxLength={2000} value={question} onChange={e => setQuestion(e.target.value)} />
        <Button type="button" variant="outline" disabled={asking || submitting || declining || !question.trim()} onClick={() => {
          setAsking(true); setError(null);
          void askQuestionFn({ data: { rfqId: rfq.id, text: question } }).then(async result => { if (!result.ok) setError(result.message); else { setQuestion(""); await router.invalidate(); } }).catch(() => setError(t.common.error)).finally(() => setAsking(false));
        }}>{locale === "si" ? "ප්‍රශ්නය යවන්න" : "Send question"}</Button>
      </section>
      {/* Error */}
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* Actions */}
      <div className="sticky bottom-0 flex flex-wrap gap-3 border-t border-border bg-background py-4">
        <Button type="submit" variant="brand" disabled={submitting || declining || asking}>
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
            disabled={submitting || declining || asking}
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
