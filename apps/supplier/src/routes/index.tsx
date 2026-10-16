import { Link, createFileRoute } from "@tanstack/react-router";
import { Alert, AlertDescription, AlertTitle } from "@flowers/ui/components/alert";
import { Badge } from "@flowers/ui/components/badge";
import { AlertTriangle } from "lucide-react";
import { useT } from "../i18n/react";

import { getReadinessFn, listOrdersFn } from "../server/portal";
import { listRfqsFn } from "../server/rfqs";
import { StoreReadiness } from "../components/StoreSetup";

export const Route = createFileRoute("/")({
  loader: async () => { const [readiness, rfqs, orders] = await Promise.all([getReadinessFn(), listRfqsFn(), listOrdersFn()]); return { readiness, rfqs, orders }; },
  component: DashboardPage,
});

type VerificationStatus = "unverified" | "pending" | "verified" | "rejected";

function VerificationBadge({ status }: { status: VerificationStatus }) {
  const { t } = useT();
  const labels: Record<VerificationStatus, string> = {
    unverified: t.shop.statusUnverified,
    pending: t.shop.statusPending,
    verified: t.shop.statusVerified,
    rejected: t.shop.statusRejected,
  };
  const variants: Record<
    VerificationStatus,
    "secondary" | "warning" | "success" | "destructive"
  > = {
    unverified: "secondary",
    pending: "warning",
    verified: "success",
    rejected: "destructive",
  };
  return <Badge variant={variants[status]}>{labels[status]}</Badge>;
}

function DashboardPage() {
  const { t, locale } = useT();
  const { readiness, rfqs, orders } = Route.useLoaderData();
  const { session } = Route.useRouteContext();

  if (session.kind !== "supplier" && session.kind !== "auth_disabled") {
    return (
      <div className="space-y-4">
        <h1 className="font-display text-[2rem] leading-[1.08] sm:text-[2.5rem]">{t.dashboard.title}</h1>
      </div>
    );
  }

  const shopName =
    session.kind === "supplier" ? session.shopNameEn : null;
  const status: VerificationStatus | null =
    session.kind === "supplier" ? session.verificationStatus : null;

  return (
    <div className="space-y-8">
      <div className="space-y-3">
        <h1 className="font-display text-[2rem] leading-[1.08] sm:text-[2.5rem]">{t.dashboard.title}</h1>
        {shopName && (
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-muted-foreground">
              {t.dashboard.shopName}:{" "}
              <strong className="text-foreground">{shopName}</strong>
            </span>
            {status && (
              <>
                <span className="text-muted-foreground">·</span>
                <VerificationBadge status={status} />
              </>
            )}
          </div>
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Link to="/rfqs" className="group rounded-3xl bg-card p-6 ring-1 ring-border/70 transition-shadow hover:shadow-float focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"><p className="text-[2.75rem] font-semibold leading-none tracking-[-0.03em] tabular-nums">{rfqs.filter(r => ["sent", "viewed"].includes(r.status) && (!r.expiresAt || new Date(r.expiresAt) > new Date())).length}</p><p className="mt-3 text-[15px] text-muted-foreground">{locale === "si" ? "මිල යෝජනා අවශ්‍ය ඉල්ලීම්" : "Enquiries needing a quote"}</p></Link>
        <Link to="/orders" className="group rounded-3xl bg-card p-6 ring-1 ring-border/70 transition-shadow hover:shadow-float focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"><p className="text-[2.75rem] font-semibold leading-none tracking-[-0.03em] tabular-nums">{new Set(orders.filter(o => o.orderStatus !== "cancelled" && o.awardStatus !== "cancelled" && o.orderStatus !== "completed" && o.fulfilmentStatus !== "completed").map(o => o.orderNo)).size}</p><p className="mt-3 text-[15px] text-muted-foreground">{locale === "si" ? "ඉදිරි තහවුරු කළ ඇණවුම්" : "Upcoming confirmed orders"}</p></Link>
      </div>
      <StoreReadiness data={readiness} />
      <p className="text-sm text-muted-foreground">{locale === "si" ? "ඉල්ලීම → මිල යෝජනාව → FlowerMarket සමාලෝචනය → තහවුරු කිරීම → සම්පූර්ණ කිරීම" : "Enquiry → supplier quote → FlowerMarket review → customer confirmation → fulfilment. Wait for confirmation before preparing flowers."}</p>
      {status === "pending" && (
        <Alert>
          <AlertTriangle className="size-4" aria-hidden="true" />
          <AlertTitle>{t.dashboard.pendingNotice}</AlertTitle>
          <AlertDescription>{t.dashboard.pendingNoticeBody}</AlertDescription>
        </Alert>
      )}
    </div>
  );
}
