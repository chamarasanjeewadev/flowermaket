import * as React from "react";
import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import {
  Check,
  ExternalLink,
  MapPin,
  MessageCircle,
  Package,
  Pencil,
  Phone,
  Plus,
  Search,
  Store,
  X,
} from "lucide-react";
import { Button } from "@flowers/ui/components/button";
import { Badge } from "@flowers/ui/components/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@flowers/ui/components/table";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@flowers/ui/components/sheet";
import { Separator } from "@flowers/ui/components/separator";
import { Textarea } from "@flowers/ui/components/textarea";
import { buildWhatsappLink } from "@flowers/integrations";
import { DISTRICTS, SELLER_TYPES, type SellerType } from "@flowers/api/constants";
import { Input } from "@flowers/ui/components/input";
import { cn } from "@flowers/ui/lib/utils";
import {
  listSuppliersForReview,
  reviewSupplierFn,
  setSupplierSellerTypesFn,
} from "../server/suppliers";
import { getPortalUrlsFn } from "../server/products";
import {
  SELLER_TYPE_META,
  SellerTypeChips,
  SellerTypeCheckboxes,
} from "../components/seller-types";
import type { ReviewableShop, VerificationStatus } from "@flowers/api";

// --- formatting helpers ----------------------------------------------------

const DISTRICT_NAME = new Map(DISTRICTS.map((d) => [d.slug, d.nameEn]));

/** Title-case a raw string ("chamara sanjeewa" → "Chamara Sanjeewa"). */
function titleCase(s: string | null | undefined): string {
  if (!s) return "";
  return s
    .trim()
    .split(/\s+/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

/** Human district name from a slug ("nuwara-eliya" → "Nuwara Eliya"). */
function districtName(slug: string): string {
  return DISTRICT_NAME.get(slug) ?? titleCase(slug.replace(/-/g, " "));
}

function locationLabel(shop: Pick<ReviewableShop, "city" | "district">): string {
  return [titleCase(shop.city), districtName(shop.district)]
    .filter(Boolean)
    .join(", ");
}

export const Route = createFileRoute("/suppliers/")({
  loader: async () => {
    const [suppliers, urls] = await Promise.all([
      listSuppliersForReview({ data: {} }),
      getPortalUrlsFn(),
    ]);
    return { suppliers, urls };
  },
  component: SuppliersPage,
});

// --- presentation helpers --------------------------------------------------

type BadgeVariant = React.ComponentProps<typeof Badge>["variant"];

const STATUS_VARIANT: Record<VerificationStatus, BadgeVariant> = {
  verified: "success",
  pending: "warning",
  unverified: "outline",
  rejected: "destructive",
};

function ProductCount({ shop }: { shop: ReviewableShop }) {
  const empty = shop.activeProductCount === 0;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 text-sm",
        empty ? "font-medium text-warning" : "text-muted-foreground",
      )}
      title={`${shop.activeProductCount} active of ${shop.totalProductCount} total`}
    >
      <Package className="size-3.5" aria-hidden="true" />
      {shop.activeProductCount}
      {shop.totalProductCount > shop.activeProductCount && (
        <span className="text-xs text-muted-foreground">
          {" "}/ {shop.totalProductCount}
        </span>
      )}
    </span>
  );
}

const STATUS_FILTERS: Array<{ value: VerificationStatus | "all"; label: string }> = [
  { value: "all", label: "All" },
  { value: "pending", label: "Pending" },
  { value: "verified", label: "Verified" },
  { value: "unverified", label: "Unverified" },
  { value: "rejected", label: "Rejected" },
];

function waMessage(shop: ReviewableShop) {
  const name = shop.ownerFullName || shop.nameEn;
  return `Hi ${name}, this is FlowerMarket.lk about your supplier account "${shop.nameEn}".`;
}

// --- page ------------------------------------------------------------------

function SuppliersPage() {
  const { suppliers, urls } = Route.useLoaderData();
  const router = useRouter();
  const [selected, setSelected] = React.useState<ReviewableShop | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [rejectNote, setRejectNote] = React.useState("");
  const [rejecting, setRejecting] = React.useState(false);
  const [statusFilter, setStatusFilter] = React.useState<VerificationStatus | "all">("all");
  const [typeFilter, setTypeFilter] = React.useState<SellerType | "all">("all");
  const [query, setQuery] = React.useState("");

  const q = query.trim().toLowerCase();
  const visible = suppliers.filter(
    (s) =>
      (statusFilter === "all" || s.verificationStatus === statusFilter) &&
      (typeFilter === "all" || s.sellerTypes.includes(typeFilter)) &&
      (!q ||
        s.nameEn.toLowerCase().includes(q) ||
        s.ownerEmail.toLowerCase().includes(q) ||
        (s.ownerPhone ?? "").includes(q)),
  );
  const emptyStorefronts = suppliers.filter(
    (s) => s.verificationStatus === "verified" && s.activeProductCount === 0,
  ).length;

  async function review(shopId: string, status: VerificationStatus, notes?: string) {
    setBusy(true);
    try {
      const result = await reviewSupplierFn({ data: { shopId, status, notes } });
      if (result.ok) {
        await router.invalidate();
        setSelected(null);
        setRejecting(false);
        setRejectNote("");
      }
    } finally {
      setBusy(false);
    }
  }

  const pending = suppliers.filter((s) => s.verificationStatus === "pending").length;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="space-y-1">
          <h1 className="font-display text-3xl">Suppliers</h1>
          <p className="text-sm text-muted-foreground">
            {suppliers.length} shops
            {pending > 0 ? (
              <> · <span className="font-medium text-warning">{pending} awaiting review</span></>
            ) : null}
            {emptyStorefronts > 0 ? (
              <> · <span className="font-medium text-warning">{emptyStorefronts} verified with no active products</span></>
            ) : null}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button asChild variant="outline">
            <Link to="/suppliers/invite">
              <MessageCircle className="size-4" /> Invite via WhatsApp
            </Link>
          </Button>
          <Button asChild>
            <Link to="/suppliers/new">
              <Plus className="size-4" /> Create supplier
            </Link>
          </Button>
        </div>
      </div>

      {suppliers.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border py-16 text-center">
          <Store className="size-8 text-muted-foreground/40" />
          <p className="text-sm text-muted-foreground">No suppliers yet.</p>
        </div>
      ) : (
        <>
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-wrap gap-1.5">
            {STATUS_FILTERS.map((f) => (
              <button
                key={f.value}
                type="button"
                onClick={() => setStatusFilter(f.value)}
                className={cn(
                  "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                  statusFilter === f.value
                    ? "border-foreground bg-foreground text-background"
                    : "border-border text-muted-foreground hover:text-foreground",
                )}
              >
                {f.label}
              </button>
            ))}
            <span className="mx-1 w-px self-stretch bg-border" aria-hidden="true" />
            {(["all", ...SELLER_TYPES] as const).map((type) => (
              <button
                key={type}
                type="button"
                onClick={() => setTypeFilter(type)}
                className={cn(
                  "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                  typeFilter === type
                    ? "border-foreground bg-foreground text-background"
                    : "border-border text-muted-foreground hover:text-foreground",
                )}
              >
                {type === "all" ? "All types" : SELLER_TYPE_META[type].label}
              </button>
            ))}
          </div>
          <div className="relative lg:w-64">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search name, email, phone"
              className="pl-8"
            />
          </div>
        </div>
        <div className="overflow-x-auto rounded-xl border border-border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Shop</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Products</TableHead>
                <TableHead>Location</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {visible.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="py-10 text-center text-sm text-muted-foreground">
                    No suppliers match these filters.
                  </TableCell>
                </TableRow>
              )}
              {visible.map((s) => {
                const wa = buildWhatsappLink(s.ownerPhone, waMessage(s));
                return (
                  <TableRow
                    key={s.id}
                    className="cursor-pointer"
                    onClick={() => setSelected(s)}
                  >
                    <TableCell>
                      <div className="font-medium">{s.nameEn}</div>
                      <div className="text-xs text-muted-foreground">{s.ownerEmail}</div>
                    </TableCell>
                    <TableCell><SellerTypeChips types={s.sellerTypes} /></TableCell>
                    <TableCell><ProductCount shop={s} /></TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {locationLabel(s)}
                    </TableCell>
                    <TableCell>
                      <Badge variant={STATUS_VARIANT[s.verificationStatus]}>
                        {s.verificationStatus}
                      </Badge>
                    </TableCell>
                    <TableCell
                      className="text-right"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <div className="flex items-center justify-end gap-1">
                        {wa && (
                          <Button asChild size="icon" variant="ghost" title="Message on WhatsApp">
                            <a href={wa} target="_blank" rel="noopener noreferrer">
                              <MessageCircle className="size-4" />
                            </a>
                          </Button>
                        )}
                        <Button size="sm" variant="outline" onClick={() => setSelected(s)}>
                          View
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
        </>
      )}

      <SupplierSheet
        supplierPortalUrl={urls.supplierPortalUrl ?? "https://supplier.flowermarket.lk"}
        webUrl={urls.webUrl}
        shop={
          selected
            ? (suppliers.find((x) => x.id === selected.id) ?? selected)
            : null
        }
        busy={busy}
        rejecting={rejecting}
        rejectNote={rejectNote}
        onRejectNote={setRejectNote}
        onStartReject={() => setRejecting(true)}
        onCancelReject={() => setRejecting(false)}
        onClose={() => {
          setSelected(null);
          setRejecting(false);
        }}
        onVerify={(id) => review(id, "verified")}
        onReject={(id) => review(id, "rejected", rejectNote.trim() || undefined)}
      />
    </div>
  );
}

// --- detail sheet ----------------------------------------------------------

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-0.5">
      <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      <div className="text-sm">{children || <span className="text-muted-foreground">—</span>}</div>
    </div>
  );
}

function SupplierSheet({
  supplierPortalUrl,
  webUrl,
  shop,
  busy,
  rejecting,
  rejectNote,
  onRejectNote,
  onStartReject,
  onCancelReject,
  onClose,
  onVerify,
  onReject,
}: {
  supplierPortalUrl: string;
  webUrl: string;
  shop: ReviewableShop | null;
  busy: boolean;
  rejecting: boolean;
  rejectNote: string;
  onRejectNote: (v: string) => void;
  onStartReject: () => void;
  onCancelReject: () => void;
  onClose: () => void;
  onVerify: (id: string) => void;
  onReject: (id: string) => void;
}) {
  const wa = shop ? buildWhatsappLink(shop.ownerPhone, waMessage(shop)) : null;

  return (
    <Sheet open={!!shop} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="flex w-full flex-col gap-0 sm:max-w-md">
        {shop && (
          <>
            <SheetHeader>
              <div className="flex items-center gap-2">
                <SellerTypeChips types={shop.sellerTypes} />
                <Badge variant={STATUS_VARIANT[shop.verificationStatus]}>
                  {shop.verificationStatus}
                </Badge>
              </div>
              <SheetTitle className="font-display text-2xl">{shop.nameEn}</SheetTitle>
              {shop.nameSi && <SheetDescription>{shop.nameSi}</SheetDescription>}
            </SheetHeader>

            <div className="flex-1 space-y-5 overflow-y-auto px-4 py-2">
              <div className="flex flex-wrap gap-2">
                <Button asChild size="sm" variant="brand">
                  <a
                    href={`${supplierPortalUrl}/act-as/${shop.id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <Pencil className="size-3.5" /> Manage as owner
                  </a>
                </Button>
                <Button asChild size="sm" variant="outline">
                  <Link to="/products" search={{ shop: shop.id, tab: "all" }}>
                    <Package className="size-3.5" /> Products ({shop.totalProductCount})
                  </Link>
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Manage as owner opens the supplier portal for this shop — add or
                edit products and photos, logo, banner and profile.
              </p>

              <SellerTypesEditor key={shop.id} shop={shop} />

              <div className="grid grid-cols-2 gap-4">
                <Field label="Products">
                  <ProductCount shop={shop} />
                </Field>
                <Field label="Storefront">
                  {shop.verificationStatus === "verified" ? (
                    <a
                      href={`${webUrl}/en/shops/${shop.slug}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-brand hover:underline"
                    >
                      View <ExternalLink className="size-3.5" />
                    </a>
                  ) : (
                    <span className="text-muted-foreground">Not live until verified</span>
                  )}
                </Field>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <Field label="District">{districtName(shop.district)}</Field>
                <Field label="City">{titleCase(shop.city)}</Field>
              </div>
              <Field label="Description">{shop.descriptionEn}</Field>
              {shop.descriptionSi && <Field label="Description (Sinhala)">{shop.descriptionSi}</Field>}

              <Separator />

              <Field label="Owner">{titleCase(shop.ownerFullName)}</Field>
              <div className="grid grid-cols-1 gap-3">
                <Field label="Email">{shop.ownerEmail}</Field>
                <Field label="Phone">
                  {shop.ownerPhone ? (
                    <span className="inline-flex items-center gap-1.5">
                      <Phone className="size-3.5 text-muted-foreground" />
                      {shop.ownerPhone}
                    </span>
                  ) : null}
                </Field>
              </div>

              <Field label="Submitted">
                {shop.verificationSubmittedAt
                  ? new Date(shop.verificationSubmittedAt).toLocaleDateString()
                  : new Date(shop.createdAt).toLocaleDateString()}
              </Field>

              {shop.verificationNotes && (
                <Field label="Review notes">{shop.verificationNotes}</Field>
              )}

              {wa ? (
                <Button asChild variant="outline" className="w-full">
                  <a href={wa} target="_blank" rel="noopener noreferrer">
                    <MessageCircle className="size-4" /> Message on WhatsApp
                  </a>
                </Button>
              ) : (
                <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <MapPin className="size-3.5" /> No phone on file — can't WhatsApp directly.
                </p>
              )}
            </div>

            <SheetFooter className="gap-2 border-t border-border">
              {rejecting ? (
                <div className="space-y-2">
                  <Textarea
                    placeholder="Reason for rejection (optional)"
                    rows={2}
                    value={rejectNote}
                    onChange={(e) => onRejectNote(e.target.value)}
                  />
                  <div className="flex gap-2">
                    <Button variant="ghost" className="flex-1" disabled={busy} onClick={onCancelReject}>
                      Cancel
                    </Button>
                    <Button
                      variant="destructive"
                      className="flex-1"
                      disabled={busy}
                      onClick={() => onReject(shop.id)}
                    >
                      <X className="size-4" /> Confirm reject
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="flex gap-2">
                  {shop.verificationStatus !== "rejected" && (
                    <Button variant="outline" className="flex-1" disabled={busy} onClick={onStartReject}>
                      <X className="size-4" /> Reject
                    </Button>
                  )}
                  {shop.verificationStatus !== "verified" && (
                    <Button variant="brand" className="flex-1" disabled={busy} onClick={() => onVerify(shop.id)}>
                      <Check className="size-4" /> Verify
                    </Button>
                  )}
                </div>
              )}
            </SheetFooter>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

/** Inline editor for a shop's seller types (saves immediately). */
function SellerTypesEditor({ shop }: { shop: ReviewableShop }) {
  const router = useRouter();
  const [value, setValue] = React.useState<SellerType[]>(shop.sellerTypes);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const dirty =
    value.length !== shop.sellerTypes.length ||
    value.some((x) => !shop.sellerTypes.includes(x));

  async function save() {
    setBusy(true);
    setError(null);
    try {
      const result = await setSupplierSellerTypesFn({
        data: { shopId: shop.id, sellerTypes: value },
      });
      if (!result.ok) setError(result.message);
      else await router.invalidate();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-2">
      <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        Seller type
      </div>
      <SellerTypeCheckboxes value={value} onChange={setValue} disabled={busy} />
      {error && <p className="text-xs text-destructive">{error}</p>}
      {dirty && (
        <div className="flex gap-2">
          <Button
            size="sm"
            variant="brand"
            disabled={busy || value.length === 0}
            onClick={() => void save()}
          >
            Save types
          </Button>
          <Button
            size="sm"
            variant="ghost"
            disabled={busy}
            onClick={() => setValue(shop.sellerTypes)}
          >
            Reset
          </Button>
        </div>
      )}
    </div>
  );
}
