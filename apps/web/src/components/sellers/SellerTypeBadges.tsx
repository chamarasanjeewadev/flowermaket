import { cn } from "@flowers/ui/lib/utils";
import { SELLER_TYPES, type SellerType } from "@flowers/api/constants";
import { Flower2, Sprout, Truck, type LucideIcon } from "lucide-react";
import { useT } from "../../i18n/react";

/** Visual identity per seller type — reused by badges, tiles and filters. */
export const SELLER_TYPE_STYLE: Record<
  SellerType,
  { Icon: LucideIcon; chip: string; tile: string }
> = {
  florist: {
    Icon: Flower2,
    chip: "bg-blush/70 text-foreground",
    tile: "bg-blush",
  },
  supplier: {
    Icon: Truck,
    chip: "bg-butter/70 text-foreground",
    tile: "bg-butter",
  },
  farmer: {
    Icon: Sprout,
    chip: "bg-sage text-sage-deep",
    tile: "bg-sage",
  },
};

/** Canonical-order chips for a shop's seller types. */
export function SellerTypeBadges({
  types,
  size = "sm",
  className,
}: {
  types: readonly SellerType[];
  size?: "xs" | "sm";
  className?: string;
}) {
  const { t } = useT();
  const ordered = SELLER_TYPES.filter((x) => types.includes(x));
  return (
    <ul className={cn("flex flex-wrap gap-1.5", className)}>
      {ordered.map((type) => {
        const { Icon, chip } = SELLER_TYPE_STYLE[type];
        return (
          <li
            key={type}
            className={cn(
              "inline-flex items-center gap-1 rounded-full font-medium",
              size === "xs" ? "px-2 py-0.5 text-[11px]" : "px-2.5 py-1 text-xs",
              chip,
            )}
          >
            <Icon
              className={size === "xs" ? "size-3" : "size-3.5"}
              aria-hidden="true"
            />
            {t.catalog.sellerTypes[type]}
          </li>
        );
      })}
    </ul>
  );
}
