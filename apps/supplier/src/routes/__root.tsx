import * as React from "react";
import { stopActingAsFn } from "../server/act-as";
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
import { safeRedirectPath } from "@flowers/api/redirect";
import {
  Flower2,
  Inbox,
  LayoutGrid,
  LogOut,
  Menu,
  Package,
  Palette,
  Store,
  type LucideIcon,
} from "lucide-react";
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
    const isPublicPath =
      path === "/login" ||
      path === "/register" ||
      path === "/auth/callback" ||
      path.startsWith("/join");

    // Misconfigured server (Supabase env absent, AUTH_DISABLED not set) — fail closed.
    if (session.kind === "config_error" && !isPublicPath) {
      throw redirect({ to: "/login" });
    }
    // Unauthenticated → /login
    if (session.kind === "anonymous" && !isPublicPath) {
      // Keep the admin's "manage as owner" target across sign-in.
      throw redirect({
        to: "/login",
        search: { redirect: safeRedirectPath(location.href.replace(/^https?:\/\/[^/]+/, "")) },
      });
    }

    // Authenticated but no shop → /onboarding (unless already there or at /login)
    if (
      session.kind === "no_shop" &&
      path !== "/onboarding" &&
      path !== "/login" && !isPublicPath
    ) {
      throw redirect({ to: "/onboarding", search: { redirect: safeRedirectPath(location.href.replace(/^https?:\/\/[^/]+/, "")) } });
    }

    // Authenticated with shop (or admin) → skip login/onboarding
    if (
      session.kind === "supplier" &&
      (path === "/login" || path === "/onboarding")
    ) {
      const target = safeRedirectPath(new URLSearchParams(location.searchStr).get("redirect") ?? undefined);
      throw redirect({ href: ["/login", "/onboarding", "/auth/callback", "/register"].includes(target.split("?")[0]!) ? "/" : target });
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
        <img src="/logo.png" alt="FlowerMarket.lk" className="h-7 w-auto self-start" />
        <span className="mt-1.5 text-[12px] font-medium text-muted-foreground">
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
      className="flex min-h-9 items-center rounded-lg px-3 text-left text-[13px] text-muted-foreground transition-colors hover:bg-foreground/[0.05] hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      onClick={() => void handleToggle()}
    >
      {locale === "en" ? "සිංහල" : "English"}
    </button>
  );
}

function useNavLinks() {
  const { t, locale } = useT();
  return [
    { to: "/", label: t.nav.dashboard, Icon: LayoutGrid },
    { to: "/rfqs", label: t.nav.rfqs, Icon: Inbox },
    {
      to: "/orders",
      label: locale === "si" ? "තහවුරු කළ ඇණවුම්" : "Orders",
      Icon: Package,
    },
    { to: "/products", label: t.nav.products, Icon: Flower2 },
    { to: "/shop", label: t.nav.shopSettings, Icon: Store },
  ] as const satisfies ReadonlyArray<{
    to: string;
    label: string;
    Icon: LucideIcon;
  }>;
}

const sidebarItem =
  "flex min-h-9 items-center gap-2.5 rounded-lg px-3 text-[14px] text-foreground/80 transition-colors hover:bg-foreground/[0.05] hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [&_svg]:size-[18px] [&_svg]:text-muted-foreground data-[status=active]:bg-card data-[status=active]:font-medium data-[status=active]:text-foreground data-[status=active]:shadow-[0_1px_2px_rgb(22_22_42/0.08)] data-[status=active]:[&_svg]:text-brand";

function SidebarNav() {
  const { t, locale } = useT();
  const links = useNavLinks();
  return (
    <nav
      aria-label={locale === "si" ? "සැපයුම්කරු සංචාලනය" : "Supplier navigation"}
      className="mt-6 flex flex-col gap-0.5"
    >
      {links.map(({ to, label, Icon }) => (
        <Link
          key={to}
          to={to}
          className={sidebarItem}
          activeProps={{ "aria-current": "page" }}
          activeOptions={{ exact: to === "/" }}
        >
          <Icon aria-hidden="true" />
          {label}
        </Link>
      ))}
      <p className="mt-5 px-3 pb-1 text-[12px] font-medium text-muted-foreground">
        {locale === "si" ? "මෙවලම්" : "Tools"}
      </p>
      <Link
        to="/bouquet-design"
        className={sidebarItem}
      >
        <Palette aria-hidden="true" />
        {t.nav.designBouquet}
      </Link>
    </nav>
  );
}

/** Phone navigation: iOS-style tab bar pinned to the bottom edge. */
function TabBar() {
  const { locale } = useT();
  const links = useNavLinks();
  return (
    <nav
      aria-label={locale === "si" ? "සැපයුම්කරු සංචාලනය" : "Supplier navigation"}
      className="glass fixed inset-x-0 bottom-0 z-40 border-t border-foreground/[0.08] pb-[env(safe-area-inset-bottom)] sm:hidden"
    >
      <ul className="grid grid-cols-5">
        {links.map(({ to, label, Icon }) => (
          <li key={to}>
            <Link
              to={to}
              className="flex h-14 flex-col items-center justify-center gap-1 px-1 text-[10px] font-medium text-muted-foreground data-[status=active]:text-brand-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
              activeProps={{ "aria-current": "page" }}
              activeOptions={{ exact: to === "/" }}
            >
              <Icon className="size-[22px]" strokeWidth={1.75} aria-hidden="true" />
              <span className="w-full truncate text-center">{label}</span>
            </Link>
          </li>
        ))}
      </ul>
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
        <p className="truncate px-3 text-[12px] text-muted-foreground">{email}</p>
      )}
      {session.kind !== "auth_disabled" && session.kind !== "config_error" && (
        <Button
          variant="ghost"
          size="sm"
          className="mt-1 h-9 w-full justify-start gap-2.5 rounded-lg px-3 text-[13px] text-muted-foreground"
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

/** Phone top bar: logo plus an overflow menu for tools, language and sign-out. */
function PhoneTopBar({
  session,
  locale,
  pathname,
}: {
  session: SupplierSession;
  locale: Locale;
  pathname: string;
}) {
  const { t } = useT();
  return (
    <header className="glass sticky top-0 z-30 flex h-14 items-center justify-between border-b border-foreground/[0.06] px-4 sm:hidden">
      <Link to="/" aria-label="FlowerMarket.lk Supplier Portal">
        <img src="/logo.png" alt="FlowerMarket.lk" className="h-7 w-auto" />
      </Link>
      <details key={pathname} className="group relative">
        <summary
          aria-label={locale === "si" ? "තවත්" : "More"}
          className="flex size-10 cursor-pointer list-none items-center justify-center rounded-full hover:bg-foreground/[0.06] [&::-webkit-details-marker]:hidden"
        >
          <Menu className="size-5" aria-hidden="true" />
        </summary>
        <div className="absolute right-0 top-12 w-60 rounded-2xl border border-border/70 bg-popover p-1.5 shadow-float">
          <Link to="/bouquet-design" className={sidebarItem}>
            <Palette aria-hidden="true" />
            {t.nav.designBouquet}
          </Link>
          <LocaleToggle locale={locale} />
          <SessionFooter session={session} />
        </div>
      </details>
    </header>
  );
}

/** Shown while an admin is managing someone else's shop. */
function ActingAsBanner({ shopName }: { shopName: string }) {
  const [busy, setBusy] = React.useState(false);
  async function exit() {
    setBusy(true);
    try {
      const { adminUrl } = await stopActingAsFn();
      window.location.href = adminUrl ?? "/";
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="mx-auto mb-6 flex max-w-4xl flex-wrap items-center justify-between gap-3 rounded-2xl bg-brand/10 px-4 py-2.5 text-sm">
      <span>
        <span className="font-semibold">Admin</span> · Managing{" "}
        <span className="font-semibold">{shopName}</span> as owner. Changes you
        make are published without review.
      </span>
      <Button size="sm" variant="outline" disabled={busy} onClick={() => void exit()}>
        Exit
      </Button>
    </div>
  );
}

function RootLayout() {
  const { session, locale } = Route.useRouteContext();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  const isFullBleed =
    pathname === "/login" ||
    pathname === "/register" ||
    pathname === "/onboarding";

  return (
    <I18nProvider locale={locale}>
      {isFullBleed ? (
        <>
          <Outlet />
          <Toaster />
        </>
      ) : (
        <div className="flex min-h-dvh">
          <a href="#main-content" className="sr-only focus:not-sr-only focus:fixed focus:z-50 focus:bg-card focus:p-4">Skip to content</a>
          <aside className="sticky top-0 hidden h-dvh w-60 shrink-0 flex-col border-r border-border/70 bg-stage px-3 py-5 sm:flex">
            <div className="px-3">
              <Logo />
            </div>
            <SidebarNav />
            <div className="mt-auto flex flex-col gap-0.5 border-t border-border/70 pt-3">
              <LocaleToggle locale={locale} />
              <SessionFooter session={session} />
            </div>
          </aside>
          <div className="min-w-0 flex-1">
            <PhoneTopBar session={session} locale={locale} pathname={pathname} />
            <main
              id="main-content"
              className="px-4 pb-28 pt-6 sm:px-10 sm:pb-16 sm:pt-10"
            >
              {session.kind === "supplier" && session.actingAs && (
                <ActingAsBanner shopName={session.shopNameEn} />
              )}
              <div className="mx-auto max-w-4xl">
                <Outlet />
              </div>
            </main>
          </div>
          <TabBar />
          <Toaster />
        </div>
      )}
    </I18nProvider>
  );
}
