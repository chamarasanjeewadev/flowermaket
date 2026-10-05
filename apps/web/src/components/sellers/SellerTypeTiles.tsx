import { Link } from "@tanstack/react-router";
import { SELLER_TYPES, type SellerType } from "@flowers/api/constants";
import { cn } from "@flowers/ui/lib/utils";
import { ArrowUpRight } from "lucide-react";
import { useT } from "../../i18n/react";
import { SELLER_TYPE_STYLE } from "./SellerTypeBadges";

/** Three entry tiles: Florists / Suppliers / Farmers → filtered directory. */
export function SellerTypeTiles({
  counts,
}: {
  counts: Record<SellerType, number>;
}) {
  const { t, f, locale } = useT();
  return (
    <ul className="grid gap-3 sm:grid-cols-3 sm:gap-4">
      {SELLER_TYPES.map((type) => {
        const { Icon, tile } = SELLER_TYPE_STYLE[type];
        return (
          <li key={type}>
            <Link
              to="/$locale/shops"
              params={{ locale }}
              search={{ type }}
              className={cn(
                "group relative flex h-full items-center gap-4 overflow-hidden rounded-xl p-4 transition-transform sm:min-h-44 sm:flex-col sm:items-stretch sm:justify-between sm:gap-0 sm:p-6 hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                tile,
              )}
            >
              <Icon
                className="absolute -right-4 -top-4 hidden size-32 text-foreground/[0.07] sm:block"
                aria-hidden="true"
              />
              <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-background/80">
                <Icon className="size-5" aria-hidden="true" />
              </span>
              <span className="block min-w-0 flex-1 sm:mt-6 sm:flex-none">
                <span className="flex items-center justify-between gap-2">
                  <span className="font-display text-xl sm:text-2xl">
                    {t.catalog.sellerTypesPlural[type]}
                  </span>
                  <ArrowUpRight
                    className="size-5 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5"
                    aria-hidden="true"
                  />
                </span>
                <span className="mt-1 hidden min-h-10 text-sm text-foreground/75 sm:block">
                  {t.catalog.sellerTypeBlurb[type]}
                </span>
                <span className="mt-0.5 block text-xs font-semibold sm:mt-3 uppercase tracking-wide text-foreground/60">
                  {counts[type] === 1
                    ? t.home.sellerCountOne
                    : f(t.home.sellerCount, { count: counts[type] })}
                </span>
              </span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
