import { Link, createFileRoute } from "@tanstack/react-router";
import { Alert, AlertDescription, AlertTitle } from "@flowers/ui/components/alert";
import { Badge } from "@flowers/ui/components/badge";
import { AlertTriangle, ArrowRight, Inbox, Package, Wallet, type LucideIcon } from "lucide-react";
import { DashboardCharts } from "../components/DashboardCharts";
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

function StatCard({ to, icon: Icon, tone, value, label, cta, urgent }: { to: "/rfqs" | "/orders"; icon: LucideIcon; tone: string; value: number | string; label: string; cta: string; urgent?: boolean }) {
  return (
    <Link to={to} className={`group flex flex-col rounded-3xl bg-card p-5 ring-1 transition-shadow hover:shadow-float focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${urgent ? "ring-2 ring-brand/60" : "ring-border/70"}`}>
      <span className={`grid size-11 place-items-center rounded-2xl ${tone}`}><Icon className="size-5" aria-hidden="true" /></span>
      <p className="mt-4 text-[2.25rem] font-semibold leading-none tracking-[-0.03em] tabular-nums">{value}</p>
      <p className="mt-2 text-[15px] text-muted-foreground">{label}</p>
      <span className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-brand-ink">{cta}<ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" aria-hidden="true" /></span>
    </Link>
  );
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

  const openRfqs = rfqs.filter((r) => ["sent", "viewed"].includes(r.status) && (!r.expiresAt || new Date(r.expiresAt) > new Date())).length;
  const openLines = orders.filter((o) => o.orderStatus !== "cancelled" && o.awardStatus !== "cancelled" && o.orderStatus !== "completed" && o.fulfilmentStatus !== "completed");
  const openOrders = new Set(openLines.map((o) => o.orderNo)).size;
  const openValue = openLines.reduce((n, o) => n + o.quantity * o.unitCost, 0);

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

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard to="/rfqs" icon={Inbox} tone="bg-amber-100 text-amber-700" value={openRfqs} label={locale === "si" ? "මිල යෝජනා අවශ්‍ය ඉල්ලීම්" : "Enquiries needing a quote"} cta={locale === "si" ? "බලන්න" : "Open inbox"} urgent={openRfqs > 0} />
        <StatCard to="/orders" icon={Package} tone="bg-emerald-100 text-emerald-700" value={openOrders} label={locale === "si" ? "ඉදිරි තහවුරු කළ ඇණවුම්" : "Upcoming confirmed orders"} cta={locale === "si" ? "ඇණවුම් බලන්න" : "View orders"} />
        <StatCard to="/orders" icon={Wallet} tone="bg-rose-100 text-rose-700" value={`Rs ${Math.round(openValue / 100).toLocaleString("en-LK")}`} label={locale === "si" ? "ක්‍රියාත්මක ඇණවුම් වටිනාකම" : "Value of open orders"} cta={locale === "si" ? "විස්තර" : "Details"} />
      </div>
      <DashboardCharts orders={orders} rfqs={rfqs} />
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
