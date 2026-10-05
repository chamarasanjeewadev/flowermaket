import * as React from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ChevronRight, Flower2, ImageOff, Plus, Search } from "lucide-react";
import { humanizeCategorySlug } from "@flowers/api/flowers";
import { Button } from "@flowers/ui/components/button";
import { Input } from "@flowers/ui/components/input";
import { cn } from "@flowers/ui/lib/utils";
import { FlowersSubnav } from "../components/flowers/FlowersSubnav";
import { categorySwatch } from "../components/flowers/CategoryPicker";
import { getAdminFlowers, getFlowerCategories } from "../server/flowers";

export const Route = createFileRoute("/flowers/")({
  loader: async () => {
    const [species, categories] = await Promise.all([getAdminFlowers(), getFlowerCategories()]);
    return { species, categories };
  },
  component: FlowersPage,
});

function FlowersPage() {
  const { species, categories } = Route.useLoaderData();
  const [query, setQuery] = React.useState("");
  const [category, setCategory] = React.useState<string>("all");

  const nameOf = React.useCallback(
    (slug: string) => categories.find((c) => c.slug === slug)?.nameEn ?? humanizeCategorySlug(slug),
    [categories],
  );

  const filtered = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    return species.filter((s) => {
      if (category !== "all" && s.category !== category) return false;
      if (!q) return true;
      return [s.nameEn, s.nameSi, s.localName ?? "", nameOf(s.category), ...s.variants.map((v) => v.colorEn ?? "")].some(
        (t) => t.toLowerCase().includes(q),
      );
    });
  }, [species, query, category, nameOf]);

  const variantCount = species.reduce((n, s) => n + s.variants.length, 0);
  const missingPhotos = species.reduce((n, s) => n + s.variants.filter((v) => !v.imageUrl).length, 0);
  const usedCategories = categories.filter((c) => c.speciesCount > 0);

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-1">
          <h1 className="font-display text-3xl">Flowers</h1>
          <p className="text-sm text-muted-foreground">
            {species.length} species · {variantCount} variants
            {missingPhotos > 0 && <> · <span className="text-brand">{missingPhotos} missing photos</span></>}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <FlowersSubnav />
          <Button asChild variant="brand">
            <Link to="/flowers/$speciesId" params={{ speciesId: "new" }}>
              <Plus className="size-4" />
              Add species
            </Link>
          </Button>
        </div>
      </div>

      {species.length > 0 && (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative sm:w-72">
            <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
            <Input
              className="pl-8"
              placeholder="Search name, colour…"
              aria-label="Search flowers"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
          <div role="group" aria-label="Filter by category" className="flex flex-wrap gap-1.5">
            {[{ slug: "all", nameEn: "All", speciesCount: species.length }, ...usedCategories].map((c) => (
              <button
                key={c.slug}
                type="button"
                aria-pressed={category === c.slug}
                onClick={() => setCategory(c.slug)}
                className={cn(
                  "inline-flex min-h-9 cursor-pointer items-center gap-1.5 rounded-full border px-3 text-sm transition-colors",
                  category === c.slug
                    ? "border-foreground bg-foreground text-background"
                    : "border-input bg-card text-muted-foreground hover:text-foreground",
                )}
              >
                {c.nameEn}
                <span className="text-xs opacity-70">{c.speciesCount}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {species.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border py-16 text-center">
          <Flower2 className="size-8 text-muted-foreground/40" />
          <p className="text-sm text-muted-foreground">No flower species yet.</p>
        </div>
      ) : filtered.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">No species match your filters.</p>
      ) : (
        <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card">
          {filtered.map((s) => {
            const thumbs = s.variants.filter((v) => v.imageUrl).slice(0, 3);
            const missing = s.variants.filter((v) => !v.imageUrl).length;
            return (
              <li key={s.id}>
                <Link
                  to="/flowers/$speciesId"
                  params={{ speciesId: s.id }}
                  className="group flex items-center gap-4 px-4 py-3 transition-colors hover:bg-accent"
                >
                  <div className="flex shrink-0 -space-x-3">
                    {thumbs.length > 0 ? (
                      thumbs.map((v) => (
                        <img key={v.id} src={v.imageUrl!} alt="" className="size-11 rounded-full border-2 border-card object-cover" loading="lazy" />
                      ))
                    ) : (
                      <span className="flex size-11 items-center justify-center rounded-full bg-muted text-muted-foreground">
                        <ImageOff className="size-4" aria-hidden="true" />
                      </span>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">
                      {s.nameEn}
                      {!s.isActive && <span className="ml-2 text-xs font-normal text-destructive">Hidden</span>}
                    </p>
                    <p className="truncate text-xs text-muted-foreground" lang="si">
                      {[s.nameSi !== s.nameEn ? s.nameSi : null, s.localName].filter(Boolean).join(" · ") || "—"}
                    </p>
                  </div>
                  <span className={cn("hidden rounded-full px-2.5 py-0.5 text-xs font-medium sm:inline", categorySwatch(s.category))}>
                    {nameOf(s.category)}
                  </span>
                  <span className="hidden w-28 text-right text-xs text-muted-foreground md:block">
                    {s.variants.length} variant{s.variants.length !== 1 ? "s" : ""}
                    {missing > 0 && <span className="block text-brand">{missing} need photo</span>}
                  </span>
                  <ChevronRight className="size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
