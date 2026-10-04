import * as React from "react";
import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { MessageCircle, Plus, Store } from "lucide-react";
import { Button } from "@flowers/ui/components/button";
import { Badge } from "@flowers/ui/components/badge";
import { listSuppliersForReview, reviewSupplierFn } from "../server/suppliers";
import type { VerificationStatus } from "@flowers/api";

export const Route = createFileRoute("/suppliers/")({
  loader: async () => ({ suppliers: await listSuppliersForReview({ data: {} }) }),
  component: SuppliersPage,
});

const STATUS_VARIANT: Record<
  VerificationStatus,
  "default" | "secondary" | "destructive" | "outline"
> = {
  verified: "default",
  pending: "secondary",
  unverified: "outline",
  rejected: "destructive",
};

function SuppliersPage() {
  const { suppliers } = Route.useLoaderData();
  const router = useRouter();
  const [busyId, setBusyId] = React.useState<string | null>(null);

  async function review(shopId: string, status: VerificationStatus) {
    setBusyId(shopId);
    try {
      const result = await reviewSupplierFn({ data: { shopId, status } });
      if (result.ok) await router.invalidate();
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <h1 className="font-display text-3xl">Suppliers</h1>
          <p className="text-sm text-muted-foreground">{suppliers.length} shops</p>
        </div>
        <div className="flex items-center gap-2">
          <Button asChild variant="outline">
            <Link to="/suppliers/invite">
              <MessageCircle className="size-4" /> Invite via WhatsApp
            </Link>
          </Button>
          <Button asChild>
            <Link to="/suppliers/new">
              <Plus className="size-4" /> Create supplier
            </Link>
          </Button>
        </div>
      </div>

      {suppliers.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border py-16 text-center">
          <Store className="size-8 text-muted-foreground/40" />
          <p className="text-sm text-muted-foreground">No suppliers yet.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {suppliers.map((s) => (
            <div
              key={s.id}
              className="flex items-center justify-between rounded-lg border border-border bg-card px-4 py-3 text-sm"
            >
              <div className="flex min-w-0 flex-col">
                <span className="font-medium">
                  {s.nameEn}
                  {s.isAggregator ? (
                    <span className="ml-2 text-xs text-muted-foreground">· aggregator</span>
                  ) : null}
                </span>
                <span className="text-xs text-muted-foreground">
                  {s.shopType} · {s.district} · {s.ownerEmail}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant={STATUS_VARIANT[s.verificationStatus]}>
                  {s.verificationStatus}
                </Badge>
                {s.verificationStatus !== "verified" && (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={busyId === s.id}
                    onClick={() => void review(s.id, "verified")}
                  >
                    Verify
                  </Button>
                )}
                {s.verificationStatus !== "rejected" && (
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={busyId === s.id}
                    onClick={() => void review(s.id, "rejected")}
                  >
                    Reject
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
