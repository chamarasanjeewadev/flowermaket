import { formatRupees } from "@flowers/api/money";
import { cn } from "@flowers/ui/lib/utils";
import { useT } from "../../i18n/react";
import { SavingsBadge } from "./SavingsBadge";

/**
 * Price display: current price (with a "per stem" suffix for wholesale), an
 * optional struck-through compareAtPrice, and a savings badge.
 */
export function PriceBlock({
  price,
  compareAtPrice,
  listingType,
  size = "md",
  className,
}: {
  price: number;
  compareAtPrice: number | null;
  listingType: "retail" | "wholesale";
  size?: "sm" | "md" | "lg";
  className?: string;
}) {
  const { t } = useT();
  const priceClass =
    size === "lg"
      ? "text-2xl font-bold"
      : size === "sm"
        ? "text-sm font-semibold"
        : "text-base font-semibold";

  return (
    <div className={cn("flex flex-wrap items-baseline gap-x-2 gap-y-1", className)}>
      <span className={cn("text-foreground", priceClass)}>
        {formatRupees(price)}
      </span>
      {listingType === "wholesale" && (
        <span className="text-xs text-muted-foreground">{t.catalog.perStem}</span>
      )}
      {compareAtPrice !== null && compareAtPrice > price && (
        <span className="text-xs text-muted-foreground line-through">
          {formatRupees(compareAtPrice)}
        </span>
      )}
      <SavingsBadge price={price} compareAtPrice={compareAtPrice} />
    </div>
  );
}
