import { createFileRoute } from "@tanstack/react-router";
import { Alert, AlertDescription, AlertTitle } from "@flowers/ui/components/alert";
import { Badge } from "@flowers/ui/components/badge";
import { AlertTriangle } from "lucide-react";
import { useT } from "../i18n/react";

export const Route = createFileRoute("/")({
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
    "default" | "secondary" | "outline" | "destructive"
  > = {
    unverified: "secondary",
    pending: "outline",
    verified: "default",
    rejected: "destructive",
  };
  return <Badge variant={variants[status]}>{labels[status]}</Badge>;
}

function DashboardPage() {
  const { t } = useT();
  const { session } = Route.useRouteContext();

  if (session.kind !== "supplier" && session.kind !== "auth_disabled") {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-bold">{t.dashboard.title}</h1>
      </div>
    );
  }

  const shopName =
    session.kind === "supplier" ? session.shopNameEn : null;
  const status: VerificationStatus | null =
    session.kind === "supplier" ? session.verificationStatus : null;

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-bold">{t.dashboard.title}</h1>
        {shopName && (
          <div className="flex items-center gap-3">
            <span className="text-muted-foreground">
              {t.dashboard.shopName}: <strong>{shopName}</strong>
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
