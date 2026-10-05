import * as React from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@flowers/ui/components/card";
import { Badge } from "@flowers/ui/components/badge";
import { Button } from "@flowers/ui/components/button";
import { ArrowRight, Clock, Flower2, ShoppingBag, Store } from "lucide-react";
import { listOrdersFn } from "../server/orders";
import { listSuppliersForReview } from "../server/suppliers";
import { getAdminFlowers } from "../server/flowers";
import { getModerationCountsFn } from "../server/products";
import type { ModerationCounts, OrderSummary, ReviewableShop } from "@flowers/api";

interface DashboardData {
  orders: OrderSummary[];
  suppliers: ReviewableShop[];
  speciesCount: number;
  variantCount: number;
  moderation: ModerationCounts;
}

export const Route = createFileRoute("/")({
  loader: async (): Promise<DashboardData> => {
    const [ordersRes, suppliers, flowers, moderation] = await Promise.all([
      listOrdersFn(),
      listSuppliersForReview({ data: {} }),
      getAdminFlowers(),
      getModerationCountsFn(),
    ]);
    return {
      orders: ordersRes.ok ? ordersRes.data : [],
      suppliers,
      speciesCount: flowers.length,
      variantCount: flowers.reduce((n, s) => n + s.variants.length, 0),
      moderation,
    };
  },
  component: DashboardPage,
});

const OPEN_STATUSES = new Set([
  "draft",
  "sourcing",
  "quoted",
  "confirmed",
  "invoiced",
  "paid",
  "fulfilling",
]);

const STATUS_VARIANT: Record<string, React.ComponentProps<typeof Badge>["variant"]> = {
  completed: "success",
  cancelled: "destructive",
  draft: "outline",
  sourcing: "info",
  quoted: "info",
  confirmed: "info",
  invoiced: "warning",
  paid: "success",
  fulfilling: "warning",
};

function StatCard({
  icon: Icon,
  label,
  value,
  sub,
  to,
}: {
  icon: typeof ShoppingBag;
  label: string;
  value: number | string;
  sub?: React.ReactNode;
  to: string;
}) {
  return (
    <Link to={to} className="group">
      <Card className="transition-colors group-hover:border-brand/40">
        <CardContent className="flex items-center gap-4 p-5">
          <div className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-brand/10 text-brand">
            <Icon className="size-5" />
          </div>
          <div className="min-w-0">
            <div className="text-2xl font-semibold leading-none">{value}</div>
            <div className="mt-1 text-sm text-muted-foreground">{label}</div>
            {sub ? <div className="mt-0.5 text-xs">{sub}</div> : null}
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}

function DashboardPage() {
  const { orders, suppliers, speciesCount, variantCount, moderation } =
    Route.useLoaderData();
  const emptyStorefronts = suppliers.filter(
    (s) => s.verificationStatus === "verified" && s.activeProductCount === 0,
  );

  const openOrders = orders.filter((o) => OPEN_STATUSES.has(o.status)).length;
  const pendingSuppliers = suppliers.filter(
    (s) => s.verificationStatus === "pending",
  ).length;
  const verifiedSuppliers = suppliers.filter(
    (s) => s.verificationStatus === "verified",
  ).length;
  const recent = orders.slice(0, 6);

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="space-y-1">
        <h1 className="font-display text-3xl sm:text-4xl">Admin dashboard</h1>
        <p className="text-muted-foreground">Platform management for FlowerMarket.lk.</p>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          icon={ShoppingBag}
          label="Orders"
          value={orders.length}
          to="/orders"
          sub={<span className="text-muted-foreground">{openOrders} open</span>}
        />
        <StatCard
          icon={Store}
          label="Suppliers"
          value={suppliers.length}
          to="/suppliers"
          sub={
            pendingSuppliers > 0 ? (
              <span className="text-warning">{pendingSuppliers} pending review</span>
            ) : (
              <span className="text-muted-foreground">{verifiedSuppliers} verified</span>
            )
          }
        />
        <StatCard
          icon={Clock}
          label="Products to review"
          value={moderation.pending}
          to="/products"
          sub={
            <span className="text-muted-foreground">
              {moderation.approved} live · {moderation.blocked} blocked
            </span>
          }
        />
        <StatCard
          icon={Flower2}
          label="Flowers"
          value={speciesCount}
          to="/flowers"
          sub={<span className="text-muted-foreground">{variantCount} variants</span>}
        />
      </div>

      {/* Needs attention */}
      {(moderation.pending > 0 || pendingSuppliers > 0 || emptyStorefronts.length > 0) && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Needs attention</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="divide-y divide-border text-sm">
              {moderation.pending > 0 && (
                <li className="flex items-center justify-between gap-3 py-2.5">
                  <span>
                    <span className="font-semibold">{moderation.pending}</span> product
                    {moderation.pending === 1 ? "" : "s"} waiting for approval
                  </span>
                  <Button asChild size="sm" variant="outline">
                    <Link to="/products" search={{ tab: "pending" }}>Review</Link>
                  </Button>
                </li>
              )}
              {pendingSuppliers > 0 && (
                <li className="flex items-center justify-between gap-3 py-2.5">
                  <span>
                    <span className="font-semibold">{pendingSuppliers}</span> shop
                    {pendingSuppliers === 1 ? "" : "s"} waiting for verification
                  </span>
                  <Button asChild size="sm" variant="outline">
                    <Link to="/suppliers">Verify</Link>
                  </Button>
                </li>
              )}
              {emptyStorefronts.map((s) => (
                <li key={s.id} className="flex items-center justify-between gap-3 py-2.5">
                  <span>
                    <span className="font-semibold">{s.nameEn}</span> is verified but has
                    no live products
                  </span>
                  <Button asChild size="sm" variant="outline">
                    <Link to="/products" search={{ shop: s.id, tab: "all" }}>
                      Check products
                    </Link>
                  </Button>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {/* Recent orders */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-lg">Recent orders</CardTitle>
          <Button asChild variant="ghost" size="sm">
            <Link to="/orders">
              View all <ArrowRight className="size-4" />
            </Link>
          </Button>
        </CardHeader>
        <CardContent>
          {recent.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-10 text-center">
              <ShoppingBag className="size-7 text-muted-foreground/40" />
              <p className="text-sm text-muted-foreground">No orders yet.</p>
              <Button asChild size="sm" className="mt-1">
                <Link to="/orders/new">Create the first order</Link>
              </Button>
            </div>
          ) : (
            <ul className="divide-y divide-border">
              {recent.map((o) => (
                <li key={o.id}>
                  <Link
                    to="/orders/$orderId"
                    params={{ orderId: o.id }}
                    className="flex items-center justify-between gap-3 py-3 transition-colors hover:text-brand"
                  >
                    <div className="min-w-0">
                      <div className="truncate font-medium">{o.customerName}</div>
                      <div className="text-xs text-muted-foreground">
                        {o.orderNo}
                        {o.neededByDate ? ` · needed ${o.neededByDate}` : ""}
                      </div>
                    </div>
                    <Badge variant={STATUS_VARIANT[o.status] ?? "secondary"}>
                      {o.status}
                    </Badge>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
