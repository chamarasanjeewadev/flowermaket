import * as React from "react";
import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { formatRupees } from "@flowers/api/money";
import { Badge } from "@flowers/ui/components/badge";
import { ArrowUpRight, Clock, Info, MapPin, Store } from "lucide-react";
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
  socialMeta,
} from "../../lib/seo";
import { getProductBySlug } from "../../server/catalog";

function truncateMetaDescription(value: string): string {
  if (value.length <= 160) return value;
  return `${value.slice(0, 157).trimEnd()}...`;
}

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
    const districtName =
      locale === "si"
        ? product.shop.districtNameSi
        : product.shop.districtNameEn;
    const shopName =
      locale === "si" && product.shop.nameSi
        ? product.shop.nameSi
        : product.shop.nameEn;
    const productDescription =
      locale === "si" && product.descriptionSi
        ? product.descriptionSi
        : product.descriptionEn;
    const listingSummary =
      locale === "si"
        ? `${districtName} හි ${shopName} විසින් ${formatRupees(product.price)} සඳහන් මිලට ලැයිස්තුගත කළ ${name} බලන්න. ලබා ගත හැකි බව සහ සැපයීම තහවුරු කිරීමට විමසන්න.`
        : `View ${name} in ${districtName}, listed at ${formatRupees(product.price)} by ${shopName}. Send an enquiry to confirm availability, condition, and fulfilment.`;
    const metaDescription = truncateMetaDescription(
      productDescription
        ? `${listingSummary} ${productDescription}`
        : listingSummary,
    );
    const title =
      locale === "si"
        ? `${name} — ${districtName}, ශ්‍රී ලංකාව | FlowerMarket.lk`
        : `${name} in ${districtName}, Sri Lanka | FlowerMarket.lk`;
    const imageUrls = product.images.map((i) => absoluteUrl(i.url));
    const availability =
      product.stockQty === null
        ? "https://schema.org/PreOrder"
        : product.stockQty > 0
          ? "https://schema.org/InStock"
          : "https://schema.org/OutOfStock";
    const socialAvailability =
      product.stockQty === null
        ? "preorder"
        : product.stockQty > 0
          ? "in stock"
          : "out of stock";

    const canonicalUrl = absoluteUrl(`/${locale}/products/${product.slug}`);

    const jsonLd = {
      "@context": "https://schema.org",
      "@type": "Product",
      name,
      description: productDescription ?? listingSummary,
      inLanguage: locale,
      mainEntityOfPage: canonicalUrl,
      ...(imageUrls.length > 0 ? { image: imageUrls } : {}),
      sku: product.id,
      category: product.category.nameEn,
      offers: {
        "@type": "Offer",
        url: canonicalUrl,
        priceCurrency: "LKR",
        price: (product.price / 100).toFixed(2),
        itemCondition: "https://schema.org/NewCondition",
        availability,
        seller: {
          "@type": "Organization",
          name: product.shop.nameEn,
          url: absoluteUrl(`/${locale}/shops/${product.shop.slug}`),
        },
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
        { title },
        { name: "description", content: metaDescription },
        {
          property: "product:price:amount",
          content: (product.price / 100).toFixed(2),
        },
        { property: "product:price:currency", content: "LKR" },
        { property: "product:availability", content: socialAvailability },
        ...(imageUrls[0]
          ? [{ property: "og:image:alt", content: name }]
          : []),
        ...socialMeta({
          title,
          description: metaDescription,
          url: canonicalUrl,
          image: imageUrls[0],
          type: "product",
          locale,
        }),
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

          <p className="flex items-start gap-2 border-l-2 border-border pl-3 text-xs leading-relaxed text-muted-foreground">
            <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
            <span>{t.catalog.sellerNotice}</span>
          </p>

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

          <nav
            aria-label={t.catalog.district}
            className="flex flex-wrap items-center gap-x-5 gap-y-2 pt-1 text-sm"
          >
            <Link
              to="/$locale/fresh-flowers-near-me"
              params={{ locale }}
              className="inline-flex items-center gap-1.5 font-medium text-brand hover:underline"
            >
              <MapPin className="size-4" aria-hidden="true" />
              {t.catalog.nearMeLink}
            </Link>
            <Link
              to="/$locale/products"
              params={{ locale }}
              search={{ district: product.shop.district }}
              className="inline-flex items-center gap-1.5 text-muted-foreground hover:text-foreground hover:underline"
            >
              {f(t.catalog.moreInDistrict, { district: districtName })}
              <ArrowUpRight className="size-4" aria-hidden="true" />
            </Link>
          </nav>
        </div>
      </div>
    </div>
  );
}
