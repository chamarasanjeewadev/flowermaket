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
import { Info, LogIn } from "lucide-react";
import { GoogleButton } from "../../components/GoogleButton";
import { useT } from "../../i18n/react";
import { refreshSession, safeRedirectPath } from "../../lib/session";
import { signInWithPassword } from "../../server/auth";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const Route = createFileRoute("/$locale/login")({
  validateSearch: (
    search: Record<string, unknown>,
  ): { redirect?: string; error?: string } => ({
    redirect:
      typeof search.redirect === "string" ? search.redirect : undefined,
    error: typeof search.error === "string" ? search.error : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Sign in | FlowerMarket.lk" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: LoginPage,
});

function LoginPage() {
  const { redirect: redirectTo, error } = Route.useSearch();
  const { session, locale } = Route.useRouteContext();
  const { t } = useT();
  const router = useRouter();
  const queryClient = useQueryClient();
  const authDisabled =
    session.kind === "auth_disabled" || session.kind === "config_error";

  React.useEffect(() => {
    if (error) toast.error(error);
  }, [error]);

  const form = useForm({
    defaultValues: { email: "", password: "" },
    onSubmit: async ({ value }) => {
      const result = await signInWithPassword({ data: value });
      if (!result.ok) {
        toast.error(result.message);
        return;
      }
      toast.success(t.auth.welcomeToast);
      await refreshSession(queryClient, router);
      router.history.push(safeRedirectPath(redirectTo) || `/${locale}/`);
    },
  });

  return (
    <div className="mx-auto flex max-w-md flex-col px-4 py-12 sm:py-16">
      <Card>
        <CardHeader className="text-center">
          <CardTitle className="text-xl">{t.auth.welcomeBack}</CardTitle>
          <CardDescription>{t.auth.signInSub}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {authDisabled && (
            <Alert>
              <Info className="size-4" aria-hidden="true" />
              <AlertTitle>{t.auth.soonTitle}</AlertTitle>
              <AlertDescription>{t.auth.soonBody}</AlertDescription>
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
                  {field.state.meta.isTouched &&
                    field.state.meta.errors.length > 0 && (
                      <p className="text-xs text-destructive">
                        {field.state.meta.errors[0]}
                      </p>
                    )}
                </div>
              )}
            </form.Field>

            <form.Field
              name="password"
              validators={{
                onChange: ({ value }) =>
                  !value ? t.auth.passwordRequired : undefined,
              }}
            >
              {(field) => (
                <div className="space-y-1.5">
                  <Label htmlFor={field.name}>{t.auth.password}</Label>
                  <Input
                    id={field.name}
                    name={field.name}
                    type="password"
                    autoComplete="current-password"
                    placeholder={t.auth.passwordPlaceholder}
                    disabled={authDisabled}
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

            <form.Subscribe
              selector={(state) => [state.canSubmit, state.isSubmitting]}
            >
              {([canSubmit, isSubmitting]) => (
                <Button
                  type="submit"
                  className="w-full"
                  disabled={authDisabled || !canSubmit || isSubmitting}
                >
                  <LogIn className="size-4" aria-hidden="true" />
                  {isSubmitting ? t.auth.signingIn : t.nav.login}
                </Button>
              )}
            </form.Subscribe>
          </form>

          <div className="flex items-center gap-3">
            <Separator className="flex-1" />
            <span className="text-xs uppercase text-muted-foreground">
              {t.common.or}
            </span>
            <Separator className="flex-1" />
          </div>

          <GoogleButton
            disabled={authDisabled}
            redirect={safeRedirectPath(redirectTo) || `/${locale}/`}
          />

          <p className="text-center text-sm text-muted-foreground">
            {t.auth.newHere}{" "}
            <Link
              to="/$locale/signup"
              params={{ locale }}
              className="font-medium text-primary hover:underline"
            >
              {t.auth.createFreeAccount}
            </Link>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
