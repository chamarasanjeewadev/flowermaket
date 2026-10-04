import * as React from "react";
import { Link, createFileRoute, useRouter } from "@tanstack/react-router";
import { Alert, AlertDescription } from "@flowers/ui/components/alert";
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
import { Loader2 } from "lucide-react";
import { signUp } from "../server/auth";
import { GoogleButton } from "../components/GoogleButton";

export const Route = createFileRoute("/register")({
  validateSearch: (search: Record<string, unknown>): { invite?: string } => ({
    invite: typeof search.invite === "string" ? search.invite : undefined,
  }),
  component: RegisterPage,
});

function RegisterPage() {
  const { invite } = Route.useSearch();
  const router = useRouter();
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
      setError("Enter an email and a password of at least 8 characters.");
      return;
    }
    setBusy(true);
    try {
      const result = await signUp({ data: { email: email.trim(), password } });
      if (!result.ok) {
        setError(result.message ?? "Sign up failed.");
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
      setNotice("Account created. Please check your email to confirm, then sign in.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center bg-background p-6">
      <Card className="w-full max-w-sm">
        <CardHeader className="text-center">
          <img src="/logo.png" alt="FlowerMarket.lk" className="mx-auto mb-3 h-12 w-auto" />
          <CardTitle className="font-display text-2xl">Become a supplier</CardTitle>
          <CardDescription>
            Create your account to list and sell on FlowerMarket.lk.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
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
              <span className="text-xs text-muted-foreground">or</span>
              <span className="h-px flex-1 bg-border" />
            </div>
            <form className="space-y-4" onSubmit={(e) => void handleSubmit(e)}>
              <div>
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  autoComplete="email"
                  className="mt-1.5"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
              <div>
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  type="password"
                  autoComplete="new-password"
                  className="mt-1.5"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>
              <Button type="submit" variant="brand" className="w-full" disabled={busy}>
                {busy ? <Loader2 className="animate-spin" /> : null}
                {busy ? "Creating…" : "Create account"}
              </Button>
            </form>
            <p className="text-center text-sm text-muted-foreground">
              Already have an account?{" "}
              <Link to="/login" className="underline hover:text-foreground">
                Sign in
              </Link>
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
