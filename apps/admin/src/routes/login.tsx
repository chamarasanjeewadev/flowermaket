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
import { Loader2, ShieldCheck } from "lucide-react";
import { signIn } from "../server/auth";

export const Route = createFileRoute("/login")({
  component: LoginPage,
});

function LoginPage() {
  const { session } = Route.useRouteContext();
  const router = useRouter();
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!email.trim() || !password) {
      setError("Enter your email and password.");
      return;
    }
    setBusy(true);
    try {
      const result = await signIn({ data: { email: email.trim(), password } });
      if (result.ok) {
        await router.invalidate();
        await router.navigate({ to: "/" });
      } else {
        setError(result.message ?? "Sign-in failed.");
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-dvh items-center justify-center bg-muted/30 p-6">
      <Card className="w-full max-w-sm">
        <CardHeader className="text-center">
          <div className="mx-auto mb-2 flex size-12 items-center justify-center rounded-full bg-primary/10">
            <ShieldCheck className="size-6 text-primary" />
          </div>
          <CardTitle className="text-xl">
            <span className="text-primary">Flowers</span>.lk admin
          </CardTitle>
          <CardDescription>Internal portal — admin accounts only.</CardDescription>
        </CardHeader>
        <CardContent>
          {session.kind === "config_error" ? (
            <Alert variant="destructive">
              <AlertDescription>
                Server configuration error: Supabase credentials are not set.
                Set AUTH_DISABLED=1 for local dev, or configure SUPABASE_URL
                and SUPABASE_ANON_KEY. Access is denied until this is resolved.
              </AlertDescription>
            </Alert>
          ) : session.kind === "auth_disabled" ? (
            <div className="space-y-4">
              <Alert>
                <AlertDescription>
                  Supabase is not configured, so the portal is running in dev
                  mode without authentication.
                </AlertDescription>
              </Alert>
              <Button asChild className="w-full">
                <Link to="/">Continue to dashboard</Link>
              </Button>
            </div>
          ) : (
            <form className="space-y-4" onSubmit={(e) => void handleSubmit(e)}>
              {error && (
                <Alert variant="destructive">
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}
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
                  autoComplete="current-password"
                  className="mt-1.5"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>
              <Button type="submit" className="w-full" disabled={busy}>
                {busy ? <Loader2 className="animate-spin" /> : null}
                Sign in
              </Button>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
