import { EmptyState } from "@flowers/ui/components/empty-state";
import { Skeleton } from "@flowers/ui/components/skeleton";
import { Flower2 } from "lucide-react";
import { useT } from "../../i18n/react";
import type { ProductListItemDTO } from "../../server/catalog";
import { ProductCard } from "./ProductCard";

export function ProductGrid({ products }: { products: ProductListItemDTO[] }) {
  const { t } = useT();
  if (products.length === 0) {
    return (
      <EmptyState
        icon={<Flower2 />}
        title={t.catalog.noResults}
        description={t.catalog.noResultsBody}
      />
    );
  }
  return (
    <ul className="grid grid-cols-2 gap-x-3 gap-y-8 sm:grid-cols-3 sm:gap-x-5 sm:gap-y-10 lg:grid-cols-4">
      {products.map((p, i) => (
        <li key={p.id}>
          <ProductCard product={p} index={i} />
        </li>
      ))}
    </ul>
  );
}

export function ProductGridSkeleton({ count = 8 }: { count?: number }) {
  return (
    <ul className="grid grid-cols-2 gap-x-3 gap-y-8 sm:grid-cols-3 sm:gap-x-5 sm:gap-y-10 lg:grid-cols-4">
      {Array.from({ length: count }).map((_, i) => (
        <li key={i}>
          <Skeleton className="aspect-square w-full rounded-2xl" />
          <div className="space-y-2 px-0.5 pt-3">
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-4 w-1/2" />
          </div>
        </li>
      ))}
    </ul>
  );
}
