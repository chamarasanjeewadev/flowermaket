import * as React from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  buildQuotationText,
  buildWhatsappUrl,
  formatQuotationRupees,
  quotationLineTotal,
  quotationTotal,
  WHATSAPP_NUMBER,
  type QuotationDetails,
  type QuotationLine,
  type QuotationUnit,
} from "@flowers/integrations";
import { Button, buttonVariants } from "@flowers/ui/components/button";
import { Input } from "@flowers/ui/components/input";
import { Label } from "@flowers/ui/components/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@flowers/ui/components/select";
import { Textarea } from "@flowers/ui/components/textarea";
import {
  ArrowUpRight,
  Calculator,
  CircleAlert,
  Plus,
  Printer,
  Send,
  Trash2,
} from "lucide-react";
import { localizedName, type Locale } from "../../i18n";
import { useT } from "../../i18n/react";
import { jsonLdScript, localePath, socialMeta } from "../../lib/seo";
import { absoluteUrl, hreflangLinks, siteUrl } from "../../lib/site";
import {
  listProducts,
  type ProductListItemDTO,
} from "../../server/catalog";

const SEO_PATH = "/fresh-flower-quotation-generator";
const NO_LISTING = "none";

let customLineSequence = 1;

function emptyLine(id = "custom-1"): QuotationLine {
  return {
    id,
    name: "",
    quantity: 1,
    unitPrice: 0,
    unit: "stem",
  };
}

export const Route = createFileRoute(
  "/$locale/fresh-flower-quotation-generator",
)({
  loader: async () => {
    const result = await listProducts({ data: {} });
    return { listings: result.items };
  },
  head: ({ params }) => {
    const locale = params.locale as Locale;
    const title =
      locale === "si"
        ? "විවාහ සඳහා නැවුම් මල් මිල ගණන් සාදනය | FlowerMarket.lk"
        : "Fresh Flower Quotation Generator for Weddings | FlowerMarket.lk";
    const description =
      locale === "si"
        ? "මල් වර්ග, ප්‍රමාණ සහ ඒකක මිල එක් කර විවාහ මල් ඇස්තමේන්තුවක් සාදන්න. මුළු මිල ගණනය කර ඇණවුම් ඉල්ලීම WhatsApp හරහා යවන්න."
        : "Create an itemised wedding flower quotation by flower type, quantity and unit price. Calculate the total, print the estimate, and send an order request.";
    const url = absoluteUrl(`/${locale}${SEO_PATH}`);
    const webApplication = {
      "@context": "https://schema.org",
      "@type": "WebApplication",
      name: title,
      description,
      url,
      inLanguage: locale,
      applicationCategory: "BusinessApplication",
      operatingSystem: "Web",
      offers: {
        "@type": "Offer",
        price: "0",
        priceCurrency: "LKR",
      },
    };
    const breadcrumbs = {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        {
          "@type": "ListItem",
          position: 1,
          name: "Home",
          item: absoluteUrl(localePath(locale, "/")),
        },
        {
          "@type": "ListItem",
          position: 2,
          name:
            locale === "si"
              ? "නැවුම් මල් මිල ගණන් සාදනය"
              : "Fresh flower quotation generator",
          item: url,
        },
      ],
    };

    return {
      meta: [
        { title },
        { name: "description", content: description },
        ...socialMeta({ title, description, url, locale }),
      ],
      links: hreflangLinks(SEO_PATH, locale),
      scripts: [jsonLdScript(webApplication), jsonLdScript(breadcrumbs)],
    };
  },
  component: FlowerQuotationGeneratorPage,
});

function FlowerQuotationGeneratorPage() {
  const { listings } = Route.useLoaderData();
  const { t, f, locale } = useT();
  const [lines, setLines] = React.useState<QuotationLine[]>([emptyLine()]);
  const [details, setDetails] = React.useState<QuotationDetails>({});
  const [selectedListing, setSelectedListing] = React.useState(
    listings[0]?.id ?? NO_LISTING,
  );

  const pricedLines = lines.filter(
    (line) => line.name.trim() && line.quantity > 0 && line.unitPrice > 0,
  );
  const total = quotationTotal(pricedLines);
  const quotationText = buildQuotationText({
    lines: pricedLines,
    details,
    locale,
    siteUrl: siteUrl(),
  });
  const whatsappUrl = buildWhatsappUrl(quotationText, WHATSAPP_NUMBER);

  const units: Array<{ value: QuotationUnit; label: string }> = [
    { value: "stem", label: t.quotation.unitStem },
    { value: "bunch", label: t.quotation.unitBunch },
    { value: "arrangement", label: t.quotation.unitArrangement },
    { value: "item", label: t.quotation.unitItem },
    { value: "service", label: t.quotation.unitService },
  ];

  function patchDetails(key: keyof QuotationDetails, value: string) {
    setDetails((current) => ({ ...current, [key]: value }));
  }

  function patchLine(id: string, patch: Partial<QuotationLine>) {
    setLines((current) =>
      current.map((line) => (line.id === id ? { ...line, ...patch } : line)),
    );
  }

  function addCustomLine() {
    customLineSequence += 1;
    setLines((current) => [
      ...current,
      emptyLine(`custom-${Date.now()}-${customLineSequence}`),
    ]);
  }

  function addPublishedListing() {
    const product = listings.find((item) => item.id === selectedListing);
    if (!product) return;
    setLines((current) => {
      const existing = current.find(
        (line) => line.productSlug === product.slug,
      );
      if (existing) {
        return current.map((line) =>
          line.id === existing.id
            ? {
                ...line,
                quantity:
                  line.quantity + Math.max(1, product.minOrderQty ?? 1),
              }
            : line,
        );
      }
      return [
        ...current.filter(
          (line) => line.name.trim() || line.unitPrice > 0,
        ),
        listingToLine(product, locale),
      ];
    });
  }

  function removeLine(id: string) {
    setLines((current) => {
      const remaining = current.filter((line) => line.id !== id);
      return remaining.length > 0 ? remaining : [emptyLine()];
    });
  }

  return (
    <div className="quotation-print-root">
      <section className="grid-paper border-b border-border">
        <div className="mx-auto max-w-6xl px-4 py-10 sm:py-14">
          <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-brand">
            <Calculator className="size-4" aria-hidden="true" />
            {t.quotation.eyebrow}
          </p>
          <h1 className="mt-3 max-w-4xl font-display text-4xl leading-tight sm:text-5xl">
            {t.quotation.title}
          </h1>
          <p className="mt-4 max-w-3xl text-base leading-relaxed text-muted-foreground">
            {t.quotation.intro}
          </p>
        </div>
      </section>

      <section className="border-b border-border bg-accent/25">
        <div className="mx-auto max-w-6xl px-4 py-8">
          <div className="flex flex-col gap-1">
            <h2 className="font-display text-2xl">{t.quotation.eventDetails}</h2>
            <p className="text-sm text-muted-foreground">
              {t.quotation.eventDetailsHint}
            </p>
          </div>
          <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <QuoteField label={t.quotation.plannerName} htmlFor="quote-planner">
              <Input
                id="quote-planner"
                value={details.plannerName ?? ""}
                onChange={(event) =>
                  patchDetails("plannerName", event.target.value)
                }
                placeholder={t.quotation.plannerPlaceholder}
              />
            </QuoteField>
            <QuoteField label={t.quotation.clientName} htmlFor="quote-client">
              <Input
                id="quote-client"
                value={details.clientName ?? ""}
                onChange={(event) =>
                  patchDetails("clientName", event.target.value)
                }
                placeholder={t.quotation.clientPlaceholder}
              />
            </QuoteField>
            <QuoteField label={t.quotation.eventDate} htmlFor="quote-date">
              <Input
                id="quote-date"
                type="date"
                value={details.eventDate ?? ""}
                onChange={(event) =>
                  patchDetails("eventDate", event.target.value)
                }
              />
            </QuoteField>
            <QuoteField label={t.quotation.venue} htmlFor="quote-venue">
              <Input
                id="quote-venue"
                value={details.venue ?? ""}
                onChange={(event) => patchDetails("venue", event.target.value)}
                placeholder={t.quotation.venuePlaceholder}
              />
            </QuoteField>
            <div className="sm:col-span-2 lg:col-span-4">
              <QuoteField label={t.quotation.notes} htmlFor="quote-notes">
                <Textarea
                  id="quote-notes"
                  rows={2}
                  value={details.notes ?? ""}
                  onChange={(event) => patchDetails("notes", event.target.value)}
                  placeholder={t.quotation.notesPlaceholder}
                />
              </QuoteField>
            </div>
          </div>
        </div>
      </section>

      <main className="mx-auto grid max-w-6xl gap-8 px-4 py-10 lg:grid-cols-[minmax(0,1fr)_320px] lg:items-start">
        <section aria-labelledby="quote-items-heading">
          <div className="flex flex-col gap-1">
            <h2 id="quote-items-heading" className="font-display text-3xl">
              {t.quotation.flowerItems}
            </h2>
            <p className="text-sm text-muted-foreground">
              {t.quotation.flowerItemsHint}
            </p>
          </div>

          <div className="quotation-screen-only mt-6 border-y border-border py-5">
            {listings.length > 0 ? (
              <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
                <div className="min-w-0 flex-1 space-y-1.5">
                  <Label>{t.quotation.chooseListing}</Label>
                  <Select
                    value={selectedListing}
                    onValueChange={setSelectedListing}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder={t.quotation.chooseListing} />
                    </SelectTrigger>
                    <SelectContent>
                      {listings.map((product) => (
                        <SelectItem key={product.id} value={product.id}>
                          {localizedName(product, locale)} - {formatQuotationRupees(product.price)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  onClick={addPublishedListing}
                >
                  <Plus className="size-4" aria-hidden="true" />
                  {t.quotation.addListing}
                </Button>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                {t.quotation.noListings}
              </p>
            )}
          </div>

          <div className="mt-6 space-y-4">
            {lines.map((line, index) => (
              <QuoteLineEditor
                key={line.id}
                line={line}
                index={index}
                units={units}
                locale={locale}
                onPatch={(patch) => patchLine(line.id, patch)}
                onRemove={() => removeLine(line.id)}
              />
            ))}
          </div>

          <Button
            type="button"
            variant="outline"
            onClick={addCustomLine}
            className="quotation-screen-only mt-5"
          >
            <Plus className="size-4" aria-hidden="true" />
            {t.quotation.addCustom}
          </Button>
        </section>

        <aside className="rounded-lg border border-border bg-card p-5 lg:sticky lg:top-24">
          <h2 className="font-display text-2xl">{t.quotation.summary}</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {f(t.quotation.itemCount, { count: pricedLines.length })}
          </p>
          <div className="my-5 border-y border-border py-5">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {t.quotation.estimatedTotal}
            </p>
            <p className="mt-2 font-display text-4xl tabular-nums">
              {formatQuotationRupees(total)}
            </p>
            {pricedLines.length === 0 && (
              <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                {t.quotation.emptyTotal}
              </p>
            )}
          </div>
          <p className="flex items-start gap-2 text-xs leading-relaxed text-muted-foreground">
            <CircleAlert
              className="mt-0.5 size-4 shrink-0 text-brand"
              aria-hidden="true"
            />
            <span>{t.quotation.estimateNotice}</span>
          </p>
          <div className="quotation-screen-only mt-5 space-y-3">
            {pricedLines.length > 0 ? (
              <Button
                asChild
                size="lg"
                className="w-full bg-[#25D366] text-white hover:bg-[#1fb457]"
              >
                <a href={whatsappUrl} target="_blank" rel="noopener noreferrer">
                  <Send className="size-4" aria-hidden="true" />
                  {t.quotation.requestOrder}
                </a>
              </Button>
            ) : (
              <Button size="lg" className="w-full" disabled>
                <Send className="size-4" aria-hidden="true" />
                {t.quotation.requestOrder}
              </Button>
            )}
            <Button
              type="button"
              variant="outline"
              className="w-full"
              onClick={() => window.print()}
            >
              <Printer className="size-4" aria-hidden="true" />
              {t.quotation.print}
            </Button>
            <Link
              to="/$locale/products"
              params={{ locale }}
              className={buttonVariants({ variant: "ghost", className: "w-full" })}
            >
              {t.quotation.browseListings}
              <ArrowUpRight className="size-4" aria-hidden="true" />
            </Link>
            <p className="text-center text-xs leading-relaxed text-muted-foreground">
              {t.quotation.requestOrderHint}
            </p>
          </div>
        </aside>
      </main>
    </div>
  );
}

function QuoteField({
  label,
  htmlFor,
  children,
}: {
  label: string;
  htmlFor: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
    </div>
  );
}

function listingToLine(
  product: ProductListItemDTO,
  locale: Locale,
): QuotationLine {
  return {
    id: `listing-${product.id}`,
    name: localizedName(product, locale),
    quantity: Math.max(1, product.minOrderQty ?? 1),
    unitPrice: product.price,
    unit: product.listingType === "wholesale" ? "stem" : "item",
    productSlug: product.slug,
  };
}

function QuoteLineEditor({
  line,
  index,
  units,
  locale,
  onPatch,
  onRemove,
}: {
  line: QuotationLine;
  index: number;
  units: Array<{ value: QuotationUnit; label: string }>;
  locale: Locale;
  onPatch: (patch: Partial<QuotationLine>) => void;
  onRemove: () => void;
}) {
  const { t } = useT();
  const prefix = `quote-line-${index}`;
  return (
    <article className="rounded-lg border border-border bg-card p-4">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-[minmax(180px,2fr)_1fr_1fr_1.25fr_auto] lg:items-end">
        <QuoteField label={t.quotation.flowerName} htmlFor={`${prefix}-name`}>
          <Input
            id={`${prefix}-name`}
            value={line.name}
            onChange={(event) => onPatch({ name: event.target.value })}
            placeholder={t.quotation.flowerNamePlaceholder}
          />
        </QuoteField>
        <div className="flex flex-col gap-1.5">
          <Label>{t.quotation.unit}</Label>
          <Select
            value={line.unit}
            onValueChange={(value) =>
              onPatch({ unit: value as QuotationUnit })
            }
          >
            <SelectTrigger aria-label={t.quotation.unit}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {units.map((unit) => (
                <SelectItem key={unit.value} value={unit.value}>
                  {unit.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <QuoteField label={t.quotation.quantity} htmlFor={`${prefix}-qty`}>
          <Input
            id={`${prefix}-qty`}
            type="number"
            min="1"
            step="1"
            inputMode="numeric"
            value={line.quantity || ""}
            onChange={(event) =>
              onPatch({ quantity: Math.max(0, Number(event.target.value)) })
            }
          />
        </QuoteField>
        <QuoteField label={t.quotation.unitPrice} htmlFor={`${prefix}-price`}>
          <Input
            id={`${prefix}-price`}
            type="number"
            min="0"
            step="0.01"
            inputMode="decimal"
            value={line.unitPrice > 0 ? line.unitPrice / 100 : ""}
            onChange={(event) =>
              onPatch({
                unitPrice: Math.max(
                  0,
                  Math.round(Number(event.target.value) * 100),
                ),
              })
            }
            placeholder="0.00"
          />
        </QuoteField>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={onRemove}
          aria-label={t.quotation.removeLine}
          className="quotation-screen-only text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
        >
          <Trash2 className="size-4" aria-hidden="true" />
        </Button>
      </div>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3">
        <div className="text-xs text-muted-foreground">
          {line.productSlug ? (
            <Link
              to="/$locale/products/$slug"
              params={{ locale, slug: line.productSlug }}
              className="quotation-screen-only font-medium text-brand hover:underline"
            >
              {t.quotation.listedItem}
            </Link>
          ) : (
            <span>{t.quotation.addCustom}</span>
          )}
        </div>
        <p className="text-sm font-semibold tabular-nums">
          <span className="mr-2 font-normal text-muted-foreground">
            {t.quotation.lineTotal}
          </span>
          {formatQuotationRupees(quotationLineTotal(line))}
        </p>
      </div>
    </article>
  );
}
