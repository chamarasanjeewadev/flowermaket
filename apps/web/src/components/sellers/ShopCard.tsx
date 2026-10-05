import { Link } from "@tanstack/react-router";
import { formatRupees } from "@flowers/api/money";
import { cn } from "@flowers/ui/lib/utils";
import { ArrowUpRight, BadgeCheck, MapPin } from "lucide-react";
import { localizedName } from "../../i18n";
import { useT } from "../../i18n/react";
import type { ShopDirectoryDTO } from "../../server/catalog";
import { SELLER_TYPE_STYLE, SellerTypeBadges } from "./SellerTypeBadges";
import { ShopAvatar } from "./ShopAvatar";

/**
 * Directory card: a product-photo collage (or banner) so buyers see what a
 * seller sells before clicking, then identity, types, location and stats.
 */
export function ShopCard({ shop }: { shop: ShopDirectoryDTO }) {
  const { t, f, locale } = useT();
  const name = localizedName(shop, locale);
  const districtName = locale === "si" ? shop.districtNameSi : shop.districtNameEn;
  const primary = shop.sellerTypes[0] ?? "florist";
  const previews = shop.previewImageUrls;

  return (
    <Link
      to="/$locale/shops/$slug"
      params={{ locale, slug: shop.slug }}
      className="group flex h-full flex-col overflow-hidden rounded-xl border border-border/60 bg-card transition-all hover:-translate-y-0.5 hover:shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      {/* Media */}
      <div
        className={cn(
          "relative aspect-[16/10] overflow-hidden",
          SELLER_TYPE_STYLE[primary].tile,
        )}
      >
        {shop.bannerUrl ? (
          <img
            src={shop.bannerUrl}
            alt=""
            loading="lazy"
            className="size-full object-cover transition-transform duration-500 group-hover:scale-[1.03]"
          />
        ) : previews.length > 0 ? (
          <div
            className={cn(
              "grid size-full gap-0.5",
              previews.length === 1
                ? "grid-cols-1"
                : previews.length === 2
                  ? "grid-cols-2"
                  : "grid-cols-3 grid-rows-2",
            )}
          >
            {previews.slice(0, 3).map((url, i) => (
              <img
                key={url}
                src={url}
                alt=""
                loading="lazy"
                className={cn(
                  "size-full object-cover transition-transform duration-500 group-hover:scale-[1.03]",
                  previews.length >= 3 && i === 0 && "col-span-2 row-span-2",
                )}
              />
            ))}
          </div>
        ) : (
          <div className="flex size-full items-center justify-center">
            {(() => {
              const { Icon } = SELLER_TYPE_STYLE[primary];
              return (
                <Icon className="size-12 text-foreground/25" aria-hidden="true" />
              );
            })()}
          </div>
        )}
        {shop.productCount > 0 && (
          <span className="absolute bottom-3 right-3 rounded-full bg-background/90 px-2.5 py-1 text-xs font-semibold text-foreground backdrop-blur">
            {shop.productCount === 1
              ? t.shops.oneProduct
              : f(t.shops.productsCount, { count: shop.productCount })}
          </span>
        )}
      </div>

      {/* Body */}
      <div className="relative flex flex-1 flex-col px-5 pb-5">
        <ShopAvatar
          name={shop.nameEn}
          logoUrl={shop.logoUrl}
          sellerTypes={shop.sellerTypes}
          className="-mt-7 size-14 text-lg"
        />
        <div className="mt-3 flex items-start justify-between gap-2">
          <h2 className="font-display text-xl leading-tight">{name}</h2>
          {shop.verificationStatus === "verified" && (
            <BadgeCheck
              className="mt-0.5 size-5 shrink-0 text-sage-deep"
              aria-label={t.catalog.verified}
            />
          )}
        </div>
        <p className="mt-1 inline-flex items-center gap-1 text-xs text-muted-foreground">
          <MapPin className="size-3.5" aria-hidden="true" />
          {shop.city && shop.city.toLowerCase() !== districtName.toLowerCase()
            ? `${shop.city}, ${districtName}`
            : districtName}
        </p>
        <SellerTypeBadges types={shop.sellerTypes} size="xs" className="mt-3" />

        <div className="min-h-5 flex-1" />
        <div className="flex items-center justify-between gap-2 border-t border-border/60 pt-4 text-sm">
          <span className={shop.minPrice === null ? "text-muted-foreground" : "font-medium"}>
            {shop.minPrice === null
              ? t.shops.noProductsYet
              : f(t.shops.fromPrice, { price: formatRupees(shop.minPrice) })}
          </span>
          <span className="inline-flex items-center gap-1 font-medium text-brand">
            {t.shops.visitShop}
            <ArrowUpRight
              className="size-4 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5"
              aria-hidden="true"
            />
          </span>
        </div>
      </div>
    </Link>
  );
}
