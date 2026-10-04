import * as React from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@flowers/ui/components/dialog";
import { Input } from "@flowers/ui/components/input";
import { Label } from "@flowers/ui/components/label";
import { Button } from "@flowers/ui/components/button";
import { Flower2, ImageOff, Loader2, Plus, Search } from "lucide-react";
import type { FlowerSpeciesWithVariants } from "@flowers/api";
import {
  saveFlowerSpecies,
  saveFlowerVariant,
  uploadVariantImage,
} from "../server/flowers";

export interface PickedFlower {
  flowerVariantId: string;
  label: string;
  imageUrl: string | null;
  nameEn: string;
  unit: "stem" | "bunch" | "arrangement" | "item";
}

interface FlowerOption extends PickedFlower {
  nameSi: string;
  colorEn: string | null;
  category: "imported" | "tropical" | "local";
}

function flatten(flowers: FlowerSpeciesWithVariants[]): FlowerOption[] {
  const out: FlowerOption[] = [];
  for (const s of flowers) {
    for (const v of s.variants) {
      if (!v.isActive) continue;
      const label = v.colorEn ? `${v.colorEn} ${s.nameEn}` : s.nameEn;
      out.push({
        flowerVariantId: v.id,
        label,
        imageUrl: v.imageUrl,
        nameEn: s.nameEn,
        unit: s.defaultUnit,
        nameSi: s.nameSi,
        colorEn: v.colorEn,
        category: s.category,
      });
    }
  }
  return out;
}

const selectClass =
  "flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring";

const CATEGORY_CLASS: Record<FlowerOption["category"], string> = {
  imported: "bg-primary/10 text-primary",
  tropical: "bg-warning/15 text-warning",
  local: "bg-success/15 text-success",
};

async function fileToBase64(file: File): Promise<string> {
  const buf = await file.arrayBuffer();
  let binary = "";
  const bytes = new Uint8Array(buf);
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

export function FlowerPicker({
  open,
  onOpenChange,
  flowers,
  onSelect,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  flowers: FlowerSpeciesWithVariants[];
  onSelect: (picked: PickedFlower) => void;
  onCreated: () => Promise<void>;
}) {
  const [query, setQuery] = React.useState("");
  const [mode, setMode] = React.useState<"browse" | "add">("browse");

  const options = React.useMemo(() => flatten(flowers), [flowers]);
  const filtered = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter((o) =>
      [o.label, o.nameSi, o.colorEn ?? ""].some((s) => s.toLowerCase().includes(q)),
    );
  }, [options, query]);

  function pick(o: FlowerOption) {
    onSelect({
      flowerVariantId: o.flowerVariantId,
      label: o.label,
      imageUrl: o.imageUrl,
      nameEn: o.nameEn,
      unit: o.unit,
    });
    onOpenChange(false);
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        onOpenChange(o);
        if (!o) {
          setMode("browse");
          setQuery("");
        }
      }}
    >
      <DialogContent className="max-h-[85vh] overflow-hidden sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{mode === "browse" ? "Pick a flower" : "Add a new flower"}</DialogTitle>
          <DialogDescription>
            {mode === "browse"
              ? "Search your flower catalog, or add one if it's missing."
              : "Create a new flower in the catalog and use it on this order."}
          </DialogDescription>
        </DialogHeader>

        {mode === "browse" ? (
          <div className="flex min-h-0 flex-col gap-3">
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  autoFocus
                  className="pl-8"
                  placeholder="Search roses, carnations, colours…"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
              </div>
              <Button variant="outline" onClick={() => setMode("add")}>
                <Plus className="size-4" /> Add new
              </Button>
            </div>

            <div className="grid max-h-[55vh] grid-cols-2 gap-2 overflow-y-auto pr-1 sm:grid-cols-3">
              {filtered.length === 0 ? (
                <div className="col-span-full flex flex-col items-center gap-2 py-10 text-center">
                  <Flower2 className="size-7 text-muted-foreground/40" />
                  <p className="text-sm text-muted-foreground">
                    {query ? `No match for “${query}”.` : "No flowers in the catalog yet."}
                  </p>
                  <Button size="sm" variant="outline" onClick={() => setMode("add")}>
                    <Plus className="size-4" /> {query ? `Add “${query}”` : "Add a flower"}
                  </Button>
                </div>
              ) : (
                filtered.map((o) => (
                  <button
                    key={o.flowerVariantId}
                    type="button"
                    onClick={() => pick(o)}
                    className="group overflow-hidden rounded-lg border border-border bg-card text-left transition-colors hover:border-brand/50 hover:bg-accent"
                  >
                    <div className="flex aspect-square items-center justify-center bg-muted/40">
                      {o.imageUrl ? (
                        <img
                          src={o.imageUrl}
                          alt={o.label}
                          loading="lazy"
                          className="size-full object-cover"
                        />
                      ) : (
                        <ImageOff className="size-6 text-muted-foreground/40" />
                      )}
                    </div>
                    <div className="space-y-1 p-2">
                      <div className="truncate text-sm font-medium">{o.label}</div>
                      <span
                        className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-medium ${CATEGORY_CLASS[o.category]}`}
                      >
                        {o.category}
                      </span>
                    </div>
                  </button>
                ))
              )}
            </div>
          </div>
        ) : (
          <AddFlowerForm
            initialName={query}
            onCancel={() => setMode("browse")}
            onCreated={async (picked) => {
              await onCreated();
              onSelect(picked);
              onOpenChange(false);
              setMode("browse");
              setQuery("");
            }}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function AddFlowerForm({
  initialName,
  onCancel,
  onCreated,
}: {
  initialName: string;
  onCancel: () => void;
  onCreated: (picked: PickedFlower) => Promise<void>;
}) {
  const [nameEn, setNameEn] = React.useState(initialName);
  const [nameSi, setNameSi] = React.useState("");
  const [colorEn, setColorEn] = React.useState("");
  const [category, setCategory] = React.useState<FlowerOption["category"]>("local");
  const [unit, setUnit] = React.useState<PickedFlower["unit"]>("stem");
  const [file, setFile] = React.useState<File | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function submit() {
    setError(null);
    if (!nameEn.trim()) {
      setError("Flower name (English) is required.");
      return;
    }
    setBusy(true);
    try {
      const speciesId = crypto.randomUUID();
      const variantId = crypto.randomUUID();
      await saveFlowerSpecies({
        data: {
          id: speciesId,
          nameEn: nameEn.trim(),
          nameSi: nameSi.trim() || nameEn.trim(),
          category,
          defaultUnit: unit,
        },
      });
      await saveFlowerVariant({
        data: {
          id: variantId,
          speciesId,
          colorEn: colorEn.trim() || null,
        },
      });

      let imageUrl: string | null = null;
      if (file) {
        const base64 = await fileToBase64(file);
        const res = await uploadVariantImage({
          data: {
            variantId,
            fileName: `${variantId}-${file.name}`,
            base64,
            mimeType: file.type || "image/jpeg",
          },
        });
        imageUrl = res.imageUrl;
      }

      const label = colorEn.trim() ? `${colorEn.trim()} ${nameEn.trim()}` : nameEn.trim();
      await onCreated({ flowerVariantId: variantId, label, imageUrl, nameEn: nameEn.trim(), unit });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not add the flower.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      {error && (
        <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>
      )}
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="nf-name">Name (English) *</Label>
          <Input id="nf-name" value={nameEn} onChange={(e) => setNameEn(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="nf-namesi">Name (Sinhala)</Label>
          <Input id="nf-namesi" value={nameSi} onChange={(e) => setNameSi(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="nf-color">Colour</Label>
          <Input id="nf-color" placeholder="e.g. Red" value={colorEn} onChange={(e) => setColorEn(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="nf-cat">Category</Label>
          <select id="nf-cat" className={selectClass} value={category} onChange={(e) => setCategory(e.target.value as FlowerOption["category"])}>
            <option value="local">Local</option>
            <option value="imported">Imported</option>
            <option value="tropical">Tropical</option>
          </select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="nf-unit">Default unit</Label>
          <select id="nf-unit" className={selectClass} value={unit} onChange={(e) => setUnit(e.target.value as PickedFlower["unit"])}>
            <option value="stem">Stem</option>
            <option value="bunch">Bunch</option>
            <option value="arrangement">Arrangement</option>
            <option value="item">Item</option>
          </select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="nf-img">Photo (optional)</Label>
          <Input id="nf-img" type="file" accept="image/*" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
        </div>
      </div>
      <div className="flex gap-2">
        <Button variant="ghost" className="flex-1" disabled={busy} onClick={onCancel}>
          Back
        </Button>
        <Button variant="brand" className="flex-1" disabled={busy} onClick={() => void submit()}>
          {busy ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
          {busy ? "Adding…" : "Add & use"}
        </Button>
      </div>
    </div>
  );
}
