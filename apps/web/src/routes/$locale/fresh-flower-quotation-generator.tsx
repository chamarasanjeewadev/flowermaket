import * as React from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
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
  Check,
  ChevronDown,
  ChevronUp,
  CircleAlert,
  GripVertical,
  Plus,
  Printer,
  QrCode,
  Send,
  Share2,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { localizedName, type Locale } from "../../i18n";
import { useT } from "../../i18n/react";
import { jsonLdScript, localePath, socialMeta } from "../../lib/seo";
import { absoluteUrl, hreflangLinks, siteUrl } from "../../lib/site";
import { variantDisplayName, type FlowerVariantRow } from "@flowers/api/flowers";
import { FlowerShowcase } from "../../components/catalog/FlowerShowcase";
import {
  listFeaturedVariants,
  listFlowerVariants,
} from "../../server/flowers";

type FlowerCategory = "imported" | "tropical" | "local";
import {
  listProducts,
  type ProductListItemDTO,
} from "../../server/catalog";

const SEO_PATH = "/fresh-flower-quotation-generator";
let customLineSequence = 1;

// --- URL state encoding ---

interface QuotationState {
  lines: QuotationLine[];
  details: QuotationDetails;
}

function encodeState(state: QuotationState): string {
  const json = JSON.stringify(state);
  // encodeURIComponent first makes it safe for any Unicode (Sinhala, etc.)
  return btoa(encodeURIComponent(json))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=/g, "");
}

function decodeState(encoded: string): QuotationState | null {
  try {
    const padded = encoded
      .replace(/-/g, "+")
      .replace(/_/g, "/")
      .padEnd(encoded.length + ((4 - (encoded.length % 4)) % 4), "=");
    const json = decodeURIComponent(atob(padded));
    const parsed = JSON.parse(json) as unknown;
    if (
      typeof parsed !== "object" ||
      parsed === null ||
      !Array.isArray((parsed as QuotationState).lines)
    )
      return null;
    return parsed as QuotationState;
  } catch {
    return null;
  }
}

// --- Route ---

function emptyLine(id = "custom-1"): QuotationLine {
  return { id, name: "", quantity: 1, unitPrice: 0, unit: "stem" };
}

export const Route = createFileRoute(
  "/$locale/fresh-flower-quotation-generator",
)({
  validateSearch: (search: Record<string, unknown>) => ({
    q: typeof search.q === "string" ? search.q : undefined,
  }),
  loader: async () => {
    const [listings, featuredFlowers, allFlowers] = await Promise.all([
      listProducts({ data: {} }).then((r) => r.items),
      listFeaturedVariants(),
      listFlowerVariants(),
    ]);
    return { listings, featuredFlowers, allFlowers };
  },
  head: ({ params }) => {
    const locale = params.locale as Locale;
    const title =
      locale === "si"
        ? "නැවුම් මල් මිල ගණන් සාදනය — විවාහ හා ප්‍රසංග | FlowerMarket.lk"
        : "Free Flower Quotation Generator for Florists & Events | FlowerMarket.lk";
    const description =
      locale === "si"
        ? "28 ජනප්‍රිය මල් වර්ග ඡායාරූප සහිතව — මිල ගණනය කරන්න, PDF බාගන්න, WhatsApp හරහා ගනුදෙනුකරුවන් වෙත යවන්න."
        : "Build itemised flower quotations with photos of 28 Sri Lankan flower types. Calculate totals, download PDF, share a link or WhatsApp — free tool for florists, suppliers and event planners.";
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
      offers: { "@type": "Offer", price: "0", priceCurrency: "LKR" },
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
              : "Free flower quotation generator",
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

// --- Main page ---

function FlowerQuotationGeneratorPage() {
  const { listings, featuredFlowers, allFlowers } = Route.useLoaderData();
  const { q } = Route.useSearch();
  const { t, f, locale } = useT();

  const preloaded = React.useMemo(
    () => (q ? decodeState(q) : null),
    [q],
  );

  const [lines, setLines] = React.useState<QuotationLine[]>(
    () => preloaded?.lines ?? [emptyLine()],
  );
  const [details, setDetails] = React.useState<QuotationDetails>(
    () => preloaded?.details ?? {},
  );
  const [selectedListing, setSelectedListing] = React.useState(
    listings[0]?.id ?? "none",
  );
  const [copyState, setCopyState] = React.useState<"idle" | "copied">("idle");
  const [qrImageUrl, setQrImageUrl] = React.useState<string | null>(null);
  const [activeCategory, setActiveCategory] =
    React.useState<FlowerCategory | "all">("all");
  const [flowerSearch, setFlowerSearch] = React.useState("");

  const pricedLines = lines.filter(
    (l) => l.name.trim() && l.quantity > 0 && l.unitPrice > 0,
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
    setDetails((d) => ({ ...d, [key]: value }));
  }

  function patchLine(id: string, patch: Partial<QuotationLine>) {
    setLines((current) =>
      current.map((l) => (l.id === id ? { ...l, ...patch } : l)),
    );
  }

  function addCustomLine() {
    customLineSequence += 1;
    setLines((current) => [
      ...current,
      emptyLine(`custom-${Date.now()}-${customLineSequence}`),
    ]);
  }

  function addFlowerFromCatalog(flower: FlowerVariantRow) {
    const matchedListing = listings.find(
      (p) => p.flowerVariantId === flower.id ||
        localizedName(p, "en").toLowerCase() ===
          variantDisplayName(flower, "en").toLowerCase(),
    );
    const unitPrice = matchedListing?.price ?? 0;
    setLines((current) => {
      const existing = current.find((l) => l.id === `catalog-${flower.id}`);
      if (existing) {
        return current.map((l) =>
          l.id === existing.id ? { ...l, quantity: l.quantity + 1 } : l,
        );
      }
      const cleanedLines = current.filter(
        (l) => l.name.trim() || l.unitPrice > 0,
      );
      return [
        ...cleanedLines,
        {
          id: `catalog-${flower.id}`,
          name: variantDisplayName(flower, locale),
          quantity: 1,
          unitPrice,
          unit: flower.defaultUnit,
        },
      ];
    });
    const displayName = variantDisplayName(flower, locale);
    toast.success(
      locale === "si"
        ? `${displayName} ගණනට එකතු කරන ලදී`
        : `${displayName} added to your quote`,
      { duration: 2000 },
    );
  }

  function addPublishedListing() {
    const product = listings.find((p) => p.id === selectedListing);
    if (!product) return;
    setLines((current) => {
      const existing = current.find((l) => l.productSlug === product.slug);
      if (existing) {
        return current.map((l) =>
          l.id === existing.id
            ? {
                ...l,
                quantity:
                  l.quantity + Math.max(1, product.minOrderQty ?? 1),
              }
            : l,
        );
      }
      return [
        ...current.filter((l) => l.name.trim() || l.unitPrice > 0),
        listingToLine(product, locale),
      ];
    });
  }

  function removeLine(id: string) {
    setLines((current) => {
      const remaining = current.filter((l) => l.id !== id);
      return remaining.length > 0 ? remaining : [emptyLine()];
    });
  }

  function moveLine(id: string, direction: "up" | "down") {
    setLines((current) => {
      const index = current.findIndex((l) => l.id === id);
      if (index === -1) return current;
      const to =
        direction === "up"
          ? Math.max(0, index - 1)
          : Math.min(current.length - 1, index + 1);
      return arrayMove(current, index, to);
    });
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      setLines((current) => {
        const from = current.findIndex((l) => l.id === active.id);
        const to = current.findIndex((l) => l.id === over.id);
        return arrayMove(current, from, to);
      });
    }
  }

  async function copyShareLink() {
    if (typeof window === "undefined") return;
    const state: QuotationState = { lines, details };
    const encoded = encodeState(state);
    const url = new URL(window.location.href);
    url.searchParams.set("q", encoded);
    await navigator.clipboard.writeText(url.toString()).catch(() => {});
    setCopyState("copied");
    setTimeout(() => setCopyState("idle"), 2500);
  }

  function openQrCode() {
    if (typeof window === "undefined") return;
    const state: QuotationState = { lines, details };
    const encoded = encodeState(state);
    const shareUrl = new URL(window.location.href);
    shareUrl.searchParams.set("q", encoded);
    setQrImageUrl(
      `https://api.qrserver.com/v1/create-qr-code/?size=240x240&data=${encodeURIComponent(shareUrl.toString())}`,
    );
  }

  const filteredFlowers = React.useMemo(() => {
    return allFlowers.filter((f) => {
      const catOk = activeCategory === "all" || f.category === activeCategory;
      const q = flowerSearch.toLowerCase();
      const nameOk =
        !q ||
        f.nameEn.toLowerCase().includes(q) ||
        f.nameSi.includes(q) ||
        (f.localName?.toLowerCase().includes(q) ?? false);
      return catOk && nameOk;
    });
  }, [allFlowers, activeCategory, flowerSearch]);

  const addedIds = new Set(
    lines.map((l) => l.id).filter((id) => id.startsWith("catalog-")),
  );

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  const CATEGORY_TABS: Array<{
    key: FlowerCategory | "all";
    label: string;
  }> = [
    { key: "all", label: t.quotation.categoryAll },
    { key: "imported", label: t.quotation.categoryImported },
    { key: "tropical", label: t.quotation.categoryTropical },
    { key: "local", label: t.quotation.categoryLocal },
  ];

  return (
    <div className="quotation-print-root">
      {/* Print header — only visible when printing */}
      <div className="quotation-print-header hidden">
        <img src="/logo.png" alt="FlowerMarket.lk" className="h-10" />
        <p className="text-xs text-muted-foreground">flowermarket.lk</p>
      </div>

      {/* Hero */}
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

      {/* Shared-quotation banner */}
      {preloaded && (
        <div className="quotation-screen-only border-b border-emerald-200 bg-emerald-50 px-4 py-3">
          <div className="mx-auto flex max-w-6xl items-center gap-3">
            <Check className="size-4 shrink-0 text-emerald-600" aria-hidden="true" />
            <p className="text-sm text-emerald-800">
              <span className="font-semibold">{t.quotation.savedQuotationBanner}</span>
              {" — "}
              {t.quotation.savedQuotationHint}
            </p>
          </div>
        </div>
      )}

      {/* Flower Gallery */}
      <section className="quotation-screen-only border-b border-border bg-accent/10">
        <div className="mx-auto max-w-6xl px-4 py-8">
          <div className="flex flex-col gap-1">
            <h2 className="font-display text-2xl">
              {f(t.quotation.flowerGallery, { count: allFlowers.length })}
            </h2>
            <p className="text-sm text-muted-foreground">
              {t.quotation.flowerGalleryHint}
            </p>
          </div>

          {/* Featured flowers — photo showcase */}
          <div className="mt-8 border-b border-border pb-10">
            <FlowerShowcase
              flowers={featuredFlowers}
              locale={locale}
              onEnquire={addFlowerFromCatalog}
              ctaLabel="Add to quote"
            />
          </div>

          {/* Search + Category tabs */}
          <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-4">
            <div className="relative flex-1 max-w-xs">
              <Input
                value={flowerSearch}
                onChange={(e) => setFlowerSearch(e.target.value)}
                placeholder={t.quotation.searchFlowers}
                className="pl-3"
                aria-label={t.quotation.searchFlowers}
              />
            </div>
            <div
              className="flex flex-wrap gap-2"
              role="group"
              aria-label="Filter by category"
            >
              {CATEGORY_TABS.map((tab) => (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => setActiveCategory(tab.key)}
                  className={[
                    "rounded-full px-3 py-1 text-xs font-medium transition-colors cursor-pointer",
                    activeCategory === tab.key
                      ? "bg-brand text-white"
                      : "bg-muted text-muted-foreground hover:bg-muted/80",
                  ].join(" ")}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          {/* Flower grid */}
          <ul
            className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6"
            role="list"
          >
            {filteredFlowers.map((flower) => {
              const isAdded = addedIds.has(`catalog-${flower.id}`);
              const displayName = variantDisplayName(flower, locale);
              return (
                <li key={flower.id}>
                  <button
                    type="button"
                    onClick={() => addFlowerFromCatalog(flower)}
                    aria-label={`${t.quotation.addToQuote}: ${displayName}`}
                    aria-pressed={isAdded}
                    className={[
                      "group relative w-full overflow-hidden rounded-xl border transition-all duration-200 cursor-pointer text-left",
                      isAdded
                        ? "border-brand/50 bg-brand/5 ring-1 ring-brand/30"
                        : "border-border bg-card hover:border-brand/30 hover:shadow-md",
                    ].join(" ")}
                  >
                    <div className="relative aspect-[4/3] overflow-hidden bg-muted">
                      <img
                        src={flower.imageUrl ?? "/placeholder-flower.svg"}
                        alt={displayName}
                        loading="lazy"
                        decoding="async"
                        className="size-full object-cover transition-transform duration-300 group-hover:scale-105"
                        onError={(e) => {
                          (e.currentTarget as HTMLImageElement).src =
                            "/placeholder-flower.svg";
                        }}
                      />
                      {isAdded && (
                        <div className="absolute inset-0 flex items-center justify-center bg-brand/20">
                          <div className="rounded-full bg-brand p-1">
                            <Check className="size-3 text-white" aria-hidden="true" />
                          </div>
                        </div>
                      )}
                    </div>
                    <div className="p-2">
                      <p className="text-xs font-semibold leading-tight">
                        {displayName}
                      </p>
                      {flower.localName && (
                        <p className="mt-0.5 text-[10px] text-muted-foreground leading-tight">
                          {flower.localName}
                        </p>
                      )}
                      <p className="mt-1 text-[10px] text-muted-foreground">
                        {isAdded ? t.quotation.alreadyAdded : `+ ${t.quotation.addToQuote}`}
                      </p>
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      </section>

      {/* Event details */}
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
                onChange={(e) => patchDetails("plannerName", e.target.value)}
                placeholder={t.quotation.plannerPlaceholder}
              />
            </QuoteField>
            <QuoteField label={t.quotation.clientName} htmlFor="quote-client">
              <Input
                id="quote-client"
                value={details.clientName ?? ""}
                onChange={(e) => patchDetails("clientName", e.target.value)}
                placeholder={t.quotation.clientPlaceholder}
              />
            </QuoteField>
            <QuoteField label={t.quotation.eventDate} htmlFor="quote-date">
              <Input
                id="quote-date"
                type="date"
                value={details.eventDate ?? ""}
                onChange={(e) => patchDetails("eventDate", e.target.value)}
              />
            </QuoteField>
            <QuoteField label={t.quotation.venue} htmlFor="quote-venue">
              <Input
                id="quote-venue"
                value={details.venue ?? ""}
                onChange={(e) => patchDetails("venue", e.target.value)}
                placeholder={t.quotation.venuePlaceholder}
              />
            </QuoteField>
            <div className="sm:col-span-2 lg:col-span-4">
              <QuoteField label={t.quotation.notes} htmlFor="quote-notes">
                <Textarea
                  id="quote-notes"
                  rows={2}
                  value={details.notes ?? ""}
                  onChange={(e) => patchDetails("notes", e.target.value)}
                  placeholder={t.quotation.notesPlaceholder}
                />
              </QuoteField>
            </div>
          </div>
        </div>
      </section>

      {/* Main grid */}
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

          {/* Add from catalog dropdown */}
          {listings.length > 0 && (
            <div className="quotation-screen-only mt-6 border-y border-border py-5">
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
                          {localizedName(product, locale)} —{" "}
                          {formatQuotationRupees(product.price)}
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
            </div>
          )}

          {/* Sortable line items */}
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <SortableContext
              items={lines.map((l) => l.id)}
              strategy={verticalListSortingStrategy}
            >
              <div className="mt-6 space-y-3">
                {lines.map((line, index) => (
                  <SortableQuoteLineEditor
                    key={line.id}
                    line={line}
                    index={index}
                    units={units}
                    locale={locale}
                    totalLines={lines.length}
                    onPatch={(patch) => patchLine(line.id, patch)}
                    onRemove={() => removeLine(line.id)}
                    onMove={(dir) => moveLine(line.id, dir)}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>

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

        {/* Summary sidebar */}
        <aside className="rounded-xl border border-border bg-card p-5 lg:sticky lg:top-24">
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

          {/* Action buttons */}
          <div className="quotation-screen-only mt-5 space-y-2.5">
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

            {/* Share link */}
            <Button
              type="button"
              variant="outline"
              className="w-full"
              onClick={copyShareLink}
            >
              {copyState === "copied" ? (
                <Check className="size-4" aria-hidden="true" />
              ) : (
                <Share2 className="size-4" aria-hidden="true" />
              )}
              {copyState === "copied" ? t.quotation.linkCopied : t.quotation.shareQuotation}
            </Button>

            {/* QR code */}
            <button
              type="button"
              onClick={openQrCode}
              className="flex w-full items-center gap-2 rounded-lg border border-border px-3 py-2.5 text-sm transition-colors hover:bg-accent/50 cursor-pointer"
            >
              <QrCode className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
              <span className="flex-1 text-left">
                <span className="block font-medium">{t.quotation.createQrCode}</span>
                <span className="block text-[11px] text-muted-foreground">
                  {t.quotation.qrCodeHint}
                </span>
              </span>
              <ArrowUpRight className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
            </button>

            {/* PDF / Print */}
            <Button
              type="button"
              variant="outline"
              className="w-full"
              onClick={() => typeof window !== "undefined" && window.print()}
            >
              <Printer className="size-4" aria-hidden="true" />
              {t.quotation.downloadPdf}
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

      {/* QR code overlay */}
      {qrImageUrl && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/60 p-4 backdrop-blur-sm"
          onClick={() => setQrImageUrl(null)}
        >
          <div
            className="w-full max-w-xs rounded-2xl border border-border bg-background p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="font-display text-xl">{t.quotation.createQrCode}</p>
            <p className="mt-1 text-sm text-muted-foreground">
              {locale === "si"
                ? "QR කේතය scan කර ගණන් ශීටය ඕනෑ කෙනෙකුට බලන්න යවන්න."
                : "Scan with any camera to open and view this quotation."}
            </p>
            <div className="mt-4 flex justify-center">
              <img
                src={qrImageUrl}
                alt="QR code for this quotation"
                className="size-60 rounded-xl border border-border"
              />
            </div>
            <button
              type="button"
              onClick={() => setQrImageUrl(null)}
              className="mt-5 w-full rounded-lg border border-border py-2 text-sm font-medium transition-colors hover:bg-accent"
            >
              {locale === "si" ? "වසන්න" : "Close"}
            </button>
          </div>
        </div>
      )}

      {/* SEO content — flower types reference */}
      <section className="quotation-screen-only border-t border-border bg-muted/30 px-4 py-12">
        <div className="mx-auto max-w-6xl">
          <h2 className="font-display text-2xl">
            {locale === "si"
              ? `ශ්‍රී ලංකාවේ ජනප්‍රිය මල් වර්ග ${allFlowers.length}ක් — මිල ගණනකට`
              : `${allFlowers.length} popular flowers for Sri Lankan events`}
          </h2>
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted-foreground">
            {locale === "si"
              ? "රෝස, ජර්බෙරා, ඕකිඩ්, හයිඩ්‍රේන්ජියා, නෙළුම් ඇතුළු ශ්‍රී ලංකාවේ ජනප්‍රිය මල් 28ක් ඡායාරූප සහිතව. ඔබේ විවාහ හෝ ප්‍රසංග සඳහා නිවැරදි මල් තෝරන්න."
              : "Roses, gerbera, orchids, hydrangea, lotus and 23 more flowers commonly used in Sri Lankan weddings and events. Each flower card shows the Sinhala name, local name, and typical unit so you can build an accurate quotation instantly."}
          </p>
          <ul className="mt-6 grid grid-cols-2 gap-x-6 gap-y-1 text-sm sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
            {allFlowers.map((flower) => (
              <li key={flower.id} className="text-muted-foreground">
                <span className="text-foreground font-medium">
                  {variantDisplayName(flower, "en")}
                </span>
                {flower.localName ? ` (${flower.localName})` : ""}
              </li>
            ))}
          </ul>
        </div>
      </section>
    </div>
  );
}

// --- Sub-components ---

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

function listingToLine(product: ProductListItemDTO, locale: Locale): QuotationLine {
  return {
    id: `listing-${product.id}`,
    name: localizedName(product, locale),
    quantity: Math.max(1, product.minOrderQty ?? 1),
    unitPrice: product.price,
    unit: product.listingType === "wholesale" ? "stem" : "item",
    productSlug: product.slug,
  };
}

function SortableQuoteLineEditor({
  line,
  index,
  units,
  locale,
  totalLines,
  onPatch,
  onRemove,
  onMove,
}: {
  line: QuotationLine;
  index: number;
  units: Array<{ value: QuotationUnit; label: string }>;
  locale: Locale;
  totalLines: number;
  onPatch: (patch: Partial<QuotationLine>) => void;
  onRemove: () => void;
  onMove: (direction: "up" | "down") => void;
}) {
  const { t } = useT();
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: line.id });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 50 : undefined,
  };

  const prefix = `quote-line-${index}`;

  return (
    <article
      ref={setNodeRef}
      style={style}
      className="rounded-xl border border-border bg-card p-4"
    >
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-[auto_minmax(160px,2fr)_1fr_1fr_1.25fr_auto]">
        {/* Drag handle + move buttons */}
        <div className="quotation-screen-only flex flex-col items-center gap-0.5 pt-6">
          <button
            type="button"
            onClick={() => onMove("up")}
            disabled={index === 0}
            aria-label={t.quotation.moveUp}
            className="rounded p-0.5 text-muted-foreground transition-colors hover:bg-accent disabled:opacity-30 cursor-pointer disabled:cursor-not-allowed"
          >
            <ChevronUp className="size-3.5" aria-hidden="true" />
          </button>
          <button
            type="button"
            {...attributes}
            {...listeners}
            aria-label={t.quotation.dragHandle}
            className="cursor-grab rounded p-0.5 text-muted-foreground transition-colors hover:bg-accent active:cursor-grabbing"
          >
            <GripVertical className="size-4" aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={() => onMove("down")}
            disabled={index === totalLines - 1}
            aria-label={t.quotation.moveDown}
            className="rounded p-0.5 text-muted-foreground transition-colors hover:bg-accent disabled:opacity-30 cursor-pointer disabled:cursor-not-allowed"
          >
            <ChevronDown className="size-3.5" aria-hidden="true" />
          </button>
        </div>

        <QuoteField label={t.quotation.flowerName} htmlFor={`${prefix}-name`}>
          <Input
            id={`${prefix}-name`}
            value={line.name}
            onChange={(e) => onPatch({ name: e.target.value })}
            placeholder={t.quotation.flowerNamePlaceholder}
          />
        </QuoteField>

        <div className="flex flex-col gap-1.5">
          <Label>{t.quotation.unit}</Label>
          <Select
            value={line.unit}
            onValueChange={(value) => onPatch({ unit: value as QuotationUnit })}
          >
            <SelectTrigger aria-label={t.quotation.unit}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {units.map((u) => (
                <SelectItem key={u.value} value={u.value}>
                  {u.label}
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
            onChange={(e) =>
              onPatch({ quantity: Math.max(0, Number(e.target.value)) })
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
            onChange={(e) =>
              onPatch({
                unitPrice: Math.max(0, Math.round(Number(e.target.value) * 100)),
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
          className="quotation-screen-only mt-5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
        >
          <Trash2 className="size-4" aria-hidden="true" />
        </Button>
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3">
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
