/**
 * Edge-cache helper for public, non-personalized catalog responses.
 *
 * Cloudflare re-computes every SSR HTML response from the Supabase (Mumbai)
 * DB on each request — measured TTFB ~3.1s. Public catalog pages (home,
 * /products, /c/*, product + shop detail) carry no per-user state and emit no
 * Set-Cookie for anonymous visitors, so they are safe to cache at the edge.
 *
 * `s-maxage` is a *shared*-cache directive (Cloudflare) only; browsers ignore
 * it, so a florist updating a listing is never stuck behind a stale private
 * cache. `stale-while-revalidate` keeps the edge fast during revalidation.
 *
 * When a Supabase auth cookie is present (a signed-in buyer) we send
 * `private, no-cache` so a personalized render is never stored in — or served
 * from — the shared edge cache.
 *
 * Server-only: imports request-scoped APIs. Call inside a server function
 * handler, never at module scope or from a client component.
 */
import { getCookies, setResponseHeader } from "@tanstack/react-start/server";

/** Supabase SSR auth cookies are named `sb-<ref>-auth-token[...]`. */
function hasSupabaseAuthCookie(): boolean {
  return Object.keys(getCookies()).some(
    (name) => name.startsWith("sb-") && name.includes("auth-token"),
  );
}

export function setPublicCatalogCache(): void {
  if (hasSupabaseAuthCookie()) {
    setResponseHeader("Cache-Control", "private, no-cache");
    return;
  }
  setResponseHeader(
    "Cache-Control",
    "public, s-maxage=60, stale-while-revalidate=300",
  );
}
