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
import { LogOut, ShieldAlert } from "lucide-react";
import { getAdminSession, signOut, type AdminSession } from "../server/auth";
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
      { title: "Admin — Flowers.lk" },
      { name: "robots", content: "noindex,nofollow" },
    ],
    links: [{ rel: "stylesheet", href: appCss }],
  }),
  beforeLoad: async ({ location }) => {
    const session = await getAdminSession();

    // Unauthenticated → /login
    if (session.kind === "anonymous" && location.pathname !== "/login") {
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
      <body className="min-h-dvh bg-muted/30 font-sans antialiased">
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function Logo() {
  return (
    <p className="flex items-center gap-2 text-base font-bold">
      <span>
        <span className="text-primary">Flowers</span>.lk
      </span>
      <span className="rounded bg-destructive px-1.5 py-0.5 text-[10px] font-semibold text-destructive-foreground">
        ADMIN
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
    <div className="mt-auto border-t pt-3">
      <p className="truncate px-3 text-xs text-muted-foreground">
        {session.kind === "admin" ? session.email : "Dev mode — no auth"}
      </p>
      {session.kind !== "auth_disabled" && (
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
    <div className="flex min-h-dvh items-center justify-center p-6">
      <div className="w-full max-w-sm rounded-xl border bg-background p-8 text-center shadow-sm">
        <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-destructive/10">
          <ShieldAlert className="size-6 text-destructive" />
        </div>
        <h1 className="mt-4 text-lg font-semibold">Not authorized</h1>
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
      <aside className="sticky top-0 hidden h-dvh w-56 shrink-0 flex-col border-r bg-background p-4 sm:flex">
        <Logo />
        <nav className="mt-6 flex flex-col gap-1 text-sm">
          <Link
            to="/"
            className="rounded-md px-3 py-2 hover:bg-accent"
            activeProps={{ className: "bg-accent font-medium" }}
            activeOptions={{ exact: true }}
          >
            Dashboard
          </Link>
        </nav>
        <SessionFooter session={session} />
      </aside>
      <main className="flex-1 p-6">
        <Outlet />
      </main>
      <Toaster />
    </div>
  );
}
