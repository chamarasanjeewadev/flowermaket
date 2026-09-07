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
  onSubmit,
  onSuccess,
}: ProductFormProps) {
  const { t } = useT();
  const [serverError, setServerError] = React.useState<string | null>(null);

  const form = useForm({
    defaultValues: {
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
        categoryId: value.categoryId,
        nameEn: value.nameEn.trim(),
        nameSi: value.nameSi.trim() || null,
        descriptionEn: value.descriptionEn.trim() || null,
        descriptionSi: value.descriptionSi.trim() || null,
        listingType: value.listingType,
        price: toCents(value.price) ?? 0,
        compareAtPrice: toCents(value.compareAtPrice),
        stockQty: toIntOrNull(value.stockQty),
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

      {/* Category (flower type) — required */}
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

      {/* Name (Sinhala) */}
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

        {/* Available quantity */}
        <form.Field name="stockQty">
          {(field) => (
            <div className="space-y-1.5">
              <Label htmlFor={field.name}>{t.products.stockQty}</Label>
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
              <p className="text-xs text-muted-foreground">
                {t.products.stockHint}
              </p>
            </div>
          )}
        </form.Field>

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
                <option value="active">{t.products.statusActive}</option>
              </select>
              <p className="text-xs text-muted-foreground">
                {t.products.publishHint}
              </p>
            </div>
          )}
        </form.Field>
      )}

      <form.Subscribe selector={(state) => [state.canSubmit, state.isSubmitting]}>
        {([canSubmit, isSubmitting]) => (
          <Button
            type="submit"
            variant="brand"
            disabled={!canSubmit || isSubmitting}
          >
            {isSubmitting ? (
              <Loader2 className="mr-2 size-4 animate-spin" />
            ) : null}
            {isSubmitting ? submittingLabel : submitLabel}
          </Button>
        )}
      </form.Subscribe>
    </form>
  );
}
