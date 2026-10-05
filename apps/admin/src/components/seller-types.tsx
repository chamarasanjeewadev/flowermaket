import { SELLER_TYPES, type SellerType } from "@flowers/api/constants";
import { cn } from "@flowers/ui/lib/utils";
import { Flower2, Sprout, Truck, type LucideIcon } from "lucide-react";

export const SELLER_TYPE_META: Record<
  SellerType,
  { label: string; hint: string; Icon: LucideIcon; chip: string }
> = {
  florist: {
    label: "Florist",
    hint: "Arranges & sells bouquets",
    Icon: Flower2,
    chip: "bg-blush/70 text-foreground",
  },
  supplier: {
    label: "Supplier",
    hint: "Wholesaler / middleman, sells in bulk",
    Icon: Truck,
    chip: "bg-butter/70 text-foreground",
  },
  farmer: {
    label: "Farmer",
    hint: "Grows the flowers",
    Icon: Sprout,
    chip: "bg-sage text-sage-deep",
  },
};

export function SellerTypeChips({ types }: { types: readonly SellerType[] }) {
  return (
    <span className="inline-flex flex-wrap gap-1">
      {SELLER_TYPES.filter((x) => types.includes(x)).map((type) => {
        const { label, Icon, chip } = SELLER_TYPE_META[type];
        return (
          <span
            key={type}
            className={cn(
              "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium",
              chip,
            )}
          >
            <Icon className="size-3" aria-hidden="true" />
            {label}
          </span>
        );
      })}
    </span>
  );
}

/** Multi-select seller types (checkbox cards). */
export function SellerTypeCheckboxes({
  value,
  onChange,
  disabled,
}: {
  value: readonly SellerType[];
  onChange: (next: SellerType[]) => void;
  disabled?: boolean;
}) {
  function toggle(type: SellerType) {
    const next = value.includes(type)
      ? value.filter((x) => x !== type)
      : [...value, type];
    onChange(SELLER_TYPES.filter((x) => next.includes(x)));
  }
  return (
    <div className="grid gap-2 sm:grid-cols-3">
      {SELLER_TYPES.map((type) => {
        const { label, hint, Icon } = SELLER_TYPE_META[type];
        const checked = value.includes(type);
        return (
          <label
            key={type}
            className={cn(
              "flex cursor-pointer items-start gap-2 rounded-lg border p-3 text-sm transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring",
              checked ? "border-brand bg-brand/5" : "border-input hover:border-foreground/30",
              disabled && "cursor-not-allowed opacity-60",
            )}
          >
            <input
              type="checkbox"
              className="mt-0.5"
              checked={checked}
              disabled={disabled}
              onChange={() => toggle(type)}
            />
            <span className="flex flex-col">
              <span className="inline-flex items-center gap-1.5 font-medium">
                <Icon className="size-4" aria-hidden="true" />
                {label}
              </span>
              <span className="text-xs text-muted-foreground">{hint}</span>
            </span>
          </label>
        );
      })}
    </div>
  );
}
