import * as React from "react";
import { Link } from "@tanstack/react-router";
import { Send, Sparkles } from "lucide-react";
import {
  buildEnquiryText,
  buildWhatsappUrl,
  pendingBasketAdditions,
  WHATSAPP_NUMBER,
  type EnquiryItem,
} from "@flowers/integrations";
import { Button } from "@flowers/ui/components/button";
import { Checkbox } from "@flowers/ui/components/checkbox";
import { type Locale } from "../../i18n";
import { useT } from "../../i18n/react";
import { siteUrl } from "../../lib/site";
import { useEnquiry } from "../../lib/enquiry";
import { generateBouquetImage } from "../../server/bouquet";
import type { ProductListItemDTO } from "../../server/catalog";
import { FlowerPicker } from "./FlowerPicker";
import { BouquetPreview, type PreviewStatus } from "./BouquetPreview";

type RateLimitReason = "anon_limit" | "user_limit" | "cooloff" | null;

export default function BouquetDesigner({ flowers }: { flowers: ProductListItemDTO[] }) {
  const { t, f, locale } = useT();
  const { add, has } = useEnquiry();
  const [quantities, setQuantities] = React.useState<Record<string, number>>({});
  const [status, setStatus] = React.useState<PreviewStatus>("idle");
  const [dataUrl, setDataUrl] = React.useState<string | null>(null);
  const [imageUrl, setImageUrl] = React.useState<string | null>(null);
  const [rateLimitReason, setRateLimitReason] = React.useState<RateLimitReason>(null);
  const [heldByModel, setHeldByModel] = React.useState(false);

  const byId = React.useMemo(() => new Map(flowers.map((fl) => [fl.id, fl])), [flowers]);

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
    setRateLimitReason(null);
    try {
      const result = await generateBouquetImage({
        data: {
          items: selection.map((i) => ({ nameEn: i.nameEn, qty: i.qty })),
          heldByModel,
        },
      });
      if (result.ok) {
        setDataUrl(result.dataUrl);
        setImageUrl(result.imageUrl);
        setStatus("ready");
      } else if (result.reason === "rate_limited") {
        setDataUrl(null);
        setImageUrl(null);
        setRateLimitReason(result.limitKind);
        setStatus("rate_limited");
      } else {
        setDataUrl(null);
        setImageUrl(null);
        setStatus(result.reason === "unconfigured" ? "unconfigured" : "error");
      }
    } catch {
      setDataUrl(null);
      setImageUrl(null);
      setStatus("error");
    }
  }

  const rateLimitMessage =
    rateLimitReason === "user_limit"
      ? t.design.rateLimitUser
      : rateLimitReason === "cooloff"
        ? t.design.rateLimitCooloff
        : t.design.rateLimitAnon;

  const waHref = buildWhatsappUrl(
    buildEnquiryText({
      items: selection,
      locale,
      siteUrl: siteUrl(),
      designNote: status === "ready" ? "AI bouquet design attached" : undefined,
      designImageUrl: imageUrl ?? undefined,
    }),
    WHATSAPP_NUMBER,
  );

  function onSendWhatsapp() {
    for (const item of pendingBasketAdditions(selection, has)) {
      const { qty, ...draft } = item;
      add({ ...draft, qty });
    }
  }

  // After a successful generation, fetch the session to know if user is anon
  // so we can show the sign-in nudge. We derive this from whether the server
  // returned an imageUrl (storage only works when Supabase is configured).
  const showSignInNudge = status === "rate_limited" && rateLimitReason === "anon_limit";
  const showMoreDesignsWa = status === "rate_limited" && rateLimitReason === "user_limit";

  const moreDesignsWaHref = buildWhatsappUrl(
    "Hi, I've reached my daily bouquet design limit on FlowerMarket.lk. Can I get more designs?",
    WHATSAPP_NUMBER,
  );

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
        <BouquetPreview
          status={status}
          dataUrl={dataUrl}
          rateLimitMessage={rateLimitMessage}
        />
        <p className="mt-3 text-sm text-muted-foreground">
          {f(t.design.selectedSummary, { flowers: selection.length, stems })}
        </p>
        <p className="mt-2 text-xs italic text-muted-foreground">
          {t.design.aiDisclaimer}
        </p>
        <label className="mt-4 flex cursor-pointer items-start gap-2.5">
          <Checkbox
            checked={heldByModel}
            onCheckedChange={(v) => setHeldByModel(v === true)}
            disabled={status === "loading"}
            className="mt-0.5"
          />
          <span className="text-sm">
            {t.design.heldByModel}
            <span className="block text-xs text-muted-foreground">{t.design.heldByModelHint}</span>
          </span>
        </label>
        <div className="mt-4 flex flex-col gap-2">
          <Button
            onClick={() => void onGenerate()}
            disabled={empty || status === "loading" || status === "rate_limited"}
            size="lg"
          >
            <Sparkles className="size-4" aria-hidden="true" />
            {status === "loading"
              ? t.design.generating
              : status === "ready"
                ? t.design.regenerate
                : t.design.generate}
          </Button>

          {showSignInNudge && (
            <Button asChild variant="outline" size="sm">
              <Link to="/$locale/login" params={{ locale }}>{t.design.signInToGenerate}</Link>
            </Button>
          )}

          {showMoreDesignsWa && (
            <Button asChild size="sm" className="bg-[#25D366] text-white hover:bg-[#1fb457]">
              <a href={moreDesignsWaHref} target="_blank" rel="noopener noreferrer">
                <Send className="size-4" aria-hidden="true" />
                Want more designs? Message us
              </a>
            </Button>
          )}

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
