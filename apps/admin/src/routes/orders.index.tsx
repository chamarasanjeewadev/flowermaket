import { createFileRoute, Link } from "@tanstack/react-router";
import { Button } from "@flowers/ui/components/button";
import { EmptyState } from "@flowers/ui/components/empty-state";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@flowers/ui/components/table";
import { ClipboardList, Plus } from "lucide-react";
import { listOrdersFn } from "../server/orders";
import { StatusBadge } from "../components/order-status-badge";
import { formatDate } from "../lib/format";

export const Route = createFileRoute("/orders/")({
  loader: async () => {
    const result = await listOrdersFn();
    return { orders: result.ok ? result.data : [] };
  },
  component: OrdersIndexPage,
});

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

function OrdersIndexPage() {
  const { orders } = Route.useLoaderData();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <h1 className="font-display text-3xl">Orders</h1>
          <p className="text-sm text-muted-foreground">
            All customer orders, newest first.
          </p>
        </div>
        <Button asChild variant="brand">
          <Link to="/orders/new">
            <Plus className="mr-1.5 size-4" />
            New order
          </Link>
        </Button>
      </div>

      {orders.length === 0 ? (
        <EmptyState
          icon={<ClipboardList />}
          title="No orders yet"
          description="Orders placed by customers or created manually will appear here."
          action={
            <Button asChild variant="brand">
              <Link to="/orders/new">
                <Plus className="mr-1.5 size-4" />
                Create first order
              </Link>
            </Button>
          }
        />
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Order</TableHead>
                <TableHead>Customer</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Needed by</TableHead>
                <TableHead>Created</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {orders.map((order) => (
                <TableRow key={order.id}>
                  <TableCell className="font-mono text-sm">
                    <Link
                      to="/orders/$orderId"
                      params={{ orderId: order.id }}
                      className="font-medium text-brand hover:underline"
                    >
                      {order.orderNo}
                    </Link>
                  </TableCell>
                  <TableCell>{order.customerName}</TableCell>
                  <TableCell>
                    <StatusBadge status={order.status} />
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {formatDate(order.neededByDate)}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {formatDate(order.createdAt)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
