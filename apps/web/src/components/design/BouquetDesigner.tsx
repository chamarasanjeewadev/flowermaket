import * as React from "react";
import { Send, Sparkles } from "lucide-react";
import {
  buildEnquiryText,
  buildWhatsappUrl,
  pendingBasketAdditions,
  WHATSAPP_NUMBER,
  type EnquiryItem,
} from "@flowers/integrations";
import { Button } from "@flowers/ui/components/button";
import { type Locale } from "../../i18n";
import { useT } from "../../i18n/react";
import { siteUrl } from "../../lib/site";
import { useEnquiry } from "../../lib/enquiry";
import { generateBouquetImage } from "../../server/bouquet";
import type { ProductListItemDTO } from "../../server/catalog";
import { FlowerPicker } from "./FlowerPicker";
import { BouquetPreview, type PreviewStatus } from "./BouquetPreview";

export default function BouquetDesigner({ flowers }: { flowers: ProductListItemDTO[] }) {
  const { t, f, locale } = useT();
  const { add, has } = useEnquiry();
  const [quantities, setQuantities] = React.useState<Record<string, number>>({});
  const [status, setStatus] = React.useState<PreviewStatus>("idle");
  const [dataUrl, setDataUrl] = React.useState<string | null>(null);

  const byId = React.useMemo(() => new Map(flowers.map((fl) => [fl.id, fl])), [flowers]);

  // Selection = flowers with qty >= 1, shaped as EnquiryItem for the basket.
  const selection = React.useMemo<EnquiryItem[]>(() => {
    const out: EnquiryItem[] = [];
    for (const [id, qty] of Object.entries(quantities)) {
      const fl = byId.get(id);
      if (!fl || qty < 1) continue;
      out.push({
        id: fl.id,
        slug: fl.slug,
        nameEn: fl.nameEn,
        nameSi: fl.nameSi,
        price: fl.price,
        listingType: fl.listingType,
        qty,
      });
    }
    return out;
  }, [quantities, byId]);

  const stems = selection.reduce((n, i) => n + i.qty, 0);
  const empty = selection.length === 0;

  function onChange(id: string, qty: number) {
    setQuantities((prev) => ({ ...prev, [id]: qty }));
  }

  async function onGenerate() {
    if (empty || status === "loading") return;
    setStatus("loading");
    const result = await generateBouquetImage({
      data: { items: selection.map((i) => ({ nameEn: i.nameEn, qty: i.qty })) },
    });
    if (result.ok) {
      setDataUrl(result.dataUrl);
      setStatus("ready");
    } else {
      setDataUrl(null);
      setStatus(result.reason === "unconfigured" ? "unconfigured" : "error");
    }
  }

  const waHref = buildWhatsappUrl(
    buildEnquiryText({
      items: selection,
      locale,
      siteUrl: siteUrl(),
      designNote: status === "ready" ? "AI bouquet design (image attached)" : undefined,
    }),
    WHATSAPP_NUMBER,
  );

  function onSendWhatsapp() {
    // Only add items not already in the basket, so repeat clicks don't
    // accumulate quantities (matches AddToEnquiryButton's has() guard).
    for (const item of pendingBasketAdditions(selection, has)) {
      const { qty, ...draft } = item;
      add({ ...draft, qty });
    }
  }

  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_380px]">
      <section>
        <h2 className="font-display text-2xl">{t.design.pickHeading}</h2>
        <div className="mt-4">
          <FlowerPicker
            flowers={flowers}
            quantities={quantities}
            onChange={onChange}
            locale={locale as Locale}
          />
        </div>
      </section>

      <aside className="lg:sticky lg:top-6 lg:self-start">
        <BouquetPreview status={status} dataUrl={dataUrl} />
        <p className="mt-3 text-sm text-muted-foreground">
          {f(t.design.selectedSummary, { flowers: selection.length, stems })}
        </p>
        <div className="mt-4 flex flex-col gap-2">
          <Button onClick={onGenerate} disabled={empty || status === "loading"} size="lg">
            <Sparkles className="size-4" aria-hidden="true" />
            {status === "loading"
              ? t.design.generating
              : status === "ready"
                ? t.design.regenerate
                : t.design.generate}
          </Button>
          {empty ? (
            <Button
              size="lg"
              disabled
              className="bg-[#25D366] text-white hover:bg-[#1fb457]"
            >
              <Send className="size-4" aria-hidden="true" />
              {t.design.sendWhatsapp}
            </Button>
          ) : (
            <Button asChild size="lg" className="bg-[#25D366] text-white hover:bg-[#1fb457]">
              <a
                href={waHref}
                target="_blank"
                rel="noopener noreferrer"
                onClick={onSendWhatsapp}
              >
                <Send className="size-4" aria-hidden="true" />
                {t.design.sendWhatsapp}
              </a>
            </Button>
          )}
        </div>
      </aside>
    </div>
  );
}
