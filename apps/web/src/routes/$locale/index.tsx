import { createFileRoute, Link } from "@tanstack/react-router";
import { buttonVariants } from "@flowers/ui/components/button";
import { cn } from "@flowers/ui/lib/utils";
import {
  ArrowUpRight,
  BadgePercent,
  MessageCircle,
  Store,
} from "lucide-react";
import { SELLER_TYPES, type SellerType } from "@flowers/api/constants";
import { ProductCard } from "../../components/catalog/ProductCard";
import { ShopCard } from "../../components/sellers/ShopCard";
import { SellerTypeTiles } from "../../components/sellers/SellerTypeTiles";
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
  listShops,
} from "../../server/catalog";

export const Route = createFileRoute("/$locale/")({
  loader: async () => {
    const [categories, featured, shops] = await Promise.all([
      getCategoriesWithCounts(),
      getFeaturedProducts(),
      listShops({ data: {} }),
    ]);
    return { categories, featured, shops };
  },
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
  const { categories, featured, shops } = Route.useLoaderData();
  const { locale, t, f } = useT();
  const sellerCounts = Object.fromEntries(
    SELLER_TYPES.map((type) => [
      type,
      shops.filter((s) => s.sellerTypes.includes(type)).length,
    ]),
  ) as Record<SellerType, number>;
  // Directory already sorts sellers with products first.
  const featuredShops = shops.filter((s) => s.productCount > 0).slice(0, 3);
  // Stocked categories first (stable, so admin sort order is kept within each group).
  const orderedCategories = [...categories].sort(
    (a, b) => Number(b.productCount > 0) - Number(a.productCount > 0),
  );

  return (
    <>
      {/* Hero */}
      <section className="border-b border-border">
        <div className="mx-auto grid max-w-6xl items-center gap-12 px-4 pb-16 pt-14 sm:pt-20 lg:grid-cols-2 lg:gap-16 lg:pb-24 lg:pt-24">
          {/* Text column */}
          <div>
            <h1 className="font-display text-[3rem] leading-[0.95] sm:text-[4rem] lg:text-[4.75rem]">
              {t.home.heroLead}
              <br />
              {t.home.heroHighlight}
            </h1>
            <p className="mt-6 max-w-sm text-base leading-relaxed text-muted-foreground sm:text-lg">
              {t.home.heroSubtitle}
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link
                to="/$locale/products"
                params={{ locale }}
                search={{ type: "retail" }}
                className={cn(buttonVariants({ size: "pill" }))}
              >
                {t.home.ctaShopRetail}
                <ArrowUpRight className="size-4" aria-hidden="true" />
              </Link>
              <Link
                to="/$locale/products"
                params={{ locale }}
                search={{ type: "wholesale" }}
                className={cn(buttonVariants({ variant: "outline", size: "pill" }))}
              >
                {t.home.ctaBuyWholesale}
                <ArrowUpRight className="size-4" aria-hidden="true" />
              </Link>
            </div>
          </div>

          {/* Image column */}
          <div className="relative mx-auto w-full max-w-sm lg:max-w-none">
            <img
              src="/flowers/hero-bouquet.webp"
              alt="Fresh gerbera bouquet"
              className="w-full drop-shadow-2xl"
            />
            <div className="absolute bottom-5 left-5 right-5 rounded-xl border border-border bg-background/90 px-5 py-4 backdrop-blur-sm">
              <p className="text-xs text-muted-foreground">Sri Lanka</p>
              <p className="font-display text-base leading-snug">
                {t.home.stickerTitle}
              </p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {t.home.stickerSub}
              </p>
            </div>
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

      {/* Seller types */}
      <section
        aria-labelledby="sellers"
        className="mx-auto max-w-6xl px-4 pt-14"
      >
        <div className="mb-6 flex items-end justify-between gap-3">
          <div>
            <h2 id="sellers" className="font-display text-3xl sm:text-4xl">
              {t.home.sellersTitle}
            </h2>
            <p className="mt-2 max-w-xl text-sm text-muted-foreground">
              {t.home.sellersSub}
            </p>
          </div>
        </div>
        <SellerTypeTiles counts={sellerCounts} />
      </section>

      {/* Featured sellers */}
      {featuredShops.length > 0 && (
        <section
          aria-labelledby="featured-sellers"
          className="mx-auto max-w-6xl px-4 pt-16"
        >
          <div className="mb-6 flex items-end justify-between gap-3">
            <div>
              <h2
                id="featured-sellers"
                className="font-display text-3xl sm:text-4xl"
              >
                {t.home.featuredShopsTitle}
              </h2>
              <p className="mt-2 text-sm text-muted-foreground">
                {t.home.featuredShopsSub}
              </p>
            </div>
            <Link
              to="/$locale/shops"
              params={{ locale }}
              search={{}}
              className="inline-flex shrink-0 items-center gap-1.5 text-sm font-medium text-brand hover:underline"
            >
              {t.home.viewAllShops}
              <ArrowUpRight className="size-4" aria-hidden="true" />
            </Link>
          </div>
          <ul className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {featuredShops.map((shop) => (
              <li key={shop.slug}>
                <ShopCard shop={shop} />
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Category grid */}
      <div className="mx-auto max-w-6xl px-4 py-16">
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
              {orderedCategories.map((cat, i) => (
                <li key={cat.id}>
                  <Link
                    to="/$locale/c/$slug"
                    params={{ locale, slug: cat.slug }}
                    className={cn(
                      "group relative flex aspect-[4/3] items-end overflow-hidden rounded-xl p-4 transition-transform hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                      CATEGORY_TINTS[i % CATEGORY_TINTS.length],
                    )}
                  >
                    {cat.coverImageUrl && (
                      <>
                        <img
                          src={cat.coverImageUrl}
                          alt=""
                          loading="lazy"
                          className="absolute inset-0 size-full object-cover transition-transform duration-500 group-hover:scale-105"
                        />
                        <span className="absolute inset-0 bg-gradient-to-t from-foreground/70 via-foreground/10 to-transparent" />
                      </>
                    )}
                    <span
                      className={cn(
                        "relative flex flex-col",
                        cat.coverImageUrl ? "text-background" : "text-foreground",
                      )}
                    >
                      <span className="font-display text-lg leading-tight">
                        {localizedCategoryName(cat, locale)}
                      </span>
                      {cat.productCount > 0 && (
                        <span className="text-xs opacity-80">
                          {f(t.home.categoryCount, { count: cat.productCount })}
                        </span>
                      )}
                    </span>
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
