import { Link } from "@tanstack/react-router";
import type { FlowerVariantRow } from "@flowers/api/flowers";
import { variantDisplayName } from "@flowers/api/flowers";
import type { Locale } from "../../i18n";

interface FlowerShowcaseProps {
  flowers: FlowerVariantRow[];
  locale: Locale;
  ctaLabel?: string;
  /** Render the CTA as a button with click handler. */
  onEnquire?: (flower: FlowerVariantRow) => void;
  /** Render the CTA as a link. Takes precedence over onEnquire. */
  getHref?: (flower: FlowerVariantRow) => string;
}

export function FlowerShowcase({
  flowers,
  locale,
  ctaLabel = "Enquire",
  onEnquire,
  getHref,
}: FlowerShowcaseProps) {
  return (
    <ul className="grid grid-cols-2 gap-x-6 gap-y-12 sm:grid-cols-3 lg:grid-cols-4">
      {flowers.map((flower) => {
        const name = variantDisplayName(flower, locale);
        const href = getHref?.(flower);
        return (
          <li key={flower.id} className="flex flex-col">
            <div className="flex aspect-square items-center justify-center overflow-hidden">
              <img
                src={flower.imageUrl ?? "/placeholder-flower.svg"}
                alt={name}
                loading="lazy"
                decoding="async"
                className="h-full w-full object-contain transition-transform duration-500 hover:scale-105"
                onError={(e) => {
                  (e.currentTarget as HTMLImageElement).src =
                    "/placeholder-flower.svg";
                }}
              />
            </div>
            <h3 className="mt-5 font-display text-xl leading-snug">{name}</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Fresh bouquet arrangement
            </p>
            {href ? (
              <Link
                to={href}
                className="mt-3 w-fit text-sm font-semibold text-brand hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {ctaLabel} &rarr;
              </Link>
            ) : onEnquire ? (
              <button
                type="button"
                onClick={() => onEnquire(flower)}
                className="mt-3 w-fit text-sm font-semibold text-brand hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {ctaLabel} &rarr;
              </button>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}
