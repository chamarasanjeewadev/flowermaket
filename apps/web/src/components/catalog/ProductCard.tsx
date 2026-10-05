import { Link } from "@tanstack/react-router";
import { Badge } from "@flowers/ui/components/badge";
import { cn } from "@flowers/ui/lib/utils";
import { localizedName } from "../../i18n";
import { useT } from "../../i18n/react";
import type { ProductListItemDTO } from "../../server/catalog";
import { PriceBlock } from "./PriceBlock";
import { AddToEnquiryButton } from "./AddToEnquiryButton";
import { SELLER_TYPE_STYLE } from "../sellers/SellerTypeBadges";

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
  const sellerType = product.shopSellerTypes[0] ?? "florist";
  const SellerIcon = SELLER_TYPE_STYLE[sellerType].Icon;

  // Stretched-link pattern: the whole card is clickable via an absolutely
  // positioned link, while the "Add to enquiry" button sits above it (higher
  // z-index) so it stays independently interactive without nesting a <button>
  // inside an <a>.
  return (
    <article className="group relative flex h-full flex-col overflow-hidden rounded-lg border border-border/60 bg-card transition-transform hover:-translate-y-0.5 focus-within:ring-2 focus-within:ring-ring">
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
          className="absolute left-2 top-2 sm:left-2.5 sm:top-2.5"
        >
          {isWholesale ? t.catalog.wholesaleBadge : t.catalog.retailBadge}
        </Badge>
      </div>
      <div className="flex flex-1 flex-col gap-1.5 p-3 sm:gap-2 sm:p-4">
        <h3 className="font-display line-clamp-2 text-[15px] leading-snug text-foreground sm:text-base">
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
        <Link
          to="/$locale/shops/$slug"
          params={{ locale, slug: product.shopSlug }}
          className="relative z-20 mt-auto inline-flex min-w-0 items-center gap-1.5 self-start pt-1 text-xs text-muted-foreground hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          title={t.catalog.sellerTypes[sellerType]}
        >
          <SellerIcon className="size-3.5 shrink-0" aria-hidden="true" />
          <span className="truncate">{f(t.catalog.soldBy, { shop: shopName })}</span>
        </Link>
        <div className="relative z-20 pt-1.5 sm:pt-2">
          <AddToEnquiryButton
            product={{
              id: product.id,
              slug: product.slug,
              nameEn: product.nameEn,
              nameSi: product.nameSi,
              price: product.price,
              listingType: product.listingType,
            }}
            variant="card"
            className="w-full sm:w-auto"
          />
        </div>
      </div>

      <Link
        to="/$locale/products/$slug"
        params={{ locale, slug: product.slug }}
        aria-label={name}
        className="absolute inset-0 z-10 focus-visible:outline-none"
      >
        <span className="sr-only">{name}</span>
      </Link>
    </article>
  );
}
