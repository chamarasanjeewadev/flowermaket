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
        : `Design Your Own Bouquet Online | Custom Bouquet Maker Sri Lanka | FlowerMarket.lk`;
    const description =
      locale === "si"
        ? dict.design.subtitle
        : "Build a custom flower bouquet online — pick your flowers, get an AI-generated preview, and send your design to a local florist in Sri Lanka. Free bouquet maker, no account needed.";
    const pageUrl = absoluteUrl(`/${locale}/design`);
    const webApp = {
      "@context": "https://schema.org",
      "@type": "WebApplication",
      name: locale === "si" ? dict.design.title : "Custom Bouquet Maker — FlowerMarket.lk",
      applicationCategory: "LifestyleApplication",
      operatingSystem: "Any",
      url: pageUrl,
      description,
      offers: {
        "@type": "Offer",
        price: "0",
        priceCurrency: "LKR",
      },
    };
    return {
      meta: [
        { title },
        { name: "description", content: description },
        { name: "keywords", content: "design your own bouquet online Sri Lanka, custom bouquet maker, build a bouquet, AI bouquet, flower arrangement online, custom flower bouquet Sri Lanka" },
        ...socialMeta({
          title,
          description,
          url: pageUrl,
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
