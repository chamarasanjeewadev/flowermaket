import * as React from "react";
import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useForm } from "@tanstack/react-form";
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
import { Loader2 } from "lucide-react";
import { updateShopFn } from "../server/shops";
import { useT } from "../i18n/react";

export const Route = createFileRoute("/shop")({
  component: ShopSettingsPage,
});

type VerificationStatus = "unverified" | "pending" | "verified" | "rejected";

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
    "default" | "secondary" | "outline" | "destructive"
  > = {
    unverified: "secondary",
    pending: "outline",
    verified: "default",
    rejected: "destructive",
  };
  return <Badge variant={variants[status]}>{labels[status]}</Badge>;
}

function ShopSettingsPage() {
  const { t } = useT();
  const router = useRouter();
  const { session } = Route.useRouteContext();

  const [serverError, setServerError] = React.useState<string | null>(null);
  const [savedMsg, setSavedMsg] = React.useState(false);

  // In auth_disabled or no_shop modes, show a placeholder.
  if (session.kind !== "supplier") {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-bold">{t.shop.title}</h1>
        <p className="text-muted-foreground">{t.common.loading}</p>
      </div>
    );
  }

  const shop = session;

  const form = useForm({
    defaultValues: {
      nameEn: shop.shopNameEn,
      nameSi: "",
      descriptionEn: "",
      descriptionSi: "",
      city: "",
    },
    onSubmit: async ({ value }) => {
      setServerError(null);
      setSavedMsg(false);
      const result = await updateShopFn({
        data: {
          nameEn: value.nameEn || undefined,
          nameSi: value.nameSi || null,
          descriptionEn: value.descriptionEn || null,
          descriptionSi: value.descriptionSi || null,
          city: value.city || null,
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
    <div className="mx-auto max-w-xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold">{t.shop.title}</h1>
        <div className="mt-2 flex items-center gap-3">
          <span className="text-sm text-muted-foreground">
            {t.shop.verificationStatus}:
          </span>
          <VerificationBadge status={shop.verificationStatus} />
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t.shop.title}</CardTitle>
          <CardDescription>
            <span className="font-mono text-xs">{t.shop.slug}: </span>
            <span className="font-mono text-xs text-muted-foreground">
              {shop.shopId ? `…` : "—"}
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
            className="space-y-4"
            noValidate
          >
            {/* Shop name (English) */}
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

            {/* Shop name (Sinhala) */}
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

            {/* City */}
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

            {/* Description (English) */}
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

            {/* Description (Sinhala) */}
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
