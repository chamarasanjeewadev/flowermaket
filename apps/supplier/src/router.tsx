import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createRouter as createTanStackRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";

export function getRouter() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { staleTime: 30_000 } },
  });

  const router = createTanStackRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    defaultPreload: "intent",
    defaultPreloadStaleTime: 0,
    defaultPendingMs: 150,
    defaultPendingComponent: () => <p role="status" className="p-6 text-muted-foreground">Loading page…</p>,
    defaultErrorComponent: ({ error, reset }) => <div role="alert" className="space-y-3 p-6"><h1 className="text-lg font-semibold">This page could not load</h1><p>{error.message}</p><button type="button" className="min-h-11 rounded-md border px-4" onClick={reset}>Try again</button></div>,
    Wrap: ({ children }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    ),
  });

  return router;
}

declare module "@tanstack/react-router" {
  interface Register {
    router: ReturnType<typeof getRouter>;
  }
}
