import * as React from "react";
import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { Button } from "@flowers/ui/components/button";
import { Input } from "@flowers/ui/components/input";
import { Label } from "@flowers/ui/components/label";
import { Textarea } from "@flowers/ui/components/textarea";
import { Alert, AlertDescription } from "@flowers/ui/components/alert";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@flowers/ui/components/card";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { createOrderFn } from "../server/orders";
import type { CreateOrderInput, OrderItemInput } from "@flowers/api";
import {
  DISTRICTS,
  ORDER_SOURCES,
  ORDER_SOURCE_LABELS,
  ORDER_UNITS,
  type OrderSource,
} from "@flowers/api/constants";

// ---------------------------------------------------------------------------
// Route
// ---------------------------------------------------------------------------

export const Route = createFileRoute("/orders/new")({
  component: NewOrderPage,
});

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface LineItem {
  descriptionEn: string;
  descriptionSi: string;
  variant: string;
  quantity: string;
  unit: (typeof ORDER_UNITS)[number];
  notes: string;
}

function emptyLine(): LineItem {
  return {
    descriptionEn: "",
    descriptionSi: "",
    variant: "",
    quantity: "",
    unit: "stem",
    notes: "",
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const selectClassName =
  "flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50";

// ---------------------------------------------------------------------------
// Line-item row
// ---------------------------------------------------------------------------

interface LineItemRowProps {
  index: number;
  item: LineItem;
  onChange: (index: number, patch: Partial<LineItem>) => void;
  onRemove: (index: number) => void;
  canRemove: boolean;
}

function LineItemRow({
  index,
  item,
  onChange,
  onRemove,
  canRemove,
}: LineItemRowProps) {
  return (
    <div className="relative rounded-lg border border-border bg-muted/20 p-4 pb-5">
      <div className="mb-3 flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Item {index + 1}
        </span>
        {canRemove && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="size-7 p-0 text-muted-foreground hover:text-destructive"
            onClick={() => onRemove(index)}
            aria-label="Remove item"
          >
            <Trash2 className="size-3.5" />
          </Button>
        )}
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {/* Description EN — required */}
        <div className="space-y-1.5">
          <Label htmlFor={`item-${index}-descriptionEn`}>
            Description (English) <span className="text-destructive">*</span>
          </Label>
          <Input
            id={`item-${index}-descriptionEn`}
            type="text"
            placeholder="e.g. White roses"
            value={item.descriptionEn}
            onChange={(e) => onChange(index, { descriptionEn: e.target.value })}
          />
        </div>

        {/* Description SI */}
        <div className="space-y-1.5">
          <Label htmlFor={`item-${index}-descriptionSi`}>
            Description (Sinhala)
          </Label>
          <Input
            id={`item-${index}-descriptionSi`}
            type="text"
            placeholder="සිංහල (optional)"
            value={item.descriptionSi}
            onChange={(e) =>
              onChange(index, { descriptionSi: e.target.value })
            }
          />
        </div>

        {/* Variant */}
        <div className="space-y-1.5">
          <Label htmlFor={`item-${index}-variant`}>Variant / colour</Label>
          <Input
            id={`item-${index}-variant`}
            type="text"
            placeholder="e.g. Red, 50 cm"
            value={item.variant}
            onChange={(e) => onChange(index, { variant: e.target.value })}
          />
        </div>

        {/* Quantity + unit */}
        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1.5">
            <Label htmlFor={`item-${index}-quantity`}>
              Quantity <span className="text-destructive">*</span>
            </Label>
            <Input
              id={`item-${index}-quantity`}
              type="number"
              min="1"
              step="1"
              inputMode="numeric"
              placeholder="100"
              value={item.quantity}
              onChange={(e) => onChange(index, { quantity: e.target.value })}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`item-${index}-unit`}>Unit</Label>
            <select
              id={`item-${index}-unit`}
              value={item.unit}
              onChange={(e) =>
                onChange(index, {
                  unit: e.target.value as (typeof ORDER_UNITS)[number],
                })
              }
              className={selectClassName}
            >
              {ORDER_UNITS.map((u) => (
                <option key={u} value={u}>
                  {u.charAt(0).toUpperCase() + u.slice(1)}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Notes */}
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor={`item-${index}-notes`}>Notes</Label>
          <Input
            id={`item-${index}-notes`}
            type="text"
            placeholder="Special requirements, packaging, etc."
            value={item.notes}
            onChange={(e) => onChange(index, { notes: e.target.value })}
          />
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

function NewOrderPage() {
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);
  const [serverError, setServerError] = React.useState<string | null>(null);

  // Customer fields
  const [customerName, setCustomerName] = React.useState("");
  const [customerPhone, setCustomerPhone] = React.useState("");
  const [customerEmail, setCustomerEmail] = React.useState("");
  const [customerLocale, setCustomerLocale] = React.useState<"en" | "si">("en");
  const [source, setSource] = React.useState<OrderSource>("whatsapp");

  // Delivery fields
  const [deliveryAddress, setDeliveryAddress] = React.useState("");
  const [deliveryDistrict, setDeliveryDistrict] = React.useState("");
  const [deliveryCity, setDeliveryCity] = React.useState("");
  const [neededByDate, setNeededByDate] = React.useState("");

  // Notes
  const [notesInternal, setNotesInternal] = React.useState("");
  const [notesCustomer, setNotesCustomer] = React.useState("");

  // Line items
  const [items, setItems] = React.useState<LineItem[]>([emptyLine()]);

  function updateItem(index: number, patch: Partial<LineItem>) {
    setItems((prev) =>
      prev.map((item, i) => (i === index ? { ...item, ...patch } : item)),
    );
  }

  function removeItem(index: number) {
    setItems((prev) => prev.filter((_, i) => i !== index));
  }

  function addItem() {
    setItems((prev) => [...prev, emptyLine()]);
  }

  // ---------------------------------------------------------------------------
  // Submit
  // ---------------------------------------------------------------------------

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setServerError(null);

    // Client-side validation of line items
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      if (!it.descriptionEn.trim()) {
        setServerError(`Item ${i + 1}: description (English) is required.`);
        return;
      }
      const qty = parseInt(it.quantity, 10);
      if (!Number.isInteger(qty) || qty <= 0) {
        setServerError(`Item ${i + 1}: quantity must be a positive whole number.`);
        return;
      }
    }

    const payload: CreateOrderInput = {
      customerName: customerName.trim(),
      customerPhone: customerPhone.trim(),
      customerEmail: customerEmail.trim() || null,
      customerLocale,
      source,
      deliveryAddress: deliveryAddress.trim() || null,
      deliveryDistrict: deliveryDistrict || null,
      deliveryCity: deliveryCity.trim() || null,
      neededByDate: neededByDate || null,
      notesInternal: notesInternal.trim() || null,
      notesCustomer: notesCustomer.trim() || null,
      items: items.map(
        (it): OrderItemInput => ({
          descriptionEn: it.descriptionEn.trim(),
          descriptionSi: it.descriptionSi.trim() || null,
          variant: it.variant.trim() || null,
          quantity: parseInt(it.quantity, 10),
          unit: it.unit,
          notes: it.notes.trim() || null,
        }),
      ),
    };

    setBusy(true);
    try {
      const result = await createOrderFn({ data: payload });
      if (result.ok) {
        await router.navigate({
          to: "/orders/$orderId",
          params: { orderId: result.data.id },
        });
      } else {
        setServerError(result.message ?? "Failed to create order.");
      }
    } catch (err) {
      setServerError(
        err instanceof Error ? err.message : "An unexpected error occurred.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <Link
        to="/orders"
        className="text-sm text-muted-foreground hover:text-foreground"
      >
        Back to orders
      </Link>

      <div className="space-y-1">
        <h1 className="font-display text-3xl">New order</h1>
        <p className="text-sm text-muted-foreground">
          Create a manual order on behalf of a customer.
        </p>
      </div>

      {serverError && (
        <Alert variant="destructive">
          <AlertDescription>{serverError}</AlertDescription>
        </Alert>
      )}

      <form onSubmit={(e) => void handleSubmit(e)} className="space-y-6" noValidate>
        {/* Customer details */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Customer details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="customerName">
                  Name <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="customerName"
                  type="text"
                  placeholder="Full name"
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="customerPhone">
                  Phone <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="customerPhone"
                  type="tel"
                  placeholder="+94 77 123 4567"
                  value={customerPhone}
                  onChange={(e) => setCustomerPhone(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="customerEmail">Email</Label>
                <Input
                  id="customerEmail"
                  type="email"
                  placeholder="customer@example.com"
                  value={customerEmail}
                  onChange={(e) => setCustomerEmail(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="customerLocale">Preferred language</Label>
                <select
                  id="customerLocale"
                  value={customerLocale}
                  onChange={(e) =>
                    setCustomerLocale(e.target.value as "en" | "si")
                  }
                  className={selectClassName}
                >
                  <option value="en">English</option>
                  <option value="si">Sinhala / සිංහල</option>
                </select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="orderSource">Order source</Label>
                <select
                  id="orderSource"
                  value={source}
                  onChange={(e) => setSource(e.target.value as OrderSource)}
                  className={selectClassName}
                >
                  {ORDER_SOURCES.map((s) => (
                    <option key={s} value={s}>
                      {ORDER_SOURCE_LABELS[s]}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Delivery */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Delivery</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="deliveryAddress">Address</Label>
                <Textarea
                  id="deliveryAddress"
                  rows={2}
                  placeholder="Street, town"
                  value={deliveryAddress}
                  onChange={(e) => setDeliveryAddress(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="deliveryDistrict">District</Label>
                <select
                  id="deliveryDistrict"
                  value={deliveryDistrict}
                  onChange={(e) => setDeliveryDistrict(e.target.value)}
                  className={selectClassName}
                >
                  <option value="">Select district…</option>
                  {DISTRICTS.map((d) => (
                    <option key={d.slug} value={d.slug}>
                      {d.nameEn}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="deliveryCity">City</Label>
                <Input
                  id="deliveryCity"
                  type="text"
                  placeholder="City or town"
                  value={deliveryCity}
                  onChange={(e) => setDeliveryCity(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="neededByDate">Needed by</Label>
                <Input
                  id="neededByDate"
                  type="date"
                  value={neededByDate}
                  onChange={(e) => setNeededByDate(e.target.value)}
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Line items */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Order items</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {items.map((item, index) => (
              <LineItemRow
                key={index}
                index={index}
                item={item}
                onChange={updateItem}
                onRemove={removeItem}
                canRemove={items.length > 1}
              />
            ))}
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={addItem}
              className="w-full"
            >
              <Plus className="mr-1.5 size-4" />
              Add item
            </Button>
          </CardContent>
        </Card>

        {/* Notes */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Notes</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="notesInternal">Internal notes</Label>
              <Textarea
                id="notesInternal"
                rows={2}
                placeholder="Visible to admin only"
                value={notesInternal}
                onChange={(e) => setNotesInternal(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="notesCustomer">Customer notes</Label>
              <Textarea
                id="notesCustomer"
                rows={2}
                placeholder="Shared with customer"
                value={notesCustomer}
                onChange={(e) => setNotesCustomer(e.target.value)}
              />
            </div>
          </CardContent>
        </Card>

        <div className="flex gap-3">
          <Button
            type="submit"
            variant="brand"
            disabled={busy}
          >
            {busy ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
            {busy ? "Creating…" : "Create order"}
          </Button>
          <Button type="button" variant="outline" asChild>
            <Link to="/orders">Cancel</Link>
          </Button>
        </div>
      </form>
    </div>
  );
}
