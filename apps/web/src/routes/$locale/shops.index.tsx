import { createFileRoute, Link } from "@tanstack/react-router";
import { Badge } from "@flowers/ui/components/badge";
import { BadgeCheck, MapPin } from "lucide-react";
import {
  getDict,
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
import { listShops } from "../../server/catalog";

export const Route = createFileRoute("/$locale/shops/")({
  loader: async () => ({ shops: await listShops() }),
  head: ({ loaderData, params }) => {
    const locale = params.locale as Locale;
    const dict = getDict(locale);
    const title = dict.shops.metaTitle;
    const description = dict.shops.metaDescription;
    const shops = loaderData?.shops ?? [];
    const itemList = {
      "@context": "https://schema.org",
      "@type": "ItemList",
      name: dict.shops.title,
      itemListElement: shops.map((shop, i) => ({
        "@type": "ListItem",
        position: i + 1,
        url: absoluteUrl(`/${locale}/shops/${shop.slug}`),
        name: shop.nameEn,
      })),
    };
    const breadcrumbs = breadcrumbJsonLd([
      { name: dict.catalog.breadcrumbHome, path: localePath(locale, "/") },
      { name: dict.shops.title, path: localePath(locale, "/shops") },
    ]);
    return {
      meta: [
        { title },
        { name: "description", content: description },
        ...socialMeta({
          title,
          description,
          url: absoluteUrl(`/${locale}/shops`),
          locale,
        }),
      ],
      links: hreflangLinks("/shops", locale),
      scripts: [jsonLdScript(itemList), jsonLdScript(breadcrumbs)],
    };
  },
  component: ShopsIndexPage,
});

function ShopsIndexPage() {
  const { shops } = Route.useLoaderData();
  const { t, f, locale } = useT();

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <div className="mb-8">
        <h1 className="font-display text-4xl sm:text-5xl">{t.shops.title}</h1>
        <p className="mt-2 max-w-xl text-sm text-muted-foreground">
          {t.shops.subtitle}
        </p>
      </div>

      {shops.length === 0 ? (
        <div className="rounded-lg border border-dashed p-10 text-center">
          <p className="font-semibold text-foreground">{t.shops.empty}</p>
          <p className="mt-2 text-sm text-muted-foreground">
            {t.shops.emptyBody}
          </p>
        </div>
      ) : (
        <>
          <p className="mb-4 text-sm text-muted-foreground">
            {f(t.shops.countShops, { count: shops.length })}
          </p>
          <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {shops.map((shop) => {
              const name = localizedName(shop, locale);
              const description = localizedDescription(shop, locale);
              const districtName =
                locale === "si" ? shop.districtNameSi : shop.districtNameEn;
              return (
                <li key={shop.slug}>
                  <Link
                    to="/$locale/shops/$slug"
                    params={{ locale, slug: shop.slug }}
                    className="flex h-full flex-col rounded-lg border border-border/60 p-5 transition-transform hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="font-display text-xl">{name}</h2>
                      {shop.verificationStatus === "verified" && (
                        <Badge variant="success" className="gap-1">
                          <BadgeCheck className="size-3.5" aria-hidden="true" />
                          {t.catalog.verified}
                        </Badge>
                      )}
                      <Badge variant="secondary">
                        {shop.shopType === "grower"
                          ? t.catalog.grower
                          : t.catalog.florist}
                      </Badge>
                    </div>
                    <p className="mt-2 inline-flex items-center gap-1.5 text-sm text-muted-foreground">
                      <MapPin className="size-4" aria-hidden="true" />
                      {districtName}
                    </p>
                    {description && (
                      <p className="mt-3 line-clamp-3 text-sm leading-relaxed text-foreground">
                        {description}
                      </p>
                    )}
                  </Link>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </div>
  );
}
