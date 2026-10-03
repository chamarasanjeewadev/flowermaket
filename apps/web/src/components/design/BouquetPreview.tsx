import { Download } from "lucide-react";
import { Button } from "@flowers/ui/components/button";
import { useT } from "../../i18n/react";

export type PreviewStatus = "idle" | "loading" | "ready" | "error" | "unconfigured" | "rate_limited";

export interface PreviewProps {
  status: PreviewStatus;
  dataUrl: string | null;
  rateLimitMessage?: string;
}

export function BouquetPreview({ status, dataUrl, rateLimitMessage }: PreviewProps) {
  const { t } = useT();
  return (
    <div className="flex flex-col gap-3">
      <div className="flex aspect-square w-full items-center justify-center overflow-hidden rounded-lg border border-border bg-muted/40">
        {status === "ready" && dataUrl ? (
          <img src={dataUrl} alt={t.design.previewAlt} className="h-full w-full object-cover" />
        ) : status === "loading" ? (
          <span className="animate-pulse text-sm text-muted-foreground">
            {t.design.generating}
          </span>
        ) : status === "error" ? (
          <span className="px-6 text-center text-sm text-destructive">{t.design.genError}</span>
        ) : status === "unconfigured" ? (
          <span className="px-6 text-center text-sm text-muted-foreground">
            {t.design.genUnavailable}
          </span>
        ) : status === "rate_limited" ? (
          <span className="px-6 text-center text-sm text-muted-foreground">
            {rateLimitMessage ?? t.design.rateLimitAnon}
          </span>
        ) : (
          <span className="px-6 text-center text-sm text-muted-foreground">
            {t.design.previewPlaceholder}
          </span>
        )}
      </div>
      {status === "ready" && dataUrl && (
        <Button asChild variant="outline" size="sm">
          <a href={dataUrl} download="flowermarket-bouquet.png">
            <Download className="size-4" aria-hidden="true" />
            {t.design.download}
          </a>
        </Button>
      )}
    </div>
  );
}
