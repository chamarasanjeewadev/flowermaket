import { createFileRoute } from "@tanstack/react-router";
import { useT } from "../i18n/react";

export const Route = createFileRoute("/")({
  component: DashboardPage,
});

function DashboardPage() {
  const { t } = useT();

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">{t.dashboard.title}</h1>
      <p className="text-muted-foreground">{t.dashboard.comingSoon}</p>
      <p className="text-sm text-muted-foreground">{t.dashboard.comingSoonBody}</p>
    </div>
  );
}
