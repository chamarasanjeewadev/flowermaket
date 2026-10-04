import * as React from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Plus, Flower2 } from "lucide-react";
import { Button } from "@flowers/ui/components/button";
import { Badge } from "@flowers/ui/components/badge";
import { getAdminFlowers } from "../server/flowers";

export const Route = createFileRoute("/flowers/")({
  loader: async () => {
    const species = await getAdminFlowers();
    return { species };
  },
  component: FlowersPage,
});

const CATEGORY_LABELS: Record<string, string> = {
  imported: "Imported",
  tropical: "Tropical",
  local: "Local",
};

function FlowersPage() {
  const { species } = Route.useLoaderData();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <h1 className="font-display text-3xl">Flower Species</h1>
          <p className="text-sm text-muted-foreground">
            {species.length} species · {species.reduce((n, s) => n + s.variants.length, 0)} variants
          </p>
        </div>
        <Button asChild>
          <Link to="/flowers/new">
            <Plus className="size-4" />
            Add species
          </Link>
        </Button>
      </div>

      {species.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border py-16 text-center">
          <Flower2 className="size-8 text-muted-foreground/40" />
          <p className="text-sm text-muted-foreground">No flower species yet.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {species.map((s) => (
            <Link
              key={s.id}
              to="/flowers/$speciesId"
              params={{ speciesId: s.id }}
              className="flex items-center justify-between rounded-lg border border-border bg-card px-4 py-3 text-sm transition-colors hover:border-brand/40 hover:bg-accent"
            >
              <div className="flex items-center gap-3">
                <div className="flex min-w-0 flex-col">
                  <span className="font-medium">{s.nameEn}</span>
                  <span className="text-xs text-muted-foreground">{s.nameSi}</span>
                </div>
                <Badge variant="secondary" className="hidden sm:inline-flex">
                  {CATEGORY_LABELS[s.category] ?? s.category}
                </Badge>
                {!s.isActive && (
                  <Badge variant="destructive">Inactive</Badge>
                )}
              </div>
              <div className="flex items-center gap-3 text-xs text-muted-foreground">
                <span>{s.variants.length} variant{s.variants.length !== 1 ? "s" : ""}</span>
                <span className="text-brand">Edit →</span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
