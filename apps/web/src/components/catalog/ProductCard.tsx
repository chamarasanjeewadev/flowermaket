import { Link } from "@tanstack/react-router";
import { Badge } from "@flowers/ui/components/badge";
import { localizedName } from "../../i18n";
import { useT } from "../../i18n/react";
import type { ProductListItemDTO } from "../../server/catalog";
import { PriceBlock } from "./PriceBlock";
import { AddToEnquiryButton } from "./AddToEnquiryButton";
import { SELLER_TYPE_STYLE } from "../sellers/SellerTypeBadges";

export function ProductCard({
  product,
}: {
  product: ProductListItemDTO;
  /** @deprecated Cards share one neutral stage now; kept for call sites. */
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
    <article className="group relative flex h-full flex-col rounded-2xl focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-4 focus-within:ring-offset-background">
      <div
        className="relative aspect-square overflow-hidden rounded-2xl bg-stage">
        <img
          src={img}
          alt={name}
          loading="lazy"
          className="size-full object-cover mix-blend-multiply transition-transform duration-700 ease-out group-hover:scale-[1.03] motion-reduce:transition-none"
        />
        <Badge
          variant={isWholesale ? "brand" : "sticker"}
          className="absolute left-2 top-2 sm:left-2.5 sm:top-2.5"
        >
          {isWholesale ? t.catalog.wholesaleBadge : t.catalog.retailBadge}
        </Badge>
      </div>
      <div className="flex flex-1 flex-col gap-1 px-0.5 pt-3">
        <h3 className="line-clamp-2 text-[15px] font-semibold leading-snug tracking-[-0.01em] text-foreground">
          {name}
        </h3>
        <PriceBlock
          price={product.price}
          compareAtPrice={product.compareAtPrice}
          priceMax={product.priceMax}
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
          className="relative z-20 mt-auto inline-flex min-w-0 max-w-full items-center gap-1.5 self-start pt-1 text-xs text-muted-foreground hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          title={t.catalog.sellerTypes[sellerType]}
        >
          <SellerIcon className="size-3.5 shrink-0" aria-hidden="true" />
          <span className="truncate">{f(t.catalog.soldBy, { shop: shopName })}</span>
        </Link>
        <div className="relative z-20 pt-2">
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
