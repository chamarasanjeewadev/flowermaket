import { Link } from "@tanstack/react-router";
import { SELLER_TYPES, type SellerType } from "@flowers/api/constants";
import { cn } from "@flowers/ui/lib/utils";
import { ChevronRight } from "lucide-react";
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
              className="group flex h-full items-center gap-4 rounded-2xl bg-card p-4 transition-colors hover:bg-card/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:flex-col sm:items-start sm:gap-0 sm:p-6"
            >
              <span
                className={cn(
                  "flex size-11 shrink-0 items-center justify-center rounded-full",
                  tile,
                )}
              >
                <Icon className="size-5" aria-hidden="true" />
              </span>
              <span className="block min-w-0 flex-1 sm:mt-5 sm:flex-none">
                <span className="flex items-center gap-1">
                  <span className="text-[17px] font-semibold tracking-[-0.015em]">
                    {t.catalog.sellerTypesPlural[type]}
                  </span>
                  <ChevronRight
                    className="size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5"
                    aria-hidden="true"
                  />
                </span>
                <span className="mt-1 hidden text-[15px] leading-relaxed text-muted-foreground sm:block">
                  {t.catalog.sellerTypeBlurb[type]}
                </span>
                <span className="mt-0.5 block text-[13px] text-muted-foreground sm:mt-3">
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
