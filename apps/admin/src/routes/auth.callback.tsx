import { createFileRoute, redirect } from "@tanstack/react-router";
import { safeRedirectPath } from "@flowers/api/redirect";
import { exchangeAuthCode } from "../server/auth";

/**
 * OAuth landing pad: exchanges ?code= for a session cookie server-side, then
 * bounces to the intended destination. Errors bounce to /login where the
 * `error` search param is shown.
 */
export const Route = createFileRoute("/auth/callback")({
  validateSearch: (
    search: Record<string, unknown>,
  ): { code?: string; redirect?: string; error_description?: string } => ({
    code: typeof search.code === "string" ? search.code : undefined,
    redirect:
      typeof search.redirect === "string" ? search.redirect : undefined,
    error_description:
      typeof search.error_description === "string"
        ? search.error_description
        : undefined,
  }),
  beforeLoad: async ({ search }) => {
    if (!search.code) {
      throw redirect({
        to: "/login",
        search: {
          error:
            search.error_description ??
            "Sign-in was cancelled or the provider is not enabled.",
        },
      });
    }
    const result = await exchangeAuthCode({ data: { code: search.code } });
    if (!result.ok) {
      throw redirect({
        to: "/login",
        search: { error: result.message ?? "Sign-in failed." },
      });
    }
    throw redirect({ href: safeRedirectPath(search.redirect) });
  },
  component: AuthCallbackPending,
});

function AuthCallbackPending() {
  return (
    <div className="mx-auto max-w-md px-4 py-24 text-center text-sm text-muted-foreground">
      Completing sign-in…
    </div>
  );
}
