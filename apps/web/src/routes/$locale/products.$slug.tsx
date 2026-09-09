import * as React from "react";
import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { Badge } from "@flowers/ui/components/badge";
import { Clock, Store } from "lucide-react";
import { PriceBlock } from "../../components/catalog/PriceBlock";
import { WholesaleInfo } from "../../components/catalog/WholesaleInfo";
import { AddToEnquiryButton } from "../../components/catalog/AddToEnquiryButton";
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
import { getProductBySlug } from "../../server/catalog";

export const Route = createFileRoute("/$locale/products/$slug")({
  loader: async ({ params }) => {
    const product = await getProductBySlug({ data: params.slug });
    if (!product) throw notFound();
    return { product };
  },
  head: ({ loaderData, params }) => {
    const locale = params.locale as Locale;
    const product = loaderData?.product;
    if (!product) {
      return { links: hreflangLinks(`/products/${params.slug}`, locale) };
    }
    const name = locale === "si" && product.nameSi ? product.nameSi : product.nameEn;
    const description =
      (locale === "si" && product.descriptionSi
        ? product.descriptionSi
        : product.descriptionEn) ?? name;
    const imageUrls = product.images.map((i) => absoluteUrl(i.url));
    const availability =
      product.stockQty === null
        ? "https://schema.org/PreOrder"
        : product.stockQty > 0
          ? "https://schema.org/InStock"
          : "https://schema.org/OutOfStock";

    const canonicalUrl = absoluteUrl(`/${locale}/products/${product.slug}`);
    // Offers carry a validity horizon so Rich Results doesn't flag the price as
    // stale — end of next calendar year is a safe rolling window.
    const priceValidUntil = `${new Date().getFullYear() + 1}-12-31`;

    const jsonLd = {
      "@context": "https://schema.org",
      "@type": "Product",
      name,
      description,
      ...(imageUrls.length > 0 ? { image: imageUrls } : {}),
      sku: product.id,
      category: product.category.nameEn,
      brand: { "@type": "Brand", name: product.shop.nameEn },
      offers: {
        "@type": "Offer",
        url: canonicalUrl,
        priceCurrency: "LKR",
        price: (product.price / 100).toFixed(2),
        priceValidUntil,
        itemCondition: "https://schema.org/NewCondition",
        availability,
        seller: { "@type": "Organization", name: product.shop.nameEn },
      },
    };

    const breadcrumbs = breadcrumbJsonLd([
      { name: "Home", path: localePath(locale, "/") },
      {
        name: product.category.nameEn,
        path: localePath(locale, `/c/${product.category.slug}`),
      },
      {
        name: product.nameEn,
        path: localePath(locale, `/products/${product.slug}`),
      },
    ]);

    return {
      meta: [
        { title: `${name} | FlowerMarket.lk` },
        { name: "description", content: description },
        { property: "og:type", content: "product" },
        { property: "og:title", content: name },
        { property: "og:description", content: description },
        { property: "og:url", content: canonicalUrl },
        ...(imageUrls.length > 0
          ? [{ property: "og:image", content: imageUrls[0]! }]
          : []),
      ],
      links: hreflangLinks(`/products/${product.slug}`, locale),
      scripts: [jsonLdScript(jsonLd), jsonLdScript(breadcrumbs)],
    };
  },
  component: ProductDetailPage,
});

function ProductDetailPage() {
  const { product } = Route.useLoaderData();
  const { t, f, locale } = useT();
  const [active, setActive] = React.useState(0);

  const name = localizedName(product, locale);
  const description = localizedDescription(product, locale);
  const showEnHint = locale === "si" && !product.nameSi;
  const isWholesale = product.listingType === "wholesale";
  const images = product.images.length
    ? product.images
    : [{ url: "/placeholder-flower.svg", altText: name }];
  const shopName = localizedName(product.shop, locale);
  const districtName =
    locale === "si"
      ? product.shop.districtNameSi
      : product.shop.districtNameEn;

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      {/* Breadcrumb */}
      <nav className="mb-4 text-sm text-muted-foreground" aria-label="Breadcrumb">
        <Link to="/$locale" params={{ locale }} className="hover:text-foreground">
          {t.catalog.breadcrumbHome}
        </Link>
        <span className="mx-1.5">/</span>
        <Link
          to="/$locale/c/$slug"
          params={{ locale, slug: product.category.slug }}
          className="hover:text-foreground"
        >
          {localizedName(product.category, locale)}
        </Link>
      </nav>

      <div className="grid gap-8 lg:grid-cols-2">
        {/* Gallery */}
        <div>
          <div className="aspect-square overflow-hidden rounded-lg border border-border/60 bg-butter">
            <img
              src={images[active]!.url}
              alt={images[active]!.altText ?? name}
              className="size-full object-cover mix-blend-multiply"
            />
          </div>
          {images.length > 1 && (
            <ul className="mt-3 flex gap-2">
              {images.map((img, i) => (
                <li key={i}>
                  <button
                    type="button"
                    onClick={() => setActive(i)}
                    aria-label={`Image ${i + 1}`}
                    className={
                      "size-16 overflow-hidden rounded-lg border-2 transition-colors " +
                      (i === active ? "border-brand" : "border-border")
                    }
                  >
                    <img
                      src={img.url}
                      alt={img.altText ?? name}
                      className="size-full object-cover"
                    />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Details */}
        <div className="flex flex-col gap-4">
          <div className="flex items-center gap-2">
            <Badge variant={isWholesale ? "brand" : "secondary"}>
              {isWholesale ? t.catalog.wholesaleBadge : t.catalog.retailBadge}
            </Badge>
          </div>

          <h1 className="font-display text-3xl sm:text-4xl">{name}</h1>

          <PriceBlock
            price={product.price}
            compareAtPrice={product.compareAtPrice}
            listingType={product.listingType}
            size="lg"
          />

          {isWholesale && (
            <WholesaleInfo
              price={product.price}
              minOrderQty={product.minOrderQty}
            />
          )}

          {/* Stock / lead time */}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
            <span>
              {product.stockQty === null
                ? t.catalog.madeToOrder
                : product.stockQty > 0
                  ? t.catalog.inStock
                  : t.catalog.madeToOrder}
            </span>
            {product.leadTimeDays ? (
              <span className="inline-flex items-center gap-1.5">
                <Clock className="size-4" aria-hidden="true" />
                {f(t.catalog.leadTime, { days: product.leadTimeDays })}
              </span>
            ) : null}
          </div>

          {/* Enquiry CTA — add to the WhatsApp enquiry list */}
          <div className="pt-1">
            <AddToEnquiryButton
              product={{
                id: product.id,
                slug: product.slug,
                nameEn: product.nameEn,
                nameSi: product.nameSi,
                price: product.price,
                listingType: product.listingType,
              }}
              variant="detail"
              className="w-full sm:w-auto"
            />
            <p className="mt-2 text-xs text-muted-foreground">
              {t.enquiry.detailHint}
            </p>
          </div>

          {description && (
            <p className="whitespace-pre-line text-sm leading-relaxed text-foreground">
              {description}
            </p>
          )}
          {showEnHint && (
            <p className="text-xs italic text-muted-foreground">
              {t.catalog.enOnlyHint}
            </p>
          )}

          {/* Shop card */}
          <Link
            to="/$locale/shops/$slug"
            params={{ locale, slug: product.shop.slug }}
            className="mt-2 flex items-center gap-3 rounded-lg border p-4 transition-colors hover:border-brand/50"
          >
            <span className="flex size-10 items-center justify-center rounded-full bg-accent text-accent-foreground">
              <Store className="size-5" aria-hidden="true" />
            </span>
            <span className="flex flex-col">
              <span className="text-sm font-medium text-foreground">
                {f(t.catalog.soldBy, { shop: shopName })}
              </span>
              <span className="text-xs text-muted-foreground">
                {product.shop.shopType === "grower"
                  ? t.catalog.grower
                  : t.catalog.florist}{" "}
                · {districtName}
              </span>
            </span>
          </Link>
        </div>
      </div>
    </div>
  );
}
