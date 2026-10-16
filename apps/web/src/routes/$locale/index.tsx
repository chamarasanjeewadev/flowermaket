import { createFileRoute, Link } from "@tanstack/react-router";
import { buttonVariants } from "@flowers/ui/components/button";
import { cn } from "@flowers/ui/lib/utils";
import {
  BadgePercent,
  ChevronRight,
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
      {/* Hero — centred headline over one large stage. Compact on mobile so
          listings sit near the fold; the stage image is tablet/desktop only. */}
      <section className="px-4 pt-6 sm:pt-16 lg:pt-20">
        <div className="mx-auto max-w-3xl text-center">
          <h1 className="animate-rise font-display text-[2.375rem] leading-[1.02] sm:text-[4.25rem] lg:text-[5.25rem]">
            {t.home.heroLead} {t.home.heroHighlight}
          </h1>
          <p
            className="animate-rise text-lead mx-auto mt-3 line-clamp-2 max-w-xl sm:mt-5 sm:line-clamp-none"
            style={{ animationDelay: "80ms" }}
          >
            {t.home.heroSubtitle}
          </p>
          <div
            className="animate-rise mt-5 flex flex-wrap items-center justify-center gap-x-6 gap-y-3 sm:mt-8"
            style={{ animationDelay: "160ms" }}
          >
            <Link
              to="/$locale/products"
              params={{ locale }}
              search={{ type: "retail" }}
              className={cn(buttonVariants({ size: "lg" }), "px-6 sm:px-7")}
            >
              {t.home.ctaShopRetail}
            </Link>
            <Link
              to="/$locale/products"
              params={{ locale }}
              search={{ type: "wholesale" }}
              className="group inline-flex items-center gap-0.5 text-[15px] font-medium text-brand-ink hover:underline underline-offset-4"
            >
              {t.home.ctaBuyWholesale}
              <ChevronRight
                className="size-4 transition-transform group-hover:translate-x-0.5"
                aria-hidden="true"
              />
            </Link>
          </div>
        </div>

        <div
          className="animate-rise relative mx-auto mt-12 hidden max-w-6xl overflow-hidden rounded-3xl bg-stage sm:block lg:mt-16"
          style={{ animationDelay: "240ms" }}
        >
          <img
            src="/flowers/hero-bouquet.webp"
            alt="Fresh gerbera bouquet"
            className="mx-auto h-[420px] w-auto object-contain py-8 lg:h-[520px]"
          />
          <div className="glass absolute bottom-5 left-5 max-w-xs rounded-2xl px-5 py-4 shadow-float">
            <p className="text-[15px] font-semibold leading-snug tracking-[-0.015em]">
              {t.home.stickerTitle}
            </p>
            <p className="mt-0.5 text-[13px] text-muted-foreground">
              {t.home.stickerSub}
            </p>
          </div>
        </div>
      </section>

      {/* Category chips — mobile quick filter row */}
      {categories.length > 0 && (
        <nav aria-label={t.home.browseByCategory} className="mt-5 md:hidden">
          <ul className="flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            <li className="shrink-0">
              <Link
                to="/$locale/products"
                params={{ locale }}
                className="inline-flex h-9 items-center rounded-full bg-foreground px-4 text-sm font-medium text-background"
              >
                {t.home.allItems}
              </Link>
            </li>
            {orderedCategories.map((cat) => (
              <li key={cat.id} className="shrink-0">
                <Link
                  to="/$locale/c/$slug"
                  params={{ locale, slug: cat.slug }}
                  className="inline-flex h-9 items-center whitespace-nowrap rounded-full bg-foreground/[0.06] px-4 text-sm font-medium text-foreground transition-colors active:bg-foreground/10"
                >
                  {localizedCategoryName(cat, locale)}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      )}

      {/* Latest listings — first thing after the hero on mobile */}
      {featured.length > 0 && (
        <section
          aria-labelledby="featured-mobile"
          className="mx-auto max-w-6xl px-4 pt-8 md:hidden"
        >
          <SectionHeader
            id="featured-mobile"
            title={t.home.featuredTitle}
            link={{ to: "/$locale/products", label: t.nav.browse }}
          />
          <ul className="grid grid-cols-2 gap-x-3 gap-y-6">
            {featured.map((p) => (
              <li key={p.id}>
                <ProductCard product={p} />
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* How the marketplace works — three plain facts */}
      <section className="mx-auto max-w-6xl px-4 pt-16 sm:pt-24">
        <ul className="grid gap-8 sm:grid-cols-3 sm:gap-10">
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
            <li key={title} className="flex gap-4 sm:block">
              <Icon
                className="size-7 shrink-0 text-brand-ink sm:mb-4"
                strokeWidth={1.5}
                aria-hidden="true"
              />
              <div>
                <h3 className="text-[17px] font-semibold tracking-[-0.015em]">
                  {title}
                </h3>
                <p className="mt-1.5 text-[15px] leading-relaxed text-muted-foreground">
                  {body}
                </p>
              </div>
            </li>
          ))}
        </ul>
      </section>

      {/* Category grid */}
      <section
        aria-labelledby="browse-categories"
        className="mx-auto max-w-6xl px-4 pt-16 sm:pt-24"
      >
        <SectionHeader
          id="browse-categories"
          title={t.home.browseByCategory}
          sub={t.home.browseByCategorySub}
        />
        {categories.length === 0 ? (
          <div className="rounded-3xl bg-muted/60 px-6 py-14 text-center">
            <p className="font-semibold text-foreground">{t.home.noCategories}</p>
            <p className="mt-2 text-sm text-muted-foreground">
              {t.home.noCategoriesBody}
            </p>
          </div>
        ) : (
          <ul className="grid grid-cols-2 gap-x-3 gap-y-5 sm:grid-cols-3 sm:gap-x-5 sm:gap-y-8 lg:grid-cols-4">
            {orderedCategories.map((cat) => (
              <li key={cat.id}>
                <Link
                  to="/$locale/c/$slug"
                  params={{ locale, slug: cat.slug }}
                  className="group block rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-4 focus-visible:ring-offset-background"
                >
                  <span className="block aspect-[4/3] overflow-hidden rounded-2xl bg-stage">
                    {cat.coverImageUrl && (
                      <img
                        src={cat.coverImageUrl}
                        alt=""
                        loading="lazy"
                        className="size-full object-cover transition-transform duration-700 ease-out group-hover:scale-[1.03] motion-reduce:transition-none"
                      />
                    )}
                  </span>
                  <span className="mt-2.5 block text-[15px] font-semibold tracking-[-0.01em] text-foreground">
                    {localizedCategoryName(cat, locale)}
                  </span>
                  {cat.productCount > 0 && (
                    <span className="block text-[13px] text-muted-foreground">
                      {f(t.home.categoryCount, { count: cat.productCount })}
                    </span>
                  )}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Featured strip — desktop position (mobile copy sits above) */}
      {featured.length > 0 && (
        <section
          aria-labelledby="featured"
          className="mx-auto hidden max-w-6xl px-4 pt-24 md:block"
        >
          <SectionHeader
            id="featured"
            title={t.home.featuredTitle}
            sub={t.home.featuredSub}
            link={{ to: "/$locale/products", label: t.nav.browse }}
          />
          <ul className="grid grid-cols-3 gap-x-5 gap-y-10 lg:grid-cols-4">
            {featured.map((p) => (
              <li key={p.id}>
                <ProductCard product={p} />
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Seller types — a calm band of its own */}
      <section aria-labelledby="sellers" className="px-4 pt-16 sm:pt-24">
        <div className="mx-auto max-w-6xl rounded-3xl bg-stage px-5 py-10 sm:px-10 sm:py-14">
          <SectionHeader
            id="sellers"
            title={t.home.sellersTitle}
            sub={t.home.sellersSub}
          />
          <SellerTypeTiles counts={sellerCounts} />
        </div>
      </section>

      {/* Featured sellers */}
      {featuredShops.length > 0 && (
        <section
          aria-labelledby="featured-sellers"
          className="mx-auto max-w-6xl px-4 pb-20 pt-16 sm:pb-28 sm:pt-24"
        >
          <SectionHeader
            id="featured-sellers"
            title={t.home.featuredShopsTitle}
            sub={t.home.featuredShopsSub}
            link={{ to: "/$locale/shops", label: t.home.viewAllShops }}
          />
          <ul className="-mx-4 flex snap-x snap-mandatory scroll-px-4 gap-3 overflow-x-auto px-4 pb-1 [scrollbar-width:none] sm:mx-0 sm:grid sm:grid-cols-2 sm:gap-5 sm:overflow-visible sm:px-0 lg:grid-cols-3 [&::-webkit-scrollbar]:hidden">
            {featuredShops.map((shop) => (
              <li
                key={shop.slug}
                className="w-[82%] shrink-0 snap-start sm:w-auto"
              >
                <ShopCard shop={shop} />
              </li>
            ))}
          </ul>
        </section>
      )}
      {featuredShops.length === 0 && <div className="pb-20 sm:pb-28" />}
    </>
  );
}

function SectionHeader({
  id,
  title,
  sub,
  link,
}: {
  id: string;
  title: string;
  sub?: string;
  link?: { to: "/$locale/products" | "/$locale/shops"; label: string };
}) {
  const { locale } = useT();
  return (
    <div className="mb-6 flex items-end justify-between gap-4 sm:mb-10">
      <div className="max-w-2xl">
        <h2
          id={id}
          className="font-display text-[1.75rem] leading-[1.08] sm:text-[2.75rem]"
        >
          {title}
        </h2>
        {sub && (
          <p className="mt-2 hidden text-[15px] leading-relaxed text-muted-foreground sm:block sm:text-[17px]">
            {sub}
          </p>
        )}
      </div>
      {link && (
        <Link
          to={link.to}
          params={{ locale }}
          search={{}}
          className="group inline-flex shrink-0 items-center gap-0.5 text-[15px] font-medium text-brand-ink underline-offset-4 hover:underline"
        >
          {link.label}
          <ChevronRight
            className="size-4 transition-transform group-hover:translate-x-0.5"
            aria-hidden="true"
          />
        </Link>
      )}
    </div>
  );
}
