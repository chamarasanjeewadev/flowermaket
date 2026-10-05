import * as React from "react";
import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import {
  Ban,
  Check,
  CheckCheck,
  ExternalLink,
  Flower2,
  Pencil,
  RotateCcw,
  Search,
  Store,
} from "lucide-react";
import { formatRupees } from "@flowers/api/money";
import { SELLER_TYPES, type SellerType } from "@flowers/api/constants";
import type { ModerationStatus } from "@flowers/api";
import { Badge } from "@flowers/ui/components/badge";
import { Button } from "@flowers/ui/components/button";
import { Input } from "@flowers/ui/components/input";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@flowers/ui/components/sheet";
import { Textarea } from "@flowers/ui/components/textarea";
import { cn } from "@flowers/ui/lib/utils";
import { SELLER_TYPE_META, SellerTypeChips } from "../components/seller-types";
import {
  approveProductsFn,
  listModerationProductsFn,
  moderateProductFn,
  type ModerationProductDTO,
} from "../server/products";

type Tab = "pending" | "approved" | "blocked" | "all";

interface ProductsSearch {
  tab?: Tab;
  shop?: string;
}

const TABS: Array<{ value: Tab; label: string }> = [
  { value: "pending", label: "Pending review" },
  { value: "approved", label: "Live" },
  { value: "blocked", label: "Blocked" },
  { value: "all", label: "All" },
];

export const Route = createFileRoute("/products/")({
  validateSearch: (search: Record<string, unknown>): ProductsSearch => ({
    tab:
      search.tab === "pending" ||
      search.tab === "approved" ||
      search.tab === "blocked" ||
      search.tab === "all"
        ? search.tab
        : undefined,
    shop: typeof search.shop === "string" && search.shop ? search.shop : undefined,
  }),
  // Load everything once; tabs / filters are instant client-side.
  loader: () => listModerationProductsFn({ data: {} }),
  component: ProductsPage,
});

const MODERATION_VARIANT: Record<
  ModerationStatus,
  React.ComponentProps<typeof Badge>["variant"]
> = {
  pending: "warning",
  approved: "success",
  blocked: "destructive",
};

const MODERATION_LABEL: Record<ModerationStatus, string> = {
  pending: "Pending review",
  approved: "Approved",
  blocked: "Blocked",
};

/** Why an approved product might still not be visible to buyers. */
function visibilityIssue(p: ModerationProductDTO): string | null {
  if (p.moderationStatus !== "approved") return null;
  if (p.status !== "active") return `Seller has it as ${p.status}`;
  if (p.shopVerificationStatus !== "verified") return "Shop not verified";
  return null;
}

function ProductsPage() {
  const { products, counts, webUrl, supplierPortalUrl } = Route.useLoaderData();
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const router = useRouter();
  const tab: Tab = search.tab ?? (counts.pending > 0 ? "pending" : "all");
  const [query, setQuery] = React.useState("");
  const [typeFilter, setTypeFilter] = React.useState<SellerType | "all">("all");
  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const [bulkBusy, setBulkBusy] = React.useState(false);

  const shops = Array.from(
    new Map(products.map((p) => [p.shopId, p.shopNameEn])),
  ).sort((a, b) => a[1].localeCompare(b[1]));

  const q = query.trim().toLowerCase();
  const visible = products.filter(
    (p) =>
      (tab === "all" || p.moderationStatus === tab) &&
      (!search.shop || p.shopId === search.shop) &&
      (typeFilter === "all" || p.shopSellerTypes.includes(typeFilter)) &&
      (!q ||
        p.nameEn.toLowerCase().includes(q) ||
        (p.nameSi ?? "").toLowerCase().includes(q) ||
        p.shopNameEn.toLowerCase().includes(q)),
  );
  const pendingInView = visible.filter((p) => p.moderationStatus === "pending");
  const selected = products.find((p) => p.id === selectedId) ?? null;
  const shopName = search.shop
    ? shops.find(([id]) => id === search.shop)?.[1]
    : undefined;

  async function approveAllInView() {
    setBulkBusy(true);
    try {
      const res = await approveProductsFn({
        data: { productIds: pendingInView.map((p) => p.id) },
      });
      if (res.ok) await router.invalidate();
    } finally {
      setBulkBusy(false);
    }
  }

  const tabCount = (t: Tab) =>
    t === "all" ? counts.pending + counts.approved + counts.blocked : counts[t];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="space-y-1">
          <h1 className="font-display text-3xl">Products</h1>
          <p className="text-sm text-muted-foreground">
            Review what sellers list. Only approved products appear on
            FlowerMarket.lk.
            {shopName && (
              <>
                {" "}Showing <span className="font-medium text-foreground">{shopName}</span>
                {" · "}
                <button
                  type="button"
                  className="text-brand hover:underline"
                  onClick={() =>
                    navigate({ search: (prev: ProductsSearch) => ({ ...prev, shop: undefined }) })
                  }
                >
                  show all shops
                </button>
              </>
            )}
          </p>
        </div>
        {pendingInView.length > 1 && (
          <Button
            variant="brand"
            disabled={bulkBusy}
            onClick={() => void approveAllInView()}
          >
            <CheckCheck className="size-4" />
            Approve {pendingInView.length} pending
          </Button>
        )}
      </div>

      {/* Tabs */}
      <div className="flex flex-wrap gap-1 border-b border-border">
        {TABS.map((t) => (
          <button
            key={t.value}
            type="button"
            onClick={() =>
              navigate({ search: (prev: ProductsSearch) => ({ ...prev, tab: t.value }) })
            }
            className={cn(
              "-mb-px inline-flex items-center gap-2 border-b-2 px-3 py-2 text-sm font-medium transition-colors",
              tab === t.value
                ? "border-brand text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {t.label}
            <span
              className={cn(
                "rounded-full px-1.5 text-xs",
                t.value === "pending" && counts.pending > 0
                  ? "bg-warning/20 text-warning"
                  : "bg-muted text-muted-foreground",
              )}
            >
              {tabCount(t.value)}
            </span>
          </button>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
        <div className="relative lg:w-72">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search product or shop"
            className="pl-8"
          />
        </div>
        <select
          value={search.shop ?? ""}
          onChange={(e) =>
            navigate({
              search: (prev: ProductsSearch) => ({
                ...prev,
                shop: e.target.value || undefined,
              }),
            })
          }
          className="h-9 rounded-md border border-input bg-transparent px-3 text-sm lg:w-56"
          aria-label="Filter by shop"
        >
          <option value="">All shops</option>
          {shops.map(([id, name]) => (
            <option key={id} value={id}>
              {name}
            </option>
          ))}
        </select>
        <div className="flex flex-wrap gap-1.5">
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
              {type === "all" ? "All sellers" : SELLER_TYPE_META[type].label}
            </button>
          ))}
        </div>
      </div>

      {/* Grid */}
      {visible.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border py-16 text-center">
          <Flower2 className="size-8 text-muted-foreground/40" />
          <p className="text-sm text-muted-foreground">
            {tab === "pending" ? "Nothing waiting for review." : "No products match."}
          </p>
        </div>
      ) : (
        <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {visible.map((p) => (
            <li key={p.id}>
              <ProductTile
                product={p}
                onOpen={() => setSelectedId(p.id)}
              />
            </li>
          ))}
        </ul>
      )}

      <ProductSheet
        product={selected}
        webUrl={webUrl}
        supplierPortalUrl={supplierPortalUrl}
        onClose={() => setSelectedId(null)}
      />
    </div>
  );
}

function ProductTile({
  product: p,
  onOpen,
}: {
  product: ModerationProductDTO;
  onOpen: () => void;
}) {
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);
  const issue = visibilityIssue(p);

  async function approve(e: React.MouseEvent) {
    e.stopPropagation();
    setBusy(true);
    try {
      const res = await moderateProductFn({
        data: { productId: p.id, status: "approved" },
      });
      if (res.ok) await router.invalidate();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpen();
        }
      }}
      className="group flex h-full cursor-pointer gap-3 rounded-xl border border-border bg-card p-3 text-left transition-colors hover:border-foreground/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <div className="relative size-24 shrink-0 overflow-hidden rounded-lg bg-muted">
        {p.imageUrls[0] ? (
          <img src={p.imageUrls[0]} alt="" className="size-full object-cover" />
        ) : (
          <div className="flex size-full items-center justify-center">
            <Flower2 className="size-6 text-muted-foreground/50" />
          </div>
        )}
        {p.imageUrls.length > 1 && (
          <span className="absolute bottom-1 right-1 rounded bg-background/90 px-1 text-[10px] font-medium">
            +{p.imageUrls.length - 1}
          </span>
        )}
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex items-start justify-between gap-2">
          <p className="line-clamp-2 text-sm font-medium leading-snug">{p.nameEn}</p>
          <Badge variant={MODERATION_VARIANT[p.moderationStatus]} className="shrink-0">
            {MODERATION_LABEL[p.moderationStatus]}
          </Badge>
        </div>
        <p className="truncate text-xs text-muted-foreground">
          {p.shopNameEn} · {p.categoryNameEn}
        </p>
        <p className="text-sm">
          <span className="font-semibold">{formatRupees(p.price)}</span>
          {p.listingType === "wholesale" && (
            <span className="text-xs text-muted-foreground"> / stem</span>
          )}
        </p>
        {issue && <p className="text-xs text-warning">{issue}</p>}
        {p.moderationStatus === "blocked" && p.moderationNote && (
          <p className="line-clamp-1 text-xs text-destructive">{p.moderationNote}</p>
        )}
        {p.moderationStatus === "pending" && (
          <div className="mt-auto pt-1">
            <Button size="sm" variant="outline" disabled={busy} onClick={(e) => void approve(e)}>
              <Check className="size-3.5" /> Approve
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

function ProductSheet({
  product,
  webUrl,
  supplierPortalUrl,
  onClose,
}: {
  product: ModerationProductDTO | null;
  webUrl: string;
  supplierPortalUrl: string | null;
  onClose: () => void;
}) {
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);
  const [blocking, setBlocking] = React.useState(false);
  const [note, setNote] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [activeImage, setActiveImage] = React.useState(0);

  React.useEffect(() => {
    setBlocking(false);
    setNote("");
    setError(null);
    setActiveImage(0);
  }, [product?.id]);

  async function moderate(status: ModerationStatus, reason?: string) {
    if (!product) return;
    setBusy(true);
    setError(null);
    try {
      const res = await moderateProductFn({
        data: { productId: product.id, status, note: reason ?? null },
      });
      if (!res.ok) {
        setError(res.message);
        return;
      }
      setBlocking(false);
      setNote("");
      await router.invalidate();
    } finally {
      setBusy(false);
    }
  }

  const issue = product ? visibilityIssue(product) : null;
  const portal = supplierPortalUrl ?? "https://supplier.flowermarket.lk";

  return (
    <Sheet open={!!product} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="flex w-full flex-col gap-0 sm:max-w-lg">
        {product && (
          <>
            <SheetHeader>
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant={MODERATION_VARIANT[product.moderationStatus]}>
                  {MODERATION_LABEL[product.moderationStatus]}
                </Badge>
                <Badge variant="outline">{product.status}</Badge>
                <Badge variant="outline">{product.listingType}</Badge>
              </div>
              <SheetTitle className="font-display text-2xl">{product.nameEn}</SheetTitle>
              {product.nameSi && <SheetDescription>{product.nameSi}</SheetDescription>}
            </SheetHeader>

            <div className="flex-1 space-y-5 overflow-y-auto px-4 py-2">
              {/* Gallery */}
              <div className="space-y-2">
                <div className="aspect-[4/3] overflow-hidden rounded-lg bg-muted">
                  {product.imageUrls[activeImage] ? (
                    <img
                      src={product.imageUrls[activeImage]}
                      alt=""
                      className="size-full object-cover"
                    />
                  ) : (
                    <div className="flex size-full items-center justify-center text-sm text-muted-foreground">
                      No photos
                    </div>
                  )}
                </div>
                {product.imageUrls.length > 1 && (
                  <div className="flex gap-2">
                    {product.imageUrls.map((url, i) => (
                      <button
                        key={url}
                        type="button"
                        onClick={() => setActiveImage(i)}
                        className={cn(
                          "size-14 overflow-hidden rounded-md border-2",
                          i === activeImage ? "border-brand" : "border-transparent",
                        )}
                      >
                        <img src={url} alt="" className="size-full object-cover" />
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {issue && (
                <p className="rounded-md bg-warning/10 px-3 py-2 text-xs text-warning">
                  Approved but not visible to buyers: {issue.toLowerCase()}.
                </p>
              )}
              {product.moderationStatus === "blocked" && product.moderationNote && (
                <p className="rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive">
                  Block reason: {product.moderationNote}
                </p>
              )}

              <div className="grid grid-cols-2 gap-4 text-sm">
                <Detail label="Price">
                  {formatRupees(product.price)}
                  {product.listingType === "wholesale" ? " / stem" : ""}
                  {product.compareAtPrice && product.compareAtPrice > product.price && (
                    <span className="ml-1 text-xs text-muted-foreground line-through">
                      {formatRupees(product.compareAtPrice)}
                    </span>
                  )}
                </Detail>
                <Detail label="Category">{product.categoryNameEn}</Detail>
                <Detail label="Stock">
                  {product.stockQty == null ? "Made to order" : product.stockQty}
                </Detail>
                <Detail label="Min order">
                  {product.minOrderQty ? `${product.minOrderQty} stems` : "—"}
                </Detail>
              </div>

              <Detail label="Description">
                <span className="whitespace-pre-line">{product.descriptionEn ?? "—"}</span>
              </Detail>

              <div className="space-y-2 rounded-lg border border-border p-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{product.shopNameEn}</p>
                    <SellerTypeChips types={product.shopSellerTypes} />
                  </div>
                  <Store className="size-4 shrink-0 text-muted-foreground" />
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button asChild size="sm" variant="outline">
                    <a
                      href={`${portal}/act-as/${product.shopId}?next=${encodeURIComponent(`/products/${product.id}`)}`}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      <Pencil className="size-3.5" /> Edit as owner
                    </a>
                  </Button>
                  <Button asChild size="sm" variant="ghost">
                    <Link to="/products" search={{ shop: product.shopId, tab: "all" }}>
                      All from this shop
                    </Link>
                  </Button>
                  {product.moderationStatus === "approved" && product.status === "active" && (
                    <Button asChild size="sm" variant="ghost">
                      <a
                        href={`${webUrl}/en/products/${product.slug}`}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        View live <ExternalLink className="size-3.5" />
                      </a>
                    </Button>
                  )}
                </div>
              </div>
            </div>

            <SheetFooter className="flex-col gap-2 border-t border-border sm:flex-col sm:space-x-0">
              {error && <p className="text-xs text-destructive">{error}</p>}
              {blocking ? (
                <div className="w-full space-y-2">
                  <Textarea
                    autoFocus
                    rows={2}
                    placeholder="Reason (shown to the seller), e.g. Photo is a stock image — upload your own."
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                  />
                  <div className="flex gap-2">
                    <Button
                      variant="ghost"
                      className="flex-1"
                      disabled={busy}
                      onClick={() => setBlocking(false)}
                    >
                      Cancel
                    </Button>
                    <Button
                      variant="destructive"
                      className="flex-1"
                      disabled={busy || !note.trim()}
                      onClick={() => void moderate("blocked", note)}
                    >
                      <Ban className="size-4" /> Block product
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="flex w-full gap-2">
                  {product.moderationStatus !== "blocked" && (
                    <Button
                      variant="outline"
                      className="flex-1"
                      disabled={busy}
                      onClick={() => setBlocking(true)}
                    >
                      <Ban className="size-4" /> Block
                    </Button>
                  )}
                  {product.moderationStatus === "approved" && (
                    <Button
                      variant="ghost"
                      className="flex-1"
                      disabled={busy}
                      onClick={() => void moderate("pending")}
                    >
                      <RotateCcw className="size-4" /> Back to review
                    </Button>
                  )}
                  {product.moderationStatus !== "approved" && (
                    <Button
                      variant="brand"
                      className="flex-1"
                      disabled={busy}
                      onClick={() => void moderate("approved")}
                    >
                      <Check className="size-4" />
                      {product.moderationStatus === "blocked" ? "Unblock & approve" : "Approve"}
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

function Detail({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-0.5">
      <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      <div className="text-sm">{children}</div>
    </div>
  );
}
