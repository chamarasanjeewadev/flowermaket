import * as React from "react";
import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import {
  Check,
  MapPin,
  MessageCircle,
  Phone,
  Plus,
  Sprout,
  Store,
  Users,
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
import { listSuppliersForReview, reviewSupplierFn } from "../server/suppliers";
import type { ReviewableShop, VerificationStatus } from "@flowers/api";

export const Route = createFileRoute("/suppliers/")({
  loader: async (): Promise<{ suppliers: ReviewableShop[] }> => ({
    suppliers: await listSuppliersForReview({ data: {} }),
  }),
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

function typeMeta(shopType: ReviewableShop["shopType"], isAggregator: boolean) {
  if (shopType === "grower") {
    return {
      label: isAggregator ? "Aggregator" : "Farmer / Grower",
      Icon: isAggregator ? Users : Sprout,
      className: "bg-success/15 text-success",
    };
  }
  return { label: "Florist", Icon: Store, className: "bg-primary/10 text-primary" };
}

function TypeBadge({ shop }: { shop: ReviewableShop }) {
  const { label, Icon, className } = typeMeta(shop.shopType, shop.isAggregator);
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${className}`}
    >
      <Icon className="size-3.5" />
      {label}
    </span>
  );
}

function waMessage(shop: ReviewableShop) {
  const name = shop.ownerFullName || shop.nameEn;
  return `Hi ${name}, this is FlowerMarket.lk about your supplier account "${shop.nameEn}".`;
}

// --- page ------------------------------------------------------------------

function SuppliersPage() {
  const { suppliers } = Route.useLoaderData();
  const router = useRouter();
  const [selected, setSelected] = React.useState<ReviewableShop | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [rejectNote, setRejectNote] = React.useState("");
  const [rejecting, setRejecting] = React.useState(false);

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
        <div className="overflow-x-auto rounded-xl border border-border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Shop</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Location</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {suppliers.map((s) => {
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
                    <TableCell><TypeBadge shop={s} /></TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {s.city ? `${s.city}, ` : ""}
                      {s.district}
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
      )}

      <SupplierSheet
        shop={selected}
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
                <TypeBadge shop={shop} />
                <Badge variant={STATUS_VARIANT[shop.verificationStatus]}>
                  {shop.verificationStatus}
                </Badge>
              </div>
              <SheetTitle className="font-display text-2xl">{shop.nameEn}</SheetTitle>
              {shop.nameSi && <SheetDescription>{shop.nameSi}</SheetDescription>}
            </SheetHeader>

            <div className="flex-1 space-y-5 overflow-y-auto px-4 py-2">
              <div className="grid grid-cols-2 gap-4">
                <Field label="District">{shop.district}</Field>
                <Field label="City">{shop.city}</Field>
              </div>
              <Field label="Description">{shop.descriptionEn}</Field>
              {shop.descriptionSi && <Field label="Description (Sinhala)">{shop.descriptionSi}</Field>}

              <Separator />

              <Field label="Owner">{shop.ownerFullName}</Field>
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
