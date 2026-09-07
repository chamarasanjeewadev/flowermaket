import * as React from "react";
import { Input } from "@flowers/ui/components/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@flowers/ui/components/select";
import { Tabs, TabsList, TabsTrigger } from "@flowers/ui/components/tabs";
import { Search } from "lucide-react";
import { localizedName } from "../../i18n";
import { useT } from "../../i18n/react";

export const ALL = "all";

export interface CatalogFilterValue {
  category?: string;
  type?: "retail" | "wholesale";
  district?: string;
  q?: string;
}

export interface CatalogFilterPatch {
  category?: string;
  type?: string;
  district?: string;
  q?: string;
}

/**
 * Controlled filter bar. Emits patches (with the `ALL` sentinel for "no
 * filter"); the route maps `ALL`/empty to `undefined` search params and
 * navigates.
 */
export function CatalogFilters({
  categories,
  districts,
  value,
  onChange,
}: {
  categories: Array<{ slug: string; nameEn: string; nameSi: string | null }>;
  districts: Array<{ slug: string; nameEn: string; nameSi: string }>;
  value: CatalogFilterValue;
  onChange: (patch: CatalogFilterPatch) => void;
}) {
  const { t, locale } = useT();
  const [q, setQ] = React.useState(value.q ?? "");

  // Keep the local search box in sync when the URL changes elsewhere.
  React.useEffect(() => {
    setQ(value.q ?? "");
  }, [value.q]);

  return (
    <div className="flex flex-col gap-3">
      <Tabs
        value={value.type ?? ALL}
        onValueChange={(v) => onChange({ type: v })}
      >
        <TabsList>
          <TabsTrigger value={ALL}>{t.catalog.typeAll}</TabsTrigger>
          <TabsTrigger value="retail">{t.catalog.typeRetail}</TabsTrigger>
          <TabsTrigger value="wholesale">{t.catalog.typeWholesale}</TabsTrigger>
        </TabsList>
      </Tabs>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_2fr]">
        <Select
          value={value.category ?? ALL}
          onValueChange={(v) => onChange({ category: v })}
        >
          <SelectTrigger aria-label={t.catalog.filterCategory}>
            <SelectValue placeholder={t.catalog.filterCategory} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>{t.catalog.allCategories}</SelectItem>
            {categories.map((c) => (
              <SelectItem key={c.slug} value={c.slug}>
                {localizedName(c, locale)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={value.district ?? ALL}
          onValueChange={(v) => onChange({ district: v })}
        >
          <SelectTrigger aria-label={t.catalog.filterDistrict}>
            <SelectValue placeholder={t.catalog.filterDistrict} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>{t.catalog.allDistricts}</SelectItem>
            {districts.map((d) => (
              <SelectItem key={d.slug} value={d.slug}>
                {localizedName(d, locale)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            onChange({ q });
          }}
          className="relative"
        >
          <Search
            className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <Input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={t.catalog.searchPlaceholder}
            className="pl-9"
            aria-label={t.catalog.searchPlaceholder}
          />
        </form>
      </div>
    </div>
  );
}
