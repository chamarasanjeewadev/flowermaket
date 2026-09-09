import * as React from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  buildEnquiryText,
  buildWhatsappUrl,
  WHATSAPP_NUMBER,
  type EnquiryForm,
} from "@flowers/integrations";
import { Button } from "@flowers/ui/components/button";
import { Input } from "@flowers/ui/components/input";
import { Label } from "@flowers/ui/components/label";
import { Textarea } from "@flowers/ui/components/textarea";
import { Minus, Plus, Send, Trash2 } from "lucide-react";
import { localizedName, type Locale } from "../../i18n";
import { useT } from "../../i18n/react";
import { hreflangLinks } from "../../lib/site";
import { siteUrl } from "../../lib/site";
import { useEnquiry } from "../../lib/enquiry";

export const Route = createFileRoute("/$locale/enquiry")({
  head: ({ params }) => {
    const locale = params.locale as Locale;
    return {
      meta: [
        {
          title:
            locale === "si"
              ? "ඔබේ මල් විමසුම | FlowerMarket.lk"
              : "Your flower enquiry | FlowerMarket.lk",
        },
        // Utility page — keep it out of the index.
        { name: "robots", content: "noindex" },
      ],
      links: hreflangLinks("/enquiry", locale),
    };
  },
  component: EnquiryPage,
});

function formatRupees(cents: number): string {
  const rupees = Math.round(cents / 100);
  return `Rs ${rupees.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",")}`;
}

function EnquiryPage() {
  const { t, locale } = useT();
  const { items, hydrated, setQty, remove, clear } = useEnquiry();
  const [form, setForm] = React.useState<EnquiryForm>({});

  function patch(key: keyof EnquiryForm, value: string) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  const waHref = buildWhatsappUrl(
    buildEnquiryText({ items, form, locale, siteUrl: siteUrl() }),
    WHATSAPP_NUMBER,
  );

  if (!hydrated) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-16 text-center text-muted-foreground">
        {t.enquiry.loading}
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-16 text-center">
        <h1 className="font-display text-3xl sm:text-4xl">{t.enquiry.title}</h1>
        <p className="mx-auto mt-3 max-w-md text-muted-foreground">
          {t.enquiry.emptyBody}
        </p>
        <Link
          to="/$locale/products"
          params={{ locale }}
          className="mt-6 inline-flex items-center justify-center rounded-full bg-foreground px-6 py-2.5 text-sm font-medium text-background transition-opacity hover:opacity-90"
        >
          {t.enquiry.browseCta}
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <header className="mb-6">
        <h1 className="font-display text-4xl sm:text-5xl">{t.enquiry.title}</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {t.enquiry.subtitle}
        </p>
      </header>

      {/* Items */}
      <ul className="flex flex-col divide-y divide-border rounded-lg border border-border">
        {items.map((item) => (
          <li key={item.id} className="flex items-center gap-3 p-4">
            <div className="min-w-0 flex-1">
              <Link
                to="/$locale/products/$slug"
                params={{ locale, slug: item.slug }}
                className="line-clamp-1 font-medium text-foreground hover:text-brand"
              >
                {localizedName(item, locale)}
              </Link>
              <p className="mt-0.5 text-sm text-muted-foreground">
                {item.listingType === "wholesale"
                  ? t.catalog.wholesaleBadge
                  : t.catalog.retailBadge}{" "}
                · {formatRupees(item.price)}
              </p>
            </div>

            {/* Qty stepper */}
            <div className="flex items-center gap-1">
              <button
                type="button"
                aria-label={t.enquiry.decrease}
                onClick={() => setQty(item.id, item.qty - 1)}
                className="flex size-8 items-center justify-center rounded-full border border-border text-foreground transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <Minus className="size-3.5" aria-hidden="true" />
              </button>
              <span className="w-8 text-center text-sm tabular-nums">
                {item.qty}
              </span>
              <button
                type="button"
                aria-label={t.enquiry.increase}
                onClick={() => setQty(item.id, item.qty + 1)}
                className="flex size-8 items-center justify-center rounded-full border border-border text-foreground transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <Plus className="size-3.5" aria-hidden="true" />
              </button>
            </div>

            <button
              type="button"
              aria-label={t.enquiry.remove}
              onClick={() => remove(item.id)}
              className="flex size-8 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <Trash2 className="size-4" aria-hidden="true" />
            </button>
          </li>
        ))}
      </ul>

      <div className="mt-3 text-right">
        <button
          type="button"
          onClick={clear}
          className="text-sm text-muted-foreground underline underline-offset-2 hover:text-destructive"
        >
          {t.enquiry.clearAll}
        </button>
      </div>

      {/* Requirements */}
      <section className="mt-8">
        <h2 className="font-display text-2xl">{t.enquiry.yourDetails}</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {t.enquiry.yourDetailsHint}
        </p>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="enq-name">{t.enquiry.name}</Label>
            <Input
              id="enq-name"
              value={form.name ?? ""}
              onChange={(e) => patch("name", e.target.value)}
              placeholder={t.enquiry.namePlaceholder}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="enq-date">{t.enquiry.dateNeeded}</Label>
            <Input
              id="enq-date"
              type="date"
              value={form.dateNeeded ?? ""}
              onChange={(e) => patch("dateNeeded", e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1.5 sm:col-span-2">
            <Label htmlFor="enq-area">{t.enquiry.deliveryArea}</Label>
            <Input
              id="enq-area"
              value={form.deliveryArea ?? ""}
              onChange={(e) => patch("deliveryArea", e.target.value)}
              placeholder={t.enquiry.deliveryAreaPlaceholder}
            />
          </div>
          <div className="flex flex-col gap-1.5 sm:col-span-2">
            <Label htmlFor="enq-notes">{t.enquiry.notes}</Label>
            <Textarea
              id="enq-notes"
              rows={3}
              value={form.notes ?? ""}
              onChange={(e) => patch("notes", e.target.value)}
              placeholder={t.enquiry.notesPlaceholder}
            />
          </div>
        </div>
      </section>

      {/* Send */}
      <div className="mt-8 flex flex-col items-stretch gap-2">
        <Button
          asChild
          size="lg"
          className="w-full bg-[#25D366] text-white hover:bg-[#1fb457]"
        >
          <a href={waHref} target="_blank" rel="noopener noreferrer">
            <Send className="size-4" aria-hidden="true" />
            {t.enquiry.sendWhatsapp}
          </a>
        </Button>
        <p className="text-center text-xs text-muted-foreground">
          {t.enquiry.sendHint}
        </p>
      </div>
    </div>
  );
}
