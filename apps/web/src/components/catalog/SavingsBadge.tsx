import { Badge } from "@flowers/ui/components/badge";
import { savingsPercent } from "@flowers/api/money";
import { useT } from "../../i18n/react";

/** "Save X%" badge — renders nothing unless compareAtPrice is a genuine higher price. */
export function SavingsBadge({
  price,
  compareAtPrice,
  className,
}: {
  price: number;
  compareAtPrice: number | null;
  className?: string;
}) {
  const { t, f } = useT();
  const pct = savingsPercent(price, compareAtPrice);
  if (pct === null) return null;
  return (
    <Badge variant="success" className={className}>
      {f(t.catalog.save, { percent: pct })}
    </Badge>
  );
}
