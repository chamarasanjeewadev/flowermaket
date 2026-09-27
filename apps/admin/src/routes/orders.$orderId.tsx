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
  createAwardFn,
  cancelAwardFn,
} from "../server/orders";
import type { DispatchResult } from "../server/orders";
import { StatusBadge } from "../components/order-status-badge";
import { formatDate, formatDateTime } from "../lib/format";
import { formatRupees } from "@flowers/api/money";
import type {
  MatchedSupplier,
  OrderDetail,
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
              <TableHead>Supplier shop ID</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Sent</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {localRfqs.map((rfq) => (
              <TableRow key={rfq.id}>
                <TableCell className="font-mono text-xs">{rfq.supplierShopId}</TableCell>
                <TableCell>
                  <Badge variant="outline" className="text-xs capitalize">
                    {rfq.status}
                  </Badge>
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {rfq.sentAt ? formatDateTime(rfq.sentAt) : "—"}
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

      {/* Documents — future tasks will fill this panel */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Documents</CardTitle>
        </CardHeader>
        <CardContent>
          <EmptyState
            icon={<FileText />}
            title="No documents yet"
            description="Quotations, invoices, and receipts linked to this order will appear here."
          />
        </CardContent>
      </Card>
    </div>
  );
}
