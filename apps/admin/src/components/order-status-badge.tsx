import { Badge } from "@flowers/ui/components/badge";
import type { OrderStatus } from "@flowers/api";

/** Maps each order status to a Badge variant token. */
export const STATUS_VARIANTS: Record<
  OrderStatus,
  "outline" | "secondary" | "info" | "warning" | "success" | "destructive"
> = {
  draft: "outline",
  sourcing: "info",
  quoted: "info",
  confirmed: "warning",
  invoiced: "warning",
  paid: "success",
  fulfilling: "success",
  completed: "success",
  cancelled: "destructive",
};

/** Renders an order status as a coloured, title-cased badge. */
export function StatusBadge({ status }: { status: OrderStatus }) {
  return (
    <Badge variant={STATUS_VARIANTS[status]}>
      {status.charAt(0).toUpperCase() + status.slice(1)}
    </Badge>
  );
}
