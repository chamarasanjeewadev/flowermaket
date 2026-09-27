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
import { FileText, InboxIcon, Loader2, Package, Search, Send } from "lucide-react";
import { getOrderFn, matchSuppliersFn, sendRfqsFn } from "../server/orders";
import type { DispatchResult } from "../server/orders";
import { StatusBadge } from "../components/order-status-badge";
import { formatDate, formatDateTime } from "../lib/format";
import type { MatchedSupplier, OrderDetail } from "@flowers/api";

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
