import * as React from "react";
import { createFileRoute, useRouter } from "@tanstack/react-router";
import { ArrowDown, ArrowUp, Check, Loader2, Pencil, Plus, Tags, Trash2, X } from "lucide-react";
import { slugify } from "@flowers/api/slug";
import { Button } from "@flowers/ui/components/button";
import { Input } from "@flowers/ui/components/input";
import { Label } from "@flowers/ui/components/label";
import { Switch } from "@flowers/ui/components/switch";
import { EmptyState } from "@flowers/ui/components/empty-state";
import { cn } from "@flowers/ui/lib/utils";
import { toast } from "../components/toaster";
import { FlowersSubnav } from "../components/flowers/FlowersSubnav";
import { categorySwatch } from "../components/flowers/CategoryPicker";
import { errorMessage } from "../lib/image-upload";
import {
  getFlowerCategories,
  removeFlowerCategory,
  saveFlowerCategory,
  type FlowerCategoryWithCount,
} from "../server/flowers";

export const Route = createFileRoute("/flowers/categories")({
  loader: async () => ({ categories: await getFlowerCategories() }),
  component: FlowerCategoriesPage,
});

function FlowerCategoriesPage() {
  const { categories: loaded } = Route.useLoaderData();
  const router = useRouter();
  const [categories, setCategories] = React.useState(loaded);
  React.useEffect(() => setCategories(loaded), [loaded]);

  const refresh = () => router.invalidate();

  /** Swap with a neighbour, then renumber everything in steps of 10. */
  async function move(index: number, dir: -1 | 1) {
    const target = index + dir;
    if (target < 0 || target >= categories.length) return;
    const next = [...categories];
    [next[index], next[target]] = [next[target]!, next[index]!];
    const renumbered = next.map((c, i) => ({ ...c, sortOrder: (i + 1) * 10 }));
    setCategories(renumbered);
    try {
      await Promise.all(
        renumbered
          .filter((c, i) => c.sortOrder !== categories[i]?.sortOrder || c.slug !== categories[i]?.slug)
          .map((c) => saveFlowerCategory({ data: { slug: c.slug, nameEn: c.nameEn, sortOrder: c.sortOrder } })),
      );
    } catch (err) {
      toast.error(errorMessage(err, "Could not reorder."));
      await refresh();
    }
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-1">
          <h1 className="font-display text-3xl">Flower categories</h1>
          <p className="text-sm text-muted-foreground">
            Groups used to filter flowers in pickers and the public quotation tool.
          </p>
        </div>
        <FlowersSubnav />
      </div>

      <AddCategoryForm
        nextSort={(categories.at(-1)?.sortOrder ?? 0) + 10}
        taken={categories.map((c) => c.slug)}
        onAdded={refresh}
      />

      {categories.length === 0 ? (
        <EmptyState icon={<Tags />} title="No categories yet" description="Add your first category above — e.g. Imported, Tropical, Local." />
      ) : (
        <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card">
          {categories.map((c, i) => (
            <CategoryRow
              key={c.slug}
              category={c}
              swatch={categorySwatch(c.slug)}
              isFirst={i === 0}
              isLast={i === categories.length - 1}
              onMove={(dir) => void move(i, dir)}
              onChanged={(next) => setCategories((list) => list.map((x) => (x.slug === next.slug ? next : x)))}
              onDeleted={() => setCategories((list) => list.filter((x) => x.slug !== c.slug))}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

function AddCategoryForm({ nextSort, taken, onAdded }: { nextSort: number; taken: string[]; onAdded: () => Promise<void> }) {
  const [nameEn, setNameEn] = React.useState("");
  const [nameSi, setNameSi] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const slug = slugify(nameEn);
  const exists = slug !== "" && taken.includes(slug);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!slug || exists) return;
    setBusy(true);
    try {
      await saveFlowerCategory({ data: { slug, nameEn: nameEn.trim(), nameSi: nameSi.trim() || null, sortOrder: nextSort } });
      toast.success(`Category “${nameEn.trim()}” added.`);
      setNameEn("");
      setNameSi("");
      await onAdded();
    } catch (err) {
      toast.error(errorMessage(err, "Could not add the category."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="grid gap-3 rounded-2xl border border-dashed border-border bg-card/60 p-4 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
      <div className="space-y-1.5">
        <Label htmlFor="cat-en">New category (English)</Label>
        <Input id="cat-en" value={nameEn} onChange={(e) => setNameEn(e.target.value)} placeholder="Exotic" aria-invalid={exists} />
        <p className={cn("text-xs", exists ? "text-destructive" : "text-muted-foreground")}>
          {exists ? "A category with this key already exists." : slug ? <>Key: <code className="font-mono">{slug}</code></> : "The key is generated from the name."}
        </p>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="cat-si">Sinhala name</Label>
        <Input id="cat-si" value={nameSi} onChange={(e) => setNameSi(e.target.value)} placeholder="විදේශීය" lang="si" />
        <p className="text-xs text-muted-foreground">Optional — falls back to English.</p>
      </div>
      <Button type="submit" variant="brand" className="sm:mb-5" disabled={busy || !slug || exists}>
        {busy ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
        Add
      </Button>
    </form>
  );
}

function CategoryRow({
  category: c,
  swatch,
  isFirst,
  isLast,
  onMove,
  onChanged,
  onDeleted,
}: {
  category: FlowerCategoryWithCount;
  swatch: string;
  isFirst: boolean;
  isLast: boolean;
  onMove: (dir: -1 | 1) => void;
  onChanged: (c: FlowerCategoryWithCount) => void;
  onDeleted: () => void;
}) {
  const [editing, setEditing] = React.useState(false);
  const [nameEn, setNameEn] = React.useState(c.nameEn);
  const [nameSi, setNameSi] = React.useState(c.nameSi ?? "");
  const [busy, setBusy] = React.useState<"save" | "active" | "delete" | null>(null);

  async function save(fields: { nameEn?: string; nameSi?: string | null; isActive?: boolean }, kind: "save" | "active") {
    setBusy(kind);
    try {
      const next = { ...c, ...fields };
      await saveFlowerCategory({ data: { slug: c.slug, nameEn: next.nameEn, nameSi: fields.nameSi, isActive: fields.isActive } });
      onChanged(next);
      if (kind === "save") setEditing(false);
      toast.success(kind === "save" ? "Category renamed." : next.isActive ? "Category shown." : "Category hidden.");
    } catch (err) {
      toast.error(errorMessage(err, "Update failed."));
    } finally {
      setBusy(null);
    }
  }

  async function remove() {
    setBusy("delete");
    try {
      await removeFlowerCategory({ data: { slug: c.slug } });
      onDeleted();
      toast.success(`Category “${c.nameEn}” deleted.`);
    } catch (err) {
      toast.error(errorMessage(err, "Could not delete."));
    } finally {
      setBusy(null);
    }
  }

  return (
    <li className={cn("flex flex-wrap items-center gap-3 px-4 py-3", !c.isActive && "bg-muted/30")}>
      <div className="flex flex-col">
        <Button type="button" size="icon" variant="ghost" className="size-7" disabled={isFirst} onClick={() => onMove(-1)} aria-label={`Move ${c.nameEn} up`}>
          <ArrowUp className="size-3.5" />
        </Button>
        <Button type="button" size="icon" variant="ghost" className="size-7" disabled={isLast} onClick={() => onMove(1)} aria-label={`Move ${c.nameEn} down`}>
          <ArrowDown className="size-3.5" />
        </Button>
      </div>

      {editing ? (
        <form
          className="flex min-w-0 flex-1 flex-wrap items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (nameEn.trim()) void save({ nameEn: nameEn.trim(), nameSi: nameSi.trim() || null }, "save");
          }}
        >
          <Input autoFocus aria-label="English name" value={nameEn} onChange={(e) => setNameEn(e.target.value)} className="w-40" />
          <Input aria-label="Sinhala name" value={nameSi} onChange={(e) => setNameSi(e.target.value)} placeholder="Sinhala" className="w-40" lang="si" />
          <Button type="submit" size="icon" variant="brand" className="size-9" disabled={busy === "save" || !nameEn.trim()} aria-label="Save">
            {busy === "save" ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
          </Button>
          <Button type="button" size="icon" variant="ghost" className="size-9" onClick={() => setEditing(false)} aria-label="Cancel">
            <X className="size-4" />
          </Button>
        </form>
      ) : (
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <span className={cn("size-3 shrink-0 rounded-full ring-1 ring-foreground/10", swatch)} aria-hidden="true" />
          <div className="min-w-0">
            <p className="font-medium">
              {c.nameEn}
              {!c.isActive && <span className="ml-2 text-xs font-normal text-muted-foreground">Hidden</span>}
            </p>
            <p className="truncate text-xs text-muted-foreground">
              <span lang="si">{c.nameSi ?? "No Sinhala name"}</span> · <code className="font-mono">{c.slug}</code>
            </p>
          </div>
        </div>
      )}

      <span className="w-24 text-right text-xs text-muted-foreground">
        {c.speciesCount} species
      </span>

      <div className="flex items-center gap-1">
        <Switch
          checked={c.isActive}
          disabled={busy === "active"}
          onCheckedChange={(isActive) => void save({ isActive }, "active")}
          aria-label={`${c.isActive ? "Hide" : "Show"} ${c.nameEn}`}
          className="mr-2 data-[state=checked]:bg-sage-deep"
        />
        {!editing && (
          <Button type="button" size="icon" variant="ghost" className="size-9" onClick={() => setEditing(true)} aria-label={`Rename ${c.nameEn}`}>
            <Pencil className="size-4" />
          </Button>
        )}
        <Button
          type="button"
          size="icon"
          variant="ghost"
          className="size-9 text-destructive hover:bg-destructive/10 hover:text-destructive disabled:text-muted-foreground"
          disabled={c.speciesCount > 0 || busy === "delete"}
          title={c.speciesCount > 0 ? "In use — move its species first, or hide it" : undefined}
          onClick={() => void remove()}
          aria-label={`Delete ${c.nameEn}`}
        >
          {busy === "delete" ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" />}
        </Button>
      </div>
    </li>
  );
}
