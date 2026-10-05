import { SELLER_TYPES, type SellerType } from "@flowers/api/constants";
import { cn } from "@flowers/ui/lib/utils";
import { Check, Flower2, Sprout, Truck, type LucideIcon } from "lucide-react";
import { useT } from "../i18n/react";

const ICONS: Record<SellerType, LucideIcon> = {
  florist: Flower2,
  supplier: Truck,
  farmer: Sprout,
};

/** Multi-select seller types as checkbox cards (at least one is enforced by
 * the caller's validator). */
export function SellerTypePicker({
  value,
  onChange,
  onBlur,
  id,
}: {
  value: readonly SellerType[];
  onChange: (next: SellerType[]) => void;
  onBlur?: () => void;
  id?: string;
}) {
  const { t } = useT();

  function toggle(type: SellerType) {
    const next = value.includes(type)
      ? value.filter((x) => x !== type)
      : [...value, type];
    onChange(SELLER_TYPES.filter((x) => next.includes(x)));
  }

  return (
    <div id={id} className="grid gap-2 sm:grid-cols-3" onBlur={onBlur}>
      {SELLER_TYPES.map((type) => {
        const Icon = ICONS[type];
        const checked = value.includes(type);
        return (
          <label
            key={type}
            className={cn(
              "relative flex cursor-pointer flex-col gap-1.5 rounded-lg border p-3 text-left transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring",
              checked
                ? "border-brand bg-brand/5"
                : "border-input hover:border-foreground/30",
            )}
          >
            <input
              type="checkbox"
              className="sr-only"
              checked={checked}
              onChange={() => toggle(type)}
            />
            <span className="flex items-center justify-between">
              <Icon className="size-5 text-foreground/80" aria-hidden="true" />
              <span
                className={cn(
                  "flex size-4 items-center justify-center rounded-sm border",
                  checked ? "border-brand bg-brand text-brand-foreground" : "border-input",
                )}
                aria-hidden="true"
              >
                {checked && <Check className="size-3" />}
              </span>
            </span>
            <span className="text-sm font-medium">{t.sellerTypes[type]}</span>
            <span className="text-xs leading-snug text-muted-foreground">
              {t.sellerTypes[`${type}Hint`]}
            </span>
          </label>
        );
      })}
    </div>
  );
}
