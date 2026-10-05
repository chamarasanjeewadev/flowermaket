import * as React from "react";
import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { formatRupees } from "@flowers/api/money";
import { buttonVariants } from "@flowers/ui/components/button";
import { Skeleton } from "@flowers/ui/components/skeleton";
import { cn } from "@flowers/ui/lib/utils";
import { ArrowLeft, BadgeCheck, MapPin, MessageCircle } from "lucide-react";
import { ProductGrid, ProductGridSkeleton } from "../../components/catalog/ProductGrid";
import {
  SELLER_TYPE_STYLE,
  SellerTypeBadges,
} from "../../components/sellers/SellerTypeBadges";
import { ShopAvatar } from "../../components/sellers/ShopAvatar";
import {
  getDict,
  localizedCategoryName,
  localizedDescription,
  localizedName,
  type Locale,
} from "../../i18n";
import { useT } from "../../i18n/react";
import { absoluteUrl, hreflangLinks } from "../../lib/site";
import {
  breadcrumbJsonLd,
  jsonLdScript,
  localePath,
  socialMeta,
} from "../../lib/seo";
import { getCategoriesWithCounts, getShopBySlug } from "../../server/catalog";

export const Route = createFileRoute("/$locale/shops/$slug")({
  loader: async ({ params }) => {
    const [data, categories] = await Promise.all([
      getShopBySlug({ data: params.slug }),
      getCategoriesWithCounts(),
    ]);
    if (!data) throw notFound();
    return { ...data, categories };
  },
  head: ({ loaderData, params }) => {
    const locale = params.locale as Locale;
    const shop = loaderData?.shop;
    if (!shop) {
      return { links: hreflangLinks(`/shops/${params.slug}`, locale) };
    }
    const dict = getDict("en");
    const name = locale === "si" && shop.nameSi ? shop.nameSi : shop.nameEn;
    // Factual fallback description when the shop hasn't written its own.
    const typeList = shop.sellerTypes
      .map((type) => dict.catalog.sellerTypes[type].toLowerCase())
      .join(" and ");
    const fallbackDescription = `${shop.nameEn} is a flower ${typeList} in ${shop.districtNameEn}, Sri Lanka. Browse its published products and listed prices on FlowerMarket.lk.`;
    const description =
      (locale === "si" && shop.descriptionSi
        ? shop.descriptionSi
        : shop.descriptionEn) ?? fallbackDescription;
    const canonicalUrl = absoluteUrl(`/${locale}/shops/${shop.slug}`);
    const title = `${name} — Sri Lanka | FlowerMarket.lk`;
    const jsonLd = {
      "@context": "https://schema.org",
      "@type": shop.sellerTypes.includes("florist") ? "Florist" : "LocalBusiness",
      name: shop.nameEn,
      url: canonicalUrl,
      description: shop.descriptionEn ?? fallbackDescription,
      ...(shop.logoUrl ? { logo: shop.logoUrl } : {}),
      ...(shop.bannerUrl ? { image: shop.bannerUrl } : {}),
      address: {
        "@type": "PostalAddress",
        addressRegion: shop.districtNameEn,
        addressCountry: "LK",
        ...(shop.city ? { addressLocality: shop.city } : {}),
      },
    };
    const breadcrumbs = breadcrumbJsonLd([
      { name: "Home", path: localePath(locale, "/") },
      { name: dict.shops.title, path: localePath(locale, "/shops") },
      { name: shop.nameEn, path: localePath(locale, `/shops/${shop.slug}`) },
    ]);
    return {
      meta: [
        { title },
        { name: "description", content: description },
        ...socialMeta({
          title,
          description,
          url: canonicalUrl,
          locale,
        }),
      ],
      links: hreflangLinks(`/shops/${shop.slug}`, locale),
      scripts: [jsonLdScript(jsonLd), jsonLdScript(breadcrumbs)],
    };
  },
  pendingComponent: PendingShop,
  component: ShopPage,
});

function PendingShop() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-6">
      <Skeleton className="h-44 w-full rounded-2xl sm:h-56" />
      <div className="mt-6 space-y-3">
        <Skeleton className="h-9 w-1/2" />
        <Skeleton className="h-4 w-1/4" />
      </div>
      <div className="mt-10">
        <ProductGridSkeleton count={8} />
      </div>
    </div>
  );
}

const ALL = "all";

function ShopPage() {
  const { shop, products, categories } = Route.useLoaderData();
  const { t, f, locale } = useT();
  const [category, setCategory] = React.useState<string>(ALL);

  const name = localizedName(shop, locale);
  const description = localizedDescription(shop, locale);
  const districtName = locale === "si" ? shop.districtNameSi : shop.districtNameEn;
  const location =
    shop.city && shop.city.toLowerCase() !== districtName.toLowerCase()
      ? `${shop.city}, ${districtName}`
      : districtName;
  const primary = shop.sellerTypes[0] ?? "florist";
  const minPrice = products.length
    ? Math.min(...products.map((p) => p.price))
    : null;

  // Category chips: only categories this shop actually sells in.
  const shopCategorySlugs = new Set(products.map((p) => p.categorySlug));
  const shopCategories = categories.filter((c) => shopCategorySlugs.has(c.slug));
  const visible =
    category === ALL ? products : products.filter((p) => p.categorySlug === category);

  const collage = products
    .map((p) => p.imageUrl)
    .filter((u): u is string => Boolean(u))
    .slice(0, 4);

  return (
    <div className="mx-auto max-w-6xl px-4 pb-16 pt-6">
      <Link
        to="/$locale/shops"
        params={{ locale }}
        search={{}}
        className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" aria-hidden="true" />
        {t.shops.backToShops}
      </Link>

      {/* Banner */}
      <div
        className={cn(
          "relative h-44 overflow-hidden rounded-2xl sm:h-60",
          SELLER_TYPE_STYLE[primary].tile,
        )}
      >
        {shop.bannerUrl ? (
          <img src={shop.bannerUrl} alt="" className="size-full object-cover" />
        ) : collage.length > 0 ? (
          <div
            className="grid size-full gap-0.5"
            style={{ gridTemplateColumns: `repeat(${collage.length}, minmax(0, 1fr))` }}
          >
            {collage.map((url) => (
              <img key={url} src={url} alt="" className="size-full object-cover" />
            ))}
          </div>
        ) : (
          <div className="flex size-full items-center justify-end overflow-hidden pr-10">
            {(() => {
              const { Icon } = SELLER_TYPE_STYLE[primary];
              return (
                <Icon className="size-48 text-foreground/[0.06]" aria-hidden="true" />
              );
            })()}
          </div>
        )}
        {(shop.bannerUrl || collage.length > 0) && (
          <div className="absolute inset-0 bg-gradient-to-t from-foreground/30 to-transparent" />
        )}
      </div>

      {/* Identity */}
      <header className="relative px-1 sm:px-4">
        <ShopAvatar
          name={shop.nameEn}
          logoUrl={shop.logoUrl}
          sellerTypes={shop.sellerTypes}
          className="-mt-12 size-24 border-4 text-3xl sm:-mt-14 sm:size-28"
        />
        <div className="mt-4 flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-2xl">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="font-display text-4xl leading-tight sm:text-5xl">{name}</h1>
              {shop.verificationStatus === "verified" && (
                <span className="inline-flex items-center gap-1 rounded-full bg-sage px-2.5 py-1 text-xs font-semibold text-sage-deep">
                  <BadgeCheck className="size-3.5" aria-hidden="true" />
                  {t.catalog.verified}
                </span>
              )}
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2">
              <SellerTypeBadges types={shop.sellerTypes} />
              <span className="inline-flex items-center gap-1 text-sm text-muted-foreground">
                <MapPin className="size-4" aria-hidden="true" />
                {location}
              </span>
            </div>
            {description && (
              <p className="mt-4 text-base leading-relaxed text-foreground/80">
                {description}
              </p>
            )}
          </div>

          <dl className="grid shrink-0 grid-cols-3 divide-x divide-border rounded-xl border border-border bg-card text-center">
            <div className="px-4 py-3 sm:px-6">
              <dt className="text-xs text-muted-foreground">{t.shops.statProducts}</dt>
              <dd className="mt-0.5 font-display text-2xl">{products.length}</dd>
            </div>
            <div className="px-4 py-3 sm:px-6">
              <dt className="text-xs text-muted-foreground">{t.shops.statFrom}</dt>
              <dd className="mt-1.5 text-sm font-semibold">
                {minPrice === null ? "—" : formatRupees(minPrice)}
              </dd>
            </div>
            <div className="px-4 py-3 sm:px-6">
              <dt className="text-xs text-muted-foreground">{t.shops.statLocation}</dt>
              <dd className="mt-1.5 inline-flex items-center gap-1 text-sm font-semibold">
                <MapPin className="size-3.5 shrink-0" aria-hidden="true" />
                <span className="line-clamp-1">{districtName}</span>
              </dd>
            </div>
          </dl>
        </div>
      </header>

      {/* Products */}
      <section aria-labelledby="shop-products" className="mt-12">
        <div className="mb-5 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <h2 id="shop-products" className="font-display text-2xl sm:text-3xl">
            {t.catalog.shopProducts}
          </h2>
          {shopCategories.length > 1 && (
            <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0">
              {[{ slug: ALL, label: t.shops.allCategories }, ...shopCategories.map((c) => ({
                slug: c.slug,
                label: localizedCategoryName(c, locale),
              }))].map((c) => (
                <button
                  key={c.slug}
                  type="button"
                  onClick={() => setCategory(c.slug)}
                  aria-pressed={category === c.slug}
                  className={cn(
                    "shrink-0 rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    category === c.slug
                      ? "border-foreground bg-foreground text-background"
                      : "border-border bg-card text-foreground/80 hover:border-foreground/40",
                  )}
                >
                  {c.label}
                </button>
              ))}
            </div>
          )}
        </div>

        {products.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border bg-card px-6 py-14 text-center">
            <p className="font-display text-2xl">{t.shops.storefrontEmpty}</p>
            <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
              {t.shops.storefrontEmptyBody}
            </p>
            <div className="mt-6 flex flex-wrap justify-center gap-3">
              <Link
                to="/$locale/shops"
                params={{ locale }}
                search={{ type: primary }}
                className={cn(buttonVariants({ variant: "outline", size: "pill" }))}
              >
                {f(t.shops.browseSimilar, {
                  type: t.catalog.sellerTypesPlural[primary].toLowerCase(),
                })}
              </Link>
              <Link
                to="/$locale/enquiry"
                params={{ locale }}
                className={cn(buttonVariants({ size: "pill" }))}
              >
                <MessageCircle className="size-4" aria-hidden="true" />
                {t.shops.sendEnquiry}
              </Link>
            </div>
          </div>
        ) : (
          <ProductGrid products={visible} />
        )}
      </section>
    </div>
  );
}
