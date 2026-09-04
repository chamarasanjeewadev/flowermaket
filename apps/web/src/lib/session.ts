/** Client-side session plumbing: query options + post-auth refresh helper. */
import { queryOptions, type QueryClient } from "@tanstack/react-query";
import type { AnyRouter } from "@tanstack/react-router";
import { safeRedirectPath } from "@flowers/api/redirect";
import { getSessionUser, type SessionUser } from "../server/auth";

export type { SessionUser };
export { safeRedirectPath };

export const SESSION_QUERY_KEY = ["session"] as const;

/** Shared session query — the root beforeLoad ensures it once per navigation. */
export function sessionQueryOptions() {
  return queryOptions<SessionUser>({
    queryKey: SESSION_QUERY_KEY,
    queryFn: () => getSessionUser(),
    staleTime: 60_000,
  });
}

/** Drop the cached session and re-run loaders after sign-in/out. */
export async function refreshSession(
  queryClient: QueryClient,
  router: AnyRouter,
): Promise<void> {
  queryClient.removeQueries({ queryKey: SESSION_QUERY_KEY });
  await router.invalidate();
}
