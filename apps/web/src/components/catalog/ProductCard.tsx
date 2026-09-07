import { Link } from "@tanstack/react-router";
import { Badge } from "@flowers/ui/components/badge";
import { cn } from "@flowers/ui/lib/utils";
import { localizedName } from "../../i18n";
import { useT } from "../../i18n/react";
import type { ProductListItemDTO } from "../../server/catalog";
import { PriceBlock } from "./PriceBlock";

/** Rotating pastel tints for the image stage, echoing the reference's
 * colored blocks behind product photography. */
const STAGE_TINTS = ["bg-sage", "bg-peach", "bg-butter", "bg-blush"] as const;

export function ProductCard({
  product,
  index = 0,
}: {
  product: ProductListItemDTO;
  index?: number;
}) {
  const { t, f, locale } = useT();
  const name = localizedName(product, locale);
  const shopName = localizedName(
    { nameEn: product.shopNameEn, nameSi: product.shopNameSi },
    locale,
  );
  const img = product.imageUrl ?? "/placeholder-flower.svg";
  const isWholesale = product.listingType === "wholesale";

  return (
    <Link
      to="/$locale/products/$slug"
      params={{ locale, slug: product.slug }}
      className="group flex h-full flex-col overflow-hidden rounded-lg border border-border/60 bg-card transition-transform hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <div
        className={cn(
          "relative aspect-square overflow-hidden",
          STAGE_TINTS[index % STAGE_TINTS.length],
        )}
      >
        <img
          src={img}
          alt={name}
          loading="lazy"
          className="size-full object-cover mix-blend-multiply transition-transform duration-300 group-hover:scale-[1.04]"
        />
        <Badge
          variant={isWholesale ? "brand" : "sticker"}
          className="absolute left-2.5 top-2.5"
        >
          {isWholesale ? t.catalog.wholesaleBadge : t.catalog.retailBadge}
        </Badge>
      </div>
      <div className="flex flex-1 flex-col gap-2 p-4">
        <h3 className="font-display line-clamp-2 text-base leading-snug text-foreground">
          {name}
        </h3>
        <PriceBlock
          price={product.price}
          compareAtPrice={product.compareAtPrice}
          listingType={product.listingType}
          size="sm"
        />
        {isWholesale && product.minOrderQty ? (
          <p className="text-xs text-muted-foreground">
            {f(t.catalog.minOrder, { qty: product.minOrderQty })}
          </p>
        ) : null}
        <p className="mt-auto pt-1 text-xs text-muted-foreground">
          {f(t.catalog.soldBy, { shop: shopName })}
        </p>
      </div>
    </Link>
  );
}
