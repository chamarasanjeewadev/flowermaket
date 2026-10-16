import { createFileRoute, Link } from "@tanstack/react-router";
import { Badge } from "@flowers/ui/components/badge";
import { EmptyState } from "@flowers/ui/components/empty-state";

import { Inbox } from "lucide-react";
import { listRfqsFn } from "../server/rfqs";
import { useT } from "../i18n/react";

export const Route = createFileRoute("/rfqs/")({
  loader: async () => ({ rfqs: await listRfqsFn() }),
  component: RfqInboxPage,
});

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
  const label = labels[key] ?? status;
  const variant = variants[key] ?? "secondary";

  return <Badge variant={variant}>{label}</Badge>;
}

function formatDate(date: Date | null | string): string {
  if (!date) return "—";
  const d = date instanceof Date ? date : new Date(date);
  return d.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function RfqInboxPage() {
  const { t } = useT();
  const { rfqs } = Route.useLoaderData();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl sm:text-4xl">{t.rfqs.title}</h1>
        <p className="mt-1 max-w-xl text-sm text-muted-foreground">
          {t.rfqs.subtitle}
        </p>
      </div>

      {rfqs.length === 0 ? (
        <EmptyState
          icon={<Inbox />}
          title={t.rfqs.empty}
          description={t.rfqs.emptyDescription}
        />
      ) : (
        <div className="space-y-4">{rfqs.map(rfq => <article key={rfq.id} className="space-y-3 rounded-xl border border-border bg-card p-5">
          <div className="flex flex-wrap justify-between gap-3"><h2 className="font-semibold">{rfq.orderNo}</h2><RfqStatusBadge status={rfq.expiresAt && new Date(rfq.expiresAt) <= new Date() && ["sent", "viewed", "quoted"].includes(rfq.status) ? "expired" : rfq.status} /></div>
          <p>{rfq.firstItemDescription ?? `${rfq.itemCount} items`}{rfq.itemCount > 1 && ` +${rfq.itemCount - 1}`}</p>
          <p className="text-sm text-muted-foreground">Required: {rfq.neededByDate ?? "—"} · Area: {rfq.deliveryArea ?? "—"}</p>
          <p className="text-sm text-muted-foreground">Respond by: {formatDate(rfq.expiresAt)}</p>
          <Link to="/rfqs/$rfqId" params={{ rfqId: rfq.id }} className="inline-flex min-h-11 items-center rounded-md bg-brand px-4 text-sm font-medium text-white focus-visible:ring-2 focus-visible:ring-ring">{t.rfqs.statusQuoted === rfq.status ? "Review quote" : "Review & quote"}</Link>
        </article>)}</div>
      )}
    </div>
  );
}
