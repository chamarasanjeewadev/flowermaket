import { useState } from "react";
import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { EmptyState } from "@flowers/ui/components/empty-state";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@flowers/ui/components/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@flowers/ui/components/table";
import { Badge } from "@flowers/ui/components/badge";
import { Button } from "@flowers/ui/components/button";
import { Checkbox } from "@flowers/ui/components/checkbox";
import { Input } from "@flowers/ui/components/input";
import {
  AlertCircle,
  Check,
  ClipboardCopy,
  Download,
  FileText,
  InboxIcon,
  Loader2,
  Package,
  Search,
  Send,
  Trophy,
  X,
} from "lucide-react";
import {
  getOrderFn,
  matchSuppliersFn,
  sendRfqsFn,
  resendRfqNudgeFn,
  createAwardFn,
  cancelAwardFn,
  createDocumentFn,
  issueDocumentFn,
  acceptDocumentFn,
  sendDocumentFn,
  markPaidFn,
} from "../server/orders";
import type { DispatchResult } from "../server/orders";
import { StatusBadge } from "../components/order-status-badge";
import { formatDate, formatDateTime } from "../lib/format";
import { formatRupees } from "@flowers/api/money";
import { documentTotals, applyMargin } from "@flowers/api/pricing";
import type {
  MatchedSupplier,
  OrderDetail,
  OrderDocumentDetail,
  OrderItemDetail,
  OrderItemAwardDetail,
  RfqDetail,
} from "@flowers/api";

// ---------------------------------------------------------------------------
// Route
// ---------------------------------------------------------------------------

export const Route = createFileRoute("/orders/$orderId")({
  loader: async ({ params }) => {
    const result = await getOrderFn({ data: params.orderId });
    if (!result.ok) {
      throw notFound();
    }
    return { order: result.data };
  },
  notFoundComponent: OrderNotFound,
  component: OrderDetailPage,
});

// ---------------------------------------------------------------------------
// Detail field
// ---------------------------------------------------------------------------

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="space-y-0.5">
      <dt className="text-xs font-medium text-muted-foreground">{label}</dt>
      <dd className="text-sm">{value ?? "—"}</dd>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Not found fallback
// ---------------------------------------------------------------------------

function OrderNotFound() {
  return (
    <div className="space-y-4">
      <Link to="/orders" className="text-sm text-muted-foreground hover:text-foreground">
        Back to orders
      </Link>
      <EmptyState
        icon={<Package />}
        title="Order not found"
        description="This order does not exist or you do not have permission to view it."
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sourcing panel (Task 12)
// ---------------------------------------------------------------------------

interface SourcingPanelProps {
  orderId: string;
  rfqs: OrderDetail["rfqs"];
}

function SourcingPanel({ orderId, rfqs }: SourcingPanelProps) {
  const [matched, setMatched] = useState<MatchedSupplier[] | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [matchLoading, setMatchLoading] = useState(false);
  const [matchError, setMatchError] = useState<string | null>(null);

  const [dispatchLoading, setDispatchLoading] = useState(false);
  const [dispatchResults, setDispatchResults] = useState<DispatchResult[] | null>(null);
  const [dispatchError, setDispatchError] = useState<string | null>(null);

  // Re-read RFQs from loader data but allow the panel to show new state after
  // a successful send.  We track created RFQ IDs locally post-dispatch.
  const [localRfqs, setLocalRfqs] = useState<OrderDetail["rfqs"]>(rfqs);

  const [resendingRfqId, setResendingRfqId] = useState<string | null>(null);
  const [resendNotes, setResendNotes] = useState<Record<string, string>>({});

  async function handleResendNudge(rfqId: string) {
    setResendingRfqId(rfqId);
    setResendNotes((prev) => ({ ...prev, [rfqId]: "" }));
    try {
      const result = await resendRfqNudgeFn({ data: { orderId, rfqId } });
      const note = !result.ok
        ? result.message
        : result.data.sent
          ? "Nudge sent."
          : `Send failed: ${result.data.error ?? "unknown error"}`;
      setResendNotes((prev) => ({ ...prev, [rfqId]: note }));
    } finally {
      setResendingRfqId(null);
    }
  }

  async function handleFindGrowers() {
    setMatchLoading(true);
    setMatchError(null);
    setMatched(null);
    setSelected(new Set());
    setDispatchResults(null);

    const result = await matchSuppliersFn({ data: orderId });
    setMatchLoading(false);

    if (!result.ok) {
      setMatchError(result.message);
      return;
    }
    setMatched(result.data);
  }

  function toggleSelect(shopId: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(shopId)) {
        next.delete(shopId);
      } else {
        next.add(shopId);
      }
      return next;
    });
  }

  function toggleAll() {
    if (!matched) return;
    if (selected.size === matched.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(matched.map((s) => s.shopId)));
    }
  }

  async function handleSendRfqs() {
    if (!matched || selected.size === 0) return;
    setDispatchLoading(true);
    setDispatchError(null);
    setDispatchResults(null);

    const result = await sendRfqsFn({
      data: {
        orderId,
        supplierShopIds: Array.from(selected),
      },
    });

    setDispatchLoading(false);

    if (!result.ok) {
      setDispatchError(result.message);
      return;
    }

    setDispatchResults(result.data.dispatch);

    // Optimistically append created RFQs to the local list so the table
    // updates without a full page reload.  We build synthetic rows from the
    // dispatch results (supplierShopId + shopName) — the real rows will be
    // hydrated on next navigation.
    if (result.data.created.length > 0 && result.data.dispatch.length > 0) {
      const now = new Date();
      // Pair each created rfqId with its dispatch entry by index — createRfqs
      // returns IDs in insertion order matching the supplierShopIds array.
      const newRfqs: OrderDetail["rfqs"] = result.data.created.map(
        (rfqId, i) => {
          const dr = result.data.dispatch[i];
          return {
            id: rfqId,
            supplierShopId: dr?.supplierShopId ?? rfqId,
            supplierShopName: dr?.shopName ?? null,
            status: "sent",
            message: null,
            quoteNotes: null,
            quoteValidUntil: null,
            sentAt: now,
            viewedAt: null,
            respondedAt: null,
            expiresAt: null,
            createdAt: now,
            updatedAt: now,
            quoteLines: [],
          };
        },
      );
      setLocalRfqs((prev) => [...prev, ...newRfqs]);
    }

    // Clear matched list after sending so the panel stays clean.
    setMatched(null);
    setSelected(new Set());
  }

  return (
    <div className="space-y-4">
      {/* Existing RFQs */}
      {localRfqs.length > 0 ? (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Supplier</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Sent</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {localRfqs.map((rfq) => (
              <TableRow key={rfq.id}>
                <TableCell>
                  {rfq.supplierShopName ? (
                    <span title={rfq.supplierShopId}>{rfq.supplierShopName}</span>
                  ) : (
                    <span className="font-mono text-xs">{rfq.supplierShopId}</span>
                  )}
                </TableCell>
                <TableCell>
                  <Badge variant="outline" className="text-xs capitalize">
                    {rfq.status}
                  </Badge>
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {rfq.sentAt ? formatDateTime(rfq.sentAt) : "—"}
                </TableCell>
                <TableCell className="text-right">
                  {(rfq.status === "sent" || rfq.status === "viewed") && (
                    <div className="flex flex-col items-end gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => void handleResendNudge(rfq.id)}
                        disabled={resendingRfqId === rfq.id}
                      >
                        {resendingRfqId === rfq.id ? (
                          <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                        ) : null}
                        Resend nudge
                      </Button>
                      {resendNotes[rfq.id] ? (
                        <span className="text-xs text-muted-foreground">
                          {resendNotes[rfq.id]}
                        </span>
                      ) : null}
                    </div>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      ) : (
        !matched && (
          <EmptyState
            icon={<InboxIcon />}
            title="No RFQs yet"
            description="Request-for-quotes sent to suppliers will appear here once sourcing begins."
          />
        )
      )}

      {/* Find rose growers button */}
      {!matched && (
        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            size="sm"
            onClick={handleFindGrowers}
            disabled={matchLoading}
          >
            {matchLoading ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Search className="mr-2 h-4 w-4" />
            )}
            Find rose growers
          </Button>
          {matchError && (
            <p className="text-sm text-destructive">{matchError}</p>
          )}
        </div>
      )}

      {/* Matched suppliers checklist */}
      {matched && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              {matched.length === 0
                ? "No matching growers found for this order's categories."
                : `${matched.length} grower${matched.length > 1 ? "s" : ""} matched`}
            </p>
            {matched.length > 0 && (
              <button
                type="button"
                onClick={toggleAll}
                className="text-xs text-muted-foreground hover:text-foreground underline"
              >
                {selected.size === matched.length ? "Deselect all" : "Select all"}
              </button>
            )}
          </div>

          {matched.length > 0 && (
            <div className="rounded-md border divide-y">
              {matched.map((supplier) => (
                <label
                  key={supplier.shopId}
                  className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-muted/40"
                >
                  <Checkbox
                    checked={selected.has(supplier.shopId)}
                    onCheckedChange={() => toggleSelect(supplier.shopId)}
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium">{supplier.nameEn}</p>
                    <p className="text-xs text-muted-foreground">{supplier.district}</p>
                  </div>
                </label>
              ))}
            </div>
          )}

          {/* Send RFQs button */}
          {matched.length > 0 && (
            <div className="flex items-center gap-3 flex-wrap">
              <Button
                size="sm"
                onClick={handleSendRfqs}
                disabled={selected.size === 0 || dispatchLoading}
              >
                {dispatchLoading ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Send className="mr-2 h-4 w-4" />
                )}
                Send RFQs ({selected.size})
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setMatched(null);
                  setSelected(new Set());
                  setDispatchResults(null);
                  setDispatchError(null);
                }}
              >
                Cancel
              </Button>
              {dispatchError && (
                <p className="text-sm text-destructive">{dispatchError}</p>
              )}
            </div>
          )}
        </div>
      )}

      {/* Dispatch results */}
      {dispatchResults && dispatchResults.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-sm font-medium">WhatsApp dispatch results</p>
          <div className="rounded-md border divide-y text-sm">
            {dispatchResults.map((dr) => (
              <div key={dr.supplierShopId} className="flex items-start gap-3 px-4 py-2.5">
                <span
                  className={
                    dr.sent
                      ? "text-green-600 font-medium"
                      : "text-destructive font-medium"
                  }
                >
                  {dr.sent ? "Sent" : "Failed"}
                </span>
                <div className="flex-1 min-w-0">
                  <p>{dr.shopName}</p>
                  {!dr.sent && dr.error && (
                    <p className="text-xs text-muted-foreground">{dr.error}</p>
                  )}
                </div>
              </div>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">
            RFQs were created even for failed WhatsApp nudges — suppliers can
            still access them via the portal.
          </p>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Awards panel helpers — pure client-side math
// ---------------------------------------------------------------------------

/**
 * Sum of non-cancelled awardedQty for a given orderItemId.
 * Mirrors the logic in `remainingQty` from the repo, computed from loader data
 * so we never import a server-only value in client code.
 */
function consumedQty(
  itemId: string,
  awards: OrderItemAwardDetail[],
): number {
  return awards
    .filter((a) => a.orderItemId === itemId && a.status !== "cancelled")
    .reduce((sum, a) => sum + a.awardedQty, 0);
}

// ---------------------------------------------------------------------------
// AwardRow — single item in the awards list with a cancel button
// ---------------------------------------------------------------------------

interface AwardRowProps {
  award: OrderItemAwardDetail;
  supplierLabel: string;
  onCancel: (awardId: string) => Promise<void>;
  cancelling: boolean;
}

function AwardRow({ award, supplierLabel, onCancel, cancelling }: AwardRowProps) {
  const isCancelled = award.status === "cancelled";
  return (
    <TableRow className={isCancelled ? "opacity-50" : undefined}>
      <TableCell className="text-sm font-medium">{supplierLabel}</TableCell>
      <TableCell className="font-mono text-sm text-right">{award.awardedQty}</TableCell>
      <TableCell className="text-sm">{formatRupees(award.unitCost)}</TableCell>
      <TableCell className="text-sm font-medium">
        {isCancelled ? "—" : formatRupees(award.awardedQty * award.unitCost)}
      </TableCell>
      <TableCell>
        <Badge
          variant={
            isCancelled
              ? "secondary"
              : award.status === "confirmed"
                ? "default"
                : "outline"
          }
          className="text-xs capitalize"
        >
          {award.status}
        </Badge>
      </TableCell>
      <TableCell>
        {!isCancelled && (
          <Button
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-destructive hover:text-destructive"
            onClick={() => onCancel(award.id)}
            disabled={cancelling}
          >
            {cancelling ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <X className="h-3.5 w-3.5" />
            )}
          </Button>
        )}
      </TableCell>
    </TableRow>
  );
}

// ---------------------------------------------------------------------------
// AwardForm — per-item award control
// ---------------------------------------------------------------------------

interface QuoteCellInfo {
  rfqId: string;
  supplierShopId: string;
  quoteLineId: string;
  availableQty: number;
  unitPrice: number;
  leadTimeDays: number | null;
  supplierLabel: string;
}

interface AwardFormProps {
  item: OrderItemDetail;
  quoteCells: QuoteCellInfo[];
  remaining: number;
  onAward: (
    itemId: string,
    cell: QuoteCellInfo,
    qty: number,
  ) => Promise<string | null>;
}

function AwardForm({ item, quoteCells, remaining, onAward }: AwardFormProps) {
  const [selectedLineId, setSelectedLineId] = useState<string>("");
  const [qty, setQty] = useState<string>("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (quoteCells.length === 0 || remaining <= 0) return null;

  const selectedCell = quoteCells.find((c) => c.quoteLineId === selectedLineId) ?? null;
  const parsedQty = parseInt(qty, 10);
  const isValidQty =
    Number.isInteger(parsedQty) && parsedQty > 0 && parsedQty <= remaining;
  const canSubmit = selectedCell !== null && isValidQty && !submitting;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit || !selectedCell) return;
    setSubmitting(true);
    setError(null);
    const errMsg = await onAward(item.id, selectedCell, parsedQty);
    setSubmitting(false);
    if (errMsg) {
      setError(errMsg);
    } else {
      setQty("");
      setSelectedLineId("");
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-2 pt-2">
      <div className="flex items-center gap-2 flex-wrap">
        {/* Supplier / quote-line selector */}
        <select
          className="rounded-md border border-input bg-background px-2 py-1.5 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring min-w-[180px]"
          value={selectedLineId}
          onChange={(e) => setSelectedLineId(e.target.value)}
        >
          <option value="">Select supplier…</option>
          {quoteCells.map((cell) => (
            <option key={cell.quoteLineId} value={cell.quoteLineId}>
              {cell.supplierLabel} — {formatRupees(cell.unitPrice)} / unit
              {cell.leadTimeDays != null ? ` (${cell.leadTimeDays}d)` : ""}
            </option>
          ))}
        </select>

        {/* Qty input */}
        <Input
          type="number"
          min={1}
          max={remaining}
          className="w-24 h-9"
          placeholder="Qty"
          value={qty}
          onChange={(e) => setQty(e.target.value)}
        />

        {/* Preview cost */}
        {selectedCell && isValidQty && (
          <span className="text-sm text-muted-foreground">
            = {formatRupees(selectedCell.unitPrice * parsedQty)}
          </span>
        )}

        <Button type="submit" size="sm" disabled={!canSubmit}>
          {submitting ? (
            <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
          ) : (
            <Trophy className="mr-1.5 h-3.5 w-3.5" />
          )}
          Award
        </Button>
      </div>
      {error && (
        <div className="flex items-start gap-1.5 text-sm text-destructive">
          <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}
    </form>
  );
}

// ---------------------------------------------------------------------------
// Awards panel (Task 15)
// ---------------------------------------------------------------------------

interface AwardsPanelProps {
  order: OrderDetail;
}

function AwardsPanel({ order }: AwardsPanelProps) {
  // Local mirror of awards so we can update optimistically.
  const [awards, setAwards] = useState<OrderItemAwardDetail[]>(order.awards);
  const [cancellingId, setCancellingId] = useState<string | null>(null);

  // ---- Build a lookup: supplierShopId → English shop name ----
  // getOrder enriches each rfq and award with `supplierShopName`. We index those
  // here so award rows created optimistically (which lack the name) can still be
  // labelled. Falls back to the short UUID only if a name is somehow missing.
  const shopNameById = new Map<string, string>();
  for (const rfq of order.rfqs) {
    if (rfq.supplierShopName) shopNameById.set(rfq.supplierShopId, rfq.supplierShopName);
  }
  for (const award of order.awards) {
    if (award.supplierShopName) shopNameById.set(award.supplierShopId, award.supplierShopName);
  }

  function supplierLabel(shopId: string): string {
    return shopNameById.get(shopId) ?? shopId.slice(0, 8);
  }

  // ---- Build quote-cell index per item ----
  // For each order item, collect all supplier quote lines that mention that item.
  function quoteCellsForItem(itemId: string): QuoteCellInfo[] {
    const cells: QuoteCellInfo[] = [];
    for (const rfq of order.rfqs) {
      for (const ql of rfq.quoteLines) {
        if (ql.orderItemId === itemId) {
          cells.push({
            rfqId: rfq.id,
            supplierShopId: rfq.supplierShopId,
            quoteLineId: ql.id,
            availableQty: ql.availableQty,
            unitPrice: ql.unitPrice,
            leadTimeDays: ql.leadTimeDays,
            supplierLabel: supplierLabel(rfq.supplierShopId),
          });
        }
      }
    }
    return cells;
  }

  // ---- All suppliers that responded (have at least one quote line) ----
  const respondingRfqs: RfqDetail[] = order.rfqs.filter(
    (rfq) => rfq.quoteLines.length > 0,
  );

  // ---- Award handler ----
  async function handleAward(
    itemId: string,
    cell: QuoteCellInfo,
    qty: number,
  ): Promise<string | null> {
    const result = await createAwardFn({
      data: {
        orderItemId: itemId,
        supplierShopId: cell.supplierShopId,
        rfqQuoteLineId: cell.quoteLineId,
        awardedQty: qty,
        unitCost: cell.unitPrice,
        notes: null,
      },
    });

    if (!result.ok) {
      return result.message;
    }

    // Optimistic update: append the new award to local state.
    const now = new Date();
    const newAward: OrderItemAwardDetail = {
      id: result.data.id,
      orderItemId: itemId,
      supplierShopId: cell.supplierShopId,
      supplierShopName: shopNameById.get(cell.supplierShopId) ?? null,
      rfqQuoteLineId: cell.quoteLineId,
      awardedQty: qty,
      unitCost: cell.unitPrice,
      status: "pending",
      notes: null,
      createdAt: now,
      updatedAt: now,
    };
    setAwards((prev) => [...prev, newAward]);
    return null;
  }

  // ---- Cancel handler ----
  async function handleCancel(awardId: string) {
    setCancellingId(awardId);
    const result = await cancelAwardFn({ data: awardId });
    setCancellingId(null);

    if (!result.ok) {
      // Surface error — in a real app we'd show a toast; here a simple alert
      // keeps it self-contained.
      // eslint-disable-next-line no-alert
      alert(`Cancel failed: ${result.message}`);
      return;
    }

    // Optimistic update: mark award as cancelled in local state.
    setAwards((prev) =>
      prev.map((a) =>
        a.id === awardId ? { ...a, status: "cancelled", updatedAt: new Date() } : a,
      ),
    );
  }

  // ---- Total sourcing cost (from local awards, non-cancelled) ----
  const totalCost = awards
    .filter((a) => a.status !== "cancelled")
    .reduce((sum, a) => sum + a.awardedQty * a.unitCost, 0);

  // ---- Check if there are any responding suppliers ----
  if (respondingRfqs.length === 0) {
    return (
      <EmptyState
        icon={<Trophy />}
        title="No quotes received yet"
        description="Once suppliers respond to their RFQs with quote lines, the award matrix will appear here."
      />
    );
  }

  return (
    <div className="space-y-6">
      {/* ---- Quote comparison matrix ---- */}
      <div>
        <h3 className="text-sm font-semibold mb-3">Quote matrix</h3>
        <div className="overflow-x-auto rounded-md border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50">
                <th className="px-4 py-2 text-left font-medium text-muted-foreground">
                  Item
                </th>
                <th className="px-4 py-2 text-right font-medium text-muted-foreground">
                  Need
                </th>
                <th className="px-4 py-2 text-right font-medium text-muted-foreground">
                  Remaining
                </th>
                {respondingRfqs.map((rfq) => (
                  <th
                    key={rfq.id}
                    className="px-4 py-2 text-center font-medium text-muted-foreground min-w-[140px]"
                  >
                    <span title={rfq.supplierShopId} className="text-xs">
                      {supplierLabel(rfq.supplierShopId)}
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y">
              {order.items.map((item) => {
                const consumed = consumedQty(item.id, awards);
                const remaining = item.quantity - consumed;

                return (
                  <tr key={item.id}>
                    {/* Item description */}
                    <td className="px-4 py-3 align-top">
                      <p className="font-medium">{item.descriptionEn}</p>
                      {item.variant && (
                        <p className="text-xs text-muted-foreground">{item.variant}</p>
                      )}
                    </td>

                    {/* Total quantity needed */}
                    <td className="px-4 py-3 text-right align-top font-mono">
                      {item.quantity} {item.unit}
                    </td>

                    {/* Live remaining */}
                    <td className="px-4 py-3 text-right align-top">
                      <span
                        className={
                          remaining <= 0
                            ? "text-green-600 font-semibold font-mono"
                            : remaining < item.quantity
                              ? "text-amber-600 font-medium font-mono"
                              : "font-mono text-muted-foreground"
                        }
                      >
                        {remaining <= 0 ? "Fully awarded" : `${remaining} remaining`}
                      </span>
                    </td>

                    {/* One column per responding supplier */}
                    {respondingRfqs.map((rfq) => {
                      const ql = rfq.quoteLines.find(
                        (l) => l.orderItemId === item.id,
                      );
                      if (!ql) {
                        return (
                          <td
                            key={rfq.id}
                            className="px-4 py-3 text-center text-muted-foreground align-top"
                          >
                            —
                          </td>
                        );
                      }
                      return (
                        <td
                          key={rfq.id}
                          className="px-4 py-3 text-center align-top"
                        >
                          <div className="space-y-0.5">
                            <p className="font-semibold">{formatRupees(ql.unitPrice)}</p>
                            <p className="text-xs text-muted-foreground">
                              Avail: {ql.availableQty} {item.unit}
                            </p>
                            {ql.leadTimeDays != null && (
                              <p className="text-xs text-muted-foreground">
                                Lead: {ql.leadTimeDays}d
                              </p>
                            )}
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* ---- Per-item award controls ---- */}
      <div>
        <h3 className="text-sm font-semibold mb-3">Allocate awards</h3>
        <div className="space-y-4">
          {order.items.map((item) => {
            const consumed = consumedQty(item.id, awards);
            const remaining = item.quantity - consumed;
            const cells = quoteCellsForItem(item.id);
            const itemAwards = awards.filter((a) => a.orderItemId === item.id);

            return (
              <div key={item.id} className="rounded-md border p-4 space-y-3">
                {/* Item header */}
                <div className="flex items-baseline justify-between gap-3">
                  <div>
                    <span className="font-medium">{item.descriptionEn}</span>
                    {item.variant && (
                      <span className="ml-2 text-xs text-muted-foreground">
                        {item.variant}
                      </span>
                    )}
                  </div>
                  <span
                    className={[
                      "text-sm font-mono shrink-0",
                      remaining <= 0
                        ? "text-green-600 font-semibold"
                        : "text-muted-foreground",
                    ].join(" ")}
                  >
                    {remaining <= 0
                      ? `Fully awarded (${item.quantity} ${item.unit})`
                      : `${remaining} of ${item.quantity} ${item.unit} remaining`}
                  </span>
                </div>

                {/* Existing awards for this item */}
                {itemAwards.length > 0 && (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Supplier</TableHead>
                        <TableHead className="text-right">Qty</TableHead>
                        <TableHead>Unit cost</TableHead>
                        <TableHead>Line total</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead />
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {itemAwards.map((award) => (
                        <AwardRow
                          key={award.id}
                          award={award}
                          supplierLabel={supplierLabel(award.supplierShopId)}
                          onCancel={handleCancel}
                          cancelling={cancellingId === award.id}
                        />
                      ))}
                    </TableBody>
                  </Table>
                )}

                {/* Award form — only shown while there are quote lines and remaining qty */}
                {cells.length > 0 && remaining > 0 && (
                  <AwardForm
                    item={item}
                    quoteCells={cells}
                    remaining={remaining}
                    onAward={handleAward}
                  />
                )}

                {/* No quotes for this item */}
                {cells.length === 0 && (
                  <p className="text-sm text-muted-foreground">
                    No supplier quoted this item yet.
                  </p>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* ---- Order cost summary ---- */}
      {awards.some((a) => a.status !== "cancelled") && (
        <div className="rounded-md border p-4">
          <h3 className="text-sm font-semibold mb-3">Award summary</h3>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b">
                <th className="pb-2 text-left font-medium text-muted-foreground">Item</th>
                <th className="pb-2 text-right font-medium text-muted-foreground">Awarded qty</th>
                <th className="pb-2 text-right font-medium text-muted-foreground">Cost</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {order.items.map((item) => {
                const itemAwards = awards.filter(
                  (a) => a.orderItemId === item.id && a.status !== "cancelled",
                );
                if (itemAwards.length === 0) return null;
                const awardedTotal = itemAwards.reduce((s, a) => s + a.awardedQty, 0);
                const costTotal = itemAwards.reduce(
                  (s, a) => s + a.awardedQty * a.unitCost,
                  0,
                );
                return (
                  <tr key={item.id}>
                    <td className="py-2">{item.descriptionEn}</td>
                    <td className="py-2 text-right font-mono">
                      {awardedTotal} {item.unit}
                    </td>
                    <td className="py-2 text-right font-medium">
                      {formatRupees(costTotal)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="border-t">
                <td colSpan={2} className="pt-2 font-semibold">
                  Total sourcing cost
                </td>
                <td className="pt-2 text-right font-semibold text-lg">
                  {formatRupees(totalCost)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Documents panel (Task 20)
// ---------------------------------------------------------------------------

const DEFAULT_MARGIN_BPS = 2500; // 25% — matches packages/api/src/constants.ts

interface DocumentsPanelProps {
  order: OrderDetail;
}

/**
 * DocumentsPanel — full quotation / invoice / receipt lifecycle UI.
 *
 * Renders the existing documents table and the next action (create / issue /
 * accept / send / mark-paid) based on the order and document state.
 *
 * Client-safety: formatRupees and documentTotals/applyMargin are imported from
 * subpath exports (@flowers/api/money, @flowers/api/pricing). No barrel import
 * used as a value.
 */
function DocumentsPanel({ order }: DocumentsPanelProps) {
  // Local mirror of documents so we can append after create/issue without a
  // full page reload.
  const [documents, setDocuments] = useState<OrderDocumentDetail[]>(
    order.documents,
  );

  // Per-action loading/error state
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [sendResults, setSendResults] = useState<
    Record<string, { sent: boolean; error?: string }>
  >({});

  // Quotation create form state
  const [showCreateQuote, setShowCreateQuote] = useState(false);
  const [marginBps, setMarginBps] = useState<string>(
    DEFAULT_MARGIN_BPS.toString(),
  );
  const [discountStr, setDiscountStr] = useState<string>("0");
  const [deliveryFeeStr, setDeliveryFeeStr] = useState<string>("0");

  // Mark-paid form state
  const [payingDocId, setPayingDocId] = useState<string | null>(null);
  const [payMethod, setPayMethod] = useState<string>("bank_transfer");
  const [payRef, setPayRef] = useState<string>("");
  const [payError, setPayError] = useState<string | null>(null);

  // Copied token feedback
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // ---------------------------------------------------------------------------
  // Derived state helpers
  // ---------------------------------------------------------------------------

  const activeLocale = (order.customerLocale === "si" ? "si" : "en") as
    | "si"
    | "en";

  const hasQuotation = documents.some(
    (d) => d.type === "quotation" && d.status !== "void",
  );
  const acceptedQuotation = documents.find(
    (d) => d.type === "quotation" && d.status === "accepted",
  );
  const hasInvoice = documents.some(
    (d) => d.type === "invoice" && d.status !== "void",
  );
  const paidInvoice = documents.find(
    (d) => d.type === "invoice" && d.status === "paid",
  );
  const hasReceipt = documents.some(
    (d) => d.type === "receipt" && d.status !== "void",
  );

  // Live total preview for the create-quotation form
  const marginParsed = Math.max(
    0,
    Math.min(50000, parseInt(marginBps, 10) || 0),
  );
  const discountCents = Math.max(0, parseInt(discountStr, 10) || 0) * 100;
  const deliveryFeeCents =
    Math.max(0, parseInt(deliveryFeeStr, 10) || 0) * 100;

  // Build synthetic line items for preview using awards available on the
  // client. Group by orderItemId, derive a weighted-average unit cost per item,
  // then apply margin once per item — matching the server-side rollup in
  // buildDocumentDraft. The actual total is computed server-side; this is an
  // approximation that aligns when no per-line overrides are set.
  const activeAwards = order.awards.filter((a) => a.status !== "cancelled");
  const itemCostMap = new Map<string, { totalCost: number; totalQty: number }>();
  for (const a of activeAwards) {
    const existing = itemCostMap.get(a.orderItemId) ?? { totalCost: 0, totalQty: 0 };
    existing.totalCost += a.awardedQty * a.unitCost;
    existing.totalQty += a.awardedQty;
    itemCostMap.set(a.orderItemId, existing);
  }
  const previewLines = Array.from(itemCostMap.values()).map(({ totalCost, totalQty }) => {
    const perUnit = totalQty > 0 ? Math.round(totalCost / totalQty) : 0;
    return { qty: totalQty, unitPrice: applyMargin(perUnit, marginParsed) };
  });
  const previewTotals = documentTotals(previewLines, {
    discount: discountCents,
    deliveryFee: deliveryFeeCents,
  });
  const hasAwards = order.awards.some((a) => a.status !== "cancelled");
  const previewNote = hasAwards
    ? `Est. customer total: ${formatRupees(previewTotals.total)} (margin ${((marginParsed / 10000) * 100).toFixed(1)}%${discountCents > 0 ? `, discount ${formatRupees(discountCents)}` : ""}${deliveryFeeCents > 0 ? `, delivery ${formatRupees(deliveryFeeCents)}` : ""})`
    : `No active awards yet — total computed after sourcing (margin ${((marginParsed / 10000) * 100).toFixed(1)}%)`;

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  function buildDocUrl(doc: OrderDocumentDetail): string {
    // The public token is only useful after issue; drafts have a "draft_" prefix.
    return `/${activeLocale}/d/${doc.publicToken}`;
  }

  async function copyLink(doc: OrderDocumentDetail) {
    const url = buildDocUrl(doc);
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      // Clipboard denied — silently ignore; users can still see the URL.
    }
    setCopiedId(doc.id);
    setTimeout(() => setCopiedId(null), 2000);
  }

  // ---------------------------------------------------------------------------
  // Actions
  // ---------------------------------------------------------------------------

  async function handleCreateQuotation() {
    setCreating(true);
    setCreateError(null);
    const result = await createDocumentFn({
      data: {
        orderId: order.id,
        type: "quotation",
        marginBps: marginParsed,
        discount: discountCents,
        deliveryFee: deliveryFeeCents,
      },
    });
    setCreating(false);
    if (!result.ok) {
      setCreateError(result.message);
      return;
    }
    setDocuments((prev) => [
      ...prev,
      {
        id: result.data.id,
        type: result.data.type,
        docNo: result.data.docNo,
        status: result.data.status,
        total: result.data.total,
        publicToken: result.data.publicToken,
        issuedAt: result.data.issuedAt,
        paidAt: result.data.paidAt,
        createdAt: result.data.createdAt,
        updatedAt: result.data.updatedAt,
      },
    ]);
    setShowCreateQuote(false);
    setMarginBps(DEFAULT_MARGIN_BPS.toString());
    setDiscountStr("0");
    setDeliveryFeeStr("0");
  }

  async function handleCreateInvoice() {
    setActionLoading("create_invoice");
    setActionError(null);
    const result = await createDocumentFn({
      data: { orderId: order.id, type: "invoice" },
    });
    setActionLoading(null);
    if (!result.ok) {
      setActionError(result.message);
      return;
    }
    setDocuments((prev) => [
      ...prev,
      {
        id: result.data.id,
        type: result.data.type,
        docNo: result.data.docNo,
        status: result.data.status,
        total: result.data.total,
        publicToken: result.data.publicToken,
        issuedAt: result.data.issuedAt,
        paidAt: result.data.paidAt,
        createdAt: result.data.createdAt,
        updatedAt: result.data.updatedAt,
      },
    ]);
  }

  async function handleCreateReceipt() {
    setActionLoading("create_receipt");
    setActionError(null);
    const result = await createDocumentFn({
      data: { orderId: order.id, type: "receipt" },
    });
    setActionLoading(null);
    if (!result.ok) {
      setActionError(result.message);
      return;
    }
    setDocuments((prev) => [
      ...prev,
      {
        id: result.data.id,
        type: result.data.type,
        docNo: result.data.docNo,
        status: result.data.status,
        total: result.data.total,
        publicToken: result.data.publicToken,
        issuedAt: result.data.issuedAt,
        paidAt: result.data.paidAt,
        createdAt: result.data.createdAt,
        updatedAt: result.data.updatedAt,
      },
    ]);
  }

  async function handleIssueDocument(doc: OrderDocumentDetail) {
    setActionLoading(`issue_${doc.id}`);
    setActionError(null);
    const result = await issueDocumentFn({
      data: {
        docId: doc.id,
        orderId: order.id,
        type: doc.type as "quotation" | "invoice" | "receipt",
      },
    });
    setActionLoading(null);
    if (!result.ok) {
      setActionError(result.message);
      return;
    }
    setDocuments((prev) =>
      prev.map((d) =>
        d.id === doc.id
          ? {
              ...d,
              docNo: result.data.docNo,
              publicToken: result.data.token,
              status: "sent",
              issuedAt: new Date(),
              updatedAt: new Date(),
            }
          : d,
      ),
    );
  }

  async function handleAcceptDocument(doc: OrderDocumentDetail) {
    setActionLoading(`accept_${doc.id}`);
    setActionError(null);
    const result = await acceptDocumentFn({
      data: { docId: doc.id, orderId: order.id },
    });
    setActionLoading(null);
    if (!result.ok) {
      setActionError(result.message);
      return;
    }
    setDocuments((prev) =>
      prev.map((d) =>
        d.id === doc.id
          ? { ...d, status: "accepted", updatedAt: new Date() }
          : d,
      ),
    );
  }

  async function handleSendDocument(doc: OrderDocumentDetail) {
    setActionLoading(`send_${doc.id}`);
    const result = await sendDocumentFn({
      data: {
        docId: doc.id,
        orderId: order.id,
        type: doc.type as "quotation" | "invoice" | "receipt",
        docNo: doc.docNo,
        publicToken: doc.publicToken,
        customerLocale: order.customerLocale,
        customerPhone: order.customerPhone,
      },
    });
    setActionLoading(null);
    if (result.ok) {
      setSendResults((prev) => ({ ...prev, [doc.id]: result.data }));
    } else {
      setSendResults((prev) => ({
        ...prev,
        [doc.id]: { sent: false, error: result.message },
      }));
    }
  }

  async function handleMarkPaid(doc: OrderDocumentDetail) {
    if (!payRef.trim()) {
      setPayError("Payment reference is required.");
      return;
    }
    setActionLoading(`pay_${doc.id}`);
    setPayError(null);
    const result = await markPaidFn({
      data: {
        docId: doc.id,
        orderId: order.id,
        method: payMethod,
        ref: payRef.trim(),
      },
    });
    setActionLoading(null);
    if (!result.ok) {
      setPayError(result.message);
      return;
    }
    setDocuments((prev) =>
      prev.map((d) =>
        d.id === doc.id
          ? { ...d, status: "paid", paidAt: new Date(), updatedAt: new Date() }
          : d,
      ),
    );
    setPayingDocId(null);
    setPayMethod("bank_transfer");
    setPayRef("");
  }

  // ---------------------------------------------------------------------------
  // Render helpers
  // ---------------------------------------------------------------------------

  function docTypeBadge(type: string) {
    const labels: Record<string, string> = {
      quotation: "Quotation",
      invoice: "Invoice",
      receipt: "Receipt",
    };
    return labels[type] ?? type;
  }

  function docStatusVariant(
    status: string,
  ): "default" | "secondary" | "outline" | "destructive" {
    switch (status) {
      case "draft":
        return "secondary";
      case "sent":
      case "viewed":
        return "outline";
      case "accepted":
      case "paid":
        return "default";
      case "void":
        return "destructive";
      default:
        return "secondary";
    }
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  if (documents.length === 0 && !showCreateQuote) {
    return (
      <div className="space-y-4">
        <EmptyState
          icon={<FileText />}
          title="No documents yet"
          description="Create a quotation to begin the document lifecycle."
        />
        <Button
          size="sm"
          variant="outline"
          onClick={() => setShowCreateQuote(true)}
        >
          <FileText className="mr-2 h-4 w-4" />
          Create Quotation
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* ---- Existing documents table ---- */}
      {documents.length > 0 && (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Doc #</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Total</TableHead>
              <TableHead>Issued</TableHead>
              <TableHead>Link / PDF</TableHead>
              <TableHead>Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {documents.map((doc) => {
              const isLoading =
                actionLoading === `issue_${doc.id}` ||
                actionLoading === `accept_${doc.id}` ||
                actionLoading === `send_${doc.id}` ||
                actionLoading === `pay_${doc.id}`;
              const isDraft = doc.issuedAt == null;
              const docSendResult = sendResults[doc.id];

              return (
                <TableRow
                  key={doc.id}
                  className={doc.status === "void" ? "opacity-50" : undefined}
                >
                  {/* Doc # */}
                  <TableCell className="font-mono text-xs">{doc.docNo}</TableCell>

                  {/* Type */}
                  <TableCell>
                    <span className="text-sm font-medium capitalize">
                      {docTypeBadge(doc.type)}
                    </span>
                  </TableCell>

                  {/* Status */}
                  <TableCell>
                    <Badge
                      variant={docStatusVariant(doc.status)}
                      className="text-xs capitalize"
                    >
                      {doc.status}
                    </Badge>
                  </TableCell>

                  {/* Total */}
                  <TableCell className="text-right font-medium">
                    {formatRupees(doc.total)}
                  </TableCell>

                  {/* Issued at */}
                  <TableCell className="text-sm text-muted-foreground">
                    {doc.issuedAt ? formatDateTime(doc.issuedAt) : "—"}
                  </TableCell>

                  {/* Public link + PDF */}
                  <TableCell>
                    {!isDraft && doc.status !== "void" ? (
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          title="Copy public link"
                          onClick={() => copyLink(doc)}
                          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                        >
                          {copiedId === doc.id ? (
                            <Check className="h-3.5 w-3.5 text-green-600" />
                          ) : (
                            <ClipboardCopy className="h-3.5 w-3.5" />
                          )}
                          {copiedId === doc.id ? "Copied" : "Copy link"}
                        </button>
                        <a
                          href={`${buildDocUrl(doc)}/pdf`}
                          target="_blank"
                          rel="noreferrer"
                          title="Download PDF"
                          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                        >
                          <Download className="h-3.5 w-3.5" />
                          PDF
                        </a>
                      </div>
                    ) : (
                      <span className="text-xs text-muted-foreground">
                        {isDraft ? "Draft" : "—"}
                      </span>
                    )}
                  </TableCell>

                  {/* Row actions */}
                  <TableCell>
                    <div className="flex flex-col gap-1.5">
                      {/* Issue (draft only) */}
                      {isDraft && doc.status !== "void" && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 text-xs px-2"
                          onClick={() => handleIssueDocument(doc)}
                          disabled={isLoading}
                        >
                          {actionLoading === `issue_${doc.id}` ? (
                            <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                          ) : (
                            <Send className="mr-1 h-3 w-3" />
                          )}
                          Issue
                        </Button>
                      )}

                      {/* Send WhatsApp (issued, non-void) */}
                      {!isDraft && doc.status !== "void" && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 text-xs px-2"
                          onClick={() => handleSendDocument(doc)}
                          disabled={isLoading}
                        >
                          {actionLoading === `send_${doc.id}` ? (
                            <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                          ) : (
                            <Send className="mr-1 h-3 w-3" />
                          )}
                          Send WA
                        </Button>
                      )}

                      {/* Accept (quotation, sent/viewed) */}
                      {doc.type === "quotation" &&
                        (doc.status === "sent" || doc.status === "viewed") && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 text-xs px-2"
                            onClick={() => handleAcceptDocument(doc)}
                            disabled={isLoading}
                          >
                            {actionLoading === `accept_${doc.id}` ? (
                              <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                            ) : (
                              <Check className="mr-1 h-3 w-3" />
                            )}
                            Accept
                          </Button>
                        )}

                      {/* Mark paid (invoice, sent/viewed) */}
                      {doc.type === "invoice" &&
                        (doc.status === "sent" || doc.status === "viewed") && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 text-xs px-2"
                            onClick={() => setPayingDocId(doc.id)}
                            disabled={isLoading}
                          >
                            Mark paid
                          </Button>
                        )}

                      {/* WA send result inline */}
                      {docSendResult && (
                        <span
                          className={
                            docSendResult.sent
                              ? "text-xs text-green-600"
                              : "text-xs text-destructive"
                          }
                        >
                          {docSendResult.sent
                            ? "WA sent"
                            : `WA failed: ${docSendResult.error ?? "unknown"}`}
                        </span>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}

      {/* ---- Global action error ---- */}
      {actionError && (
        <div className="flex items-start gap-1.5 text-sm text-destructive">
          <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
          <span>{actionError}</span>
        </div>
      )}

      {/* ---- Mark-paid inline form ---- */}
      {payingDocId && (
        <div className="rounded-md border p-4 space-y-3">
          <p className="text-sm font-medium">Mark invoice as paid</p>
          <div className="flex flex-wrap items-center gap-3">
            <select
              className="rounded-md border border-input bg-background px-2 py-1.5 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              value={payMethod}
              onChange={(e) => setPayMethod(e.target.value)}
            >
              <option value="bank_transfer">Bank transfer</option>
              <option value="cash">Cash</option>
              <option value="card">Card</option>
              <option value="payhere">PayHere</option>
              <option value="other">Other</option>
            </select>
            <Input
              className="h-9 w-56"
              placeholder="Reference / receipt no."
              value={payRef}
              onChange={(e) => setPayRef(e.target.value)}
            />
            <Button
              size="sm"
              onClick={() => {
                const doc = documents.find((d) => d.id === payingDocId);
                if (doc) handleMarkPaid(doc);
              }}
              disabled={actionLoading === `pay_${payingDocId}`}
            >
              {actionLoading === `pay_${payingDocId}` ? (
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
              ) : (
                <Check className="mr-1.5 h-3.5 w-3.5" />
              )}
              Confirm
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setPayingDocId(null);
                setPayRef("");
                setPayError(null);
              }}
            >
              Cancel
            </Button>
          </div>
          {payError && (
            <p className="text-sm text-destructive">{payError}</p>
          )}
        </div>
      )}

      {/* ---- Create quotation form ---- */}
      {showCreateQuote && (
        <div className="rounded-md border p-4 space-y-4">
          <p className="text-sm font-medium">New quotation</p>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">
                Margin (basis points)
              </label>
              <Input
                type="number"
                min={0}
                max={50000}
                className="h-9"
                value={marginBps}
                onChange={(e) => setMarginBps(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                {((marginParsed / 10000) * 100).toFixed(1)}% markup
              </p>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">
                Discount (LKR)
              </label>
              <Input
                type="number"
                min={0}
                className="h-9"
                value={discountStr}
                onChange={(e) => setDiscountStr(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">
                Delivery fee (LKR)
              </label>
              <Input
                type="number"
                min={0}
                className="h-9"
                value={deliveryFeeStr}
                onChange={(e) => setDeliveryFeeStr(e.target.value)}
              />
            </div>
          </div>
          <p className="text-xs text-muted-foreground">{previewNote}</p>
          {createError && (
            <p className="text-sm text-destructive">{createError}</p>
          )}
          <div className="flex items-center gap-3">
            <Button
              size="sm"
              onClick={handleCreateQuotation}
              disabled={creating}
            >
              {creating ? (
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
              ) : (
                <FileText className="mr-1.5 h-3.5 w-3.5" />
              )}
              Create quotation draft
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setShowCreateQuote(false);
                setCreateError(null);
              }}
            >
              Cancel
            </Button>
          </div>
        </div>
      )}

      {/* ---- Next-step buttons ---- */}
      <div className="flex flex-wrap gap-3">
        {/* Create quotation (if none exists yet) */}
        {!hasQuotation && !showCreateQuote && (
          <Button
            size="sm"
            variant="outline"
            onClick={() => setShowCreateQuote(true)}
          >
            <FileText className="mr-2 h-4 w-4" />
            Create Quotation
          </Button>
        )}

        {/* Create invoice (once a quotation is accepted, and no invoice yet) */}
        {acceptedQuotation && !hasInvoice && (
          <Button
            size="sm"
            variant="outline"
            onClick={handleCreateInvoice}
            disabled={actionLoading === "create_invoice"}
          >
            {actionLoading === "create_invoice" ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <FileText className="mr-2 h-4 w-4" />
            )}
            Create Invoice
          </Button>
        )}

        {/* Create receipt (once the invoice is paid, and no receipt yet) */}
        {paidInvoice && !hasReceipt && (
          <Button
            size="sm"
            variant="outline"
            onClick={handleCreateReceipt}
            disabled={actionLoading === "create_receipt"}
          >
            {actionLoading === "create_receipt" ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <FileText className="mr-2 h-4 w-4" />
            )}
            Create Receipt
          </Button>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

function OrderDetailPage() {
  const { order } = Route.useLoaderData() as { order: OrderDetail };

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      {/* Breadcrumb */}
      <Link
        to="/orders"
        className="text-sm text-muted-foreground hover:text-foreground"
      >
        Back to orders
      </Link>

      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <h1 className="font-mono font-display text-3xl">{order.orderNo}</h1>
          <p className="text-sm text-muted-foreground">
            Created {formatDateTime(order.createdAt)}
          </p>
        </div>
        <StatusBadge status={order.status} />
      </div>

      {/* Customer + Delivery */}
      <div className="grid gap-6 sm:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Customer</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="grid gap-3 sm:grid-cols-2">
              <Field label="Name" value={order.customerName} />
              <Field label="Phone" value={order.customerPhone} />
              <Field label="Email" value={order.customerEmail} />
              <Field
                label="Preferred language"
                value={order.customerLocale === "si" ? "Sinhala / සිංහල" : "English"}
              />
            </dl>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Delivery</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="grid gap-3 sm:grid-cols-2">
              <Field label="Address" value={order.deliveryAddress} />
              <Field label="District" value={order.deliveryDistrict} />
              <Field label="City" value={order.deliveryCity} />
              <Field label="Needed by" value={formatDate(order.neededByDate)} />
            </dl>
          </CardContent>
        </Card>
      </div>

      {/* Notes */}
      {(order.notesInternal || order.notesCustomer) && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Notes</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="space-y-3">
              {order.notesInternal && (
                <Field label="Internal" value={order.notesInternal} />
              )}
              {order.notesCustomer && (
                <Field label="Customer" value={order.notesCustomer} />
              )}
            </dl>
          </CardContent>
        </Card>
      )}

      {/* Line items */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Order items ({order.items.length})
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {order.items.length === 0 ? (
            <div className="px-6 pb-6">
              <EmptyState
                icon={<Package />}
                title="No items"
                description="No line items were added to this order."
              />
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>#</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead>Variant</TableHead>
                  <TableHead className="text-right">Qty</TableHead>
                  <TableHead>Unit</TableHead>
                  <TableHead>Notes</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {order.items.map((item, i) => (
                  <TableRow key={item.id}>
                    <TableCell className="text-sm text-muted-foreground">
                      {i + 1}
                    </TableCell>
                    <TableCell>
                      <span className="font-medium">{item.descriptionEn}</span>
                      {item.descriptionSi && (
                        <span className="ml-1.5 text-xs text-muted-foreground">
                          {item.descriptionSi}
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {item.variant ?? "—"}
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm">
                      {item.quantity}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {item.unit}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {item.notes ?? "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Sourcing */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Sourcing</CardTitle>
        </CardHeader>
        <CardContent>
          <SourcingPanel
            orderId={order.id}
            rfqs={order.rfqs}
          />
        </CardContent>
      </Card>

      {/* Awards */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Awards</CardTitle>
        </CardHeader>
        <CardContent>
          <AwardsPanel order={order} />
        </CardContent>
      </Card>

      {/* Documents */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Documents</CardTitle>
        </CardHeader>
        <CardContent>
          <DocumentsPanel order={order} />
        </CardContent>
      </Card>
    </div>
  );
}
