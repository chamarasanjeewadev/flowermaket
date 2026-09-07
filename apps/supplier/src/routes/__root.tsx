import * as React from "react";
import type { QueryClient } from "@tanstack/react-query";
import {
  HeadContent,
  Link,
  Outlet,
  Scripts,
  createRootRouteWithContext,
  redirect,
  useRouter,
  useRouterState,
} from "@tanstack/react-router";
import { Button } from "@flowers/ui/components/button";
import { LogOut } from "lucide-react";
import {
  getSupplierSession,
  getLocale,
  signOut,
  setLocale,
  type SupplierSession,
} from "../server/auth";
import { I18nProvider, useT } from "../i18n/react";
import { type Locale } from "../i18n";
import { Toaster } from "../components/toaster";
import appCss from "../styles.css?url";

interface RouterContext {
  queryClient: QueryClient;
}

export const Route = createRootRouteWithContext<RouterContext>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "Supplier Portal — FlowerMarket.lk" },
      { name: "robots", content: "noindex" },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "icon", href: "/favicon.ico", sizes: "any" },
      { rel: "icon", type: "image/png", href: "/icons/icon-32.png", sizes: "32x32" },
      { rel: "apple-touch-icon", href: "/icons/apple-touch-icon.png", sizes: "180x180" },
    ],
  }),
  beforeLoad: async ({ location }) => {
    const [session, locale] = await Promise.all([
      getSupplierSession(),
      getLocale(),
    ]);

    const path = location.pathname;

    // Misconfigured server (Supabase env absent, AUTH_DISABLED not set) — fail closed.
    if (session.kind === "config_error" && path !== "/login") {
      throw redirect({ to: "/login" });
    }
    // Unauthenticated → /login
    if (session.kind === "anonymous" && path !== "/login") {
      throw redirect({ to: "/login" });
    }

    // Authenticated but no shop → /onboarding (unless already there or at /login)
    if (
      session.kind === "no_shop" &&
      path !== "/onboarding" &&
      path !== "/login"
    ) {
      throw redirect({ to: "/onboarding" });
    }

    // Authenticated with shop (or admin) → skip login/onboarding
    if (
      session.kind === "supplier" &&
      (path === "/login" || path === "/onboarding")
    ) {
      throw redirect({ to: "/" });
    }

    // auth_disabled — let through to any page (dev mode)

    return { session, locale };
  },
  shellComponent: RootDocument,
  component: RootLayout,
});

function RootDocument({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <HeadContent />
      </head>
      <body className="min-h-dvh bg-background font-sans text-foreground antialiased">
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function Logo() {
  return (
    <Link to="/" className="block rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
      <span className="flex flex-col">
        <img src="/logo.png" alt="FlowerMarket.lk" className="h-8 w-auto self-start" />
        <span className="mt-1 font-display text-sm text-muted-foreground">
          Supplier Portal
        </span>
      </span>
    </Link>
  );
}

function LocaleToggle({ locale }: { locale: Locale }) {
  const router = useRouter();
  async function handleToggle() {
    const next: Locale = locale === "en" ? "si" : "en";
    await setLocale({ data: next });
    await router.invalidate();
  }
  return (
    <button
      type="button"
      className="rounded-md px-2 py-1 text-left text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      onClick={() => void handleToggle()}
    >
      {locale === "en" ? "සිංහල" : "English"}
    </button>
  );
}

function SidebarNav() {
  const { t } = useT();
  return (
    <nav className="mt-6 flex flex-col gap-1 text-sm">
      <Link
        to="/"
        className="rounded-md border-l-2 border-transparent px-3 py-2 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        activeProps={{
          className: "border-brand bg-accent font-medium text-brand",
        }}
        activeOptions={{ exact: true }}
      >
        {t.nav.dashboard}
      </Link>
      <Link
        to="/products"
        className="rounded-md border-l-2 border-transparent px-3 py-2 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        activeProps={{
          className: "border-brand bg-accent font-medium text-brand",
        }}
      >
        {t.nav.products}
      </Link>
      <Link
        to="/shop"
        className="rounded-md border-l-2 border-transparent px-3 py-2 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        activeProps={{
          className: "border-brand bg-accent font-medium text-brand",
        }}
      >
        {t.nav.shopSettings}
      </Link>
    </nav>
  );
}

function SessionFooter({ session }: { session: SupplierSession }) {
  const { t } = useT();
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);

  async function handleSignOut() {
    setBusy(true);
    try {
      await signOut();
      await router.invalidate();
      await router.navigate({ to: "/login" });
    } finally {
      setBusy(false);
    }
  }

  const email =
    session.kind === "supplier" || session.kind === "no_shop"
      ? session.email
      : null;

  return (
    <div>
      {email && (
        <p className="truncate px-3 text-xs text-muted-foreground">{email}</p>
      )}
      {session.kind !== "auth_disabled" && session.kind !== "config_error" && (
        <Button
          variant="ghost"
          size="sm"
          className="mt-1 w-full justify-start gap-2 px-3 text-muted-foreground"
          disabled={busy}
          onClick={() => void handleSignOut()}
        >
          <LogOut className="size-4" />
          {t.auth.signOut}
        </Button>
      )}
    </div>
  );
}

function RootLayout() {
  const { session, locale } = Route.useRouteContext();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  const isFullBleed =
    pathname === "/login" || pathname === "/onboarding";

  return (
    <I18nProvider locale={locale}>
      {isFullBleed ? (
        <>
          <Outlet />
          <Toaster />
        </>
      ) : (
        <div className="flex min-h-dvh">
          <aside className="sticky top-0 hidden h-dvh w-56 shrink-0 flex-col border-r border-border bg-card p-4 sm:flex">
            <Logo />
            <SidebarNav />
            <div className="mt-auto flex flex-col gap-2 border-t border-border pt-3">
              <LocaleToggle locale={locale} />
              <SessionFooter session={session} />
            </div>
          </aside>
          <main className="flex-1 p-6 sm:p-8">
            <div className="mx-auto max-w-4xl">
              <Outlet />
            </div>
          </main>
          <Toaster />
        </div>
      )}
    </I18nProvider>
  );
}
