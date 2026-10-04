import * as React from "react";
import { ImagePlus, X } from "lucide-react";

// Mirror the server limits (enforced authoritatively in uploadProductImageFn +
// addProductImage). Kept as local constants so this client file never imports
// the @flowers/api barrel (which would pull postgres into the browser bundle).
export const MAX_IMAGES = 5;
const MAX_BYTES = 5 * 1024 * 1024; // 5 MB
const ACCEPTED = ["image/jpeg", "image/png", "image/webp"];

/**
 * Client-side multi-image picker (up to 5, ≤5 MB, JPEG/PNG/WebP) with previews.
 * Holds File objects; the parent uploads them after the product is created.
 */
export function ProductImagePicker({
  files,
  onChange,
  disabled,
}: {
  files: File[];
  onChange: (files: File[]) => void;
  disabled?: boolean;
}) {
  const [error, setError] = React.useState<string | null>(null);
  const inputRef = React.useRef<HTMLInputElement>(null);

  function addFiles(selected: FileList | null) {
    if (!selected) return;
    setError(null);
    const incoming = Array.from(selected);
    const accepted: File[] = [];
    for (const f of incoming) {
      if (!ACCEPTED.includes(f.type)) {
        setError("Images must be JPEG, PNG, or WebP.");
        continue;
      }
      if (f.size > MAX_BYTES) {
        setError(`"${f.name}" is larger than 5 MB.`);
        continue;
      }
      accepted.push(f);
    }
    const combined = [...files, ...accepted];
    if (combined.length > MAX_IMAGES) {
      setError(`You can add up to ${MAX_IMAGES} photos.`);
    }
    onChange(combined.slice(0, MAX_IMAGES));
    if (inputRef.current) inputRef.current.value = "";
  }

  function removeAt(index: number) {
    onChange(files.filter((_, i) => i !== index));
  }

  const full = files.length >= MAX_IMAGES;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium">Photos</span>
        <span className="text-xs text-muted-foreground">
          {files.length}/{MAX_IMAGES} · first photo is the cover
        </span>
      </div>

      <div className="flex flex-wrap gap-3">
        {files.map((file, i) => (
          <div
            key={`${file.name}-${i}`}
            className="group relative size-24 overflow-hidden rounded-lg border border-border bg-muted"
          >
            <img
              src={URL.createObjectURL(file)}
              alt={file.name}
              className="size-full object-cover"
              onLoad={(e) => URL.revokeObjectURL(e.currentTarget.src)}
            />
            {i === 0 && (
              <span className="absolute left-1 top-1 rounded bg-brand px-1.5 py-0.5 text-[10px] font-medium text-brand-foreground">
                Cover
              </span>
            )}
            <button
              type="button"
              onClick={() => removeAt(i)}
              disabled={disabled}
              aria-label="Remove photo"
              className="absolute right-1 top-1 flex size-5 items-center justify-center rounded-full bg-background/90 text-foreground shadow transition-opacity hover:bg-background"
            >
              <X className="size-3" />
            </button>
          </div>
        ))}

        {!full && (
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={disabled}
            className="flex size-24 flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-border text-muted-foreground transition-colors hover:border-brand/50 hover:text-foreground disabled:opacity-50"
          >
            <ImagePlus className="size-5" />
            <span className="text-xs">Add photo</span>
          </button>
        )}
      </div>

      <input
        ref={inputRef}
        type="file"
        accept={ACCEPTED.join(",")}
        multiple
        className="sr-only"
        onChange={(e) => addFiles(e.target.files)}
      />

      {error && <p className="text-xs text-destructive">{error}</p>}
      <p className="text-xs text-muted-foreground">
        Up to {MAX_IMAGES} photos, 5 MB each (JPEG, PNG, or WebP).
      </p>
    </div>
  );
}
