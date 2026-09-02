import type { QueryClient } from "@tanstack/react-query";
import {
  HeadContent,
  Link,
  Outlet,
  Scripts,
  createRootRouteWithContext,
  useRouterState,
} from "@tanstack/react-router";
import { isLocale, type Locale } from "../i18n";
import { Toaster } from "@flowers/ui/components/sonner";
import { buttonVariants } from "@flowers/ui/components/button";
import { SearchX } from "lucide-react";
import { Footer } from "../components/Footer";
import { Header } from "../components/Header";
import { getDict } from "../i18n";
import { I18nProvider } from "../i18n/react";

/** Extract locale from the current URL path (/en/..., /si/...) or fall back to "en". */
function localeFromPath(pathname: string): Locale {
  const seg = pathname.split("/")[1];
  return isLocale(seg) ? seg : "en";
}
import { sessionQueryOptions } from "../lib/session";
import { siteUrl } from "../lib/site";
import { getLocale } from "../server/locale";
import appCss from "../styles.css?url";

interface RouterContext {
  queryClient: QueryClient;
}

export const Route = createRootRouteWithContext<RouterContext>()({
  beforeLoad: async ({ context }) => {
    // Fetched once per navigation and exposed to the whole tree.
    const [session, locale] = await Promise.all([
      context.queryClient.ensureQueryData(sessionQueryOptions()),
      getLocale(),
    ]);
    return { session, locale };
  },
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      {
        title: "Flowers.lk — Sri Lanka's flower marketplace",
      },
      {
        name: "description",
        content:
          "Shop fresh flowers, arrangements and bouquets from local growers and florists across Sri Lanka — in English and සිංහල.",
      },
      { name: "theme-color", content: "#0f766e" },
      { property: "og:type", content: "website" },
      { property: "og:site_name", content: "Flowers.lk" },
      {
        property: "og:title",
        content: "Flowers.lk — Sri Lanka's flower marketplace",
      },
      {
        property: "og:description",
        content:
          "Fresh flowers and arrangements from local growers and florists across Sri Lanka.",
      },
      { property: "og:url", content: siteUrl() },
      { name: "twitter:card", content: "summary" },
    ],
    links: [{ rel: "stylesheet", href: appCss }],
  }),
  shellComponent: RootDocument,
  component: RootLayout,
  notFoundComponent: NotFoundPage,
});

function RootDocument({ children }: { children: React.ReactNode }) {
  const routerState = useRouterState();
  const locale = localeFromPath(routerState.location.pathname);
  return (
    <html lang={locale} suppressHydrationWarning>
      <head>
        <HeadContent />
      </head>
      <body className="min-h-dvh font-sans antialiased">
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootLayout() {
  const { session } = Route.useRouteContext();
  const routerState = useRouterState();
  const locale = localeFromPath(routerState.location.pathname);
  return (
    <I18nProvider locale={locale}>
      <div className="flex min-h-dvh flex-col">
        <Header session={session} />
        <main className="flex-1">
          <Outlet />
        </main>
        <Footer />
        <Toaster position="top-center" />
      </div>
    </I18nProvider>
  );
}

function NotFoundPage() {
  const routerState = useRouterState();
  const locale = localeFromPath(routerState.location.pathname);
  const t = getDict(locale);
  return (
    <div className="mx-auto flex max-w-xl flex-col items-center gap-4 px-4 py-24 text-center">
      <span className="flex size-14 items-center justify-center rounded-full bg-muted text-muted-foreground">
        <SearchX className="size-7" aria-hidden="true" />
      </span>
      <h1 className="text-2xl font-bold">{t.common.notFoundTitle}</h1>
      <p className="text-muted-foreground">{t.common.notFoundBody}</p>
      <div className="mt-2 flex gap-3">
        <Link to="/" className={buttonVariants({ variant: "outline" })}>
          {t.common.goHome}
        </Link>
      </div>
    </div>
  );
}
