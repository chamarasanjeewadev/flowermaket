import { Minus, Plus } from "lucide-react";
import { localizedName, type Locale } from "../../i18n";
import { useT } from "../../i18n/react";
import type { ProductListItemDTO } from "../../server/catalog";

export interface PickerProps {
  flowers: ProductListItemDTO[];
  /** Current quantity per flower id (0 = not selected). */
  quantities: Record<string, number>;
  onChange: (id: string, qty: number) => void;
  locale: Locale;
}

export function FlowerPicker({ flowers, quantities, onChange, locale }: PickerProps) {
  const { t } = useT();
  if (flowers.length === 0) {
    return <p className="py-12 text-center text-muted-foreground">{t.design.empty}</p>;
  }
  return (
    <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
      {flowers.map((f) => {
        const qty = quantities[f.id] ?? 0;
        return (
          <li key={f.id} className="flex flex-col rounded-lg border border-border p-3">
            {f.imageUrl ? (
              <img
                src={f.imageUrl}
                alt={localizedName(f, locale)}
                className="aspect-square w-full rounded-md object-cover"
                loading="lazy"
              />
            ) : (
              <div className="aspect-square w-full rounded-md bg-muted" />
            )}
            <span className="mt-2 line-clamp-1 text-sm font-medium">
              {localizedName(f, locale)}
            </span>
            <div className="mt-2 flex items-center justify-between">
              <button
                type="button"
                aria-label={t.design.remove}
                onClick={() => onChange(f.id, Math.max(0, qty - 1))}
                className="flex size-8 items-center justify-center rounded-full border border-border hover:bg-accent"
              >
                <Minus className="size-3.5" aria-hidden="true" />
              </button>
              <span className="w-8 text-center text-sm tabular-nums">{qty}</span>
              <button
                type="button"
                aria-label={t.design.add}
                onClick={() => onChange(f.id, qty + 1)}
                className="flex size-8 items-center justify-center rounded-full border border-border hover:bg-accent"
              >
                <Plus className="size-3.5" aria-hidden="true" />
              </button>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
