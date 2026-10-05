import * as React from "react";
import { Link } from "@tanstack/react-router";
import { Check, Loader2, Plus, Settings2, X } from "lucide-react";
import type { FlowerCategoryRow } from "@flowers/api/flowers";
import { slugify } from "@flowers/api/slug";
import { Button } from "@flowers/ui/components/button";
import { Input } from "@flowers/ui/components/input";
import { cn } from "@flowers/ui/lib/utils";
import { saveFlowerCategory } from "../../server/flowers";
import { errorMessage } from "../../lib/image-upload";
import { toast } from "../toaster";

/** Pastel per category, derived from the slug so it's stable on every page. */
const SWATCHES = ["bg-peach", "bg-sage", "bg-butter", "bg-blush", "bg-lilac/30"];
const FIXED: Record<string, string> = { imported: "bg-blush", tropical: "bg-butter", local: "bg-sage" };

export function categorySwatch(slug: string) {
  if (FIXED[slug]) return FIXED[slug];
  let h = 0;
  for (const ch of slug) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return SWATCHES[h % SWATCHES.length]!;
}

/**
 * Single-select category as visible radio chips (few options → no dropdown),
 * with inline "New category" so admins never leave the form to add one.
 */
export function CategoryPicker({
  id,
  categories,
  value,
  onChange,
  onCreated,
}: {
  id: string;
  categories: FlowerCategoryRow[];
  value: string;
  onChange: (slug: string) => void;
  onCreated: (category: FlowerCategoryRow) => void;
}) {
  const [adding, setAdding] = React.useState(false);
  const [name, setName] = React.useState("");
  const [busy, setBusy] = React.useState(false);

  async function create() {
    const nameEn = name.trim();
    const slug = slugify(nameEn);
    if (!slug) return;
    const existing = categories.find((c) => c.slug === slug);
    if (existing) {
      onChange(existing.slug);
      setAdding(false);
      setName("");
      return;
    }
    setBusy(true);
    try {
      const sortOrder = (categories.at(-1)?.sortOrder ?? 0) + 10;
      await saveFlowerCategory({ data: { slug, nameEn, sortOrder } });
      onCreated({ slug, nameEn, nameSi: null, sortOrder, isActive: true });
      onChange(slug);
      setAdding(false);
      setName("");
      toast.success(`Category “${nameEn}” added.`);
    } catch (err) {
      toast.error(errorMessage(err, "Could not add the category."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-2">
      <div role="radiogroup" aria-labelledby={id} className="flex flex-wrap gap-2">
        {categories.map((c) => {
          const checked = c.slug === value;
          return (
            <button
              key={c.slug}
              type="button"
              role="radio"
              aria-checked={checked}
              onClick={() => onChange(c.slug)}
              className={cn(
                "inline-flex min-h-10 cursor-pointer items-center gap-1.5 rounded-full border px-4 text-sm font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                checked
                  ? cn("border-foreground text-foreground shadow-sm", categorySwatch(c.slug))
                  : "border-input bg-card text-muted-foreground hover:border-foreground/40 hover:text-foreground",
                !c.isActive && "border-dashed",
              )}
            >
              {checked && <Check className="size-3.5" aria-hidden="true" />}
              {c.nameEn}
              {!c.isActive && <span className="text-xs font-normal">(hidden)</span>}
            </button>
          );
        })}

        {adding ? (
          <form
            className="flex items-center gap-1.5"
            onSubmit={(e) => {
              e.preventDefault();
              void create();
            }}
          >
            <Input
              autoFocus
              aria-label="New category name"
              placeholder="e.g. Exotic"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === "Escape" && setAdding(false)}
              className="h-10 w-40 rounded-full"
            />
            <Button type="submit" size="icon" variant="brand" className="size-10 rounded-full" disabled={busy || !slugify(name)} aria-label="Add category">
              {busy ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
            </Button>
            <Button type="button" size="icon" variant="ghost" className="size-10 rounded-full" onClick={() => setAdding(false)} aria-label="Cancel">
              <X className="size-4" />
            </Button>
          </form>
        ) : (
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="inline-flex min-h-10 cursor-pointer items-center gap-1.5 rounded-full border border-dashed border-input px-4 text-sm text-muted-foreground transition-colors hover:border-brand hover:text-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <Plus className="size-3.5" aria-hidden="true" />
            New category
          </button>
        )}
      </div>
      <Link
        to="/flowers/categories"
        className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-brand"
      >
        <Settings2 className="size-3.5" aria-hidden="true" />
        Rename, reorder or hide categories
      </Link>
    </div>
  );
}
