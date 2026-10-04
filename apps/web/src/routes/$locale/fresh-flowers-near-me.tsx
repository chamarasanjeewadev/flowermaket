import { createFileRoute, Link } from "@tanstack/react-router";
import { DISTRICTS } from "@flowers/api/constants";
import { buttonVariants } from "@flowers/ui/components/button";
import {
  ArrowUpRight,
  CheckCircle2,
  MapPin,
  MessageCircle,
  Search,
} from "lucide-react";
import { FlowerShowcase } from "../../components/catalog/FlowerShowcase";
import { ProductGrid } from "../../components/catalog/ProductGrid";
import { listFeaturedVariants } from "../../server/flowers";
import type { Locale } from "../../i18n";
import { useT } from "../../i18n/react";
import { absoluteUrl, hreflangLinks } from "../../lib/site";
import {
  breadcrumbJsonLd,
  jsonLdScript,
  localePath,
  socialMeta,
} from "../../lib/seo";
import { listProducts } from "../../server/catalog";

const SEO_PATH = "/fresh-flowers-near-me";

export const Route = createFileRoute("/$locale/fresh-flowers-near-me")({
  loader: async () => {
    const [products, featuredFlowers] = await Promise.all([
      listProducts({ data: {} }).then((r) => r.items.slice(0, 8)),
      listFeaturedVariants(),
    ]);
    return { products, featuredFlowers };
  },
  head: ({ loaderData, params }) => {
    const locale = params.locale as Locale;
    const title =
      locale === "si"
        ? "ශ්‍රී ලංකාවේ මා අසල නැවුම් මල් | FlowerMarket.lk"
        : "Fresh Flowers Near Me in Sri Lanka | FlowerMarket.lk";
    const description =
      locale === "si"
        ? "ඔබ අසල මල් සොයන්න. ශ්‍රී ලංකාවේ දිස්ත්‍රික්කය අනුව සිල්ලර මල් කළඹ සහ තොග මල් ලැයිස්තු බලා මිල සහ විකුණුම්කරුගේ තොරතුරු සසඳන්න."
        : "Find fresh flower listings near you in Sri Lanka. Browse retail bouquets and wholesale stems by seller district, compare listed prices, and send an enquiry.";
    const canonicalUrl = absoluteUrl(`/${locale}${SEO_PATH}`);
    const products = loaderData?.products ?? [];
    const collectionPage = {
      "@context": "https://schema.org",
      "@type": "CollectionPage",
      name: title,
      description,
      url: canonicalUrl,
      inLanguage: locale,
      mainEntity: {
        "@type": "ItemList",
        numberOfItems: products.length,
        itemListElement: products.map((product, index) => ({
          "@type": "ListItem",
          position: index + 1,
          name: product.nameEn,
          url: absoluteUrl(`/${locale}/products/${product.slug}`),
        })),
      },
    };
    const breadcrumbs = breadcrumbJsonLd([
      { name: "Home", path: localePath(locale, "/") },
      {
        name: locale === "si" ? "මා අසල නැවුම් මල්" : "Fresh flowers near me",
        path: localePath(locale, SEO_PATH),
      },
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
      links: hreflangLinks(SEO_PATH, locale),
      scripts: [jsonLdScript(collectionPage), jsonLdScript(breadcrumbs)],
    };
  },
  component: FreshFlowersNearMePage,
});

function FreshFlowersNearMePage() {
  const { products, featuredFlowers } = Route.useLoaderData();
  const { locale, t, f } = useT();
  const steps = [
    {
      icon: MapPin,
      title: t.nearMe.step1Title,
      body: t.nearMe.step1Body,
    },
    {
      icon: Search,
      title: t.nearMe.step2Title,
      body: t.nearMe.step2Body,
    },
    {
      icon: MessageCircle,
      title: t.nearMe.step3Title,
      body: t.nearMe.step3Body,
    },
  ];

  return (
    <>
      <section className="grid-paper border-b border-border">
        <div className="mx-auto max-w-6xl px-4 py-12 sm:py-16">
          <p className="text-xs font-semibold uppercase tracking-wide text-brand">
            {t.nearMe.eyebrow}
          </p>
          <h1 className="mt-3 max-w-3xl font-display text-4xl leading-tight sm:text-6xl">
            {t.nearMe.title}
          </h1>
          <p className="mt-5 max-w-2xl text-base leading-relaxed text-muted-foreground sm:text-lg">
            {t.nearMe.intro}
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link
              to="/$locale/products"
              params={{ locale }}
              className={buttonVariants({ size: "pill" })}
            >
              {t.nearMe.browseAll}
              <ArrowUpRight className="size-4" aria-hidden="true" />
            </Link>
            <Link
              to="/$locale/products"
              params={{ locale }}
              search={{ type: "wholesale" }}
              className={buttonVariants({ variant: "outline", size: "pill" })}
            >
              {t.nearMe.browseWholesale}
            </Link>
          </div>
          <p className="mt-8 flex max-w-2xl items-start gap-2 border-l-2 border-brand/40 pl-3 text-sm leading-relaxed text-muted-foreground">
            <MapPin className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            <span>{t.nearMe.locationNote}</span>
          </p>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-16" aria-labelledby="our-flowers-heading">
        <h2 id="our-flowers-heading" className="font-display text-3xl sm:text-4xl">
          Our Flowers
        </h2>
        <p className="mt-2 max-w-xl text-sm leading-relaxed text-muted-foreground">
          Sourced fresh from Sri Lankan growers. Send an enquiry for pricing and availability.
        </p>
        <div className="mt-10">
          <FlowerShowcase
            flowers={featuredFlowers}
            locale={locale}
            getHref={() => `/${locale}/fresh-flower-quotation-generator`}
            ctaLabel="Enquire"
          />
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-14" aria-labelledby="district-heading">
        <h2 id="district-heading" className="font-display text-3xl sm:text-4xl">
          {t.nearMe.districtTitle}
        </h2>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
          {t.nearMe.districtIntro}
        </p>
        <ul className="mt-7 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {DISTRICTS.map((district) => {
            const name = locale === "si" ? district.nameSi : district.nameEn;
            return (
              <li key={district.slug}>
                <Link
                  to="/$locale/products"
                  params={{ locale }}
                  search={{ district: district.slug }}
                  aria-label={f(t.nearMe.districtLink, { district: name })}
                  className="group flex min-h-20 items-center justify-between gap-3 rounded-lg border border-border/70 bg-background px-4 py-3 text-sm font-medium transition-colors hover:border-brand/50 hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <span>{name}</span>
                  <ArrowUpRight
                    className="size-4 shrink-0 text-muted-foreground transition-colors group-hover:text-brand"
                    aria-hidden="true"
                  />
                </Link>
              </li>
            );
          })}
        </ul>
      </section>

      <section className="border-y border-border bg-accent/35">
        <div className="mx-auto max-w-6xl px-4 py-14">
          <h2 className="font-display text-3xl sm:text-4xl">
            {t.nearMe.stepsTitle}
          </h2>
          <ul className="mt-7 grid gap-8 sm:grid-cols-3">
            {steps.map(({ icon: Icon, title, body }) => (
              <li key={title} className="flex gap-4">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-background text-foreground">
                  <Icon className="size-5" aria-hidden="true" />
                </span>
                <div>
                  <h3 className="text-sm font-semibold">{title}</h3>
                  <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                    {body}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-14" aria-labelledby="current-listings">
        <div className="mb-6">
          <h2 id="current-listings" className="font-display text-3xl sm:text-4xl">
            {t.nearMe.currentTitle}
          </h2>
          <p className="mt-2 text-sm text-muted-foreground">
            {t.nearMe.currentIntro}
          </p>
        </div>
        <ProductGrid products={products} />
      </section>

      <section className="mx-auto max-w-6xl px-4 pb-14">
        <div className="flex max-w-3xl items-start gap-4 border-t border-border pt-8">
          <CheckCircle2 className="mt-1 size-5 shrink-0 text-brand" aria-hidden="true" />
          <div>
            <h2 className="font-display text-2xl">{t.nearMe.trustTitle}</h2>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              {t.nearMe.trustBody}
            </p>
          </div>
        </div>
      </section>
    </>
  );
}
