import * as React from "react";
import { createFileRoute, useRouter } from "@tanstack/react-router";
import { Button } from "@flowers/ui/components/button";
import { Badge } from "@flowers/ui/components/badge";
import { nextFulfilmentStatus } from "@flowers/api/supplier-workflow";
import { formatRupees } from "@flowers/api/money";
import { listOrdersFn, updateFulfilmentFn } from "../server/portal";
import { useT } from "../i18n/react";
export const Route = createFileRoute("/orders")({ loader: () => listOrdersFn(), component: OrdersPage });
const labels: Record<string, [string, string]> = { confirmed: ["Confirmed", "තහවුරු කළ"], preparing: ["Preparing", "සූදානම් කරමින්"], ready: ["Ready", "සූදානම්"], handed_over: ["Handed over", "භාර දුන්"], completed: ["Completed", "සම්පූර්ණ කළ"] };
function OrdersPage() {
  const orders = Route.useLoaderData(); const router = useRouter(); const { locale } = useT();
  const [busy, setBusy] = React.useState<string | null>(null); const [error, setError] = React.useState<string | null>(null);
  const label = (status: string) => labels[status]?.[locale === "si" ? 1 : 0] ?? status;
  async function update(awardId: string, status: string) {
    setBusy(awardId); setError(null);
    try { const result = await updateFulfilmentFn({ data: { awardId, next: status } }); if (!result.ok) setError(result.message); else await router.invalidate(); }
    catch { setError(locale === "si" ? "යාවත්කාලීන කිරීම අසාර්ථකයි. නැවත උත්සාහ කරන්න." : "Update failed. Please try again."); } finally { setBusy(null); }
  }
  return <div className="space-y-6">
    <header><h1 className="font-display text-3xl">{locale === "si" ? "තහවුරු කළ ඇණවුම්" : "Orders"}</h1><p className="mt-2 text-muted-foreground">{locale === "si" ? "FlowerMarket තහවුරු කළ වැඩ පමණක් මෙහි දැක්වේ. භාරදීමේ විස්තර FlowerMarket සමඟ තහවුරු කරන්න." : "Only work confirmed by FlowerMarket appears here. Confirm delivery or collection arrangements with FlowerMarket."}</p></header>
    {error && <p role="alert" className="text-destructive">{error}</p>}
    {!orders.length && <div className="rounded-2xl border border-border p-8"><h2 className="font-semibold">{locale === "si" ? "තවම තහවුරු කළ ඇණවුම් නැත" : "No confirmed orders yet"}</h2><p className="mt-2 text-muted-foreground">{locale === "si" ? "මිල ඉල්ලීමක් ඇණවුමක් නොවේ. වැඩ ආරම්භ කිරීමට පෙර තහවුරු කිරීම බලාපොරොත්තු වන්න." : "An enquiry or quote is not an order. Wait for confirmation before starting work."}</p></div>}
    {orders.map(order => {
      const next = order.awardStatus === "cancelled" ? undefined : nextFulfilmentStatus(order.orderStatus, order.fulfilmentStatus);
      return <article key={order.id} className="space-y-4 rounded-2xl border border-border bg-card p-5">
      <div className="flex flex-wrap justify-between gap-3"><h2 className="text-lg font-semibold">{order.orderNo} · {order.description}</h2><Badge>{(order.orderStatus === "cancelled" || order.awardStatus === "cancelled") ? (locale === "si" ? "අවලංගු කළ" : "Cancelled — stop work") : label(order.fulfilmentStatus)}</Badge></div>
      <dl className="grid gap-3 text-sm sm:grid-cols-3"><div><dt className="text-muted-foreground">{locale === "si" ? "ප්‍රමාණය" : "Assigned quantity"}</dt><dd>{order.quantity} {order.unit}</dd></div><div><dt className="text-muted-foreground">{locale === "si" ? "අවශ්‍ය දිනය" : "Required date / area"}</dt><dd>{order.neededByDate ?? "—"} · {[order.deliveryCity, order.deliveryDistrict].filter(Boolean).join(", ") || "—"}</dd></div><div><dt className="text-muted-foreground">{locale === "si" ? "සැපයුම් මිල" : "Agreed supply cost"}</dt><dd>{formatRupees(order.unitCost * order.quantity)}</dd></div></dl>
      {next && <Button variant="brand" className="min-h-11" disabled={busy !== null} onClick={() => void update(order.id, next)}>{busy === order.id ? "…" : `${locale === "si" ? "සලකුණු කරන්න" : "Mark"}: ${label(next)}`}</Button>}
      {!!order.history.length && <details><summary className="cursor-pointer py-2 text-sm">{locale === "si" ? "ඉතිහාසය" : "Fulfilment history"}</summary><ol className="space-y-2 text-sm text-muted-foreground">{order.history.map((event, i) => <li key={i}>{label(event.status)} · {new Date(event.at).toLocaleString("en-GB", { timeZone: "Asia/Colombo" })}</li>)}</ol></details>}
    </article>;
    })}
  </div>;
}
