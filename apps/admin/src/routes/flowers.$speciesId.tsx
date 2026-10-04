import * as React from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, ImagePlus, Plus, Save } from "lucide-react";
import { toast } from "../components/toaster";
import { Button } from "@flowers/ui/components/button";
import { Input } from "@flowers/ui/components/input";
import { Label } from "@flowers/ui/components/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@flowers/ui/components/select";
import {
  getAdminFlowers,
  saveFlowerSpecies,
  saveFlowerVariant,
  uploadVariantImage,
} from "../server/flowers";

export const Route = createFileRoute("/flowers/$speciesId")({
  loader: async ({ params }) => {
    const all = await getAdminFlowers();
    if (params.speciesId === "new") {
      return { species: null, variants: [] };
    }
    const found = all.find((s) => s.id === params.speciesId);
    return { species: found ?? null, variants: found?.variants ?? [] };
  },
  component: FlowerSpeciesPage,
});

function FlowerSpeciesPage() {
  const { species, variants } = Route.useLoaderData();
  const { speciesId } = Route.useParams();
  const navigate = useNavigate();
  const isNew = speciesId === "new";

  const [id, setId] = React.useState(species?.id ?? "");
  const [nameEn, setNameEn] = React.useState(species?.nameEn ?? "");
  const [nameSi, setNameSi] = React.useState(species?.nameSi ?? "");
  const [localName, setLocalName] = React.useState(species?.localName ?? "");
  const [category, setCategory] = React.useState<"imported" | "tropical" | "local">(
    species?.category ?? "imported",
  );
  const [defaultUnit, setDefaultUnit] = React.useState<"stem" | "bunch" | "arrangement" | "item">(
    species?.defaultUnit ?? "stem",
  );
  const [sortOrder, setSortOrder] = React.useState(String(species?.sortOrder ?? 0));
  const [saving, setSaving] = React.useState(false);

  async function handleSaveSpecies(e: React.FormEvent) {
    e.preventDefault();
    if (!id || !nameEn || !nameSi) {
      toast.error("ID, English name, and Sinhala name are required.");
      return;
    }
    setSaving(true);
    try {
      await saveFlowerSpecies({
        data: {
          id,
          nameEn,
          nameSi,
          localName: localName || null,
          category,
          defaultUnit,
          sortOrder: Number(sortOrder) || 0,
          isActive: species?.isActive ?? true,
        },
      });
      toast.success("Species saved.");
      if (isNew) {
        await navigate({ to: "/flowers/$speciesId", params: { speciesId: id } });
      }
    } catch (err) {
      toast.error("Save failed.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-8 max-w-2xl">
      <div className="flex items-center gap-3">
        <Button asChild variant="ghost" size="icon">
          <Link to="/flowers">
            <ArrowLeft className="size-4" />
          </Link>
        </Button>
        <h1 className="font-display text-3xl">
          {isNew ? "New Species" : species?.nameEn ?? speciesId}
        </h1>
      </div>

      {/* Species form */}
      <form onSubmit={handleSaveSpecies} className="space-y-4 rounded-xl border border-border bg-card p-5">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Species details
        </h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="ID (slug)" htmlFor="sp-id">
            {isNew ? (
              <Input
                id="sp-id"
                value={id}
                onChange={(e) => setId(e.target.value)}
                placeholder="rose"
              />
            ) : (
              <div
                id="sp-id"
                className="flex h-9 items-center rounded-md border border-input bg-muted/50 px-3 font-mono text-sm text-foreground"
              >
                {id}
              </div>
            )}
          </Field>
          <Field label="English name" htmlFor="sp-name-en">
            <Input
              id="sp-name-en"
              value={nameEn}
              onChange={(e) => setNameEn(e.target.value)}
              placeholder="Rose"
            />
          </Field>
          <Field label="Sinhala name" htmlFor="sp-name-si">
            <Input
              id="sp-name-si"
              value={nameSi}
              onChange={(e) => setNameSi(e.target.value)}
              placeholder="රෝස"
            />
          </Field>
          <Field label="Local name (optional)" htmlFor="sp-local">
            <Input
              id="sp-local"
              value={localName}
              onChange={(e) => setLocalName(e.target.value)}
              placeholder="Araliya"
            />
          </Field>
          <Field label="Category" htmlFor="sp-category">
            <Select value={category} onValueChange={(v) => setCategory(v as typeof category)}>
              <SelectTrigger id="sp-category">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="imported">Imported</SelectItem>
                <SelectItem value="tropical">Tropical</SelectItem>
                <SelectItem value="local">Local</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Field label="Default unit" htmlFor="sp-unit">
            <Select value={defaultUnit} onValueChange={(v) => setDefaultUnit(v as typeof defaultUnit)}>
              <SelectTrigger id="sp-unit">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="stem">Stem</SelectItem>
                <SelectItem value="bunch">Bunch</SelectItem>
                <SelectItem value="arrangement">Arrangement</SelectItem>
                <SelectItem value="item">Item</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Field label="Sort order" htmlFor="sp-sort">
            <Input
              id="sp-sort"
              type="number"
              value={sortOrder}
              onChange={(e) => setSortOrder(e.target.value)}
            />
          </Field>
        </div>
        <Button type="submit" disabled={saving}>
          <Save className="size-4" />
          {saving ? "Saving…" : "Save species"}
        </Button>
      </form>

      {/* Variants section — only visible once species exists */}
      {!isNew && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-xl">Variants</h2>
            <AddVariantButton speciesId={speciesId} />
          </div>
          {variants.length === 0 ? (
            <p className="text-sm text-muted-foreground">No variants yet.</p>
          ) : (
            <div className="space-y-3">
              {variants.map((v) => (
                <VariantCard key={v.id} variant={v} speciesId={speciesId} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

type VariantShape = {
  id: string;
  colorEn: string | null;
  colorSi: string | null;
  imagePath: string | null;
  imageUrl: string | null;
  isFeatured: boolean;
  isActive: boolean;
  sortOrder: number;
};

function VariantCard({ variant, speciesId }: { variant: VariantShape; speciesId: string }) {
  const [saving, setSaving] = React.useState(false);
  const [uploading, setUploading] = React.useState(false);
  const [imageUrl, setImageUrl] = React.useState(variant.imageUrl);
  const [isFeatured, setIsFeatured] = React.useState(variant.isFeatured);
  const sortOrder = String(variant.sortOrder);
  const fileRef = React.useRef<HTMLInputElement>(null);

  async function handleToggleFeatured() {
    setSaving(true);
    try {
      await saveFlowerVariant({
        data: {
          id: variant.id,
          speciesId,
          colorEn: variant.colorEn,
          colorSi: variant.colorSi,
          isFeatured: !isFeatured,
          sortOrder: Number(sortOrder),
        },
      });
      setIsFeatured((f) => !f);
      toast.success("Variant updated.");
    } catch {
      toast.error("Update failed.");
    } finally {
      setSaving(false);
    }
  }

  async function handleImageUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const reader = new FileReader();
      const base64 = await new Promise<string>((resolve, reject) => {
        reader.onload = () => resolve((reader.result as string).split(",")[1]!);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      const result = await uploadVariantImage({
        data: {
          variantId: variant.id,
          fileName: file.name,
          base64,
          mimeType: file.type,
        },
      });
      setImageUrl(result.imageUrl);
      toast.success("Image uploaded.");
    } catch {
      toast.error("Upload failed.");
    } finally {
      setUploading(false);
    }
  }

  const displayName = variant.colorEn
    ? `${variant.colorEn} variant`
    : "Default variant";

  return (
    <div className="flex items-start gap-4 rounded-lg border border-border bg-card p-4">
      {/* Image thumbnail + upload */}
      <div className="flex shrink-0 flex-col items-center gap-2">
        <div className="relative size-24 overflow-hidden rounded-md bg-muted">
          {imageUrl ? (
            <img
              src={imageUrl}
              alt={displayName}
              className="size-full object-cover"
            />
          ) : (
            <div className="flex size-full items-center justify-center text-muted-foreground/40">
              <ImagePlus className="size-7" />
            </div>
          )}
          {uploading && (
            <div className="absolute inset-0 flex items-center justify-center bg-background/70 text-xs font-medium">
              Uploading…
            </div>
          )}
        </div>
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={uploading}
          className="text-xs font-medium text-brand hover:underline disabled:opacity-50"
        >
          {imageUrl ? "Replace photo" : "Upload photo"}
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="image/webp,image/jpeg,image/png"
          className="sr-only"
          onChange={handleImageUpload}
        />
      </div>

      {/* Details */}
      <div className="flex flex-1 flex-wrap items-center gap-3">
        <div className="min-w-0 flex-1">
          <p className="font-medium">{displayName}</p>
          <p className="text-xs text-muted-foreground">ID: {variant.id}</p>
          {variant.colorSi && (
            <p className="text-xs text-muted-foreground">{variant.colorSi}</p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Label className="text-xs">Featured</Label>
          <button
            type="button"
            role="switch"
            aria-checked={isFeatured}
            onClick={handleToggleFeatured}
            disabled={saving}
            className={[
              "relative inline-flex h-5 w-9 cursor-pointer rounded-full border-2 border-transparent transition-colors",
              isFeatured ? "bg-brand" : "bg-muted",
            ].join(" ")}
          >
            <span
              className={[
                "pointer-events-none inline-block size-4 rounded-full bg-white shadow ring-0 transition-transform",
                isFeatured ? "translate-x-4" : "translate-x-0",
              ].join(" ")}
            />
          </button>
        </div>
      </div>
    </div>
  );
}

function AddVariantButton({ speciesId }: { speciesId: string }) {
  const [open, setOpen] = React.useState(false);
  const [colorEn, setColorEn] = React.useState("");
  const [colorSi, setColorSi] = React.useState("");
  const [saving, setSaving] = React.useState(false);
  const navigate = useNavigate();

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    const id = colorEn
      ? `${colorEn.toLowerCase().replace(/\s+/g, "-")}-${speciesId}`
      : speciesId;
    setSaving(true);
    try {
      await saveFlowerVariant({
        data: {
          id,
          speciesId,
          colorEn: colorEn || null,
          colorSi: colorSi || null,
          isFeatured: false,
          sortOrder: 0,
        },
      });
      toast.success("Variant added.");
      setOpen(false);
      await navigate({ to: "/flowers/$speciesId", params: { speciesId } });
    } catch {
      toast.error("Failed to add variant.");
    } finally {
      setSaving(false);
    }
  }

  if (!open) {
    return (
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        <Plus className="size-4" />
        Add variant
      </Button>
    );
  }

  return (
    <form
      onSubmit={handleAdd}
      className="w-full space-y-3 rounded-lg border border-border bg-muted/20 p-4 sm:w-auto"
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Colour (English)" htmlFor="v-color-en">
          <Input
            id="v-color-en"
            value={colorEn}
            onChange={(e) => setColorEn(e.target.value)}
            placeholder="Red"
          />
        </Field>
        <Field label="Colour (Sinhala)" htmlFor="v-color-si">
          <Input
            id="v-color-si"
            value={colorSi}
            onChange={(e) => setColorSi(e.target.value)}
            placeholder="රතු"
          />
        </Field>
      </div>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)}>
          Cancel
        </Button>
        <Button type="submit" size="sm" disabled={saving}>
          {saving ? "Adding…" : "Add variant"}
        </Button>
      </div>
    </form>
  );
}

function Field({
  label,
  htmlFor,
  children,
}: {
  label: string;
  htmlFor: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
    </div>
  );
}
