import { cn } from "@flowers/ui/lib/utils";
import type { SellerType } from "@flowers/api/constants";
import { SELLER_TYPE_STYLE } from "./SellerTypeBadges";

/** Shop logo, or a monogram on the shop's primary seller-type tint. */
export function ShopAvatar({
  name,
  logoUrl,
  sellerTypes,
  className,
}: {
  name: string;
  logoUrl: string | null;
  sellerTypes: readonly SellerType[];
  className?: string;
}) {
  const primary = sellerTypes[0] ?? "florist";
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");

  return (
    <span
      className={cn(
        "flex shrink-0 items-center justify-center overflow-hidden rounded-full border-2 border-background font-display text-foreground shadow-sm",
        !logoUrl && SELLER_TYPE_STYLE[primary].tile,
        className,
      )}
    >
      {logoUrl ? (
        <img src={logoUrl} alt="" className="size-full object-cover" />
      ) : (
        <span aria-hidden="true">{initials}</span>
      )}
    </span>
  );
}
