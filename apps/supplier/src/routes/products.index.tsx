import { createFileRoute, Link } from "@tanstack/react-router";
import { formatRupees } from "@flowers/api/money";
import { Button } from "@flowers/ui/components/button";
import { Badge } from "@flowers/ui/components/badge";
import { EmptyState } from "@flowers/ui/components/empty-state";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@flowers/ui/components/table";
import { Flower, Plus } from "lucide-react";
import { listShopProductsFn } from "../server/products";
import { useT } from "../i18n/react";

export const Route = createFileRoute("/products/")({
  loader: async () => ({ products: await listShopProductsFn() }),
  component: ProductsListPage,
});

type ProductStatus = "draft" | "active" | "paused" | "archived";

function StatusBadge({ status }: { status: ProductStatus }) {
  const { t } = useT();
  const labels: Record<ProductStatus, string> = {
    draft: t.products.statusDraft,
    active: t.products.statusActive,
    paused: t.products.statusPaused,
    archived: t.products.statusArchived,
  };
  const variants: Record<
    ProductStatus,
    "secondary" | "success" | "warning" | "outline"
  > = {
    draft: "secondary",
    active: "success",
    paused: "warning",
    archived: "outline",
  };
  return <Badge variant={variants[status]}>{labels[status]}</Badge>;
}

function ProductsListPage() {
  const { t } = useT();
  const { products } = Route.useLoaderData();

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl sm:text-4xl">
            {t.products.title}
          </h1>
          <p className="mt-1 max-w-xl text-sm text-muted-foreground">
            {t.products.subtitle}
          </p>
        </div>
        <Button asChild variant="brand">
          <Link to="/products/new">
            <Plus className="mr-2 size-4" />
            {t.products.add}
          </Link>
        </Button>
      </div>

      {products.length === 0 ? (
        <EmptyState
          icon={<Flower />}
          title={t.products.empty}
          action={
            <Button asChild variant="brand">
              <Link to="/products/new">
                <Plus className="mr-2 size-4" />
                {t.products.emptyCta}
              </Link>
            </Button>
          }
        />
      ) : (
        <div className="rounded-xl border border-border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-16">{t.products.colImage}</TableHead>
                <TableHead>{t.products.colName}</TableHead>
                <TableHead>{t.products.colCategory}</TableHead>
                <TableHead>{t.products.colPrice}</TableHead>
                <TableHead>{t.products.colStock}</TableHead>
                <TableHead>{t.products.colStatus}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {products.map((p) => (
                <TableRow key={p.id}>
                  <TableCell>
                    <div className="flex size-12 items-center justify-center overflow-hidden rounded-md bg-muted">
                      {p.imageUrl ? (
                        <img
                          src={p.imageUrl}
                          alt={p.nameEn}
                          className="size-full object-cover"
                        />
                      ) : (
                        <Flower className="size-5 text-muted-foreground" />
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Link
                      to="/products/$productId"
                      params={{ productId: p.id }}
                      className="font-medium text-foreground hover:text-brand hover:underline"
                    >
                      {p.nameEn}
                    </Link>
                    {p.listingType === "wholesale" && (
                      <span className="ml-2 text-xs text-muted-foreground">
                        {t.products.perStem}
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {p.categoryNameEn}
                  </TableCell>
                  <TableCell>{formatRupees(p.price)}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {p.stockQty == null ? t.products.madeToOrder : p.stockQty}
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={p.status} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
