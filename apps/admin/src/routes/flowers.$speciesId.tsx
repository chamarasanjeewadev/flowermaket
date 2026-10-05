import * as React from "react";
import { createFileRoute, Link, useNavigate, useRouter } from "@tanstack/react-router";
import {
  Check,
  ChevronRight,
  Copy,
  ImageOff,
  Loader2,
  Plus,
  Save,
  Sparkles,
} from "lucide-react";
import { FLOWER_UNITS, type FlowerCategoryRow, type FlowerUnit } from "@flowers/api/flowers";
import { slugify } from "@flowers/api/slug";
import { Button } from "@flowers/ui/components/button";
import { Input } from "@flowers/ui/components/input";
import { Label } from "@flowers/ui/components/label";
import { Switch } from "@flowers/ui/components/switch";
import { cn } from "@flowers/ui/lib/utils";
import { toast } from "../components/toaster";
import { CategoryPicker, categorySwatch } from "../components/flowers/CategoryPicker";
import { VariantCard, type VariantShape } from "../components/flowers/VariantCard";
import { errorMessage } from "../lib/image-upload";
import {
  getAdminFlowers,
  getFlowerCategories,
  saveFlowerSpecies,
  saveFlowerVariant,
} from "../server/flowers";

export const Route = createFileRoute("/flowers/$speciesId")({
  loader: async ({ params }) => {
    const [all, categories] = await Promise.all([getAdminFlowers(), getFlowerCategories()]);
    const species = params.speciesId === "new" ? null : (all.find((s) => s.id === params.speciesId) ?? null);
    return { species, categories, takenIds: all.map((s) => s.id) };
  },
  component: FlowerSpeciesPage,
});

const UNIT_LABELS: Record<FlowerUnit, { label: string; hint: string }> = {
  stem: { label: "Stem", hint: "Single stem" },
  bunch: { label: "Bunch", hint: "Bundled stems" },
  arrangement: { label: "Arrangement", hint: "Ready-made" },
  item: { label: "Item", hint: "Anything else" },
};

type FormState = {
  id: string;
  nameEn: string;
  nameSi: string;
  localName: string;
  category: string;
  defaultUnit: FlowerUnit;
  sortOrder: string;
  isActive: boolean;
};

function FlowerSpeciesPage() {
  const { species, categories: loadedCategories, takenIds } = Route.useLoaderData();
  const { speciesId } = Route.useParams();
  const navigate = useNavigate();
  const router = useRouter();
  const isNew = speciesId === "new";

  const [categories, setCategories] = React.useState<FlowerCategoryRow[]>(() => {
    const list: FlowerCategoryRow[] = loadedCategories.filter((c) => c.isActive || c.slug === species?.category);
    // Species whose category has no row yet (pre-migration data) still render.
    if (species && !list.some((c) => c.slug === species.category)) {
      list.push({ slug: species.category, nameEn: species.category, nameSi: null, sortOrder: 999, isActive: true });
    }
    return list;
  });

  const initial = React.useMemo<FormState>(
    () => ({
      id: species?.id ?? "",
      nameEn: species?.nameEn ?? "",
      nameSi: species?.nameSi && species.nameSi !== species.nameEn ? species.nameSi : "",
      localName: species?.localName ?? "",
      category: species?.category ?? categories[0]?.slug ?? "local",
      defaultUnit: species?.defaultUnit ?? "stem",
      sortOrder: String(species?.sortOrder ?? 0),
      isActive: species?.isActive ?? true,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [species],
  );
  const [form, setForm] = React.useState<FormState>(initial);
  const [saved, setSaved] = React.useState<FormState>(initial);
  const [idTouched, setIdTouched] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [variants, setVariants] = React.useState<VariantShape[]>(species?.variants ?? []);

  React.useEffect(() => {
    setForm(initial);
    setSaved(initial);
    setVariants(species?.variants ?? []);
  }, [initial, species]);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  // New species: derive the ID from the English name until the admin edits it.
  React.useEffect(() => {
    if (isNew && !idTouched) setForm((f) => ({ ...f, id: slugify(f.nameEn) }));
  }, [form.nameEn, isNew, idTouched]);

  const dirty = JSON.stringify(form) !== JSON.stringify(saved);
  const idTaken = isNew && form.id !== "" && takenIds.includes(form.id);
  const nameError = form.nameEn.trim() === "" ? "English name is required." : null;

  // Warn before leaving with unsaved edits.
  React.useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [dirty]);

  async function handleSave(e?: React.FormEvent) {
    e?.preventDefault();
    if (nameError || !form.id || idTaken) {
      toast.error(nameError ?? (idTaken ? "That ID is already used by another species." : "ID is required."));
      return;
    }
    setSaving(true);
    try {
      const nameEn = form.nameEn.trim();
      await saveFlowerSpecies({
        data: {
          id: form.id,
          nameEn,
          // Sinhala is optional in the UI; the column is NOT NULL, so fall back to EN.
          nameSi: form.nameSi.trim() || nameEn,
          localName: form.localName.trim() || null,
          category: form.category,
          defaultUnit: form.defaultUnit,
          sortOrder: Number(form.sortOrder) || 0,
          isActive: form.isActive,
        },
      });
      setSaved(form);
      toast.success(isNew ? "Species created — now add its colour variants." : "Changes saved.");
      if (isNew) {
        // The species needs at least one variant to be pickable; seed a default.
        await saveFlowerVariant({ data: { id: form.id, speciesId: form.id, colorEn: null, colorSi: null } });
        await navigate({ to: "/flowers/$speciesId", params: { speciesId: form.id }, replace: true });
      } else {
        await router.invalidate();
      }
    } catch (err) {
      toast.error(errorMessage(err, "Save failed."));
    } finally {
      setSaving(false);
    }
  }

  const cover = variants.find((v) => v.isFeatured && v.imageUrl) ?? variants.find((v) => v.imageUrl);
  const categoryName = categories.find((c) => c.slug === form.category)?.nameEn ?? form.category;
  const missingPhotos = variants.filter((v) => !v.imageUrl).length;

  return (
    <div className="mx-auto max-w-6xl space-y-8 pb-24">
      {/* Header */}
      <header className="space-y-3">
        <nav aria-label="Breadcrumb" className="flex items-center gap-1 text-sm text-muted-foreground">
          <Link to="/flowers" className="hover:text-brand">Flowers</Link>
          <ChevronRight className="size-3.5" aria-hidden="true" />
          <span className="text-foreground">{isNew ? "New species" : saved.nameEn || speciesId}</span>
        </nav>
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="font-display text-4xl leading-tight">
              {isNew ? form.nameEn || "New species" : saved.nameEn}
            </h1>
            {!isNew && (
              <p className="mt-1 text-sm text-muted-foreground">
                {[saved.nameSi, saved.localName].filter(Boolean).join(" · ") || "No Sinhala or local name yet"}
              </p>
            )}
          </div>
          {!isNew && (
            <label className="inline-flex cursor-pointer items-center gap-3 rounded-full border border-border bg-card py-1.5 pl-4 pr-2 text-sm">
              <span className={form.isActive ? "text-sage-deep" : "text-muted-foreground"}>
                {form.isActive ? "Listed" : "Hidden"}
              </span>
              <Switch
                checked={form.isActive}
                onCheckedChange={(v) => set("isActive", v)}
                aria-label="Species visible in pickers and quotation tool"
                className="data-[state=checked]:bg-sage-deep"
              />
            </label>
          )}
        </div>
      </header>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        {/* Details form */}
        <form id="species-form" onSubmit={handleSave} className="space-y-6 rounded-2xl border border-border bg-card p-6">
          <Section title="Names" description="English is required. Sinhala falls back to English when empty.">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="English name" htmlFor="sp-name-en" required error={dirty ? nameError : null}>
                <Input
                  id="sp-name-en"
                  value={form.nameEn}
                  onChange={(e) => set("nameEn", e.target.value)}
                  placeholder="Rose"
                  autoFocus={isNew}
                  aria-invalid={dirty && !!nameError}
                />
              </Field>
              <Field label="Sinhala name" htmlFor="sp-name-si">
                <Input id="sp-name-si" value={form.nameSi} onChange={(e) => set("nameSi", e.target.value)} placeholder="රෝස" lang="si" />
              </Field>
              <Field label="Local / common name" htmlFor="sp-local" hint="What growers call it — helps search.">
                <Input id="sp-local" value={form.localName} onChange={(e) => set("localName", e.target.value)} placeholder="Araliya" />
              </Field>
            </div>
          </Section>

          <Section title="Category" labelId="sp-category">
            <CategoryPicker
              id="sp-category"
              categories={categories}
              value={form.category}
              onChange={(slug) => set("category", slug)}
              onCreated={(c) => setCategories((list) => [...list, c])}
            />
          </Section>

          <Section title="Sold by default as" labelId="sp-unit">
            <div role="radiogroup" aria-labelledby="sp-unit" className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {FLOWER_UNITS.map((u) => {
                const checked = form.defaultUnit === u;
                return (
                  <button
                    key={u}
                    type="button"
                    role="radio"
                    aria-checked={checked}
                    onClick={() => set("defaultUnit", u)}
                    className={cn(
                      "flex min-h-14 cursor-pointer flex-col items-start justify-center rounded-xl border px-3 py-2 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                      checked ? "border-brand bg-brand/5" : "border-input hover:border-foreground/30",
                    )}
                  >
                    <span className="inline-flex items-center gap-1.5 text-sm font-medium">
                      {checked && <Check className="size-3.5 text-brand" aria-hidden="true" />}
                      {UNIT_LABELS[u].label}
                    </span>
                    <span className="text-xs text-muted-foreground">{UNIT_LABELS[u].hint}</span>
                  </button>
                );
              })}
            </div>
          </Section>

          <details className="group rounded-xl border border-border px-4 py-3 [&_summary::-webkit-details-marker]:hidden" open={isNew || idTaken}>
            <summary className="flex cursor-pointer list-none items-center justify-between text-sm font-medium">
              Advanced
              <ChevronRight className="size-4 text-muted-foreground transition-transform group-open:rotate-90" aria-hidden="true" />
            </summary>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <Field
                label="ID"
                htmlFor="sp-id"
                hint={isNew ? "Auto-generated from the English name. Can't change later." : "Permanent — used in orders and links."}
                error={idTaken ? "Already used by another species." : null}
              >
                {isNew ? (
                  <Input
                    id="sp-id"
                    value={form.id}
                    onChange={(e) => {
                      setIdTouched(true);
                      set("id", slugify(e.target.value));
                    }}
                    className="font-mono"
                    aria-invalid={idTaken}
                  />
                ) : (
                  <CopyableId id={form.id} />
                )}
              </Field>
              <Field label="Sort order" htmlFor="sp-sort" hint="Lower numbers appear first.">
                <Input id="sp-sort" type="number" inputMode="numeric" value={form.sortOrder} onChange={(e) => set("sortOrder", e.target.value)} />
              </Field>
            </div>
          </details>
        </form>

        {/* At-a-glance preview */}
        <aside className="space-y-3 lg:sticky lg:top-6 lg:self-start">
          <div className="overflow-hidden rounded-2xl border border-border bg-card">
            <div className="aspect-[4/3] bg-muted/60">
              {cover?.imageUrl ? (
                <img src={cover.imageUrl} alt={form.nameEn} className="size-full object-cover" />
              ) : (
                <div className="flex size-full flex-col items-center justify-center gap-2 text-muted-foreground">
                  <ImageOff className="size-7" aria-hidden="true" />
                  <span className="text-xs">No photo yet</span>
                </div>
              )}
            </div>
            <div className="space-y-2 p-4">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Preview</p>
              <p className="font-display text-xl leading-tight">{form.nameEn || "Untitled"}</p>
              <p className="text-sm text-muted-foreground" lang="si">{form.nameSi || form.nameEn || "—"}</p>
              <div className="flex flex-wrap gap-1.5 pt-1">
                <span className={cn("rounded-full px-2.5 py-0.5 text-xs font-medium", categorySwatch(form.category))}>
                  {categoryName}
                </span>
                <span className="rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium">
                  per {UNIT_LABELS[form.defaultUnit].label.toLowerCase()}
                </span>
                {!form.isActive && (
                  <span className="rounded-full bg-destructive/10 px-2.5 py-0.5 text-xs font-medium text-destructive">Hidden</span>
                )}
              </div>
            </div>
          </div>
          {!isNew && missingPhotos > 0 && (
            <p className="flex items-start gap-2 rounded-xl bg-butter/40 px-4 py-3 text-xs">
              <Sparkles className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
              {missingPhotos} of {variants.length} variant{variants.length === 1 ? "" : "s"} still need a photo — buyers pick flowers by sight.
            </p>
          )}
        </aside>
      </div>

      {/* Variants */}
      {!isNew && (
        <section className="space-y-4" aria-labelledby="variants-heading">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 id="variants-heading" className="font-display text-2xl">Colour variants</h2>
              <p className="text-sm text-muted-foreground">Each variant is a pickable flower with its own photo.</p>
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {variants.map((v) => (
              <VariantCard
                key={v.id}
                variant={v}
                speciesId={speciesId}
                speciesName={saved.nameEn}
                onChange={(next) => setVariants((list) => list.map((x) => (x.id === next.id ? next : x)))}
              />
            ))}
            <AddVariantCard
              speciesId={speciesId}
              takenIds={variants.map((v) => v.id)}
              onAdded={(v) => setVariants((list) => [...list, v])}
            />
          </div>
        </section>
      )}

      {/* Sticky save bar — appears only when there's something to save */}
      <div
        className={cn(
          "fixed inset-x-0 bottom-0 z-30 border-t border-border bg-card/95 backdrop-blur transition-transform duration-200 sm:left-56",
          dirty || isNew ? "translate-y-0" : "translate-y-full",
        )}
        aria-hidden={!(dirty || isNew)}
      >
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-6 py-3">
          <p className="text-sm text-muted-foreground">
            {isNew ? "Save to start adding photos and variants." : "You have unsaved changes."}
          </p>
          <div className="flex gap-2">
            {!isNew && (
              <Button type="button" variant="ghost" onClick={() => setForm(saved)} disabled={saving} tabIndex={dirty ? 0 : -1}>
                Discard
              </Button>
            )}
            <Button type="submit" form="species-form" variant="brand" disabled={saving || !!nameError || idTaken} tabIndex={dirty || isNew ? 0 : -1}>
              {saving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
              {saving ? "Saving…" : isNew ? "Create species" : "Save changes"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function AddVariantCard({
  speciesId,
  takenIds,
  onAdded,
}: {
  speciesId: string;
  takenIds: string[];
  onAdded: (v: VariantShape) => void;
}) {
  const [open, setOpen] = React.useState(false);
  const [colorEn, setColorEn] = React.useState("");
  const [colorSi, setColorSi] = React.useState("");
  const [saving, setSaving] = React.useState(false);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    const en = colorEn.trim();
    if (!en) return;
    let id = `${slugify(en)}-${speciesId}`;
    if (takenIds.includes(id)) id = `${id}-${crypto.randomUUID().slice(0, 4)}`;
    setSaving(true);
    try {
      const sortOrder = takenIds.length * 10;
      await saveFlowerVariant({
        data: { id, speciesId, colorEn: en, colorSi: colorSi.trim() || null, isFeatured: false, sortOrder },
      });
      onAdded({ id, colorEn: en, colorSi: colorSi.trim() || null, imagePath: null, imageUrl: null, isFeatured: false, isActive: true, sortOrder });
      toast.success(`${en} added — drop a photo on it.`);
      setColorEn("");
      setColorSi("");
      setOpen(false);
    } catch (err) {
      toast.error(errorMessage(err, "Failed to add variant."));
    } finally {
      setSaving(false);
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex min-h-64 cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-border text-muted-foreground transition-colors hover:border-brand hover:bg-brand/5 hover:text-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <Plus className="size-6" aria-hidden="true" />
        <span className="text-sm font-medium">Add colour variant</span>
      </button>
    );
  }

  return (
    <form onSubmit={handleAdd} className="flex min-h-64 flex-col justify-center gap-3 rounded-xl border-2 border-dashed border-brand/50 bg-brand/5 p-5">
      <p className="font-medium">New colour variant</p>
      <Field label="Colour (English)" htmlFor="v-color-en" required>
        <Input id="v-color-en" autoFocus value={colorEn} onChange={(e) => setColorEn(e.target.value)} placeholder="Red" />
      </Field>
      <Field label="Colour (Sinhala)" htmlFor="v-color-si">
        <Input id="v-color-si" value={colorSi} onChange={(e) => setColorSi(e.target.value)} placeholder="රතු" lang="si" />
      </Field>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)}>Cancel</Button>
        <Button type="submit" size="sm" variant="brand" disabled={saving || !colorEn.trim()}>
          {saving && <Loader2 className="size-4 animate-spin" />}
          Add variant
        </Button>
      </div>
    </form>
  );
}

function CopyableId({ id }: { id: string }) {
  const [copied, setCopied] = React.useState(false);
  return (
    <div className="flex h-9 items-center gap-2 rounded-md border border-input bg-muted/50 pl-3 pr-1">
      <code id="sp-id" className="min-w-0 flex-1 truncate font-mono text-xs" title={id}>{id}</code>
      <Button
        type="button"
        size="icon"
        variant="ghost"
        className="size-7"
        aria-label={copied ? "Copied" : "Copy ID"}
        onClick={() => {
          void navigator.clipboard.writeText(id).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          });
        }}
      >
        {copied ? <Check className="size-3.5 text-sage-deep" /> : <Copy className="size-3.5" />}
      </Button>
    </div>
  );
}

function Section({
  title,
  description,
  labelId,
  children,
}: {
  title: string;
  description?: string;
  labelId?: string;
  children: React.ReactNode;
}) {
  return (
    <fieldset className="space-y-3">
      <legend id={labelId} className="text-sm font-semibold">{title}</legend>
      {description && <p className="-mt-2 text-xs text-muted-foreground">{description}</p>}
      {children}
    </fieldset>
  );
}

function Field({
  label,
  htmlFor,
  hint,
  error,
  required,
  children,
}: {
  label: string;
  htmlFor: string;
  hint?: string;
  error?: string | null;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={htmlFor}>
        {label}
        {required && <span className="text-brand" aria-hidden="true"> *</span>}
      </Label>
      {children}
      {error ? (
        <p className="text-xs text-destructive" role="alert">{error}</p>
      ) : hint ? (
        <p className="text-xs text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  );
}
