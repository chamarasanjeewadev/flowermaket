import * as React from "react";
import { Link, useRouter, useRouterState } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button, buttonVariants } from "@flowers/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@flowers/ui/components/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@flowers/ui/components/dropdown-menu";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetTitle,
  SheetTrigger,
} from "@flowers/ui/components/sheet";
import { cn } from "@flowers/ui/lib/utils";
import { Check, Globe, Menu, Search, ShoppingBag } from "lucide-react";
import { LOCALES, type Locale } from "../i18n";
import { useT } from "../i18n/react";
import { signOut } from "../server/auth";
import { setLocale } from "../server/locale";
import { refreshSession, type SessionUser } from "../lib/session";
import { useEnquiry } from "../lib/enquiry";

const LANGUAGES: ReadonlyArray<{
  code: Locale;
  label: string;
  short: string;
}> = [
  { code: "en", label: "English", short: "EN" },
  { code: "si", label: "සිංහල", short: "සිං" },
];

/**
 * Locale switcher: rewrites the current path's locale prefix + sets cookie.
 * E.g. /si/login → /en/login when switching to English.
 */
function LanguageSwitcher() {
  const router = useRouter();
  const { t, locale } = useT();
  const routerState = useRouterState();
  const [busy, setBusy] = React.useState(false);
  const current = LANGUAGES.find((l) => l.code === locale) ?? LANGUAGES[0]!;

  async function select(code: Locale) {
    if (code === locale || busy) return;
    setBusy(true);
    try {
      await setLocale({ data: code });
      // Rewrite path: replace the locale segment at position 1
      const pathname = routerState.location.pathname;
      // pathname is like /en/login or /si/
      const segments = pathname.split("/"); // ["", "en", "login"]
      // Confirm segment[1] is one of our locales before replacing
      if (segments[1] !== undefined && (LOCALES as readonly string[]).includes(segments[1])) {
        segments[1] = code;
      } else {
        segments.splice(1, 0, code);
      }
      const newPath = segments.join("/") || "/";
      router.history.push(newPath);
    } finally {
      setBusy(false);
    }
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" aria-label={t.nav.changeLanguage}>
          <Globe className="size-4" aria-hidden="true" />
          <span className="text-xs font-semibold">{current.short}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-36">
        {LANGUAGES.map((l) => (
          <DropdownMenuItem
            key={l.code}
            lang={l.code}
            onSelect={() => void select(l.code)}
            className="flex items-center justify-between"
          >
            {l.label}
            {l.code === locale && (
              <Check className="size-4 text-primary" aria-hidden="true" />
            )}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function Wordmark({ ariaLabel }: { ariaLabel: string }) {
  const { locale } = useT();
  return (
    <Link
      to="/$locale"
      params={{ locale }}
      className="inline-flex rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      aria-label={ariaLabel}
    >
      <img src="/logo.png" alt={ariaLabel} className="h-9 w-auto" />
    </Link>
  );
}

/** "Sign in" affordance while Supabase is not configured yet. */
function AuthDisabledSignIn({ className }: { className?: string }) {
  const { t } = useT();
  const [open, setOpen] = React.useState(false);
  return (
    <>
      <Button
        variant="outline"
        size="sm"
        className={cn("text-muted-foreground", className)}
        onClick={() => setOpen(true)}
      >
        {t.nav.login}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t.auth.soonTitle}</DialogTitle>
            <DialogDescription>{t.auth.soonBody}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button onClick={() => setOpen(false)}>{t.common.gotIt}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function UserMenu({
  session,
}: {
  session: Extract<SessionUser, { kind: "authenticated" }>;
}) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { t, locale } = useT();
  const [signingOut, setSigningOut] = React.useState(false);

  async function handleSignOut() {
    if (signingOut) return;
    setSigningOut(true);
    try {
      const result = await signOut();
      if (!result.ok) {
        toast.error(result.message);
        return;
      }
      await refreshSession(queryClient, router);
      router.history.push(`/${locale}/`);
      toast.success(t.nav.signedOutToast);
    } finally {
      setSigningOut(false);
    }
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" aria-label={t.nav.accountMenu}>
          {session.fullName ?? session.email}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-48">
        <DropdownMenuItem asChild>
          <Link to="/$locale" params={{ locale }}>
            {t.nav.myAccount}
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem
          onSelect={() => void handleSignOut()}
          disabled={signingOut}
        >
          {t.nav.signOut}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function Header({ session }: { session: SessionUser }) {
  const { t, locale } = useT();
  const { count, hydrated } = useEnquiry();
  const [mobileOpen, setMobileOpen] = React.useState(false);

  const navLink =
    "rounded-full px-3 py-1.5 text-sm font-medium text-foreground/70 transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [&.active]:text-foreground [&.active]:bg-accent";

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background/80 backdrop-blur supports-[backdrop-filter]:bg-background/65">
      <div className="mx-auto flex h-16 max-w-6xl items-center gap-3 px-4 sm:h-[72px]">
        <Wordmark ariaLabel={t.nav.homeAria} />

        <nav
          aria-label={t.nav.siteNavigation}
          className="mx-auto hidden items-center gap-1 md:flex"
        >
          <Link to="/$locale" params={{ locale }} className={navLink}>
            {t.nav.home}
          </Link>
          <Link to="/$locale/products" params={{ locale }} className={navLink}>
            {t.nav.browse}
          </Link>
          <Link
            to="/$locale/products"
            params={{ locale }}
            search={{ type: "wholesale" }}
            className={navLink}
          >
            {t.nav.wholesale}
          </Link>
          <Link to="/$locale/blog" params={{ locale }} className={navLink}>
            {t.nav.guides}
          </Link>
        </nav>

        <div className="flex items-center gap-1.5 md:ml-0">
          <Link
            to="/$locale/products"
            params={{ locale }}
            aria-label={t.nav.browse}
            className="hidden size-10 items-center justify-center rounded-full text-foreground transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:inline-flex"
          >
            <Search className="size-[18px]" aria-hidden="true" />
          </Link>
          <LanguageSwitcher />
          {session.kind === "authenticated" ? (
            <UserMenu session={session} />
          ) : session.kind === "auth_disabled" ? (
            <AuthDisabledSignIn className="hidden sm:inline-flex" />
          ) : (
            <Link
              to="/$locale/login"
              params={{ locale }}
              className={cn(
                buttonVariants({ size: "sm" }),
                "hidden sm:inline-flex",
              )}
            >
              {t.nav.login}
            </Link>
          )}

          <Link
            to="/$locale/enquiry"
            params={{ locale }}
            aria-label={t.nav.enquiry}
            className="relative inline-flex size-10 items-center justify-center rounded-full bg-brand text-brand-foreground transition-colors hover:bg-brand/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          >
            <ShoppingBag className="size-[18px]" aria-hidden="true" />
            {hydrated && count > 0 && (
              <span className="absolute -right-1 -top-1 flex min-w-5 items-center justify-center rounded-full bg-foreground px-1.5 text-xs font-semibold text-background">
                {count}
              </span>
            )}
          </Link>

          <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
            <SheetTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="md:hidden"
                aria-label={t.nav.openMenu}
              >
                <Menu className="size-5" aria-hidden="true" />
              </Button>
            </SheetTrigger>
            <SheetContent side="right" className="w-72">
              <SheetTitle className="text-left">
                <img src="/logo.png" alt="FlowerMarket.lk" className="h-8 w-auto" />
              </SheetTitle>
              <SheetDescription className="sr-only">
                {t.nav.siteNavigation}
              </SheetDescription>
              <nav aria-label="Mobile" className="mt-6 flex flex-col gap-1">
                <Link
                  to="/$locale/products"
                  params={{ locale }}
                  onClick={() => setMobileOpen(false)}
                  className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-foreground transition-colors hover:bg-accent"
                >
                  {t.nav.browse}
                </Link>
                <Link
                  to="/$locale/products"
                  params={{ locale }}
                  search={{ type: "wholesale" }}
                  onClick={() => setMobileOpen(false)}
                  className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-foreground transition-colors hover:bg-accent"
                >
                  {t.nav.wholesale}
                </Link>
                <Link
                  to="/$locale/blog"
                  params={{ locale }}
                  onClick={() => setMobileOpen(false)}
                  className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-foreground transition-colors hover:bg-accent"
                >
                  {t.nav.guides}
                </Link>
              </nav>
              <div className="mt-6 space-y-2 border-t pt-6">
                {session.kind === "anonymous" && (
                  <Link
                    to="/$locale/login"
                    params={{ locale }}
                    onClick={() => setMobileOpen(false)}
                    className={cn(buttonVariants(), "w-full")}
                  >
                    {t.nav.login}
                  </Link>
                )}
                {session.kind === "auth_disabled" && (
                  <AuthDisabledSignIn className="w-full" />
                )}
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </header>
  );
}
