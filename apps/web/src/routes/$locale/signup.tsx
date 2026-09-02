import * as React from "react";
import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useForm } from "@tanstack/react-form";
import { toast } from "sonner";
import { Alert, AlertDescription, AlertTitle } from "@flowers/ui/components/alert";
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
import { Separator } from "@flowers/ui/components/separator";
import { Info, MailCheck, UserPlus } from "lucide-react";
import { GoogleButton } from "../../components/GoogleButton";
import { useT } from "../../i18n/react";
import { refreshSession } from "../../lib/session";
import { signUpWithPassword } from "../../server/auth";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const Route = createFileRoute("/$locale/signup")({
  head: () => ({
    meta: [
      { title: "Create your free account | Flowers.lk" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: SignupPage,
});

function FieldError({
  meta,
}: {
  meta: { isTouched: boolean; errors: Array<string | undefined> };
}) {
  if (!meta.isTouched || meta.errors.length === 0) return null;
  return <p className="text-xs text-destructive">{meta.errors[0]}</p>;
}

function SignupPage() {
  const { session, locale } = Route.useRouteContext();
  const { t } = useT();
  const router = useRouter();
  const queryClient = useQueryClient();
  const authDisabled = session.kind === "auth_disabled";
  const [confirmEmailSent, setConfirmEmailSent] = React.useState(false);

  const form = useForm({
    defaultValues: { fullName: "", email: "", password: "", confirm: "" },
    onSubmit: async ({ value }) => {
      const result = await signUpWithPassword({
        data: {
          fullName: value.fullName.trim(),
          email: value.email.trim(),
          password: value.password,
        },
      });
      if (!result.ok) {
        toast.error(result.message);
        return;
      }
      if (result.data.status === "confirm_email") {
        setConfirmEmailSent(true);
        return;
      }
      toast.success(t.auth.accountCreatedToast);
      await refreshSession(queryClient, router);
      router.history.push(`/${locale}/`);
    },
  });

  return (
    <div className="mx-auto flex max-w-md flex-col px-4 py-12 sm:py-16">
      <Card>
        <CardHeader className="text-center">
          <CardTitle className="text-xl">{t.auth.createTitle}</CardTitle>
          <CardDescription>{t.auth.createSub}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {authDisabled && (
            <Alert>
              <Info className="size-4" aria-hidden="true" />
              <AlertTitle>{t.auth.soonTitle}</AlertTitle>
              <AlertDescription>{t.auth.soonBody}</AlertDescription>
            </Alert>
          )}

          {confirmEmailSent ? (
            <Alert>
              <MailCheck className="size-4" aria-hidden="true" />
              <AlertTitle>{t.auth.checkInbox}</AlertTitle>
              <AlertDescription>
                {t.auth.confirmBody}{" "}
                <Link
                  to="/$locale/login"
                  params={{ locale }}
                  className="font-medium underline"
                >
                  {t.auth.signInLink}
                </Link>
                .
              </AlertDescription>
            </Alert>
          ) : (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                e.stopPropagation();
                void form.handleSubmit();
              }}
              className="space-y-4"
              noValidate
            >
              <form.Field
                name="fullName"
                validators={{
                  onChange: ({ value }) =>
                    !value.trim() ? t.auth.nameRequired : undefined,
                }}
              >
                {(field) => (
                  <div className="space-y-1.5">
                    <Label htmlFor={field.name}>{t.auth.fullName}</Label>
                    <Input
                      id={field.name}
                      name={field.name}
                      autoComplete="name"
                      placeholder={t.auth.fullNamePlaceholder}
                      disabled={authDisabled}
                      value={field.state.value}
                      onBlur={field.handleBlur}
                      onChange={(e) => field.handleChange(e.target.value)}
                    />
                    <FieldError meta={field.state.meta} />
                  </div>
                )}
              </form.Field>

              <form.Field
                name="email"
                validators={{
                  onChange: ({ value }) =>
                    !value.trim()
                      ? t.auth.emailRequired
                      : !EMAIL_RE.test(value.trim())
                        ? t.auth.emailInvalid
                        : undefined,
                }}
              >
                {(field) => (
                  <div className="space-y-1.5">
                    <Label htmlFor={field.name}>{t.auth.email}</Label>
                    <Input
                      id={field.name}
                      name={field.name}
                      type="email"
                      autoComplete="email"
                      placeholder={t.auth.emailPlaceholder}
                      disabled={authDisabled}
                      value={field.state.value}
                      onBlur={field.handleBlur}
                      onChange={(e) => field.handleChange(e.target.value)}
                    />
                    <FieldError meta={field.state.meta} />
                  </div>
                )}
              </form.Field>

              <form.Field
                name="password"
                validators={{
                  onChange: ({ value }) =>
                    value.length < 8 ? t.auth.passwordMin : undefined,
                }}
              >
                {(field) => (
                  <div className="space-y-1.5">
                    <Label htmlFor={field.name}>{t.auth.password}</Label>
                    <Input
                      id={field.name}
                      name={field.name}
                      type="password"
                      autoComplete="new-password"
                      placeholder={t.auth.passwordMinPlaceholder}
                      disabled={authDisabled}
                      value={field.state.value}
                      onBlur={field.handleBlur}
                      onChange={(e) => field.handleChange(e.target.value)}
                    />
                    <FieldError meta={field.state.meta} />
                  </div>
                )}
              </form.Field>

              <form.Field
                name="confirm"
                validators={{
                  onChangeListenTo: ["password"],
                  onChange: ({ value, fieldApi }) =>
                    value !== fieldApi.form.getFieldValue("password")
                      ? t.auth.passwordsMismatch
                      : undefined,
                }}
              >
                {(field) => (
                  <div className="space-y-1.5">
                    <Label htmlFor={field.name}>{t.auth.confirmPassword}</Label>
                    <Input
                      id={field.name}
                      name={field.name}
                      type="password"
                      autoComplete="new-password"
                      placeholder={t.auth.confirmPlaceholder}
                      disabled={authDisabled}
                      value={field.state.value}
                      onBlur={field.handleBlur}
                      onChange={(e) => field.handleChange(e.target.value)}
                    />
                    <FieldError meta={field.state.meta} />
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
                    disabled={authDisabled || !canSubmit || isSubmitting}
                  >
                    <UserPlus className="size-4" aria-hidden="true" />
                    {isSubmitting ? t.auth.creating : t.auth.createAccount}
                  </Button>
                )}
              </form.Subscribe>
            </form>
          )}

          {!confirmEmailSent && (
            <>
              <div className="flex items-center gap-3">
                <Separator className="flex-1" />
                <span className="text-xs uppercase text-muted-foreground">
                  {t.common.or}
                </span>
                <Separator className="flex-1" />
              </div>

              <GoogleButton disabled={authDisabled} redirect={`/${locale}/`} />
            </>
          )}

          <p className="text-center text-xs text-muted-foreground">{t.auth.terms}</p>

          <p className="text-center text-sm text-muted-foreground">
            {t.auth.haveAccount}{" "}
            <Link
              to="/$locale/login"
              params={{ locale }}
              className="font-medium text-primary hover:underline"
            >
              {t.nav.login}
            </Link>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
