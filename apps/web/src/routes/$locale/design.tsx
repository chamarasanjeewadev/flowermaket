import { createFileRoute } from "@tanstack/react-router";
import { getDict, type Locale } from "../../i18n";
import { useT } from "../../i18n/react";
import { absoluteUrl, hreflangLinks } from "../../lib/site";
import { jsonLdScript, socialMeta } from "../../lib/seo";
import { listDesignerFlowers } from "../../server/catalog";
import BouquetDesigner from "../../components/design/BouquetDesigner";

export const Route = createFileRoute("/$locale/design")({
  loader: async () => {
    const { items } = await listDesignerFlowers();
    return { items };
  },
  head: ({ params }) => {
    const locale = params.locale as Locale;
    const dict = getDict(locale);
    const title =
      locale === "si"
        ? `${dict.design.title} | FlowerMarket.lk`
        : `Design Your Own Bouquet Online in Sri Lanka | FlowerMarket.lk`;
    const description = dict.design.subtitle;
    const webApp = {
      "@context": "https://schema.org",
      "@type": "WebApplication",
      name: dict.design.title,
      applicationCategory: "LifestyleApplication",
      url: absoluteUrl(`/${locale}/design`),
      description,
    };
    return {
      meta: [
        { title },
        { name: "description", content: description },
        ...socialMeta({
          title,
          description,
          url: absoluteUrl(`/${locale}/design`),
          locale,
        }),
      ],
      links: hreflangLinks("/design", locale),
      scripts: [jsonLdScript(webApp)],
    };
  },
  component: DesignPage,
});

function DesignPage() {
  const { items } = Route.useLoaderData();
  const { t } = useT();
  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <header className="mb-8 rounded-lg bg-sage px-6 py-10 sm:px-10 sm:py-12">
        <h1 className="font-display text-4xl sm:text-5xl">{t.design.title}</h1>
        <p className="mt-3 max-w-2xl text-sm text-foreground/70 sm:text-base">
          {t.design.subtitle}
        </p>
      </header>
      <BouquetDesigner flowers={items} />
    </div>
  );
}
