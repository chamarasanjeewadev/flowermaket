import * as React from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Button } from "@flowers/ui/components/button";
import { Input } from "@flowers/ui/components/input";
import { Label } from "@flowers/ui/components/label";
import { Alert, AlertDescription } from "@flowers/ui/components/alert";
import { ArrowLeft, Loader2, Check, Copy } from "lucide-react";
import { inviteSupplierFn } from "../server/suppliers";

export const Route = createFileRoute("/suppliers/invite")({
  component: InviteSupplierPage,
});

const selectClass =
  "flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring";

function InviteSupplierPage() {
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [result, setResult] = React.useState<
    { joinUrl: string; whatsappSent: boolean } | null
  >(null);
  const [copied, setCopied] = React.useState(false);
  const [form, setForm] = React.useState({
    phone: "",
    nameEn: "",
    shopType: "grower" as "florist" | "grower",
    isAggregator: false,
    language: "en" as "en" | "si",
  });

  function set<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setResult(null);
    if (!form.phone.trim()) {
      setError("A WhatsApp number is required.");
      return;
    }
    setBusy(true);
    try {
      const res = await inviteSupplierFn({
        data: {
          phone: form.phone.trim(),
          nameEn: form.nameEn.trim() || null,
          shopType: form.shopType,
          isAggregator: form.isAggregator,
          language: form.language,
        },
      });
      if (!res.ok) {
        setError(res.message);
        return;
      }
      setResult({ joinUrl: res.data.joinUrl, whatsappSent: res.data.whatsappSent });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-xl space-y-6">
      <Link
        to="/suppliers"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" /> Back to suppliers
      </Link>
      <h1 className="font-display text-3xl">Invite a supplier</h1>
      <p className="text-sm text-muted-foreground">
        Send a WhatsApp invitation with a benefits pitch and a tokenized join
        link. Works for farmers, middlemen, and florists.
      </p>

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {result && (
        <Alert>
          <AlertDescription className="space-y-2">
            <p className="flex items-center gap-2 font-medium">
              <Check className="size-4 text-brand" />
              Invite created
              {result.whatsappSent
                ? " and sent on WhatsApp."
                : " — WhatsApp not configured, share the link manually."}
            </p>
            <div className="flex items-center gap-2">
              <code className="truncate rounded bg-muted px-2 py-1 text-xs">
                {result.joinUrl}
              </code>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => {
                  void navigator.clipboard?.writeText(result.joinUrl);
                  setCopied(true);
                }}
              >
                {copied ? <Check className="size-3" /> : <Copy className="size-3" />}
              </Button>
            </div>
          </AlertDescription>
        </Alert>
      )}

      <form className="space-y-4" onSubmit={(e) => void handleSubmit(e)}>
        <div className="space-y-1.5">
          <Label htmlFor="phone">WhatsApp number (94…) *</Label>
          <Input
            id="phone"
            value={form.phone}
            onChange={(e) => set("phone", e.target.value)}
            placeholder="94771234567"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="nameEn">Name (optional)</Label>
          <Input id="nameEn" value={form.nameEn} onChange={(e) => set("nameEn", e.target.value)} />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label htmlFor="shopType">Type</Label>
            <select
              id="shopType"
              className={selectClass}
              value={form.shopType}
              onChange={(e) => set("shopType", e.target.value as "florist" | "grower")}
            >
              <option value="grower">Grower / farmer</option>
              <option value="florist">Florist</option>
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="language">Message language</Label>
            <select
              id="language"
              className={selectClass}
              value={form.language}
              onChange={(e) => set("language", e.target.value as "en" | "si")}
            >
              <option value="en">English</option>
              <option value="si">සිංහල</option>
            </select>
          </div>
        </div>

        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={form.isAggregator}
            onChange={(e) => set("isAggregator", e.target.checked)}
          />
          Aggregator / middleman
        </label>

        <Button type="submit" disabled={busy} className="w-full">
          {busy ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
          {busy ? "Sending…" : "Send WhatsApp invite"}
        </Button>
      </form>
    </div>
  );
}
