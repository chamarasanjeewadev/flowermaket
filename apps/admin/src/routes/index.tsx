import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  component: DashboardPage,
});

function DashboardPage() {
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Admin dashboard</h1>
      <p className="text-muted-foreground">Admin dashboard — coming soon.</p>
      <p className="text-sm text-muted-foreground">
        Platform management tools will be available in Phase 1.
      </p>
    </div>
  );
}
