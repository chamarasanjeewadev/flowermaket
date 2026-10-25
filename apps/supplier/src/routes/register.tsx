import * as React from "react";
import { Link, createFileRoute, useRouter } from "@tanstack/react-router";
import { Alert, AlertDescription } from "@flowers/ui/components/alert";
import { Button } from "@flowers/ui/components/button";
import { Input } from "@flowers/ui/components/input";
import { Label } from "@flowers/ui/components/label";
import { Loader2 } from "lucide-react";
import { signUp } from "../server/auth";
import { GoogleButton } from "../components/GoogleButton";
import { AuthShell } from "../components/AuthShell";
import { useT } from "../i18n/react";

export const Route = createFileRoute("/register")({
  validateSearch: (search: Record<string, unknown>): { invite?: string } => ({
    invite: typeof search.invite === "string" ? search.invite : undefined,
  }),
  component: RegisterPage,
});

function RegisterPage() {
  const { invite } = Route.useSearch();
  const router = useRouter();
  const { t } = useT();
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [notice, setNotice] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setNotice(null);
    if (!email.trim() || password.length < 8) {
      setError(t.auth.registerInvalid);
      return;
    }
    setBusy(true);
    try {
      const result = await signUp({ data: { email: email.trim(), password } });
      if (!result.ok) {
        setError(result.message ?? t.auth.registerFailed);
        return;
      }
      await router.invalidate();
      // If a session was established (email confirmation off), onboarding loads;
      // otherwise the user confirms by email and signs in.
      await router.navigate({
        to: "/onboarding",
        search: invite ? { invite } : {},
      });
    } catch {
      setNotice(t.auth.registerCheckEmail);
    } finally {
      setBusy(false);
    }
  }

  const field = "mt-2 h-12 rounded-xl text-base";
  return (
    <AuthShell title={t.auth.registerTitle} subtitle={t.auth.registerSub}>
      <div className="space-y-5">
        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        {notice && (
          <Alert>
            <AlertDescription>{notice}</AlertDescription>
          </Alert>
        )}
        <GoogleButton />
        <div className="flex items-center gap-3">
          <span className="h-px flex-1 bg-border" />
          <span className="text-sm text-muted-foreground">{t.auth.or}</span>
          <span className="h-px flex-1 bg-border" />
        </div>
        <form className="space-y-5" onSubmit={(e) => void handleSubmit(e)}>
          <div>
            <Label htmlFor="email" className="text-base font-medium">{t.auth.email}</Label>
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
            <Label htmlFor="password" className="text-base font-medium">{t.auth.password}</Label>
            <Input
              id="password"
              type="password"
              autoComplete="new-password"
              className={field}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <p className="mt-1.5 text-sm text-muted-foreground">{t.auth.passwordHint}</p>
          </div>
          <Button type="submit" variant="brand" className="h-12 w-full rounded-xl text-base font-semibold shadow-lg shadow-brand/25" disabled={busy}>
            {busy ? <Loader2 className="animate-spin" /> : null}
            {busy ? t.auth.creating : t.auth.createAccountBtn}
          </Button>
        </form>
        <p className="rounded-xl bg-muted px-4 py-3 text-center text-base text-foreground">
          {t.auth.haveAccount}{" "}
          <Link to="/login" className="font-semibold text-brand-ink underline underline-offset-4">
            {t.auth.signIn}
          </Link>
        </p>
      </div>
    </AuthShell>
  );
}
