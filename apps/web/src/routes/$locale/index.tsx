import { createFileRoute, Link } from "@tanstack/react-router";
import { buttonVariants } from "@flowers/ui/components/button";
import { Badge } from "@flowers/ui/components/badge";
import { cn } from "@flowers/ui/lib/utils";
import {
  ArrowUpRight,
  BadgePercent,
  ListChecks,
  MessageCircle,
  Shapes,
  Store,
} from "lucide-react";
import { ProductCard } from "../../components/catalog/ProductCard";
import { localizedCategoryName } from "../../i18n";
import { useT } from "../../i18n/react";
import { absoluteUrl, hreflangLinks } from "../../lib/site";
import {
  jsonLdScript,
  organizationJsonLd,
  socialMeta,
  webSiteJsonLd,
} from "../../lib/seo";
import {
  getCategoriesWithCounts,
  getFeaturedProducts,
} from "../../server/catalog";

export const Route = createFileRoute("/$locale/")({
  loader: async () => ({
    categories: await getCategoriesWithCounts(),
    featured: await getFeaturedProducts(),
  }),
  head: ({ params }) => {
    const locale = params.locale as import("../../i18n").Locale;
    const title =
      locale === "si"
        ? "ශ්‍රී ලංකාවේ මල් වෙළෙඳපොළ | FlowerMarket.lk"
        : "Online Flower Marketplace in Sri Lanka | FlowerMarket.lk";
    const description =
      locale === "si"
        ? "ශ්‍රී ලංකාවේ සිල්ලර මල් කළඹ සහ තොග මල් කඳ ලැයිස්තු බලන්න. ප්‍රවර්ගය, දිස්ත්‍රික්කය සහ වර්ගය අනුව සොයා විමසුමක් යවන්න."
        : "Browse retail bouquets and wholesale flower stems listed in Sri Lanka. Filter by category, district and type, then send an enquiry.";
    return {
      meta: [
        { title },
        { name: "description", content: description },
        ...socialMeta({
          title,
          description,
          url: absoluteUrl(`/${locale}/`),
          locale,
        }),
      ],
      links: hreflangLinks("/", locale),
      scripts: [
        jsonLdScript(organizationJsonLd()),
        jsonLdScript(webSiteJsonLd()),
      ],
    };
  },
  component: HomePage,
});

function HomePage() {
  const { categories, featured } = Route.useLoaderData();
  const { locale, t } = useT();
  const heroImg = featured[0]?.imageUrl ?? "/placeholder-flower.svg";
  const totalListings = categories.reduce(
    (total, category) => total + category.productCount,
    0,
  );
  const activeCategories = categories.filter(
    (category) => category.productCount > 0,
  ).length;

  return (
    <>
      {/* Hero — the page's one bold moment */}
      <section className="grid-paper border-b border-border">
        <div className="mx-auto grid max-w-6xl items-center gap-10 px-4 pb-14 pt-12 sm:pt-16 lg:grid-cols-2 lg:gap-8 lg:pb-20 lg:pt-20">
          <div className="max-w-xl">
            <h1 className="font-display text-[2.75rem] leading-[0.98] sm:text-6xl lg:text-[4.25rem]">
              {t.home.heroLead}
              <br />
              <span className="relative inline-block">
                <span
                  aria-hidden="true"
                  className="absolute inset-x-[-0.15em] inset-y-[0.08em] -z-10 -rotate-1 rounded-[0.15em] bg-blush"
                />
                {t.home.heroHighlight}
              </span>
            </h1>
            <p className="mt-6 max-w-md text-base leading-relaxed text-muted-foreground sm:text-lg">
              {t.home.heroSubtitle}
            </p>

            <div className="mt-8 flex flex-wrap items-center gap-5">
              <Link
                to="/$locale/products"
                params={{ locale }}
                search={{ type: "retail" }}
                className={buttonVariants({ size: "pill" })}
              >
                {t.home.ctaShopRetail}
                <ArrowUpRight className="size-4" aria-hidden="true" />
              </Link>
              <Link
                to="/$locale/products"
                params={{ locale }}
                search={{ type: "wholesale" }}
                className="group inline-flex items-center gap-3 text-sm font-medium text-foreground focus-visible:outline-none"
              >
                {t.home.ctaBuyWholesale}
                <span className="flex size-11 items-center justify-center rounded-full border border-foreground/25 transition-colors group-hover:bg-foreground group-hover:text-background group-focus-visible:ring-2 group-focus-visible:ring-ring">
                  <ArrowUpRight className="size-4" aria-hidden="true" />
                </span>
              </Link>
            </div>

            {/* Only surface live counts once there is real inventory — an
                empty marketplace should never advertise "0 listings". */}
            {totalListings > 0 && (
              <dl className="mt-12 flex items-center gap-10">
                <div className="flex items-center gap-3">
                  <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-lilac/30 text-foreground">
                    <ListChecks className="size-5" aria-hidden="true" />
                  </span>
                  <div>
                    <dt className="font-display text-2xl leading-none">
                      {totalListings}
                    </dt>
                    <dd className="mt-1 text-xs text-muted-foreground">
                      {t.home.heroStatListingsLabel}
                    </dd>
                  </div>
                </div>
                {activeCategories > 0 && (
                  <div className="flex items-center gap-3">
                    <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-sage text-foreground">
                      <Shapes className="size-5" aria-hidden="true" />
                    </span>
                    <div>
                      <dt className="font-display text-2xl leading-none">
                        {activeCategories}
                      </dt>
                      <dd className="mt-1 text-xs text-muted-foreground">
                        {t.home.heroStatCategoriesLabel}
                      </dd>
                    </div>
                  </div>
                )}
              </dl>
            )}
          </div>

          {/* Product stage: butter block + coral offset + discount sticker */}
          <div className="relative mx-auto w-full max-w-md lg:max-w-none">
            <div
              aria-hidden="true"
              className="absolute -bottom-4 -right-3 h-[92%] w-[85%] rounded-sm bg-coral"
            />
            <div className="relative aspect-[4/5] overflow-hidden rounded-sm bg-butter">
              <img
                src={heroImg}
                alt=""
                className="size-full object-cover mix-blend-multiply"
              />
            </div>
            <Badge
              variant="sticker"
              className="absolute -left-3 bottom-10 flex-col items-start gap-0 px-4 py-3 text-left sm:bottom-16"
            >
              <span className="flex items-center gap-2 text-sm font-semibold">
                <BadgePercent className="size-4" aria-hidden="true" />
                {t.home.stickerTitle}
              </span>
              <span className="pl-6 text-xs font-normal text-muted-foreground">
                {t.home.stickerSub}
              </span>
            </Badge>
          </div>
        </div>
      </section>

      {/* Marketplace facts — trust strip */}
      <section className="border-b border-border">
        <ul className="mx-auto grid max-w-6xl gap-px px-4 py-10 sm:grid-cols-3">
          {[
            {
              icon: BadgePercent,
              title: t.home.trust1Title,
              body: t.home.trust1Body,
            },
            {
              icon: Store,
              title: t.home.trust2Title,
              body: t.home.trust2Body,
            },
            {
              icon: MessageCircle,
              title: t.home.trust3Title,
              body: t.home.trust3Body,
            },
          ].map(({ icon: Icon, title, body }) => (
            <li key={title} className="flex gap-4 px-2 py-3">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-accent text-foreground">
                <Icon className="size-5" aria-hidden="true" />
              </span>
              <div>
                <h3 className="text-sm font-semibold">{title}</h3>
                <p className="mt-1 text-sm text-muted-foreground">{body}</p>
              </div>
            </li>
          ))}
        </ul>
      </section>

      {/* Category grid */}
      <div className="mx-auto max-w-6xl px-4 py-14">
        <section aria-labelledby="browse-categories">
          <div className="mb-6">
            <h2
              id="browse-categories"
              className="font-display text-3xl sm:text-4xl"
            >
              {t.home.browseByCategory}
            </h2>
            <p className="mt-2 text-sm text-muted-foreground">
              {t.home.browseByCategorySub}
            </p>
          </div>

          {categories.length === 0 ? (
            <div className="rounded-lg border border-dashed p-10 text-center">
              <p className="font-semibold text-foreground">
                {t.home.noCategories}
              </p>
              <p className="mt-2 text-sm text-muted-foreground">
                {t.home.noCategoriesBody}
              </p>
            </div>
          ) : (
            <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {categories.map((cat, i) => (
                <li key={cat.id}>
                  <Link
                    to="/$locale/c/$slug"
                    params={{ locale, slug: cat.slug }}
                    className={cn(
                      "flex h-28 items-end rounded-lg border border-border/60 p-4 text-sm font-medium transition-transform hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                      CATEGORY_TINTS[i % CATEGORY_TINTS.length],
                    )}
                  >
                    {localizedCategoryName(cat, locale)}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Featured strip */}
        {featured.length > 0 && (
          <section aria-labelledby="featured" className="mt-16">
            <div className="mb-6 flex items-end justify-between gap-3">
              <div>
                <h2 id="featured" className="font-display text-3xl sm:text-4xl">
                  {t.home.featuredTitle}
                </h2>
                <p className="mt-2 text-sm text-muted-foreground">
                  {t.home.featuredSub}
                </p>
              </div>
              <Link
                to="/$locale/products"
                params={{ locale }}
                className="group inline-flex shrink-0 items-center gap-1.5 text-sm font-medium text-brand hover:underline"
              >
                {t.nav.browse}
                <ArrowUpRight className="size-4" aria-hidden="true" />
              </Link>
            </div>
            <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
              {featured.map((p, i) => (
                <li key={p.id}>
                  <ProductCard product={p} index={i} />
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </>
  );
}

/** Rotating pastel tints for category cards (reference's colored blocks). */
const CATEGORY_TINTS = [
  "bg-sage",
  "bg-peach",
  "bg-blush",
  "bg-butter",
] as const;
