import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { Button } from "@flowers/ui/components/button";
import { safeRedirectPath } from "@flowers/api/redirect";
import { startActingAsFn } from "../server/act-as";

/** Entry point from the admin portal's "Manage as owner" button. */
export const Route = createFileRoute("/act-as/$shopId")({
  validateSearch: (search: Record<string, unknown>): { next?: string } => ({
    next: typeof search.next === "string" ? search.next : undefined,
  }),
  loaderDeps: ({ search }) => ({ next: search.next }),
  loader: async ({ params, deps }) => {
    const result = await startActingAsFn({ data: { shopId: params.shopId } });
    // `next` lets the admin deep-link (e.g. /products/<id>); same-site paths only.
    if (result.ok) throw redirect({ href: safeRedirectPath(deps.next) });
    return { message: result.message };
  },
  component: ActAsFailed,
});

function ActAsFailed() {
  const { message } = Route.useLoaderData();
  return (
    <div className="mx-auto max-w-md space-y-4 py-16 text-center">
      <h1 className="font-display text-2xl">Can't manage this shop</h1>
      <p className="text-sm text-muted-foreground">{message}</p>
      <Button asChild variant="outline">
        <Link to="/">Back to dashboard</Link>
      </Button>
    </div>
  );
}
