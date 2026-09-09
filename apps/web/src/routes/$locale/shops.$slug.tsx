import { createFileRoute, notFound } from "@tanstack/react-router";
import { Badge } from "@flowers/ui/components/badge";
import { BadgeCheck, MapPin } from "lucide-react";
import { ProductGrid } from "../../components/catalog/ProductGrid";
import {
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
} from "../../lib/seo";
import { getShopBySlug } from "../../server/catalog";

export const Route = createFileRoute("/$locale/shops/$slug")({
  loader: async ({ params }) => {
    const data = await getShopBySlug({ data: params.slug });
    if (!data) throw notFound();
    return data;
  },
  head: ({ loaderData, params }) => {
    const locale = params.locale as Locale;
    const shop = loaderData?.shop;
    if (!shop) {
      return { links: hreflangLinks(`/shops/${params.slug}`, locale) };
    }
    const name = locale === "si" && shop.nameSi ? shop.nameSi : shop.nameEn;
    // Keyword-rich fallback description when the shop hasn't written its own.
    const sellerType = shop.shopType === "grower" ? "grower" : "florist";
    const fallbackDescription = `${shop.nameEn} is a local flower ${sellerType} in ${shop.districtNameEn}, Sri Lanka. Shop fresh flowers direct — grower-direct prices, no middleman — on FlowerMarket.lk.`;
    const description =
      (locale === "si" && shop.descriptionSi
        ? shop.descriptionSi
        : shop.descriptionEn) ?? fallbackDescription;
    const canonicalUrl = absoluteUrl(`/${locale}/shops/${shop.slug}`);
    const jsonLd = {
      "@context": "https://schema.org",
      "@type": "Florist",
      name: shop.nameEn,
      url: canonicalUrl,
      description: shop.descriptionEn ?? fallbackDescription,
      image: absoluteUrl("/og-image.png"),
      address: {
        "@type": "PostalAddress",
        addressRegion: shop.districtNameEn,
        addressCountry: "LK",
        ...(shop.city ? { addressLocality: shop.city } : {}),
      },
    };
    const breadcrumbs = breadcrumbJsonLd([
      { name: "Home", path: localePath(locale, "/") },
      { name: shop.nameEn, path: localePath(locale, `/shops/${shop.slug}`) },
    ]);
    return {
      meta: [
        { title: `${name} — Sri Lanka | FlowerMarket.lk` },
        { name: "description", content: description },
        { property: "og:title", content: name },
        { property: "og:description", content: description },
        { property: "og:url", content: canonicalUrl },
      ],
      links: hreflangLinks(`/shops/${shop.slug}`, locale),
      scripts: [jsonLdScript(jsonLd), jsonLdScript(breadcrumbs)],
    };
  },
  component: ShopPage,
});

function ShopPage() {
  const { shop, products } = Route.useLoaderData();
  const { t, locale } = useT();
  const name = localizedName(shop, locale);
  const description = localizedDescription(shop, locale);
  const districtName =
    locale === "si" ? shop.districtNameSi : shop.districtNameEn;

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <div className="mb-8 border-b pb-6">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="font-display text-4xl sm:text-5xl">{name}</h1>
          {shop.verificationStatus === "verified" && (
            <Badge variant="success" className="gap-1">
              <BadgeCheck className="size-3.5" aria-hidden="true" />
              {t.catalog.verified}
            </Badge>
          )}
          <Badge variant="secondary">
            {shop.shopType === "grower" ? t.catalog.grower : t.catalog.florist}
          </Badge>
        </div>
        <p className="mt-2 inline-flex items-center gap-1.5 text-sm text-muted-foreground">
          <MapPin className="size-4" aria-hidden="true" />
          {districtName}
        </p>
        {description && (
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-foreground">
            {description}
          </p>
        )}
      </div>

      <h2 className="mb-5 font-display text-2xl sm:text-3xl">
        {t.catalog.shopProducts}
      </h2>
      <ProductGrid products={products} />
    </div>
  );
}
