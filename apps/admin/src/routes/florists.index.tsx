import * as React from "react";
import { createFileRoute } from "@tanstack/react-router";
import type { FloristListingDTO, ListingStatus } from "@flowers/api";
import { INVITE_LINK_PLACEHOLDER, buildInviteMessage } from "@flowers/api/invite-message";
import { Badge } from "@flowers/ui/components/badge";
import { Button } from "@flowers/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@flowers/ui/components/dialog";
import { Input } from "@flowers/ui/components/input";
import { Textarea } from "@flowers/ui/components/textarea";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@flowers/ui/components/table";
import { toast } from "../components/toaster";
import {
  importFloristFn,
  inviteFloristFn,
  linkFloristToShopFn,
  listFloristsFn,
  listShopOptionsFn,
  refreshStaleFloristsFn,
  searchGoogleFloristsFn,
  setFloristLocationFn,
  setFloristStatusFn,
  type SearchResultRow,
  type ShopOption,
} from "../server/florists";

export const Route = createFileRoute("/florists/")({
  component: FloristsPage,
});

const STATUS_VARIANT: Record<ListingStatus, "secondary" | "info" | "success" | "warning" | "destructive"> = {
  unclaimed: "secondary",
  invited: "info",
  claimed: "success",
  opted_out: "warning",
  blocked: "destructive",
};

const selectClass =
  "h-9 rounded-md border border-input bg-background px-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

function errorText(e: unknown): string {
  return e instanceof Error ? e.message : "Something went wrong.";
}

function parseLatLng(raw: string): { lat: number; lng: number } | null {
  const m = raw.trim().match(/^(-?\d+(?:\.\d+)?)\s*[, ]\s*(-?\d+(?:\.\d+)?)$/);
  if (!m) return null;
  const lat = Number(m[1]);
  const lng = Number(m[2]);
  return Math.abs(lat) <= 90 && Math.abs(lng) <= 180 ? { lat, lng } : null;
}

type Dialogs =
  | { kind: "invite"; listing: FloristListingDTO }
  | { kind: "link"; listing: FloristListingDTO }
  | { kind: "pin"; listing: FloristListingDTO }
  | null;

function FloristsPage() {
  const [listings, setListings] = React.useState<FloristListingDTO[]>([]);
  const [loadError, setLoadError] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(true);

  const [query, setQuery] = React.useState("florist");
  const [near, setNear] = React.useState("");
  const [radiusKm, setRadiusKm] = React.useState(10);
  const [searching, setSearching] = React.useState(false);
  const [searchError, setSearchError] = React.useState<string | null>(null);
  const [results, setResults] = React.useState<SearchResultRow[] | null>(null);
  const [importing, setImporting] = React.useState<string | null>(null);
  const [refreshing, setRefreshing] = React.useState(false);
  const [dialog, setDialog] = React.useState<Dialogs>(null);

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const res = await listFloristsFn({ data: {} });
      if (res.ok) {
        setListings(res.data);
        setLoadError(null);
      } else {
        setLoadError(res.message);
      }
    } catch (e) {
      setLoadError(errorText(e));
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void load();
  }, [load]);

  const staleCount = listings.filter((l) => l.isStale && l.status !== "opted_out" && l.status !== "blocked").length;

  async function search(e: React.FormEvent) {
    e.preventDefault();
    setSearchError(null);
    const pin = near.trim() ? parseLatLng(near) : null;
    if (near.trim() && !pin) {
      setSearchError("Near must look like 7.4863, 80.3623.");
      return;
    }
    setSearching(true);
    try {
      const res = await searchGoogleFloristsFn({
        data: { query: query.trim() || undefined, ...(pin ?? {}), radiusKm },
      });
      if (res.ok) setResults(res.data);
      else {
        setResults(null);
        setSearchError(res.message);
      }
    } catch (e2) {
      setSearchError(errorText(e2));
    } finally {
      setSearching(false);
    }
  }

  async function importPlace(placeId: string) {
    setImporting(placeId);
    try {
      const res = await importFloristFn({ data: { placeId } });
      if (!res.ok) {
        toast.error(res.message);
        return;
      }
      toast.success(res.data.created ? "Florist imported." : "Florist refreshed.");
      setResults((r) => r?.map((x) => (x.placeId === placeId ? { ...x, imported: true } : x)) ?? r);
      await load();
    } catch (e) {
      toast.error(errorText(e));
    } finally {
      setImporting(null);
    }
  }

  async function setStatus(l: FloristListingDTO, status: "opted_out" | "blocked" | "unclaimed") {
    if (status !== "unclaimed" && !window.confirm(`Mark ${l.name} as ${status.replace("_", " ")}?`)) return;
    try {
      const res = await setFloristStatusFn({ data: { listingId: l.id, status } });
      if (!res.ok) toast.error(res.message);
      else {
        toast.success(`${l.name}: ${status.replace("_", " ")}.`);
        await load();
      }
    } catch (e) {
      toast.error(errorText(e));
    }
  }

  async function refreshStale() {
    setRefreshing(true);
    try {
      const res = await refreshStaleFloristsFn({ data: { limit: 50 } });
      if (!res.ok) toast.error(res.message);
      else {
        toast.success(`Refreshed ${res.data.refreshed}${res.data.failed ? `, ${res.data.failed} failed` : ""}.`);
        await load();
      }
    } catch (e) {
      toast.error(errorText(e));
    } finally {
      setRefreshing(false);
    }
  }

  return (
    <div className="mx-auto max-w-6xl space-y-8">
      <div>
        <h1 className="font-display text-3xl">Florists</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Import local florists from Google Places, manage the directory and invite them to join.
        </p>
      </div>

      <section className="space-y-3 rounded-xl border bg-card p-5" aria-labelledby="search-h">
        <h2 id="search-h" className="font-display text-xl">
          Search Google
        </h2>
        <form onSubmit={search} className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1 text-sm">
            Search
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="florist Kurunegala"
              className="w-64"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            Near (lat,lng, optional)
            <Input
              value={near}
              onChange={(e) => setNear(e.target.value)}
              placeholder="7.4863, 80.3623"
              className="w-48"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            Radius
            <select
              className={selectClass}
              value={radiusKm}
              onChange={(e) => setRadiusKm(Number(e.target.value))}
            >
              {[5, 10, 25].map((k) => (
                <option key={k} value={k}>
                  {k} km
                </option>
              ))}
            </select>
          </label>
          <Button type="submit" disabled={searching}>
            {searching ? "Searching…" : "Search"}
          </Button>
        </form>
        {searchError ? (
          <p role="alert" className="text-sm text-destructive">
            {searchError}
          </p>
        ) : null}
        {results ? (
          results.length === 0 ? (
            <p className="text-sm text-muted-foreground">No results.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Address</TableHead>
                  <TableHead>Phone</TableHead>
                  <TableHead>Rating</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {results.map((p) => (
                  <TableRow key={p.placeId}>
                    <TableCell className="font-medium">{p.name}</TableCell>
                    <TableCell className="max-w-xs truncate">{p.address ?? "—"}</TableCell>
                    <TableCell>{p.phone ?? "—"}</TableCell>
                    <TableCell>
                      {p.rating !== null ? `★${p.rating.toFixed(1)} (${p.reviewCount ?? 0}) Google` : "—"}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={p.imported || importing === p.placeId}
                        onClick={() => void importPlace(p.placeId)}
                      >
                        {p.imported ? "Imported" : importing === p.placeId ? "Importing…" : "Import"}
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )
        ) : null}
      </section>

      <section className="space-y-3" aria-labelledby="dir-h">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id="dir-h" className="font-display text-xl">
            Directory ({listings.length})
          </h2>
          <Button
            variant="outline"
            size="sm"
            disabled={refreshing || staleCount === 0}
            onClick={() => void refreshStale()}
          >
            {refreshing ? "Refreshing…" : `Refresh stale (${staleCount})`}
          </Button>
        </div>
        {loadError ? (
          <p role="alert" className="rounded-md border border-destructive/40 p-3 text-sm text-destructive">
            {loadError}
          </p>
        ) : loading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : listings.length === 0 ? (
          <p className="text-sm text-muted-foreground">No florists yet. Search Google above and import some.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>District</TableHead>
                <TableHead>Rating</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Shop</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {listings.map((l) => {
                const closed = l.status === "opted_out" || l.status === "blocked";
                const canInvite = !closed && l.status !== "claimed" && l.phone !== null;
                return (
                  <TableRow key={l.id}>
                    <TableCell>
                      <div className="font-medium">{l.name}</div>
                      <div className="text-xs text-muted-foreground">{l.phone ?? "no phone"}</div>
                    </TableCell>
                    <TableCell>{l.district ?? "—"}</TableCell>
                    <TableCell>
                      {l.googleRating !== null
                        ? `★${l.googleRating.toFixed(1)} (${l.googleReviewCount ?? 0}) Google`
                        : "—"}
                      {l.isStale ? (
                        <Badge variant="warning" className="ml-2">
                          stale
                        </Badge>
                      ) : null}
                    </TableCell>
                    <TableCell>
                      <Badge variant={STATUS_VARIANT[l.status]}>{l.status.replace("_", " ")}</Badge>
                    </TableCell>
                    <TableCell>{l.shopName ?? "—"}</TableCell>
                    <TableCell>
                      <div className="flex flex-wrap justify-end gap-1">
                        <Button size="sm" variant="ghost" onClick={() => setDialog({ kind: "link", listing: l })}>
                          Link shop
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => setDialog({ kind: "pin", listing: l })}>
                          Set pin
                        </Button>
                        {closed ? (
                          <Button size="sm" variant="ghost" onClick={() => void setStatus(l, "unclaimed")}>
                            Reinstate
                          </Button>
                        ) : (
                          <>
                            <Button size="sm" variant="ghost" onClick={() => void setStatus(l, "opted_out")}>
                              Opt-out
                            </Button>
                            <Button size="sm" variant="ghost" onClick={() => void setStatus(l, "blocked")}>
                              Block
                            </Button>
                          </>
                        )}
                        <Button
                          size="sm"
                          disabled={!canInvite}
                          title={canInvite ? undefined : "Needs a phone and an unclaimed/invited status"}
                          onClick={() => setDialog({ kind: "invite", listing: l })}
                        >
                          Invite
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </section>

      {dialog?.kind === "invite" ? (
        <InviteDialog listing={dialog.listing} onClose={() => setDialog(null)} onDone={load} />
      ) : null}
      {dialog?.kind === "link" ? (
        <LinkDialog listing={dialog.listing} onClose={() => setDialog(null)} onDone={load} />
      ) : null}
      {dialog?.kind === "pin" ? (
        <PinDialog listing={dialog.listing} onClose={() => setDialog(null)} onDone={load} />
      ) : null}
    </div>
  );
}

interface DialogProps {
  listing: FloristListingDTO;
  onClose: () => void;
  onDone: () => Promise<void>;
}

function InviteDialog({ listing, onClose, onDone }: DialogProps) {
  const [message, setMessage] = React.useState(() =>
    buildInviteMessage({
      nameEn: listing.name,
      sellerTypes: ["florist"],
      language: "en",
      joinUrl: INVITE_LINK_PLACEHOLDER,
    }),
  );
  const [sending, setSending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function send() {
    setSending(true);
    setError(null);
    try {
      const res = await inviteFloristFn({ data: { listingId: listing.id, message } });
      if (!res.ok) {
        setError(res.message);
        return;
      }
      if (res.data.delivery.status === "failed") {
        setError(`Invite created but WhatsApp failed: ${res.data.delivery.detail}`);
        return;
      }
      toast.success(`Invite sent to ${listing.name}.`);
      await onDone();
      onClose();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setSending(false);
    }
  }

  return (
    <Dialog open onOpenChange={(o) => (!o ? onClose() : undefined)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Invite {listing.name}</DialogTitle>
          <DialogDescription>
            To {listing.phone}. Review and edit the WhatsApp message; exactly this text is sent.{" "}
            {INVITE_LINK_PLACEHOLDER} becomes the personal join link.
          </DialogDescription>
        </DialogHeader>
        <Textarea rows={10} value={message} onChange={(e) => setMessage(e.target.value)} />
        {error ? (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        ) : null}
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={sending}>
            Cancel
          </Button>
          <Button onClick={() => void send()} disabled={sending || !message.trim()}>
            {sending ? "Sending…" : "Send invite"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function LinkDialog({ listing, onClose, onDone }: DialogProps) {
  const [shops, setShops] = React.useState<ShopOption[]>([]);
  const [shopId, setShopId] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    void listShopOptionsFn()
      .then((res) => (res.ok ? setShops(res.data) : setError(res.message)))
      .catch((e) => setError(errorText(e)));
  }, []);

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const res = await linkFloristToShopFn({ data: { listingId: listing.id, shopId } });
      if (!res.ok) {
        setError(res.message);
        return;
      }
      toast.success("Linked.");
      await onDone();
      onClose();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open onOpenChange={(o) => (!o ? onClose() : undefined)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Link {listing.name} to a shop</DialogTitle>
          <DialogDescription>Florist shops are listed first.</DialogDescription>
        </DialogHeader>
        <select className={selectClass} value={shopId} onChange={(e) => setShopId(e.target.value)}>
          <option value="">Select a shop…</option>
          {shops.map((s) => (
            <option key={s.id} value={s.id}>
              {s.nameEn} ({s.district})
            </option>
          ))}
        </select>
        {error ? (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        ) : null}
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={() => void save()} disabled={saving || !shopId}>
            Link
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function PinDialog({ listing, onClose, onDone }: DialogProps) {
  const [value, setValue] = React.useState(`${listing.lat}, ${listing.lng}`);
  const [error, setError] = React.useState<string | null>(null);
  const [saving, setSaving] = React.useState(false);

  async function save() {
    const pin = parseLatLng(value);
    if (!pin) {
      setError("Enter lat,lng like 7.4863, 80.3623.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await setFloristLocationFn({ data: { listingId: listing.id, ...pin } });
      if (!res.ok) {
        setError(res.message);
        return;
      }
      toast.success("Pin updated.");
      await onDone();
      onClose();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open onOpenChange={(o) => (!o ? onClose() : undefined)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Set pin for {listing.name}</DialogTitle>
          <DialogDescription>Latitude, longitude (e.g. copied from Google Maps).</DialogDescription>
        </DialogHeader>
        <Input value={value} onChange={(e) => setValue(e.target.value)} />
        {error ? (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        ) : null}
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={() => void save()} disabled={saving}>
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
