import { createFileRoute, Link } from "@tanstack/react-router";
import {
  isSellerType,
  SELLER_TYPES,
  type SellerType,
} from "@flowers/api/constants";
import { EmptyState } from "@flowers/ui/components/empty-state";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@flowers/ui/components/select";
import { Skeleton } from "@flowers/ui/components/skeleton";
import { cn } from "@flowers/ui/lib/utils";
import { Store } from "lucide-react";
import { ShopCard } from "../../components/sellers/ShopCard";
import { SELLER_TYPE_STYLE } from "../../components/sellers/SellerTypeBadges";
import { getDict, type Locale } from "../../i18n";
import { useT } from "../../i18n/react";
import { absoluteUrl, hreflangLinks } from "../../lib/site";
import {
  breadcrumbJsonLd,
  jsonLdScript,
  localePath,
  socialMeta,
} from "../../lib/seo";
import { listShops } from "../../server/catalog";

interface ShopsSearch {
  type?: SellerType;
  district?: string;
}

const ALL = "all";

export const Route = createFileRoute("/$locale/shops/")({
  validateSearch: (search: Record<string, unknown>): ShopsSearch => ({
    type: isSellerType(search.type) ? search.type : undefined,
    district:
      typeof search.district === "string" && search.district
        ? search.district
        : undefined,
  }),
  // The directory is small: load every public shop once and filter on the
  // client so switching tabs is instant.
  loader: async () => ({ shops: await listShops({ data: {} }) }),
  head: ({ loaderData, params, match }) => {
    const locale = params.locale as Locale;
    const dict = getDict(locale);
    const title = dict.shops.metaTitle;
    const description = dict.shops.metaDescription;
    const shops = loaderData?.shops ?? [];
    const filtered = Boolean(match.search.type || match.search.district);
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
        ...(filtered ? [{ name: "robots", content: "noindex,follow" }] : []),
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
  pendingComponent: PendingShops,
  component: ShopsIndexPage,
});

function ShopsHeader() {
  const { t } = useT();
  return (
    <div className="mb-8 max-w-2xl">
      <h1 className="font-display text-4xl sm:text-5xl">{t.shops.title}</h1>
      <p className="mt-3 text-base leading-relaxed text-muted-foreground">
        {t.shops.subtitle}
      </p>
    </div>
  );
}

function PendingShops() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      <ShopsHeader />
      <ul className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <li key={i} className="overflow-hidden rounded-xl border border-border/60">
            <Skeleton className="aspect-[16/10] w-full rounded-none" />
            <div className="space-y-2 p-5">
              <Skeleton className="h-5 w-2/3" />
              <Skeleton className="h-4 w-1/3" />
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

function ShopsIndexPage() {
  const { shops } = Route.useLoaderData();
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const { t, f, locale } = useT();

  const typeCounts = Object.fromEntries(
    SELLER_TYPES.map((type) => [
      type,
      shops.filter((s) => s.sellerTypes.includes(type)).length,
    ]),
  ) as Record<SellerType, number>;

  // Only offer districts that actually have sellers.
  const districts = Array.from(
    new Map(
      shops.map((s) => [
        s.district,
        locale === "si" ? s.districtNameSi : s.districtNameEn,
      ]),
    ),
  ).sort((a, b) => a[1].localeCompare(b[1]));

  const visible = shops.filter(
    (s) =>
      (!search.type || s.sellerTypes.includes(search.type)) &&
      (!search.district || s.district === search.district),
  );

  const tabs: Array<{ value: SellerType | undefined; label: string; count: number }> = [
    { value: undefined, label: t.catalog.allSellers, count: shops.length },
    ...SELLER_TYPES.map((type) => ({
      value: type,
      label: t.catalog.sellerTypesPlural[type],
      count: typeCounts[type],
    })),
  ];

  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      <ShopsHeader />

      {shops.length === 0 ? (
        <EmptyState
          icon={<Store />}
          title={t.shops.empty}
          description={t.shops.emptyBody}
        />
      ) : (
        <>
          <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <nav
              aria-label={t.catalog.filterSeller}
              className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0"
            >
              {tabs.map((tab) => {
                const active = search.type === tab.value;
                const Icon = tab.value ? SELLER_TYPE_STYLE[tab.value].Icon : Store;
                return (
                  <Link
                    key={tab.value ?? ALL}
                    to="/$locale/shops"
                    params={{ locale }}
                    search={{ type: tab.value, district: search.district }}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "inline-flex shrink-0 items-center gap-2 rounded-full border px-4 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                      active
                        ? "border-foreground bg-foreground text-background"
                        : "border-border bg-card text-foreground/80 hover:border-foreground/40 hover:text-foreground",
                    )}
                  >
                    <Icon className="size-4" aria-hidden="true" />
                    {tab.label}
                    <span
                      className={cn(
                        "rounded-full px-1.5 text-xs",
                        active ? "bg-background/20" : "bg-muted text-muted-foreground",
                      )}
                    >
                      {tab.count}
                    </span>
                  </Link>
                );
              })}
            </nav>

            {districts.length > 1 && (
              <Select
                value={search.district ?? ALL}
                onValueChange={(v) =>
                  navigate({
                    search: (prev: ShopsSearch) => ({
                      ...prev,
                      district: v === ALL ? undefined : v,
                    }),
                  })
                }
              >
                <SelectTrigger
                  aria-label={t.catalog.filterDistrict}
                  className="w-full sm:w-52"
                >
                  <SelectValue placeholder={t.catalog.filterDistrict} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>{t.catalog.allDistricts}</SelectItem>
                  {districts.map(([slug, name]) => (
                    <SelectItem key={slug} value={slug}>
                      {name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          {search.type && (
            <p className="mb-5 text-sm text-muted-foreground">
              {t.catalog.sellerTypeBlurb[search.type]}
            </p>
          )}

          {visible.length === 0 ? (
            <EmptyState
              icon={<Store />}
              title={t.shops.emptyFiltered}
              description={t.shops.emptyFilteredBody}
            />
          ) : (
            <>
              <p className="sr-only" aria-live="polite">
                {f(t.shops.countShops, { count: visible.length })}
              </p>
              <ul className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
                {visible.map((shop) => (
                  <li key={shop.slug}>
                    <ShopCard shop={shop} />
                  </li>
                ))}
              </ul>
            </>
          )}
        </>
      )}
    </div>
  );
}
