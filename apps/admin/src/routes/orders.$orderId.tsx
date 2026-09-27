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
import { FileText, InboxIcon, Package } from "lucide-react";
import { getOrderFn } from "../server/orders";
import { StatusBadge } from "../components/order-status-badge";
import { formatDate, formatDateTime } from "../lib/format";
import type { OrderDetail } from "@flowers/api";

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

      {/* Sourcing — future tasks will fill this panel */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Sourcing</CardTitle>
        </CardHeader>
        <CardContent>
          <EmptyState
            icon={<InboxIcon />}
            title="No RFQs yet"
            description="Request-for-quotes sent to suppliers will appear here once sourcing begins."
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
