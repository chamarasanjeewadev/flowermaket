import { formatRupees } from "@flowers/api/money";
import { Package } from "lucide-react";
import { useT } from "../../i18n/react";

/**
 * Wholesale minimum-order block for the product detail page: MOQ, per-stem
 * price, and the total at the minimum order.
 */
export function WholesaleInfo({
  price,
  minOrderQty,
}: {
  price: number;
  minOrderQty: number | null;
}) {
  const { t, f } = useT();
  const qty = minOrderQty ?? 1;

  return (
    <div className="rounded-lg border bg-muted/40 p-4 text-sm">
      <div className="flex items-center gap-2 font-medium text-foreground">
        <Package className="size-4 text-primary" aria-hidden="true" />
        {f(t.catalog.minOrder, { qty })}
      </div>
      <p className="mt-2 text-muted-foreground">
        {formatRupees(price)} {t.catalog.perStem}
      </p>
      <p className="mt-1 text-muted-foreground">
        {f(t.catalog.totalAtMoq, { price: formatRupees(price * qty) })}
      </p>
    </div>
  );
}
