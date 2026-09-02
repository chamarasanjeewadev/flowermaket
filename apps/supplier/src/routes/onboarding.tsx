import * as React from "react";
import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useForm } from "@tanstack/react-form";
import { Button } from "@flowers/ui/components/button";
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
import { Flower, Loader2 } from "lucide-react";
import { DISTRICTS } from "@flowers/api";
import { createShopFn } from "../server/shops";
import { useT } from "../i18n/react";

export const Route = createFileRoute("/onboarding")({
  component: OnboardingPage,
});

function OnboardingPage() {
  const { t } = useT();
  const router = useRouter();
  const [serverError, setServerError] = React.useState<string | null>(null);

  const form = useForm({
    defaultValues: {
      nameEn: "",
      nameSi: "",
      descriptionEn: "",
      descriptionSi: "",
      district: "",
      city: "",
    },
    onSubmit: async ({ value }) => {
      setServerError(null);
      const result = await createShopFn({
        data: {
          nameEn: value.nameEn,
          nameSi: value.nameSi || null,
          descriptionEn: value.descriptionEn || null,
          descriptionSi: value.descriptionSi || null,
          district: value.district,
          city: value.city || null,
        },
      });
      if (!result.ok) {
        setServerError(result.message);
        return;
      }
      await router.invalidate();
      await router.navigate({ to: "/" });
    },
  });

  return (
    <div className="flex min-h-dvh items-start justify-center bg-muted/30 p-6 pt-16">
      <Card className="w-full max-w-lg">
        <CardHeader className="text-center">
          <div className="mx-auto mb-2 flex size-12 items-center justify-center rounded-full bg-primary/10">
            <Flower className="size-6 text-primary" />
          </div>
          <CardTitle className="text-xl">{t.onboarding.title}</CardTitle>
          <CardDescription>{t.onboarding.subtitle}</CardDescription>
        </CardHeader>

        <CardContent>
          {serverError && (
            <Alert variant="destructive" className="mb-4">
              <AlertDescription>{serverError}</AlertDescription>
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
            {/* Shop name (English) — required */}
            <form.Field
              name="nameEn"
              validators={{
                onBlur: ({ value }) => {
                  const v = value.trim();
                  if (!v) return t.onboarding.nameEnRequired;
                  if (v.length < 2) return t.onboarding.nameEnTooShort;
                  if (v.length > 100) return t.onboarding.nameEnTooLong;
                  return undefined;
                },
              }}
            >
              {(field) => (
                <div className="space-y-1.5">
                  <Label htmlFor={field.name}>
                    {t.onboarding.nameEn}{" "}
                    <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    id={field.name}
                    name={field.name}
                    type="text"
                    placeholder={t.onboarding.nameEnPlaceholder}
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

            {/* Shop name (Sinhala) — optional */}
            <form.Field name="nameSi">
              {(field) => (
                <div className="space-y-1.5">
                  <Label htmlFor={field.name}>{t.onboarding.nameSi}</Label>
                  <Input
                    id={field.name}
                    name={field.name}
                    type="text"
                    placeholder={t.onboarding.nameSiPlaceholder}
                    value={field.state.value}
                    onBlur={field.handleBlur}
                    onChange={(e) => field.handleChange(e.target.value)}
                  />
                </div>
              )}
            </form.Field>

            {/* District — required */}
            <form.Field
              name="district"
              validators={{
                onBlur: ({ value }) =>
                  !value ? t.onboarding.districtRequired : undefined,
              }}
            >
              {(field) => (
                <div className="space-y-1.5">
                  <Label htmlFor={field.name}>
                    {t.onboarding.district}{" "}
                    <span className="text-destructive">*</span>
                  </Label>
                  <select
                    id={field.name}
                    name={field.name}
                    value={field.state.value}
                    onBlur={field.handleBlur}
                    onChange={(e) => field.handleChange(e.target.value)}
                    className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <option value="">{t.onboarding.districtPlaceholder}</option>
                    {DISTRICTS.map((d) => (
                      <option key={d.slug} value={d.slug}>
                        {d.nameEn}
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

            {/* City — optional */}
            <form.Field name="city">
              {(field) => (
                <div className="space-y-1.5">
                  <Label htmlFor={field.name}>{t.onboarding.city}</Label>
                  <Input
                    id={field.name}
                    name={field.name}
                    type="text"
                    placeholder={t.onboarding.cityPlaceholder}
                    value={field.state.value}
                    onBlur={field.handleBlur}
                    onChange={(e) => field.handleChange(e.target.value)}
                  />
                </div>
              )}
            </form.Field>

            {/* Description (English) — optional */}
            <form.Field name="descriptionEn">
              {(field) => (
                <div className="space-y-1.5">
                  <Label htmlFor={field.name}>
                    {t.onboarding.descriptionEn}
                  </Label>
                  <Textarea
                    id={field.name}
                    name={field.name}
                    rows={3}
                    placeholder={t.onboarding.descriptionEnPlaceholder}
                    value={field.state.value}
                    onBlur={field.handleBlur}
                    onChange={(e) => field.handleChange(e.target.value)}
                  />
                </div>
              )}
            </form.Field>

            {/* Description (Sinhala) — optional */}
            <form.Field name="descriptionSi">
              {(field) => (
                <div className="space-y-1.5">
                  <Label htmlFor={field.name}>
                    {t.onboarding.descriptionSi}
                  </Label>
                  <Textarea
                    id={field.name}
                    name={field.name}
                    rows={3}
                    placeholder={t.onboarding.descriptionSiPlaceholder}
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
                  className="w-full"
                  disabled={!canSubmit || isSubmitting}
                >
                  {isSubmitting ? (
                    <Loader2 className="mr-2 size-4 animate-spin" />
                  ) : null}
                  {isSubmitting
                    ? t.onboarding.submitting
                    : t.onboarding.submit}
                </Button>
              )}
            </form.Subscribe>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
