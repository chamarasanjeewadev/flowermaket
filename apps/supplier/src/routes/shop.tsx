import * as React from "react";
import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useForm } from "@tanstack/react-form";
import type { SellerType } from "@flowers/api/constants";
import { Button } from "@flowers/ui/components/button";
import { Badge } from "@flowers/ui/components/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@flowers/ui/components/card";
import { Input } from "@flowers/ui/components/input";
import { Label } from "@flowers/ui/components/label";
import { Textarea } from "@flowers/ui/components/textarea";
import { Alert, AlertDescription } from "@flowers/ui/components/alert";
import { cn } from "@flowers/ui/lib/utils";
import { ExternalLink, ImagePlus, Loader2, Trash2 } from "lucide-react";
import { SellerTypePicker } from "../components/SellerTypePicker";
import {
  getMyShopFn,
  removeShopImageFn,
  updateShopFn,
  uploadShopImageFn,
  type MyShopDTO,
} from "../server/shops";
import { useT } from "../i18n/react";

export const Route = createFileRoute("/shop")({
  loader: async () => ({ shop: await getMyShopFn() }),
  component: ShopSettingsPage,
});

type VerificationStatus = MyShopDTO["verificationStatus"];

function VerificationBadge({ status }: { status: VerificationStatus }) {
  const { t } = useT();
  const labels: Record<VerificationStatus, string> = {
    unverified: t.shop.statusUnverified,
    pending: t.shop.statusPending,
    verified: t.shop.statusVerified,
    rejected: t.shop.statusRejected,
  };
  const variants: Record<
    VerificationStatus,
    "secondary" | "warning" | "success" | "destructive"
  > = {
    unverified: "secondary",
    pending: "warning",
    verified: "success",
    rejected: "destructive",
  };
  return <Badge variant={variants[status]}>{labels[status]}</Badge>;
}

function ShopSettingsPage() {
  const { t } = useT();
  const { shop } = Route.useLoaderData();

  if (!shop) {
    return (
      <div className="space-y-4">
        <h1 className="font-display text-3xl sm:text-4xl">{t.shop.title}</h1>
        <p className="text-muted-foreground">{t.common.loading}</p>
      </div>
    );
  }
  return <ShopSettings shop={shop} />;
}

function ShopSettings({ shop }: { shop: MyShopDTO }) {
  const { t } = useT();
  const router = useRouter();
  const [serverError, setServerError] = React.useState<string | null>(null);
  const [savedMsg, setSavedMsg] = React.useState(false);

  const form = useForm({
    defaultValues: {
      nameEn: shop.nameEn,
      nameSi: shop.nameSi ?? "",
      descriptionEn: shop.descriptionEn ?? "",
      descriptionSi: shop.descriptionSi ?? "",
      city: shop.city ?? "",
      sellerTypes: shop.sellerTypes as SellerType[],
    },
    onSubmit: async ({ value }) => {
      setServerError(null);
      setSavedMsg(false);
      const result = await updateShopFn({
        data: {
          nameEn: value.nameEn,
          nameSi: value.nameSi || null,
          descriptionEn: value.descriptionEn || null,
          descriptionSi: value.descriptionSi || null,
          city: value.city || null,
          sellerTypes: value.sellerTypes,
        },
      });
      if (!result.ok) {
        setServerError(result.message);
        return;
      }
      setSavedMsg(true);
      await router.invalidate();
    },
  });

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl sm:text-4xl">{t.shop.title}</h1>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <span className="text-sm text-muted-foreground">
              {t.shop.verificationStatus}:
            </span>
            <VerificationBadge status={shop.verificationStatus} />
          </div>
        </div>
        {shop.verificationStatus === "verified" ? (
          <Button asChild variant="outline" size="sm">
            <a href={shop.storefrontUrl} target="_blank" rel="noreferrer">
              {t.shop.viewStorefront}
              <ExternalLink className="size-4" aria-hidden="true" />
            </a>
          </Button>
        ) : (
          <p className="text-xs text-muted-foreground">{t.shop.notLiveYet}</p>
        )}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t.shop.appearance}</CardTitle>
          <CardDescription>{t.shop.appearanceHint}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <ShopImageField
            kind="banner"
            label={t.shop.banner}
            hint={t.shop.bannerHint}
            initialUrl={shop.bannerUrl}
          />
          <ShopImageField
            kind="logo"
            label={t.shop.logo}
            hint={t.shop.logoHint}
            initialUrl={shop.logoUrl}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t.shop.details}</CardTitle>
          <CardDescription>
            <span className="font-mono text-xs">{t.shop.slug}: </span>
            <span className="font-mono text-xs text-muted-foreground">
              {shop.slug}
            </span>
            <span className="ml-2 text-xs text-muted-foreground">
              {t.shop.slugNote}
            </span>
          </CardDescription>
        </CardHeader>

        <CardContent>
          {serverError && (
            <Alert variant="destructive" className="mb-4">
              <AlertDescription>{serverError}</AlertDescription>
            </Alert>
          )}
          {savedMsg && (
            <Alert className="mb-4">
              <AlertDescription>{t.shop.saved}</AlertDescription>
            </Alert>
          )}

          <form
            onSubmit={(e) => {
              e.preventDefault();
              e.stopPropagation();
              void form.handleSubmit();
            }}
            className="space-y-5"
            noValidate
          >
            <form.Field
              name="sellerTypes"
              validators={{
                onChange: ({ value }) =>
                  value.length === 0 ? t.onboarding.sellerTypesRequired : undefined,
              }}
            >
              {(field) => (
                <fieldset className="space-y-1.5">
                  <legend className="text-sm font-medium">{t.shop.sellerTypes}</legend>
                  <p className="text-xs text-muted-foreground">
                    {t.shop.sellerTypesHint}
                  </p>
                  <SellerTypePicker
                    value={field.state.value}
                    onChange={(next) => field.handleChange(next)}
                    onBlur={field.handleBlur}
                  />
                  {field.state.meta.errors.length > 0 && (
                    <p className="text-xs text-destructive">
                      {field.state.meta.errors[0]}
                    </p>
                  )}
                </fieldset>
              )}
            </form.Field>

            <form.Field
              name="nameEn"
              validators={{
                onBlur: ({ value }) => {
                  const v = value.trim();
                  if (!v) return t.shop.nameEnRequired;
                  if (v.length < 2) return t.shop.nameEnTooShort;
                  if (v.length > 100) return t.shop.nameEnTooLong;
                  return undefined;
                },
              }}
            >
              {(field) => (
                <div className="space-y-1.5">
                  <Label htmlFor={field.name}>{t.shop.nameEn}</Label>
                  <Input
                    id={field.name}
                    name={field.name}
                    type="text"
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

            <div className="grid gap-5 sm:grid-cols-2">
              <form.Field name="nameSi">
                {(field) => (
                  <div className="space-y-1.5">
                    <Label htmlFor={field.name}>{t.shop.nameSi}</Label>
                    <Input
                      id={field.name}
                      name={field.name}
                      type="text"
                      value={field.state.value}
                      onBlur={field.handleBlur}
                      onChange={(e) => field.handleChange(e.target.value)}
                    />
                  </div>
                )}
              </form.Field>

              <form.Field name="city">
                {(field) => (
                  <div className="space-y-1.5">
                    <Label htmlFor={field.name}>{t.shop.city}</Label>
                    <Input
                      id={field.name}
                      name={field.name}
                      type="text"
                      value={field.state.value}
                      onBlur={field.handleBlur}
                      onChange={(e) => field.handleChange(e.target.value)}
                    />
                  </div>
                )}
              </form.Field>
            </div>

            <form.Field name="descriptionEn">
              {(field) => (
                <div className="space-y-1.5">
                  <Label htmlFor={field.name}>{t.shop.descriptionEn}</Label>
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

            <form.Field name="descriptionSi">
              {(field) => (
                <div className="space-y-1.5">
                  <Label htmlFor={field.name}>{t.shop.descriptionSi}</Label>
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

            <form.Subscribe
              selector={(state) => [state.canSubmit, state.isSubmitting]}
            >
              {([canSubmit, isSubmitting]) => (
                <Button
                  type="submit"
                  variant="brand"
                  disabled={!canSubmit || isSubmitting}
                >
                  {isSubmitting ? (
                    <Loader2 className="mr-2 size-4 animate-spin" />
                  ) : null}
                  {isSubmitting ? t.shop.saving : t.shop.save}
                </Button>
              )}
            </form.Subscribe>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

const ACCEPTED = ["image/jpeg", "image/png", "image/webp"];
const MAX_BYTES = 5 * 1024 * 1024;

/** Immediate-upload image slot for the shop logo or banner. */
function ShopImageField({
  kind,
  label,
  hint,
  initialUrl,
}: {
  kind: "logo" | "banner";
  label: string;
  hint: string;
  initialUrl: string | null;
}) {
  const { t } = useT();
  const [url, setUrl] = React.useState(initialUrl);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const inputRef = React.useRef<HTMLInputElement>(null);

  async function upload(file: File | undefined) {
    if (!file) return;
    setError(null);
    if (!ACCEPTED.includes(file.type) || file.size > MAX_BYTES) {
      setError(t.shop.imageError);
      return;
    }
    setBusy(true);
    try {
      const fd = new FormData();
      fd.set("kind", kind);
      fd.set("file", file);
      const result = await uploadShopImageFn({ data: fd });
      if (!result.ok) setError(result.message);
      else setUrl(result.data.url);
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  async function remove() {
    setBusy(true);
    setError(null);
    try {
      const result = await removeShopImageFn({ data: { kind } });
      if (!result.ok) setError(result.message);
      else setUrl(null);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={busy}
        aria-label={`${url ? t.shop.replace : t.shop.upload} — ${label}`}
        className={cn(
          "relative flex shrink-0 items-center justify-center overflow-hidden border border-dashed border-input bg-muted/40 text-muted-foreground transition-colors hover:border-foreground/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          kind === "logo" ? "size-20 rounded-full" : "aspect-[3/1] w-full rounded-lg sm:w-56",
        )}
      >
        {url ? (
          <img src={url} alt="" className="size-full object-cover" />
        ) : (
          <ImagePlus className="size-6" aria-hidden="true" />
        )}
        {busy && (
          <span className="absolute inset-0 flex items-center justify-center bg-background/70">
            <Loader2 className="size-5 animate-spin" aria-hidden="true" />
          </span>
        )}
      </button>
      <div className="min-w-0 flex-1 space-y-2">
        <div>
          <p className="text-sm font-medium">{label}</p>
          <p className="text-xs text-muted-foreground">{hint}</p>
        </div>
        <div className="flex gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={busy}
            onClick={() => inputRef.current?.click()}
          >
            {busy ? t.shop.uploading : url ? t.shop.replace : t.shop.upload}
          </Button>
          {url && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={busy}
              onClick={() => void remove()}
            >
              <Trash2 className="size-4" aria-hidden="true" />
              {t.shop.remove}
            </Button>
          )}
        </div>
        {error && <p className="text-xs text-destructive">{error}</p>}
      </div>
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPTED.join(",")}
        className="hidden"
        onChange={(e) => void upload(e.target.files?.[0])}
      />
    </div>
  );
}
