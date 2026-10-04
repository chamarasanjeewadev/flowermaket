import * as React from "react";
import { createFileRoute, useRouter, Link } from "@tanstack/react-router";
import { Button } from "@flowers/ui/components/button";
import { Input } from "@flowers/ui/components/input";
import { Label } from "@flowers/ui/components/label";
import { Textarea } from "@flowers/ui/components/textarea";
import { Alert, AlertDescription } from "@flowers/ui/components/alert";
import { ArrowLeft, Loader2 } from "lucide-react";
import { DISTRICTS } from "@flowers/api/constants";
import { createSupplierFn } from "../server/suppliers";

export const Route = createFileRoute("/suppliers/new")({
  component: NewSupplierPage,
});

const selectClass =
  "flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring";

function NewSupplierPage() {
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [form, setForm] = React.useState({
    nameEn: "",
    nameSi: "",
    descriptionEn: "",
    shopType: "grower" as "florist" | "grower",
    isAggregator: false,
    district: "",
    city: "",
    email: "",
    phone: "",
    fullName: "",
    verificationStatus: "verified" as "verified" | "pending",
  });

  function set<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!form.nameEn.trim() || !form.district) {
      setError("Shop name and district are required.");
      return;
    }
    if (!form.email.trim() && !form.phone.trim()) {
      setError("Provide an email or a phone number.");
      return;
    }
    setBusy(true);
    try {
      const result = await createSupplierFn({
        data: {
          email: form.email.trim() || null,
          phone: form.phone.trim() || null,
          fullName: form.fullName.trim() || null,
          verificationStatus: form.verificationStatus,
          shop: {
            nameEn: form.nameEn.trim(),
            nameSi: form.nameSi.trim() || null,
            descriptionEn: form.descriptionEn.trim() || null,
            shopType: form.shopType,
            isAggregator: form.isAggregator,
            district: form.district,
            city: form.city.trim() || null,
          },
        },
      });
      if (!result.ok) {
        setError(result.message);
        return;
      }
      await router.navigate({ to: "/suppliers" });
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
      <h1 className="font-display text-3xl">Create supplier</h1>
      <p className="text-sm text-muted-foreground">
        Provision an account for a farmer, middleman, or florist onboarded via
        WhatsApp or a field agent.
      </p>

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <form className="space-y-4" onSubmit={(e) => void handleSubmit(e)}>
        <div className="space-y-1.5">
          <Label htmlFor="nameEn">Shop name (English) *</Label>
          <Input id="nameEn" value={form.nameEn} onChange={(e) => set("nameEn", e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="nameSi">Shop name (Sinhala)</Label>
          <Input id="nameSi" value={form.nameSi} onChange={(e) => set("nameSi", e.target.value)} />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label htmlFor="shopType">Type *</Label>
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
          <div className="flex items-end pb-2">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={form.isAggregator}
                onChange={(e) => set("isAggregator", e.target.checked)}
              />
              Aggregator / middleman
            </label>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label htmlFor="district">District *</Label>
            <select
              id="district"
              className={selectClass}
              value={form.district}
              onChange={(e) => set("district", e.target.value)}
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
            <Label htmlFor="city">City</Label>
            <Input id="city" value={form.city} onChange={(e) => set("city", e.target.value)} />
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="fullName">Owner name</Label>
          <Input
            id="fullName"
            value={form.fullName}
            onChange={(e) => set("fullName", e.target.value)}
          />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              value={form.email}
              onChange={(e) => set("email", e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="phone">Phone (94…)</Label>
            <Input id="phone" value={form.phone} onChange={(e) => set("phone", e.target.value)} />
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="descriptionEn">Description</Label>
          <Textarea
            id="descriptionEn"
            rows={3}
            value={form.descriptionEn}
            onChange={(e) => set("descriptionEn", e.target.value)}
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="verificationStatus">Verification (staff-vouched)</Label>
          <select
            id="verificationStatus"
            className={selectClass}
            value={form.verificationStatus}
            onChange={(e) => set("verificationStatus", e.target.value as "verified" | "pending")}
          >
            <option value="verified">Verified (vouched now)</option>
            <option value="pending">Pending (review later)</option>
          </select>
        </div>

        <Button type="submit" disabled={busy} className="w-full">
          {busy ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
          {busy ? "Creating…" : "Create supplier"}
        </Button>
      </form>
    </div>
  );
}
