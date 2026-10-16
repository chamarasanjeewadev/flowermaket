import * as React from "react";
import { useForm } from "@tanstack/react-form";
import { Button } from "@flowers/ui/components/button";
import { Input } from "@flowers/ui/components/input";
import { Label } from "@flowers/ui/components/label";
import { Textarea } from "@flowers/ui/components/textarea";
import { Alert, AlertDescription } from "@flowers/ui/components/alert";
import { Loader2 } from "lucide-react";
import { useT } from "../i18n/react";
import type { CategoryOption } from "@flowers/api";

export type ListingType = "retail" | "wholesale";
export type ProductStatus = "draft" | "active" | "paused" | "archived";

/** Normalized payload the form emits (money already in LKR cents). */
export interface ProductFormPayload {
  flowerSpeciesEn: string | null;
  occasionTagsEn: string[];
  categoryId: string;
  nameEn: string;
  nameSi: string | null;
  descriptionEn: string | null;
  descriptionSi: string | null;
  listingType: ListingType;
  price: number;
  compareAtPrice: number | null;
  stockQty: number | null;
  minOrderQty: number | null;
  leadTimeDays: number | null;
  status?: ProductStatus;
}

export interface ProductFormInitial {
  flowerSpeciesEn?: string | null;
  occasionTagsEn?: string[];
  categoryId?: string;
  nameEn?: string;
  nameSi?: string | null;
  descriptionEn?: string | null;
  descriptionSi?: string | null;
  listingType?: ListingType;
  price?: number | null;
  compareAtPrice?: number | null;
  stockQty?: number | null;
  minOrderQty?: number | null;
  leadTimeDays?: number | null;
  status?: ProductStatus;
}

interface ProductFormProps {
  categories: CategoryOption[];
  initial?: ProductFormInitial;
  /** Show the draft/active visibility select (create flow). */
  showStatus?: boolean;
  submitLabel: string;
  submittingLabel: string;
  /** Optional content rendered just above the submit button (e.g. image picker). */
  beforeSubmit?: React.ReactNode;
  onSubmit: (
    payload: ProductFormPayload,
  ) => Promise<{ ok: boolean; message?: string }>;
  onSuccess?: () => void;
}

// --- Rupees <-> cents helpers (money is stored as integer LKR cents) ---------
function fromCents(cents: number | null | undefined): string {
  if (cents == null) return "";
  return (cents / 100).toString();
}
function toCents(v: string): number | null {
  const s = v.trim();
  if (!s) return null;
  const n = Number(s);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 100);
}
function toIntOrNull(v: string): number | null {
  const s = v.trim();
  if (!s) return null;
  const n = Number(s);
  if (!Number.isInteger(n) || n < 0) return null;
  return n;
}

const selectClassName =
  "flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50";

export function ProductForm({
  categories,
  initial,
  showStatus,
  submitLabel,
  submittingLabel,
  beforeSubmit,
  onSubmit,
  onSuccess,
}: ProductFormProps) {
  const { t, locale } = useT();
  const [preview, setPreview] = React.useState(false);
  const [serverError, setServerError] = React.useState<string | null>(null);

  const form = useForm({
    defaultValues: {
      flowerSpeciesEn: initial?.flowerSpeciesEn ?? "",
      occasionTagsEn: initial?.occasionTagsEn?.join(", ") ?? "",
      availability: initial?.stockQty == null ? "made_to_order" : initial.stockQty === 0 ? "unavailable" : "in_stock",
      categoryId: initial?.categoryId ?? "",
      nameEn: initial?.nameEn ?? "",
      nameSi: initial?.nameSi ?? "",
      descriptionEn: initial?.descriptionEn ?? "",
      descriptionSi: initial?.descriptionSi ?? "",
      listingType: (initial?.listingType ?? "retail") as ListingType,
      price: fromCents(initial?.price),
      compareAtPrice: fromCents(initial?.compareAtPrice),
      stockQty:
        initial?.stockQty == null ? "" : String(initial.stockQty),
      minOrderQty:
        initial?.minOrderQty == null ? "" : String(initial.minOrderQty),
      leadTimeDays:
        initial?.leadTimeDays == null ? "" : String(initial.leadTimeDays),
      status: (initial?.status ?? "draft") as ProductStatus,
    },
    onSubmit: async ({ value }) => {
      setServerError(null);
      const payload: ProductFormPayload = {
        flowerSpeciesEn: value.flowerSpeciesEn.trim() || null,
        occasionTagsEn: value.occasionTagsEn.split(",").map(tag => tag.trim()).filter(Boolean),
        categoryId: value.categoryId,
        nameEn: value.nameEn.trim(),
        nameSi: value.nameSi.trim() || null,
        descriptionEn: value.descriptionEn.trim() || null,
        descriptionSi: value.descriptionSi.trim() || null,
        listingType: value.listingType,
        price: toCents(value.price) ?? 0,
        compareAtPrice: toCents(value.compareAtPrice),
        stockQty: value.availability === "made_to_order" ? null : value.availability === "unavailable" ? 0 : toIntOrNull(value.stockQty),
        minOrderQty: toIntOrNull(value.minOrderQty),
        leadTimeDays: toIntOrNull(value.leadTimeDays),
        ...(showStatus ? { status: value.status } : {}),
      };
      const result = await onSubmit(payload);
      if (!result.ok) {
        setServerError(result.message ?? t.common.error);
        return;
      }
      onSuccess?.();
    },
  });

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        e.stopPropagation();
        void form.handleSubmit();
      }}
      className="space-y-4"
      noValidate
    >
      {serverError && (
        <Alert variant="destructive">
          <AlertDescription>{serverError}</AlertDescription>
        </Alert>
      )}

      <h2 className="text-lg font-semibold">{locale === "si" ? "විස්තර" : "Details"}</h2>
      {/* Product category — required */}
      <form.Field
        name="categoryId"
        validators={{
          onBlur: ({ value }) =>
            !value ? t.products.categoryPlaceholder : undefined,
        }}
      >
        {(field) => (
          <div className="space-y-1.5">
            <Label htmlFor={field.name}>
              {t.products.category} <span className="text-destructive">*</span>
            </Label>
            <select
              id={field.name}
              name={field.name}
              value={field.state.value}
              onBlur={field.handleBlur}
              onChange={(e) => field.handleChange(e.target.value)}
              className={selectClassName}
            >
              <option value="">{t.products.categoryPlaceholder}</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nameEn}
                </option>
              ))}
            </select>
            {field.state.meta.isTouched &&
              field.state.meta.errors.length > 0 && (
                <p className="text-xs text-destructive">
                  {field.state.meta.errors[0]}
                </p>
              )}
          </div>
        )}
      </form.Field>

      {/* Name (English) — required */}
      <form.Field
        name="nameEn"
        validators={{
          onBlur: ({ value }) => {
            const v = value.trim();
            if (!v || v.length < 2 || v.length > 100)
              return t.products.nameEn;
            return undefined;
          },
        }}
      >
        {(field) => (
          <div className="space-y-1.5">
            <Label htmlFor={field.name}>
              {t.products.nameEn} <span className="text-destructive">*</span>
            </Label>
            <Input
              id={field.name}
              name={field.name}
              type="text"
              placeholder={t.products.nameEnPlaceholder}
              value={field.state.value}
              onBlur={field.handleBlur}
              onChange={(e) => field.handleChange(e.target.value)}
            />
            {field.state.meta.isTouched &&
              field.state.meta.errors.length > 0 && (
                <p className="text-xs text-destructive">
                  {field.state.meta.errors[0]}
                </p>
              )}
          </div>
        )}
      </form.Field>

      {/* Description (English) */}
      <form.Field name="descriptionEn">
        {(field) => (
          <div className="space-y-1.5">
            <Label htmlFor={field.name}>{t.products.descriptionEn}</Label>
            <Textarea
              id={field.name}
              name={field.name}
              rows={3}
              value={field.state.value}
              onBlur={field.handleBlur}
              onChange={(e) => field.handleChange(e.target.value)}
            />
          </div>
        )}
      </form.Field>

      <details className="rounded-lg border border-border p-3"><summary className="min-h-11 cursor-pointer py-2 text-sm">{locale === "si" ? "විකල්ප සිංහල පරිවර්තන" : "Optional Sinhala translations"}</summary><div className="space-y-4 pt-3">      {/* Name (Sinhala) */}
      <form.Field name="nameSi">
        {(field) => (
          <div className="space-y-1.5">
            <Label htmlFor={field.name}>{t.products.nameSi}</Label>
            <Input
              id={field.name}
              name={field.name}
              type="text"
              placeholder={t.products.nameSiPlaceholder}
              value={field.state.value}
              onBlur={field.handleBlur}
              onChange={(e) => field.handleChange(e.target.value)}
            />
          </div>
        )}
      </form.Field>

      {/* Description (Sinhala) */}
      <form.Field name="descriptionSi">
        {(field) => (
          <div className="space-y-1.5">
            <Label htmlFor={field.name}>{t.products.descriptionSi}</Label>
            <Textarea
              id={field.name}
              name={field.name}
              rows={3}
              value={field.state.value}
              onBlur={field.handleBlur}
              onChange={(e) => field.handleChange(e.target.value)}
            />
          </div>
        )}
      </form.Field>

</div></details>
      <section className="space-y-3 border-t border-border pt-4"><h2 className="font-semibold">{locale === "si" ? "මල් වර්ගය සහ අවස්ථා" : "Flower species & occasions"}</h2>
        <form.Field name="flowerSpeciesEn">{field => <div className="space-y-2"><Label htmlFor="flower-species">{locale === "si" ? "මල් වර්ගය (විකල්පයි)" : "Flower species (optional)"}</Label><Input id="flower-species" maxLength={200} value={field.state.value} onChange={e => field.handleChange(e.target.value)} /></div>}</form.Field>
        <form.Field name="occasionTagsEn">{field => <div className="space-y-2"><Label htmlFor="occasion-tags">{locale === "si" ? "අවස්ථා (කොමාවෙන් වෙන් කරන්න)" : "Occasion tags (comma separated, optional)"}</Label><Input id="occasion-tags" maxLength={500} value={field.state.value} onChange={e => field.handleChange(e.target.value)} /></div>}</form.Field>
      </section>
      <h2 className="border-t border-border pt-5 text-lg font-semibold">{locale === "si" ? "මිල සහ ලබා ගත හැකි බව" : "Pricing & availability"}</h2>
      {/* Selling type */}
      <form.Field name="listingType">
        {(field) => (
          <div className="space-y-1.5">
            <Label htmlFor={field.name}>{t.products.listingType}</Label>
            <select
              id={field.name}
              name={field.name}
              value={field.state.value}
              onBlur={field.handleBlur}
              onChange={(e) =>
                field.handleChange(e.target.value as ListingType)
              }
              className={selectClassName}
            >
              <option value="retail">{t.products.listingRetail}</option>
              <option value="wholesale">{t.products.listingWholesale}</option>
            </select>
          </div>
        )}
      </form.Field>

      <div className="grid gap-4 sm:grid-cols-2">
        {/* Price — required */}
        <form.Field
          name="price"
          validators={{
            onBlur: ({ value }) => {
              const cents = toCents(value);
              if (cents == null || cents <= 0) return t.products.price;
              return undefined;
            },
          }}
        >
          {(field) => (
            <form.Subscribe selector={(s) => s.values.listingType}>
              {(listingType) => (
                <div className="space-y-1.5">
                  <Label htmlFor={field.name}>
                    {t.products.price}{" "}
                    <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    id={field.name}
                    name={field.name}
                    type="number"
                    min="0"
                    step="0.01"
                    inputMode="decimal"
                    value={field.state.value}
                    onBlur={field.handleBlur}
                    onChange={(e) => field.handleChange(e.target.value)}
                  />
                  <p className="text-xs text-muted-foreground">
                    {listingType === "wholesale"
                      ? t.products.priceWholesaleHint
                      : t.products.priceHint}
                  </p>
                  {field.state.meta.isTouched &&
                    field.state.meta.errors.length > 0 && (
                      <p className="text-xs text-destructive">
                        {field.state.meta.errors[0]}
                      </p>
                    )}
                </div>
              )}
            </form.Subscribe>
          )}
        </form.Field>

        {/* Compare-at price */}
        <form.Field name="compareAtPrice">
          {(field) => (
            <div className="space-y-1.5">
              <Label htmlFor={field.name}>{t.products.compareAtPrice}</Label>
              <Input
                id={field.name}
                name={field.name}
                type="number"
                min="0"
                step="0.01"
                inputMode="decimal"
                value={field.state.value}
                onBlur={field.handleBlur}
                onChange={(e) => field.handleChange(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                {t.products.compareAtHint}
              </p>
            </div>
          )}
        </form.Field>

        <form.Field name="availability">{field => <div className="space-y-2"><Label htmlFor="availability">{locale === "si" ? "ලබා ගත හැකි බව" : "Availability"}</Label><select id="availability" className={selectClassName} value={field.state.value} onChange={e => { field.handleChange(e.target.value); if (e.target.value === "in_stock") form.setFieldValue("stockQty", "1"); }}><option value="in_stock">{locale === "si" ? "තොග ඇත" : "In stock"}</option><option value="made_to_order">{locale === "si" ? "ඇණවුමට සකස් කරයි" : "Made to order"}</option><option value="unavailable">{locale === "si" ? "දැනට නොමැත" : "Unavailable"}</option></select></div>}</form.Field>
      {/* Available quantity */}
        <form.Subscribe selector={state => state.values.availability}>{availability => availability === "in_stock" ? <form.Field name="stockQty" validators={{ onChange: ({ value }) => !Number.isSafeInteger(Number(value)) || Number(value) < 1 ? "Enter a quantity of at least 1." : undefined }}>
          {(field) => (
            <div className="space-y-1.5">
              <Label htmlFor={field.name}>{t.products.stockQty}</Label>
              <Input
                id={field.name}
                name={field.name}
                type="number"
                min="1"
                step="1"
                inputMode="numeric"
                value={field.state.value}
                onBlur={field.handleBlur}
                onChange={(e) => field.handleChange(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                {field.state.meta.errors[0] ?? t.products.stockHint}
              </p>
            </div>
          )}
        </form.Field> : null}</form.Subscribe>

        {/* Minimum order quantity — most relevant for wholesale */}
        <form.Subscribe selector={(s) => s.values.listingType}>
          {(listingType) =>
            listingType === "wholesale" ? (
              <form.Field name="minOrderQty">
                {(field) => (
                  <div className="space-y-1.5">
                    <Label htmlFor={field.name}>
                      {t.products.minOrderQty}
                    </Label>
                    <Input
                      id={field.name}
                      name={field.name}
                      type="number"
                      min="1"
                      step="1"
                      inputMode="numeric"
                      value={field.state.value}
                      onBlur={field.handleBlur}
                      onChange={(e) => field.handleChange(e.target.value)}
                    />
                    <p className="text-xs text-muted-foreground">
                      {t.products.minOrderHint}
                    </p>
                  </div>
                )}
              </form.Field>
            ) : null
          }
        </form.Subscribe>

        {/* Lead time */}
        <form.Field name="leadTimeDays">
          {(field) => (
            <div className="space-y-1.5">
              <Label htmlFor={field.name}>{t.products.leadTimeDays}</Label>
              <Input
                id={field.name}
                name={field.name}
                type="number"
                min="0"
                step="1"
                inputMode="numeric"
                value={field.state.value}
                onBlur={field.handleBlur}
                onChange={(e) => field.handleChange(e.target.value)}
              />
            </div>
          )}
        </form.Field>
      </div>

      {beforeSubmit}
      <h2 className="border-t border-border pt-5 text-lg font-semibold">{locale === "si" ? "ප්‍රකාශනය" : "Publishing"}</h2>
      {/* Visibility (create flow only) */}
      {showStatus && (
        <form.Field name="status">
          {(field) => (
            <div className="space-y-1.5">
              <Label htmlFor={field.name}>{t.products.status}</Label>
              <select
                id={field.name}
                name={field.name}
                value={field.state.value}
                onBlur={field.handleBlur}
                onChange={(e) =>
                  field.handleChange(e.target.value as ProductStatus)
                }
                className={selectClassName}
              >
                <option value="draft">{t.products.statusDraft}</option>
                <option value="active">{locale === "si" ? "සමාලෝචනයට ඉදිරිපත් කරන්න" : "Submit for review"}</option>
              </select>
              <p className="text-xs text-muted-foreground">
                {t.products.publishHint}
              </p>
            </div>
          )}
        </form.Field>
      )}

      <Button type="button" variant="outline" onClick={() => setPreview(!preview)}>{locale === "si" ? "පෙරදසුන" : "Preview"}</Button>
      {preview && <form.Subscribe selector={state => state.values}>{values => <section aria-label="Product preview" className="rounded-xl border border-border bg-card p-5"><h2 className="font-display text-2xl">{values.nameEn || "Untitled product"}</h2><p className="mt-2 whitespace-pre-wrap">{values.descriptionEn}</p><p className="mt-3 font-semibold">LKR {values.price || "0"}</p><p className="text-sm text-muted-foreground">{values.availability.replaceAll("_", " ")}</p></section>}</form.Subscribe>}

      <form.Subscribe selector={(state) => [state.canSubmit, state.isSubmitting, state.values.status] as const}>
        {([canSubmit, isSubmitting, status]) => (
          <Button
            type="submit"
            variant="brand"
            disabled={!canSubmit || isSubmitting}
          >
            {isSubmitting ? (
              <Loader2 className="mr-2 size-4 animate-spin" />
            ) : null}
            {isSubmitting ? submittingLabel : showStatus ? status === "active" ? (locale === "si" ? "සමාලෝචනයට ඉදිරිපත් කරන්න" : "Submit for review") : (locale === "si" ? "කෙටුම්පත සුරකින්න" : "Save draft") : submitLabel}
          </Button>
        )}
      </form.Subscribe>
    </form>
  );
}
