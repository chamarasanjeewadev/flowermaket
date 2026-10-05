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
    <ul className="grid gap-4 sm:grid-cols-3">
      {SELLER_TYPES.map((type) => {
        const { Icon, tile } = SELLER_TYPE_STYLE[type];
        return (
          <li key={type}>
            <Link
              to="/$locale/shops"
              params={{ locale }}
              search={{ type }}
              className={cn(
                "group relative flex h-full min-h-44 flex-col justify-between overflow-hidden rounded-xl p-6 transition-transform hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                tile,
              )}
            >
              <Icon
                className="absolute -right-4 -top-4 size-32 text-foreground/[0.07]"
                aria-hidden="true"
              />
              <span className="flex size-11 items-center justify-center rounded-full bg-background/80">
                <Icon className="size-5" aria-hidden="true" />
              </span>
              <span className="mt-6 block">
                <span className="flex items-center justify-between gap-2">
                  <span className="font-display text-2xl">
                    {t.catalog.sellerTypesPlural[type]}
                  </span>
                  <ArrowUpRight
                    className="size-5 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5"
                    aria-hidden="true"
                  />
                </span>
                <span className="mt-1 block min-h-10 text-sm text-foreground/75">
                  {t.catalog.sellerTypeBlurb[type]}
                </span>
                <span className="mt-3 block text-xs font-semibold uppercase tracking-wide text-foreground/60">
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
