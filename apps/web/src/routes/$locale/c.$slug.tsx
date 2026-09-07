import { createFileRoute, notFound } from "@tanstack/react-router";
import { ProductGrid } from "../../components/catalog/ProductGrid";
import { localizedName, type Locale } from "../../i18n";
import { useT } from "../../i18n/react";
import { absoluteUrl, hreflangLinks } from "../../lib/site";
import { getCategoriesWithCounts, listProducts } from "../../server/catalog";

function categoryIntro(t: ReturnType<typeof useT>["t"], slug: string): string {
  const map = t.catalog.categoryIntro as Record<string, string | undefined>;
  return map[slug] ?? t.catalog.browseSub;
}

export const Route = createFileRoute("/$locale/c/$slug")({
  loader: async ({ params }) => {
    const categories = await getCategoriesWithCounts();
    const category = categories.find((c) => c.slug === params.slug);
    if (!category) throw notFound();
    const result = await listProducts({ data: { category: params.slug } });
    return { category, result };
  },
  head: ({ loaderData, params }) => {
    const locale = params.locale as Locale;
    const category = loaderData?.category;
    if (!category) {
      return { links: hreflangLinks(`/c/${params.slug}`, locale) };
    }
    const name =
      locale === "si" && category.nameSi ? category.nameSi : category.nameEn;
    const items = loaderData?.result.items ?? [];
    const jsonLd = {
      "@context": "https://schema.org",
      "@type": "ItemList",
      name,
      itemListElement: items.map((p, i) => ({
        "@type": "ListItem",
        position: i + 1,
        url: absoluteUrl(`/${locale}/products/${p.slug}`),
        name: p.nameEn,
      })),
    };
    return {
      meta: [
        { title: `${name} | FlowerMarket.lk` },
        {
          name: "description",
          content: `${name} — FlowerMarket.lk`,
        },
      ],
      links: hreflangLinks(`/c/${category.slug}`, locale),
      scripts: [
        { type: "application/ld+json", children: JSON.stringify(jsonLd) },
      ],
    };
  },
  component: CategoryPage,
});

function CategoryPage() {
  const { category, result } = Route.useLoaderData();
  const { t, f, locale } = useT();

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <div className="mb-8 rounded-lg bg-sage px-6 py-10 sm:px-10 sm:py-12">
        <h1 className="font-display text-4xl sm:text-5xl">
          {localizedName(category, locale)}
        </h1>
        <p className="mt-3 max-w-2xl text-sm text-foreground/70 sm:text-base">
          {categoryIntro(t, category.slug)}
        </p>
        <p className="mt-4 text-sm font-medium text-foreground/60">
          {f(t.catalog.resultsCount, { count: result.total })}
        </p>
      </div>

      <ProductGrid products={result.items} />
    </div>
  );
}
