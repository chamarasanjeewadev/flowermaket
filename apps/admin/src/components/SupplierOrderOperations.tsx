import { useOrderAction } from "../hooks/useOrderAction";
import { Button } from "@flowers/ui/components/button";
import type { OrderDetail } from "@flowers/api";
import { checkRfqAlertDeliveryFn, checkSupplierAlertDeliveryFn, listSupplierAlertsFn, sendSupplierAlertFn, updateOrderLifecycleFn } from "../server/orders";
type Alerts = Awaited<ReturnType<typeof listSupplierAlertsFn>>;
export function SupplierOrderOperations({ order, alerts }: { order: OrderDetail; alerts: Alerts }) {
  const { busy, error, run } = useOrderAction();
  async function update(status: "fulfilling" | "completed" | "cancelled") {
    if (status === "cancelled" && !confirm(`Cancel ${order.orderNo}? Suppliers must stop work. A cancellation alert will be queued for your review.`)) return;
    await run(
      () => updateOrderLifecycleFn({ data: { orderId: order.id, status } }),
      "Order could not be updated. Please refresh and retry.",
    );
  }
  async function send(alert: Alerts[number]) {
    if (!confirm(`Send this WhatsApp alert to ${alert.phone}?\n\n${alert.previewText}`)) return;
    await run(
      () => sendSupplierAlertFn({ data: { alertId: alert.id, orderId: order.id } }),
      "Alert could not be sent. Check its status before retrying.",
    );
  }
  return (
    <section className="space-y-4 rounded-xl border border-border bg-card p-5">
      <h2 className="text-lg font-semibold">Confirmed fulfilment & supplier alerts</h2>
      <p className="text-sm text-muted-foreground">
        Provisional sourcing awards do not authorize preparation. Confirm the customer
        quotation before suppliers receive work. Delivery, payment and settlement
        arrangements must be agreed separately.
      </p>
      <div className="flex flex-wrap gap-3">
        {order.status === "paid" && (
          <Button disabled={busy} onClick={() => void update("fulfilling")}>Start fulfilment</Button>
        )}
        {order.status === "fulfilling" && (
          <Button disabled={busy} onClick={() => void update("completed")}>Complete order</Button>
        )}
        {!["completed", "cancelled"].includes(order.status) && (
          <Button variant="outline" disabled={busy} onClick={() => void update("cancelled")}>Cancel order</Button>
        )}
      </div>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      {order.awards.filter(award => award.status !== "cancelled").map(award => (
        <div key={award.id} className="border-t border-border pt-3 text-sm">
          <p>{award.supplierShopName} · {award.awardedQty} · {award.fulfilmentStatus ?? "Awaiting confirmation"}</p>
          <StatusHistory events={award.fulfilmentHistory ?? []} />
        </div>
      ))}
      {alerts.map(alert => (
        <article key={alert.id} className="space-y-2 rounded-lg border border-border p-4 text-sm">
          <p className="font-medium">{alert.phone ?? "No notification number"} · {alert.status}</p>
          <p className="whitespace-pre-wrap">{alert.previewText}</p>
          {alert.providerId && (
            <Button variant="outline" size="sm" disabled={busy} onClick={() => void run(
              () => checkSupplierAlertDeliveryFn({ data: { alertId: alert.id, orderId: order.id } }),
              "Could not check delivery.",
            )}>Check delivery status</Button>
          )}
          {alert.error && <p className="text-destructive">{alert.error}</p>}
          {["pending", "failed"].includes(alert.status) && (
            <Button size="sm" variant="outline" disabled={busy} onClick={() => void send(alert)}>
              {alert.status === "failed" ? "Review & retry" : "Review & send WhatsApp"}
            </Button>
          )}
        </article>
      ))}
      <p className="text-xs text-muted-foreground">
        Sent means the WhatsApp provider accepted the alert; delivery is not yet confirmed.
      </p>
      {!!order.statusHistory?.length && (
        <details>
          <summary className="cursor-pointer py-2 text-sm">Order history</summary>
          <StatusHistory events={order.statusHistory} />
        </details>
      )}
    </section>
  );
}

function StatusHistory({ events }: { events: readonly { status: string; at: string }[] }) {
  return events.map((event, index) => (
    <p key={`${event.at}-${index}`} className="text-sm text-muted-foreground">
      {event.status} · {new Date(event.at).toLocaleString("en-GB", { timeZone: "Asia/Colombo" })}
    </p>
  ));
}

export function EnquiryDeliveryCheck({ orderId, rfqId }: { orderId: string; rfqId: string }) {
  const { busy, error, run } = useOrderAction();
  return (
    <div>
      <Button variant="outline" size="sm" disabled={busy} onClick={() => void run(
        () => checkRfqAlertDeliveryFn({ data: { orderId, rfqId } }),
        "Could not check delivery.",
      )}>Check enquiry alert delivery</Button>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    </div>
  );
}
