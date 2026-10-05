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
import {
  Sheet,
  SheetContent,
  SheetTitle,
  SheetTrigger,
} from "@flowers/ui/components/sheet";
import { LogOut, Menu, ShieldAlert } from "lucide-react";
import { getAdminSession, signOut, type AdminSession } from "../server/auth";
import { Toaster } from "../components/toaster";
import appCss from "../styles.css?url";

const NAV_ITEMS = [
  { to: "/", label: "Dashboard", exact: true },
  { to: "/orders", label: "Orders", exact: false },
  { to: "/suppliers", label: "Suppliers", exact: false },
  { to: "/products", label: "Products", exact: false },
  { to: "/whatsapp", label: "WhatsApp", exact: false },
  { to: "/flowers", label: "Flowers", exact: false },
  { to: "/bouquet-usage", label: "Bouquet AI", exact: false },
  { to: "/bouquet-design", label: "Design Bouquet", exact: false },
] as const;

function NavLinks({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <nav className="flex flex-col gap-1 text-sm">
      {NAV_ITEMS.map((item) => (
        <Link
          key={item.to}
          to={item.to}
          onClick={onNavigate}
          className="rounded-md px-3 py-2 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          activeProps={{ className: "bg-accent font-medium text-brand" }}
          activeOptions={item.exact ? { exact: true } : undefined}
        >
          {item.label}
        </Link>
      ))}
    </nav>
  );
}

/** Thin top progress bar shown while the router is loading a new route. */
function RouteProgress() {
  const isLoading = useRouterState({ select: (s) => s.status === "pending" });
  if (!isLoading) return null;
  return (
    <div
      className="fixed inset-x-0 top-0 z-50 h-0.5 animate-pulse bg-brand"
      role="progressbar"
      aria-label="Loading"
    />
  );
}

interface RouterContext {
  queryClient: QueryClient;
}

export const Route = createRootRouteWithContext<RouterContext>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "Admin — FlowerMarket.lk" },
      { name: "robots", content: "noindex,nofollow" },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "icon", href: "/favicon.ico", sizes: "any" },
      { rel: "icon", type: "image/png", href: "/icons/icon-32.png", sizes: "32x32" },
      { rel: "apple-touch-icon", href: "/icons/apple-touch-icon.png", sizes: "180x180" },
    ],
  }),
  beforeLoad: async ({ location }) => {
    const session = await getAdminSession();

    const isPublicPath =
      location.pathname === "/login" || location.pathname === "/auth/callback";
    // Misconfigured server (Supabase env absent, AUTH_DISABLED not set) — fail closed.
    if (session.kind === "config_error" && !isPublicPath) {
      throw redirect({ to: "/login" });
    }
    // Unauthenticated → /login
    if (session.kind === "anonymous" && !isPublicPath) {
      throw redirect({ to: "/login" });
    }
    // Admin → skip login
    if (session.kind === "admin" && location.pathname === "/login") {
      throw redirect({ to: "/" });
    }

    return { session };
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
    <p className="flex items-center gap-2">
      <img src="/logo.png" alt="FlowerMarket.lk" className="h-7 w-auto" />
      <span className="font-display text-base">FlowerMarket.lk</span>
      <span className="rounded bg-destructive px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-destructive-foreground">
        Admin
      </span>
    </p>
  );
}

function SessionFooter({ session }: { session: AdminSession }) {
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

  return (
    <div className="mt-auto border-t border-border pt-3">
      <p className="truncate px-3 text-xs text-muted-foreground">
        {session.kind === "admin" ? session.email : "Dev mode — no auth"}
      </p>
      {session.kind !== "auth_disabled" && session.kind !== "config_error" && (
        <Button
          variant="ghost"
          size="sm"
          className="mt-1 w-full justify-start gap-2 px-3 text-muted-foreground"
          disabled={busy}
          onClick={() => void handleSignOut()}
        >
          <LogOut className="size-4" />
          Sign out
        </Button>
      )}
    </div>
  );
}

function NotAuthorized({
  session,
}: {
  session: Extract<AdminSession, { kind: "forbidden" }>;
}) {
  const router = useRouter();

  async function handleSignOut() {
    await signOut();
    await router.invalidate();
    await router.navigate({ to: "/login" });
  }

  return (
    <div className="flex min-h-dvh items-center justify-center bg-background p-6">
      <div className="w-full max-w-sm rounded-xl border border-border bg-card p-8 text-center shadow-sm">
        <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-destructive/10">
          <ShieldAlert className="size-6 text-destructive" />
        </div>
        <h1 className="mt-4 font-display text-2xl">Not authorized</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          <span className="font-medium text-foreground">{session.email}</span>{" "}
          is signed in but does not have the admin role.
        </p>
        <Button
          className="mt-6 w-full"
          variant="outline"
          onClick={() => void handleSignOut()}
        >
          <LogOut />
          Sign out
        </Button>
      </div>
    </div>
  );
}

function RootLayout() {
  const { session } = Route.useRouteContext();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  if (pathname === "/login") {
    return (
      <>
        <Outlet />
        <Toaster />
      </>
    );
  }

  if (session.kind === "forbidden") {
    return <NotAuthorized session={session} />;
  }

  return (
    <div className="flex min-h-dvh">
      <RouteProgress />

      {/* Desktop sidebar */}
      <aside className="sticky top-0 hidden h-dvh w-56 shrink-0 flex-col border-r border-border bg-card p-4 sm:flex">
        <Logo />
        <div className="mt-6">
          <NavLinks />
        </div>
        <SessionFooter session={session} />
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Mobile top bar with hamburger */}
        <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-border bg-card/95 px-4 py-3 backdrop-blur sm:hidden">
          <MobileNav session={session} />
          <Logo />
        </header>

        <main className="min-w-0 flex-1 p-4 sm:p-6">
          <Outlet />
        </main>
      </div>
      <Toaster />
    </div>
  );
}

function MobileNav({ session }: { session: AdminSession }) {
  const [open, setOpen] = React.useState(false);
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="Open menu">
          <Menu className="size-5" />
        </Button>
      </SheetTrigger>
      <SheetContent side="left" className="flex w-64 flex-col p-4">
        <SheetTitle className="sr-only">Navigation</SheetTitle>
        <Logo />
        <div className="mt-6">
          <NavLinks onNavigate={() => setOpen(false)} />
        </div>
        <SessionFooter session={session} />
      </SheetContent>
    </Sheet>
  );
}
