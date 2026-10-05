import * as React from "react";
import {
  Expand,
  ImagePlus,
  Loader2,
  Pencil,
  RefreshCw,
  Star,
  Trash2,
  UploadCloud,
} from "lucide-react";
import { Button } from "@flowers/ui/components/button";
import { Input } from "@flowers/ui/components/input";
import { Label } from "@flowers/ui/components/label";
import { Switch } from "@flowers/ui/components/switch";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@flowers/ui/components/dialog";
import { cn } from "@flowers/ui/lib/utils";
import {
  removeVariantImage,
  saveFlowerVariant,
  uploadVariantImage,
} from "../../server/flowers";
import { errorMessage, prepareImage } from "../../lib/image-upload";
import { toast } from "../toaster";

export type VariantShape = {
  id: string;
  colorEn: string | null;
  colorSi: string | null;
  imagePath: string | null;
  imageUrl: string | null;
  isFeatured: boolean;
  isActive: boolean;
  sortOrder: number;
};

type UploadState = { kind: "idle" } | { kind: "uploading"; preview: string } | { kind: "error"; message: string };

export function VariantCard({
  variant: initial,
  speciesId,
  speciesName,
  onChange,
}: {
  variant: VariantShape;
  speciesId: string;
  speciesName: string;
  onChange?: (v: VariantShape) => void;
}) {
  const [v, setV] = React.useState(initial);
  const [upload, setUpload] = React.useState<UploadState>({ kind: "idle" });
  const [dragOver, setDragOver] = React.useState(false);
  const [previewOpen, setPreviewOpen] = React.useState(false);
  const [editing, setEditing] = React.useState(false);
  const [busyField, setBusyField] = React.useState<"featured" | "active" | "colour" | "remove" | null>(null);
  const fileRef = React.useRef<HTMLInputElement>(null);

  const label = v.colorEn ? `${v.colorEn} ${speciesName}` : speciesName;

  function commit(next: VariantShape) {
    setV(next);
    onChange?.(next);
  }

  async function patch(fields: Partial<VariantShape>, field: NonNullable<typeof busyField>, okMsg: string) {
    setBusyField(field);
    try {
      await saveFlowerVariant({
        data: {
          id: v.id,
          speciesId,
          colorEn: fields.colorEn,
          colorSi: fields.colorSi,
          isFeatured: fields.isFeatured,
          isActive: fields.isActive,
        },
      });
      commit({ ...v, ...fields });
      toast.success(okMsg);
      return true;
    } catch (err) {
      toast.error(errorMessage(err, "Update failed."));
      return false;
    } finally {
      setBusyField(null);
    }
  }

  async function handleFile(file: File | undefined) {
    if (!file) return;
    const preview = URL.createObjectURL(file);
    setUpload({ kind: "uploading", preview });
    try {
      const prepared = await prepareImage(file);
      const res = await uploadVariantImage({ data: { variantId: v.id, ...prepared } });
      commit({ ...v, imagePath: res.imagePath, imageUrl: res.imageUrl });
      setUpload({ kind: "idle" });
      toast.success("Photo uploaded.");
    } catch (err) {
      const message = errorMessage(err, "Upload failed.");
      setUpload({ kind: "error", message });
      toast.error(message);
    } finally {
      URL.revokeObjectURL(preview);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function handleRemovePhoto() {
    setBusyField("remove");
    try {
      await removeVariantImage({ data: { variantId: v.id, imagePath: v.imagePath } });
      commit({ ...v, imagePath: null, imageUrl: null });
      setPreviewOpen(false);
      toast.success("Photo removed.");
    } catch (err) {
      toast.error(errorMessage(err, "Could not remove the photo."));
    } finally {
      setBusyField(null);
    }
  }

  const uploading = upload.kind === "uploading";
  const shownUrl = uploading ? upload.preview : v.imageUrl;

  return (
    <article
      className={cn(
        "group/card flex flex-col overflow-hidden rounded-xl border bg-card transition-shadow hover:shadow-md",
        v.isActive ? "border-border" : "border-dashed border-border opacity-75",
      )}
    >
      {/* Photo stage — click to preview, drop or click to upload */}
      <div
        className={cn(
          "relative aspect-[4/3] bg-muted/60 transition-colors",
          dragOver && "bg-brand/10 ring-2 ring-inset ring-brand",
        )}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          void handleFile(e.dataTransfer.files[0]);
        }}
      >
        {shownUrl ? (
          <button
            type="button"
            onClick={() => !uploading && setPreviewOpen(true)}
            className="block size-full cursor-zoom-in focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
            aria-label={`Preview photo of ${label}`}
          >
            <img src={shownUrl} alt={label} className="size-full object-cover" loading="lazy" />
          </button>
        ) : (
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="flex size-full cursor-pointer flex-col items-center justify-center gap-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
          >
            <UploadCloud className="size-8" aria-hidden="true" />
            <span className="text-sm font-medium">Drop a photo or click to upload</span>
            <span className="text-xs">JPEG, PNG or WebP · auto-resized</span>
          </button>
        )}

        {uploading && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-background/70 text-sm font-medium backdrop-blur-[2px]" aria-live="polite">
            <Loader2 className="size-6 animate-spin text-brand" aria-hidden="true" />
            Uploading…
          </div>
        )}

        {/* Floating actions on an existing photo */}
        {v.imageUrl && !uploading && (
          <div className="absolute right-2 top-2 flex gap-1.5 opacity-100 transition-opacity sm:opacity-0 sm:group-hover/card:opacity-100 sm:group-focus-within/card:opacity-100">
            <Button type="button" size="icon" variant="secondary" className="size-9 rounded-full shadow" onClick={() => setPreviewOpen(true)} aria-label="Preview photo">
              <Expand className="size-4" />
            </Button>
            <Button type="button" size="icon" variant="secondary" className="size-9 rounded-full shadow" onClick={() => fileRef.current?.click()} aria-label="Replace photo">
              <RefreshCw className="size-4" />
            </Button>
          </div>
        )}

        {v.isFeatured && (
          <span className="absolute left-2 top-2 inline-flex items-center gap-1 rounded-full bg-butter px-2.5 py-1 text-xs font-semibold text-foreground shadow-sm">
            <Star className="size-3 fill-current" aria-hidden="true" />
            Featured
          </span>
        )}

        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          className="sr-only"
          tabIndex={-1}
          onChange={(e) => void handleFile(e.target.files?.[0])}
        />
      </div>

      {upload.kind === "error" && (
        <div role="alert" className="flex items-start justify-between gap-2 border-b border-destructive/20 bg-destructive/10 px-4 py-2 text-xs text-destructive">
          <span>{upload.message}</span>
          <button type="button" className="shrink-0 font-semibold underline" onClick={() => fileRef.current?.click()}>
            Try again
          </button>
        </div>
      )}

      {/* Details */}
      <div className="flex flex-1 flex-col gap-3 p-4">
        {editing ? (
          <ColourForm
            variant={v}
            busy={busyField === "colour"}
            onCancel={() => setEditing(false)}
            onSave={async (colorEn, colorSi) => {
              if (await patch({ colorEn, colorSi }, "colour", "Colour updated.")) setEditing(false);
            }}
          />
        ) : (
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <h3 className="truncate font-medium">{v.colorEn ?? "Default"}</h3>
              <p className="truncate text-xs text-muted-foreground">{v.colorSi ?? "No Sinhala colour"}</p>
            </div>
            <Button type="button" size="icon" variant="ghost" className="size-9 shrink-0" onClick={() => setEditing(true)} aria-label="Edit colour">
              <Pencil className="size-4" />
            </Button>
          </div>
        )}

        <div className="mt-auto space-y-2 border-t border-border pt-3 text-sm">
          <ToggleRow
            id={`feat-${v.id}`}
            label="Featured"
            hint="Shown first in pickers"
            checked={v.isFeatured}
            busy={busyField === "featured"}
            onChange={(isFeatured) => void patch({ isFeatured }, "featured", isFeatured ? "Marked featured." : "Removed from featured.")}
          />
          <ToggleRow
            id={`act-${v.id}`}
            label="Visible"
            hint="Hidden variants can't be picked"
            checked={v.isActive}
            busy={busyField === "active"}
            onChange={(isActive) => void patch({ isActive }, "active", isActive ? "Variant visible." : "Variant hidden.")}
          />
        </div>
      </div>

      {/* Lightbox */}
      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="max-w-3xl gap-0 overflow-hidden p-0">
          <DialogTitle className="sr-only">{label}</DialogTitle>
          <DialogDescription className="sr-only">Full-size photo preview</DialogDescription>
          {v.imageUrl && (
            <img src={v.imageUrl} alt={label} className="max-h-[75vh] w-full bg-muted object-contain" />
          )}
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border p-4">
            <p className="font-display text-lg">{label}</p>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="ghost"
                className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                disabled={busyField === "remove"}
                onClick={() => void handleRemovePhoto()}
              >
                {busyField === "remove" ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" />}
                Remove
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setPreviewOpen(false);
                  fileRef.current?.click();
                }}
              >
                <ImagePlus className="size-4" />
                Replace
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </article>
  );
}

function ToggleRow({
  id,
  label,
  hint,
  checked,
  busy,
  onChange,
}: {
  id: string;
  label: string;
  hint: string;
  checked: boolean;
  busy: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <Label htmlFor={id} className="flex cursor-pointer flex-col items-start gap-0">
        <span>{label}</span>
        <span className="text-xs font-normal text-muted-foreground">{hint}</span>
      </Label>
      <Switch
        id={id}
        checked={checked}
        disabled={busy}
        onCheckedChange={onChange}
        className="data-[state=checked]:bg-brand"
      />
    </div>
  );
}

function ColourForm({
  variant,
  busy,
  onSave,
  onCancel,
}: {
  variant: VariantShape;
  busy: boolean;
  onSave: (colorEn: string | null, colorSi: string | null) => void;
  onCancel: () => void;
}) {
  const [en, setEn] = React.useState(variant.colorEn ?? "");
  const [si, setSi] = React.useState(variant.colorSi ?? "");
  return (
    <form
      className="space-y-2"
      onSubmit={(e) => {
        e.preventDefault();
        onSave(en.trim() || null, si.trim() || null);
      }}
    >
      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1">
          <Label htmlFor={`c-en-${variant.id}`} className="text-xs">Colour (EN)</Label>
          <Input id={`c-en-${variant.id}`} autoFocus value={en} onChange={(e) => setEn(e.target.value)} placeholder="Red" />
        </div>
        <div className="space-y-1">
          <Label htmlFor={`c-si-${variant.id}`} className="text-xs">Colour (SI)</Label>
          <Input id={`c-si-${variant.id}`} value={si} onChange={(e) => setSi(e.target.value)} placeholder="රතු" />
        </div>
      </div>
      <div className="flex justify-end gap-2">
        <Button type="button" size="sm" variant="ghost" onClick={onCancel}>Cancel</Button>
        <Button type="submit" size="sm" disabled={busy}>
          {busy && <Loader2 className="size-4 animate-spin" />}
          Save
        </Button>
      </div>
    </form>
  );
}
