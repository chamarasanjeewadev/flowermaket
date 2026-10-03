import { createFileRoute, Link } from "@tanstack/react-router";
import { buttonVariants } from "@flowers/ui/components/button";
import {
  ArrowUpRight,
  CheckCircle2,
  Leaf,
  MessageCircle,
  Tag,
  TrendingDown,
} from "lucide-react";
import { ProductGrid } from "../../components/catalog/ProductGrid";
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

const SEO_PATH = "/rose-prices-sri-lanka";

/** FAQ shown on the page and mirrored into FAQPage JSON-LD. English only —
 * this landing page keeps a localized title/description but an English body. */
const FAQS = [
  {
    q: "How much do roses cost in Sri Lanka?",
    a: "Rose prices in Sri Lanka vary by stem length, variety, season and how far the flowers travel before they reach you. A single retail rose from a florist is usually marked up well above what a grower is paid, while buying by the bunch or direct from a supplier lowers the per-stem price. On FlowerMarket.lk every listing shows the seller's own price up front, so you can compare before you enquire.",
  },
  {
    q: "Why are roses from local florists more expensive?",
    a: "Roses often pass through several hands — grower, wholesaler, then the florist's shop — and each step adds a margin, handling and storage cost on top of the last. By the time a rose reaches a high-street florist, that chain and the shopfront overheads are built into the price you pay.",
  },
  {
    q: "Can I buy roses direct from growers in Sri Lanka?",
    a: "Yes. FlowerMarket.lk lists roses directly from growers and florists across the country, so you can shop closer to the source and skip some of the markup. Filter for wholesale listings when you need larger quantities for a wedding, event or resale.",
  },
  {
    q: "Are roses bought direct from the supplier fresher?",
    a: "Generally, the fewer stops between the field and your hands, the fresher the flower and the longer it lasts in a vase. Buying direct from a grower or florist listing lets you ask about the cut date and condition before you commit, which you can do through an enquiry on any listing.",
  },
];

export const Route = createFileRoute("/$locale/rose-prices-sri-lanka")({
  loader: async () => {
    const result = await listProducts({ data: { category: "roses" } });
    return { roses: result.items.slice(0, 8) };
  },
  head: ({ loaderData, params }) => {
    const locale = params.locale as Locale;
    const title =
      locale === "si"
        ? "ශ්‍රී ලංකාවේ රෝස මල් මිල — සැපයුම්කරුගෙන් කෙළින්ම | FlowerMarket.lk"
        : "Rose Prices in Sri Lanka — Direct From the Supplier | FlowerMarket.lk";
    const description =
      locale === "si"
        ? "ශ්‍රී ලංකාවේ රෝස මල් මිල ගොඩක් වැඩි ඇයි? මල් වවන්නන්ගෙන් හා මල් වෙළෙන්දන්ගෙන් කෙළින්ම රෝස මල් මිල සසඳා, අතරමැදියන් නැතිව නැවුම් මල් ලබා ගන්න."
        : "Why do roses cost so much at the florist? Compare rose prices from growers and florists on FlowerMarket.lk, skip the middleman markup, and buy fresher blooms direct from the supplier.";
    const canonicalUrl = absoluteUrl(`/${locale}${SEO_PATH}`);
    const roses = loaderData?.roses ?? [];
    const collectionPage = {
      "@context": "https://schema.org",
      "@type": "CollectionPage",
      name: title,
      description,
      url: canonicalUrl,
      inLanguage: locale,
      mainEntity: {
        "@type": "ItemList",
        numberOfItems: roses.length,
        itemListElement: roses.map((product, index) => ({
          "@type": "ListItem",
          position: index + 1,
          name: product.nameEn,
          url: absoluteUrl(`/${locale}/products/${product.slug}`),
        })),
      },
    };
    const faqPage = {
      "@context": "https://schema.org",
      "@type": "FAQPage",
      inLanguage: locale,
      mainEntity: FAQS.map((item) => ({
        "@type": "Question",
        name: item.q,
        acceptedAnswer: { "@type": "Answer", text: item.a },
      })),
    };
    const breadcrumbs = breadcrumbJsonLd([
      { name: "Home", path: localePath(locale, "/") },
      {
        name: locale === "si" ? "රෝස මල් මිල" : "Rose prices",
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
      scripts: [
        jsonLdScript(collectionPage),
        jsonLdScript(faqPage),
        jsonLdScript(breadcrumbs),
      ],
    };
  },
  component: RosePricesPage,
});

const MARKUP_CHAIN = [
  {
    step: "Grower",
    body: "The farm cuts the roses and is paid a farm-gate price — often the smallest slice of what you eventually pay.",
  },
  {
    step: "Wholesaler",
    body: "Stems are bought in bulk, graded and stored, with a margin and handling cost added before they move on.",
  },
  {
    step: "Florist shop",
    body: "The retail florist adds their own margin plus rent, staff and shopfront overheads for a single arrangement.",
  },
  {
    step: "You",
    body: "By the register, every step above is baked into the price of one bunch of roses.",
  },
];

const PROMISE = [
  {
    icon: Tag,
    title: "The price is on the listing",
    body: "Every rose listing shows the seller's own price and minimum quantity up front — no quote-only guessing, no surprises at the counter.",
  },
  {
    icon: Leaf,
    title: "Closer to the source",
    body: "Shop grower and florist listings directly and cut some of the hops between the field and your vase, so blooms arrive fresher.",
  },
  {
    icon: MessageCircle,
    title: "Enquire before you pay",
    body: "Message the seller to confirm the cut date, availability and delivery — then agree the price directly with the supplier.",
  },
];

function RosePricesPage() {
  const { roses } = Route.useLoaderData();
  const { locale } = useT();

  return (
    <>
      <section className="grid-paper border-b border-border">
        <div className="mx-auto max-w-6xl px-4 py-12 sm:py-16">
          <p className="text-xs font-semibold uppercase tracking-wide text-brand">
            Rose prices in Sri Lanka
          </p>
          <h1 className="mt-3 max-w-3xl font-display text-4xl leading-tight sm:text-6xl">
            Fair rose prices, direct from the supplier
          </h1>
          <p className="mt-5 max-w-2xl text-base leading-relaxed text-muted-foreground sm:text-lg">
            Roses feel expensive at the florist because they pass through so
            many hands before they reach you. FlowerMarket.lk lists roses
            directly from growers and florists across Sri Lanka — with the price
            shown up front, so you can compare and buy closer to the source.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link
              to="/$locale/c/$slug"
              params={{ locale, slug: "roses" }}
              className={buttonVariants({ size: "pill" })}
            >
              Browse rose listings
              <ArrowUpRight className="size-4" aria-hidden="true" />
            </Link>
            <Link
              to="/$locale/products"
              params={{ locale }}
              search={{ type: "wholesale" }}
              className={buttonVariants({ variant: "outline", size: "pill" })}
            >
              View wholesale roses
            </Link>
          </div>
          <p className="mt-8 flex max-w-2xl items-start gap-2 border-l-2 border-brand/40 pl-3 text-sm leading-relaxed text-muted-foreground">
            <TrendingDown className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            <span>
              Prices are set by each seller and vary by variety, stem length and
              season. Always confirm the current price and availability in your
              enquiry before paying.
            </span>
          </p>
        </div>
      </section>

      <section
        className="mx-auto max-w-6xl px-4 py-14"
        aria-labelledby="markup-heading"
      >
        <h2 id="markup-heading" className="font-display text-3xl sm:text-4xl">
          Why roses cost more at the florist
        </h2>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
          The price of a rose is really the price of its journey. Every stop
          between the farm and the shop counter adds a margin — here is where
          the money goes.
        </p>
        <ol className="mt-7 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {MARKUP_CHAIN.map((link, index) => (
            <li
              key={link.step}
              className="rounded-lg border border-border/70 bg-background p-5"
            >
              <span className="flex size-8 items-center justify-center rounded-full bg-accent text-sm font-semibold text-foreground">
                {index + 1}
              </span>
              <h3 className="mt-3 text-sm font-semibold">{link.step}</h3>
              <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                {link.body}
              </p>
            </li>
          ))}
        </ol>
      </section>

      <section className="border-y border-border bg-accent/35">
        <div className="mx-auto max-w-6xl px-4 py-14">
          <h2 className="font-display text-3xl sm:text-4xl">
            Direct from the supplier, direct to you
          </h2>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
            We connect you with the growers and florists themselves, so more of
            what you pay goes to the people who actually grow and arrange the
            flowers.
          </p>
          <ul className="mt-7 grid gap-8 sm:grid-cols-3">
            {PROMISE.map(({ icon: Icon, title, body }) => (
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

      <section
        className="mx-auto max-w-6xl px-4 py-14"
        aria-labelledby="rose-listings"
      >
        <div className="mb-6">
          <h2 id="rose-listings" className="font-display text-3xl sm:text-4xl">
            Rose listings on the marketplace
          </h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Current retail and wholesale rose listings — each with the seller's
            price shown up front.
          </p>
        </div>
        {roses.length > 0 ? (
          <ProductGrid products={roses} />
        ) : (
          <p className="rounded-lg border border-dashed border-border/70 bg-background px-4 py-8 text-center text-sm text-muted-foreground">
            No rose listings are live right now.{" "}
            <Link
              to="/$locale/products"
              params={{ locale }}
              className="font-medium text-brand underline-offset-4 hover:underline"
            >
              Browse all flowers
            </Link>{" "}
            or check back soon.
          </p>
        )}
      </section>

      <section
        className="mx-auto max-w-6xl px-4 pb-14"
        aria-labelledby="rose-faq"
      >
        <h2 id="rose-faq" className="font-display text-3xl sm:text-4xl">
          Rose price questions, answered
        </h2>
        <dl className="mt-7 max-w-3xl divide-y divide-border border-t border-border">
          {FAQS.map((item) => (
            <div key={item.q} className="py-5">
              <dt className="text-base font-semibold">{item.q}</dt>
              <dd className="mt-2 text-sm leading-relaxed text-muted-foreground">
                {item.a}
              </dd>
            </div>
          ))}
        </dl>
      </section>

      <section className="mx-auto max-w-6xl px-4 pb-14">
        <div className="flex max-w-3xl items-start gap-4 border-t border-border pt-8">
          <CheckCircle2
            className="mt-1 size-5 shrink-0 text-brand"
            aria-hidden="true"
          />
          <div>
            <h2 className="font-display text-2xl">
              Shop roses at a price you can see
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              Browse rose listings from growers and florists across Sri Lanka,
              compare the listed prices, and send an enquiry to confirm
              availability and delivery before you pay.
            </p>
            <div className="mt-5 flex flex-wrap gap-3">
              <Link
                to="/$locale/c/$slug"
                params={{ locale, slug: "roses" }}
                className={buttonVariants({ size: "pill" })}
              >
                Browse rose listings
                <ArrowUpRight className="size-4" aria-hidden="true" />
              </Link>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
