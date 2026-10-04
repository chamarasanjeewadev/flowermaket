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
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@flowers/ui/components/sheet";
import {
  ArrowUpRight,
  Calculator,
  Check,
  ChevronDown,
  ChevronUp,
  CircleAlert,
  Flower2,
  GripVertical,
  Plus,
  Printer,
  QrCode,
  Send,
  Share2,
  Trash2,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { localizedName, type Locale } from "../../i18n";
import { useT } from "../../i18n/react";
import { jsonLdScript, localePath, socialMeta } from "../../lib/seo";
import { absoluteUrl, hreflangLinks, siteUrl } from "../../lib/site";
import { variantDisplayName, type FlowerVariantRow } from "@flowers/api/flowers";
import {
  listFeaturedVariants,
  listFlowerVariants,
} from "../../server/flowers";

type FlowerCategory = "imported" | "tropical" | "local";
import { listProducts } from "../../server/catalog";

const SEO_PATH = "/fresh-flower-quotation-generator";
let customLineSequence = 1;

// --- URL state encoding ---

interface QuotationState {
  lines: QuotationLine[];
  details: QuotationDetails;
}

function encodeState(state: QuotationState): string {
  const json = JSON.stringify(state);
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
  const { listings, allFlowers } = Route.useLoaderData();
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
  const [copyState, setCopyState] = React.useState<"idle" | "copied">("idle");
  const [qrImageUrl, setQrImageUrl] = React.useState<string | null>(null);
  const [activeCategory, setActiveCategory] =
    React.useState<FlowerCategory | "all">("all");
  const [flowerSearch, setFlowerSearch] = React.useState("");
  const [flowerSheetOpen, setFlowerSheetOpen] = React.useState(false);

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
        : `${displayName} added`,
      { duration: 1500 },
    );
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

      {/* Hero — compact on mobile */}
      <section className="grid-paper border-b border-border">
        <div className="mx-auto max-w-6xl px-4 py-6 sm:py-10">
          <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-brand">
            <Calculator className="size-4" aria-hidden="true" />
            {t.quotation.eyebrow}
          </p>
          <h1 className="mt-2 max-w-4xl font-display text-3xl leading-tight sm:text-4xl lg:text-5xl">
            {t.quotation.title}
          </h1>
          <p className="mt-3 max-w-3xl text-sm leading-relaxed text-muted-foreground sm:text-base">
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

      {/* Main grid — quotation builder + summary */}
      <main className="mx-auto grid max-w-6xl gap-6 px-4 py-6 pb-28 sm:py-8 sm:pb-28 lg:grid-cols-[minmax(0,1fr)_320px] lg:items-start lg:pb-10">

        {/* Left column: event details + line items */}
        <div className="space-y-5">

          {/* Event details */}
          <section aria-label={t.quotation.eventDetails} className="rounded-xl border border-border bg-accent/20 p-4">
            <h2 className="font-display text-lg">{t.quotation.eventDetails}</h2>
            <p className="mt-0.5 text-xs text-muted-foreground">{t.quotation.eventDetailsHint}</p>
            <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
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
          </section>

          {/* Flower items */}
          <section aria-labelledby="quote-items-heading">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 id="quote-items-heading" className="font-display text-2xl">
                  {t.quotation.flowerItems}
                </h2>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {t.quotation.flowerItemsHint}
                </p>
              </div>
            </div>

            {/* Browse flowers button — opens sheet */}
            <button
              type="button"
              onClick={() => setFlowerSheetOpen(true)}
              className="quotation-screen-only mt-4 flex w-full items-center gap-3 rounded-xl border border-dashed border-brand/40 bg-brand/5 px-4 py-3.5 text-left transition-colors hover:border-brand/60 hover:bg-brand/10 cursor-pointer"
            >
              <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-brand/10">
                <Flower2 className="size-4 text-brand" aria-hidden="true" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-foreground">
                  {f(t.quotation.flowerGallery, { count: allFlowers.length })}
                </p>
                <p className="text-xs text-muted-foreground">{t.quotation.flowerGalleryHint}</p>
              </div>
              <ArrowUpRight className="size-4 shrink-0 text-brand" aria-hidden="true" />
            </button>

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
                <div className="mt-4 space-y-2">
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
              className="quotation-screen-only mt-4"
            >
              <Plus className="size-4" aria-hidden="true" />
              {t.quotation.addCustom}
            </Button>
          </section>
        </div>

        {/* Summary sidebar */}
        <aside className="rounded-xl border border-border bg-card p-5 lg:sticky lg:top-24">
          <h2 className="font-display text-2xl">{t.quotation.summary}</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {f(t.quotation.itemCount, { count: pricedLines.length })}
          </p>

          <div className="my-4 border-y border-border py-4">
            <p className="text-xs text-muted-foreground">{t.quotation.estimatedTotal}</p>
            <p className="mt-1 font-display text-4xl tabular-nums">
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
          <div className="quotation-screen-only mt-5 space-y-2">
            {/* Browse flowers */}
            <Button
              type="button"
              variant="outline"
              className="w-full"
              onClick={() => setFlowerSheetOpen(true)}
            >
              <Flower2 className="size-4" aria-hidden="true" />
              {f(t.quotation.flowerGallery, { count: allFlowers.length })}
            </Button>

            {/* WhatsApp */}
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

      {/* Flower catalog bottom sheet */}
      <Sheet open={flowerSheetOpen} onOpenChange={setFlowerSheetOpen}>
        <SheetContent
          side="bottom"
          className="quotation-screen-only flex max-h-[90dvh] flex-col gap-0 p-0"
        >
          {/* Sticky sheet header */}
          <SheetHeader className="border-b border-border px-4 pb-3 pt-4">
            <div className="flex items-center justify-between">
              <SheetTitle className="font-display text-xl">
                {f(t.quotation.flowerGallery, { count: allFlowers.length })}
              </SheetTitle>
              {pricedLines.length > 0 && (
                <span className="rounded-full bg-brand px-2.5 py-0.5 text-xs font-semibold text-white">
                  {pricedLines.length} in quote
                </span>
              )}
            </div>
            <SheetDescription className="text-left text-xs">
              {t.quotation.flowerGalleryHint}
            </SheetDescription>
            {/* Search + category tabs */}
            <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
              <Input
                value={flowerSearch}
                onChange={(e) => setFlowerSearch(e.target.value)}
                placeholder={t.quotation.searchFlowers}
                className="sm:max-w-xs"
                aria-label={t.quotation.searchFlowers}
              />
              <div
                className="flex flex-wrap gap-1.5"
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
          </SheetHeader>

          {/* Scrollable flower grid */}
          <div className="flex-1 overflow-y-auto p-4">
            {filteredFlowers.length === 0 ? (
              <div className="flex flex-col items-center gap-2 py-12 text-center">
                <Flower2 className="size-8 text-muted-foreground/40" />
                <p className="text-sm text-muted-foreground">No flowers match your search</p>
              </div>
            ) : (
              <ul
                className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-8"
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
                        <div className="p-1.5">
                          <p className="text-[11px] font-semibold leading-tight">
                            {displayName}
                          </p>
                          {flower.localName && (
                            <p className="mt-0.5 text-[10px] text-muted-foreground leading-tight">
                              {flower.localName}
                            </p>
                          )}
                        </div>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          {/* Sheet footer — close + item count */}
          <div className="border-t border-border bg-background px-4 py-3">
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm text-muted-foreground">
                {pricedLines.length > 0
                  ? f(t.quotation.itemCount, { count: pricedLines.length })
                  : t.quotation.emptyTotal}
              </p>
              <Button
                type="button"
                onClick={() => setFlowerSheetOpen(false)}
                className="shrink-0"
              >
                {locale === "si" ? "සිදු කරන්න" : "Done"}
              </Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>

      {/* Mobile sticky bottom bar (hidden on lg+) */}
      <div className="quotation-screen-only fixed bottom-0 inset-x-0 z-40 lg:hidden border-t border-border bg-background/95 shadow-lg backdrop-blur-sm">
        <div className="flex items-center gap-2 px-4 py-3">
          <div className="min-w-0 flex-1">
            <p className="text-[11px] text-muted-foreground leading-none">
              {f(t.quotation.itemCount, { count: pricedLines.length })}
            </p>
            <p className="mt-0.5 font-display text-xl tabular-nums leading-none">
              {formatQuotationRupees(total)}
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setFlowerSheetOpen(true)}
            className="shrink-0"
          >
            <Flower2 className="size-3.5" aria-hidden="true" />
            {locale === "si" ? "මල්" : "Flowers"}
          </Button>
          {pricedLines.length > 0 ? (
            <Button
              asChild
              size="sm"
              className="shrink-0 bg-[#25D366] text-white hover:bg-[#1fb457]"
            >
              <a href={whatsappUrl} target="_blank" rel="noopener noreferrer">
                <Send className="size-3.5" aria-hidden="true" />
                {locale === "si" ? "යවන්න" : "Send"}
              </a>
            </Button>
          ) : (
            <Button size="sm" disabled className="shrink-0">
              <Send className="size-3.5" aria-hidden="true" />
              {locale === "si" ? "යවන්න" : "Send"}
            </Button>
          )}
        </div>
      </div>

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
      <section className="quotation-screen-only border-t border-border bg-muted/30 px-4 py-10">
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
      className="rounded-xl border border-border bg-card p-3"
    >
      {/* Mobile layout (< lg) */}
      <div className="lg:hidden space-y-2">
        {/* Row 1: Name + Remove */}
        <div className="flex gap-2">
          <Input
            id={`${prefix}-name`}
            value={line.name}
            onChange={(e) => onPatch({ name: e.target.value })}
            placeholder={t.quotation.flowerNamePlaceholder}
            aria-label={t.quotation.flowerName}
            className="flex-1 min-w-0"
          />
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={onRemove}
            aria-label={t.quotation.removeLine}
            className="quotation-screen-only shrink-0 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
          >
            <X className="size-4" aria-hidden="true" />
          </Button>
        </div>
        {/* Row 2: Qty + Unit + Price */}
        <div className="grid grid-cols-3 gap-2">
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
            aria-label={t.quotation.quantity}
            className="text-center"
          />
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
            aria-label={t.quotation.unitPrice}
          />
        </div>
        {/* Row 3: Line total */}
        <div className="flex items-center justify-between border-t border-border pt-2 text-xs">
          {line.productSlug ? (
            <Link
              to="/$locale/products/$slug"
              params={{ locale, slug: line.productSlug }}
              className="quotation-screen-only font-medium text-brand hover:underline"
            >
              {t.quotation.listedItem}
            </Link>
          ) : (
            <span className="text-muted-foreground">{t.quotation.addCustom}</span>
          )}
          <p className="text-sm font-semibold tabular-nums">
            {formatQuotationRupees(quotationLineTotal(line))}
          </p>
        </div>
      </div>

      {/* Desktop layout (lg+) */}
      <div className="hidden lg:grid lg:gap-4 lg:grid-cols-[auto_minmax(160px,2fr)_1fr_1fr_1.25fr_auto]">
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

        <QuoteField label={t.quotation.flowerName} htmlFor={`${prefix}-name-lg`}>
          <Input
            id={`${prefix}-name-lg`}
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

        <QuoteField label={t.quotation.quantity} htmlFor={`${prefix}-qty-lg`}>
          <Input
            id={`${prefix}-qty-lg`}
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

        <QuoteField label={t.quotation.unitPrice} htmlFor={`${prefix}-price-lg`}>
          <Input
            id={`${prefix}-price-lg`}
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

      {/* Desktop footer: listed item link + line total */}
      <div className="hidden lg:flex mt-3 items-center justify-between gap-2 border-t border-border pt-3">
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
