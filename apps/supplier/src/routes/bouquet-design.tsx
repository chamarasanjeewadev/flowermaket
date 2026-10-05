import * as React from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Sparkles } from "lucide-react";
import { Button } from "@flowers/ui/components/button";
import { BOUQUET_MODELS, type BouquetModelChoice } from "@flowers/integrations";
import { useT } from "../i18n/react";
import {
  generateBouquetImageSupplier,
  listDesignerFlowersSupplier,
  type DesignerFlowerDTO,
} from "../server/bouquet";

const MODEL_OPTIONS: ReadonlyArray<{ id: BouquetModelChoice; labelEn: string; labelSi: string }> = [
  { id: "none", labelEn: "No model", labelSi: "" },
  { id: "random", labelEn: "Surprise me", labelSi: "" },
  ...BOUQUET_MODELS,
];

export const Route = createFileRoute("/bouquet-design")({
  loader: async () => {
    const flowers = await listDesignerFlowersSupplier();
    return { flowers };
  },
  head: () => ({
    meta: [{ title: "Bouquet Designer — Supplier Portal | FlowerMarket.lk" }],
  }),
  component: BouquetDesignPage,
});

function BouquetDesignPage() {
  const { flowers } = Route.useLoaderData();
  const { t } = useT();
  const [quantities, setQuantities] = React.useState<Record<string, number>>({});
  const [genStatus, setGenStatus] = React.useState<
    "idle" | "loading" | "ready" | "error" | "rate_limited"
  >("idle");
  const [dataUrl, setDataUrl] = React.useState<string | null>(null);
  const [imageUrl, setImageUrl] = React.useState<string | null>(null);
  const [message, setMessage] = React.useState<string | null>(null);
  const [model, setModel] = React.useState<BouquetModelChoice>("none");

  const selection = Object.entries(quantities)
    .filter(([, qty]) => qty > 0)
    .map(([id, qty]) => {
      const fl = flowers.find((f) => f.id === id) as DesignerFlowerDTO;
      return { nameEn: fl.nameEn, qty };
    });

  const empty = selection.length === 0;

  function change(id: string, delta: number) {
    setQuantities((prev) => {
      const val = (prev[id] ?? 0) + delta;
      if (val <= 0) {
        const { [id]: _, ...rest } = prev;
        return rest;
      }
      return { ...prev, [id]: val };
    });
  }

  async function generate() {
    if (empty || genStatus === "loading") return;
    setGenStatus("loading");
    setMessage(null);
    try {
      const result = await generateBouquetImageSupplier({ data: { items: selection, model } });
      if (result.ok) {
        setDataUrl(result.dataUrl);
        setImageUrl(result.imageUrl);
        setGenStatus("ready");
      } else if (result.reason === "rate_limited") {
        if (result.limitKind === "user_limit") {
          setMessage("Daily limit reached. You can generate 3 bouquets per day.");
        } else {
          const resetTime = result.resetAt
            ? ` Try after ${new Date(result.resetAt).toLocaleTimeString()}.`
            : "";
          setMessage(`Please wait before generating again.${resetTime}`);
        }
        setGenStatus("rate_limited");
      } else if (result.reason === "unauthorized") {
        setMessage("Not authorized.");
        setGenStatus("error");
      } else {
        setMessage(
          result.reason === "unconfigured"
            ? "AI not configured — GEMINI_API_KEY is missing."
            : "Generation failed. Please try again.",
        );
        setGenStatus("error");
      }
    } catch {
      setMessage("Generation failed. Please try again.");
      setGenStatus("error");
    }
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="font-display text-3xl">{t.nav.designBouquet}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Pick flowers and generate an AI bouquet preview. Up to 3 designs per day.
        </p>
      </div>

      <div className="grid gap-8 lg:grid-cols-[1fr_360px]">
        <section>
          <h2 className="mb-4 text-base font-semibold">Select flowers</h2>
          {flowers.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t.common.loading}</p>
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
              {flowers.map((fl) => {
                const qty = quantities[fl.id] ?? 0;
                return (
                  <div
                    key={fl.id}
                    className="flex flex-col rounded-lg border border-border bg-card p-3"
                  >
                    {fl.imageUrl ? (
                      <img
                        src={fl.imageUrl}
                        alt={fl.nameEn}
                        className="mb-2 h-20 w-full rounded object-cover"
                      />
                    ) : (
                      <div className="mb-2 h-20 w-full rounded bg-muted" />
                    )}
                    <p className="truncate text-xs font-medium">{fl.nameEn}</p>
                    <div className="mt-2 flex items-center justify-between gap-1">
                      <Button
                        variant="outline"
                        size="icon"
                        className="h-7 w-7 shrink-0 text-base"
                        onClick={() => change(fl.id, -1)}
                        disabled={qty === 0}
                        aria-label={`Remove ${fl.nameEn}`}
                      >
                        −
                      </Button>
                      <span className="w-6 text-center text-sm tabular-nums">{qty}</span>
                      <Button
                        variant="outline"
                        size="icon"
                        className="h-7 w-7 shrink-0 text-base"
                        onClick={() => change(fl.id, 1)}
                        aria-label={`Add ${fl.nameEn}`}
                      >
                        +
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        <aside className="lg:sticky lg:top-6 lg:self-start">
          <div className="overflow-hidden rounded-xl border border-border bg-card">
            {genStatus === "ready" && dataUrl ? (
              <img src={dataUrl} alt="AI-generated bouquet" className="w-full" />
            ) : (
              <div className="flex aspect-square items-center justify-center bg-muted text-sm text-muted-foreground">
                {genStatus === "loading" ? "Generating…" : "Preview will appear here"}
              </div>
            )}
          </div>

          {message && (
            <p className="mt-3 text-sm text-destructive">{message}</p>
          )}

          <fieldset className="mt-4" disabled={genStatus === "loading"}>
            <legend className="text-sm font-medium">Held by a model</legend>
            <p className="text-xs text-muted-foreground">Choose a look for the model holding the bouquet.</p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {MODEL_OPTIONS.map((opt) => (
                <Button
                  key={opt.id}
                  type="button"
                  size="sm"
                  variant={model === opt.id ? "default" : "outline"}
                  aria-pressed={model === opt.id}
                  onClick={() => setModel(opt.id)}
                  className="h-8 rounded-full px-3 text-xs"
                >
                  {opt.id === "none" ? "No model" : opt.id === "random" ? "Surprise me" : opt.labelEn}
                </Button>
              ))}
            </div>
          </fieldset>

          <div className="mt-4 flex flex-col gap-2">
            <Button
              onClick={() => void generate()}
              disabled={empty || genStatus === "loading" || genStatus === "rate_limited"}
              size="lg"
            >
              <Sparkles className="size-4" aria-hidden="true" />
              {genStatus === "loading"
                ? "Generating…"
                : genStatus === "ready"
                  ? "Regenerate"
                  : "Generate bouquet"}
            </Button>

            {genStatus === "ready" && imageUrl && (
              <Button asChild variant="outline" size="sm">
                <a href={imageUrl} target="_blank" rel="noopener noreferrer">
                  View full image
                </a>
              </Button>
            )}
          </div>

          {selection.length > 0 && (
            <p className="mt-3 text-xs text-muted-foreground">
              {selection.map((s) => `${s.qty}× ${s.nameEn}`).join(", ")}
            </p>
          )}
        </aside>
      </div>
    </div>
  );
}
