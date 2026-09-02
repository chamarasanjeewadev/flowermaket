import { createFileRoute } from "@tanstack/react-router";
import { useT } from "../i18n/react";

export const Route = createFileRoute("/onboarding-required")({
  component: OnboardingRequiredPage,
});

function OnboardingRequiredPage() {
  const { t } = useT();

  return (
    <div className="flex min-h-dvh items-center justify-center bg-muted/30 p-6">
      <div className="w-full max-w-sm rounded-xl border bg-background p-8 text-center shadow-sm">
        <h1 className="text-lg font-semibold">{t.onboarding.title}</h1>
        <p className="mt-2 text-sm text-muted-foreground">{t.onboarding.body}</p>
        <p className="mt-3 text-xs text-muted-foreground">{t.onboarding.contactSupport}</p>
      </div>
    </div>
  );
}
