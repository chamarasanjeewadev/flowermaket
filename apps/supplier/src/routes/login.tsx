import * as React from "react";
import { Link, createFileRoute, useRouter } from "@tanstack/react-router";
import { Alert, AlertDescription } from "@flowers/ui/components/alert";
import { Button } from "@flowers/ui/components/button";
import { Input } from "@flowers/ui/components/input";
import { Label } from "@flowers/ui/components/label";
import { Loader2 } from "lucide-react";
import { safeRedirectPath } from "@flowers/api/redirect";
import { signIn } from "../server/auth";
import { GoogleButton } from "../components/GoogleButton";
import { useT } from "../i18n/react";
import { AuthShell } from "../components/AuthShell";

export const Route = createFileRoute("/login")({
  validateSearch: (
    search: Record<string, unknown>,
  ): { error?: string; redirect?: string } => ({
    error: typeof search.error === "string" ? search.error : undefined,
    redirect: typeof search.redirect === "string" ? search.redirect : undefined,
  }),
  component: LoginPage,
});

function LoginPage() {
  const { session } = Route.useRouteContext();
  const { error: searchError, redirect: redirectTo } = Route.useSearch();
  const afterLogin = safeRedirectPath(redirectTo);
  const { t } = useT();
  const router = useRouter();
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [error, setError] = React.useState<string | null>(searchError ?? null);
  const [busy, setBusy] = React.useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!email.trim() || !password) {
      setError(t.auth.enterCredentials);
      return;
    }
    setBusy(true);
    try {
      const result = await signIn({ data: { email: email.trim(), password } });
      if (result.ok) {
        await router.invalidate();
        await router.navigate({ to: afterLogin });
      } else {
        setError(result.message ?? t.auth.signInFailed);
      }
    } finally {
      setBusy(false);
    }
  }

  const field = "mt-2 h-12 rounded-xl text-base";
  const label = "text-base font-medium";
  return (
    <AuthShell title={t.auth.welcomeBack} subtitle={t.auth.signInSub}>
      {session.kind === "config_error" ? (
        <Alert variant="destructive">
          <AlertDescription>
            Server configuration error: Supabase credentials are not set. Set
            AUTH_DISABLED=1 for local dev, or configure SUPABASE_URL and
            SUPABASE_ANON_KEY. Access is denied until this is resolved.
          </AlertDescription>
        </Alert>
      ) : session.kind === "auth_disabled" ? (
        <div className="space-y-4">
          <Alert>
            <AlertDescription>{t.auth.devMode}</AlertDescription>
          </Alert>
          <Button asChild variant="brand" className="h-12 w-full text-base">
            <Link to="/">{t.auth.continueToDashboard}</Link>
          </Button>
        </div>
      ) : (
        <div className="space-y-5">
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          <GoogleButton redirect={redirectTo ? afterLogin : undefined} />
          <div className="flex items-center gap-3">
            <span className="h-px flex-1 bg-border" />
            <span className="text-sm text-muted-foreground">{t.auth.or}</span>
            <span className="h-px flex-1 bg-border" />
          </div>

          <form className="space-y-5" onSubmit={(e) => void handleSubmit(e)}>
              <div>
                <Label htmlFor="email" className={label}>{t.auth.email}</Label>
                <Input
                  id="email"
                  type="email"
                  autoComplete="email"
                  className={field}
                  placeholder={t.auth.emailPlaceholder}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
              <div>
                <Label htmlFor="password" className={label}>{t.auth.password}</Label>
                <Input
                  id="password"
                  type="password"
                  autoComplete="current-password"
                  className={field}
                  placeholder={t.auth.passwordPlaceholder}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>
              <Button type="submit" variant="brand" className="h-12 w-full rounded-xl text-base font-semibold shadow-lg shadow-brand/25" disabled={busy}>
                {busy ? <Loader2 className="animate-spin" /> : null}
                {busy ? t.auth.signingIn : t.auth.signIn}
              </Button>
            </form>

          <p className="rounded-xl bg-muted px-4 py-3 text-center text-base text-foreground">
            {t.auth.newSupplier}{" "}
            <Link to="/register" className="font-semibold text-brand-ink underline underline-offset-4">
              {t.auth.createAccount}
            </Link>
          </p>
        </div>
      )}
    </AuthShell>
  );
}
