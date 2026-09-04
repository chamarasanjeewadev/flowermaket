import { createFileRoute } from "@tanstack/react-router";
import { localizedCategoryName } from "../../i18n";
import { useT } from "../../i18n/react";
import { hreflangLinks } from "../../lib/site";
import { getActiveCategories } from "../../server/categories";

export const Route = createFileRoute("/$locale/")({
  loader: async () => ({ categories: await getActiveCategories() }),
  head: ({ params }) => ({
    meta:
      params.locale === "si"
        ? [
            { title: "FlowerMarket.lk — ශ්‍රී ලංකාවේ මල් වෙළෙඳපොළ" },
            {
              name: "description",
              content:
                "ශ්‍රී ලංකාව පුරා ප්‍රාදේශීය ගොවීන් හා මල් සාප්පුවලින් නැවුම් මල්, මල් සැකසුම්, සහ මල් කළඹ ලබා ගන්න.",
            },
          ]
        : [
            { title: "FlowerMarket.lk — Sri Lanka's flower marketplace" },
            {
              name: "description",
              content:
                "Shop fresh flowers, arrangements and bouquets from local growers and florists across Sri Lanka.",
            },
          ],
    links: hreflangLinks("/", (params.locale as import("../../i18n").Locale)),
  }),
  component: HomePage,
});

function HomePage() {
  const { categories } = Route.useLoaderData();
  const { locale, t } = useT();

  return (
    <>
      {/* Hero */}
      <section className="hero-gradient border-b">
        <div className="mx-auto max-w-6xl px-4 pb-12 pt-12 sm:pb-16 sm:pt-20">
          <div className="max-w-2xl">
            <h1 className="text-3xl font-bold tracking-tight sm:text-5xl sm:leading-[1.1]">
              {t.home.heroTitle}{" "}
              <span className="text-primary">{t.home.heroAccent}</span>
            </h1>
            <p className="mt-4 max-w-xl text-base text-muted-foreground sm:text-lg">
              {t.home.heroSubtitle}
            </p>
          </div>
        </div>
      </section>

      {/* Category grid */}
      <div className="mx-auto max-w-6xl px-4 py-12">
        <section aria-labelledby="browse-categories">
          <div className="mb-5">
            <h2
              id="browse-categories"
              className="text-xl font-bold tracking-tight sm:text-2xl"
            >
              {t.home.browseByCategory}
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {t.home.browseByCategorySub}
            </p>
          </div>

          {categories.length === 0 ? (
            <div className="rounded-xl border border-dashed p-10 text-center">
              <p className="font-semibold text-foreground">{t.home.noCategories}</p>
              <p className="mt-2 text-sm text-muted-foreground">
                {t.home.noCategoriesBody}
              </p>
            </div>
          ) : (
            <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {categories.map((cat) => (
                <li key={cat.id}>
                  <div className="flex h-24 items-center justify-center rounded-xl border bg-card p-4 text-center text-sm font-medium transition-colors hover:bg-accent hover:text-accent-foreground">
                    {localizedCategoryName(cat, locale)}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </>
  );
}
