import type { QueryClient } from "@tanstack/react-query";
import {
  HeadContent,
  Link,
  Outlet,
  Scripts,
  createRootRouteWithContext,
  useRouterState,
} from "@tanstack/react-router";
import { Toaster } from "@flowers/ui/components/sonner";
import { buttonVariants } from "@flowers/ui/components/button";
import { SearchX } from "lucide-react";
import { Footer } from "../components/Footer";
import { Header } from "../components/Header";
import { getDict, isLocale, type Locale } from "../i18n";
import { I18nProvider } from "../i18n/react";
import { sessionQueryOptions } from "../lib/session";
import { siteUrl, absoluteUrl } from "../lib/site";
import appCss from "../styles.css?url";

/** Extract locale from the current URL path (/en/..., /si/...) or fall back to "en". */
function localeFromPath(pathname: string): Locale {
  const seg = pathname.split("/")[1];
  return isLocale(seg) ? seg : "en";
}

interface RouterContext {
  queryClient: QueryClient;
}

export const Route = createRootRouteWithContext<RouterContext>()({
  beforeLoad: async ({ context }) => {
    // Fetched once per navigation and exposed to the whole tree. The active
    // locale is derived from the URL path (see localeFromPath), not context.
    const session = await context.queryClient.ensureQueryData(
      sessionQueryOptions(),
    );
    return { session };
  },
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      {
        title: "FlowerMarket.lk — Sri Lanka's flower marketplace",
      },
      {
        name: "description",
        content:
          "Shop fresh flowers, arrangements and bouquets from local growers and florists across Sri Lanka — in English and සිංහල.",
      },
      { name: "theme-color", content: "#f5f3ee" },
      { property: "og:type", content: "website" },
      { property: "og:site_name", content: "FlowerMarket.lk" },
      {
        property: "og:title",
        content: "FlowerMarket.lk — Sri Lanka's flower marketplace",
      },
      {
        property: "og:description",
        content:
          "Fresh flowers and arrangements from local growers and florists across Sri Lanka.",
      },
      { property: "og:url", content: siteUrl() },
      { property: "og:image", content: absoluteUrl("/og-image.png") },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:image", content: absoluteUrl("/og-image.png") },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "icon", href: "/favicon.ico", sizes: "any" },
      { rel: "icon", type: "image/png", href: "/icons/icon-32.png", sizes: "32x32" },
      { rel: "apple-touch-icon", href: "/icons/apple-touch-icon.png", sizes: "180x180" },
      { rel: "manifest", href: "/site.webmanifest" },
    ],
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
      <h1 className="font-display text-4xl">{t.common.notFoundTitle}</h1>
      <p className="text-muted-foreground">{t.common.notFoundBody}</p>
      <div className="mt-2 flex gap-3">
        <Link to="/" className={buttonVariants({ variant: "outline" })}>
          {t.common.goHome}
        </Link>
      </div>
    </div>
  );
}
