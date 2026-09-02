/**
 * Server-only session helpers for the Supplier Portal.
 * NEVER import this module from client components — it touches TanStack
 * Start's request-scoped cookie APIs.
 */
import { getCookies, setCookie } from "@tanstack/react-start/server";
import { createSupabaseServerClient } from "@flowers/auth";
import { getEnv, tryCreateDb, getUserRole, getShopByOwner } from "@flowers/api";

/**
 * The session union every route sees via router context.
 *
 * - `auth_disabled` — AUTH_DISABLED=1 set; dev browsing without accounts.
 * - `config_error`  — Supabase env vars absent without AUTH_DISABLED=1 (fail closed).
 * - `anonymous`     — Supabase configured, no valid session cookie.
 * - `no_shop`       — authenticated, any role, but no shop row yet.
 *                     These users are redirected to /onboarding.
 * - `supplier`      — authenticated with a shop (or admin, who skips onboarding).
 */
export type SupplierSession =
  | { kind: "auth_disabled" }
  | { kind: "config_error" }
  | { kind: "anonymous" }
  | { kind: "no_shop"; userId: string; email: string }
  | { kind: "supplier"; userId: string; email: string; role: "buyer" | "supplier" | "admin"; shopId: string; shopNameEn: string; verificationStatus: "unverified" | "pending" | "verified" | "rejected" };

type SetCookieOptions = Parameters<typeof setCookie>[2];

export function getSupabase() {
  const env = getEnv();
  if (!env.SUPABASE_URL || !env.SUPABASE_ANON_KEY) return null;
  return createSupabaseServerClient(
    { url: env.SUPABASE_URL, anonKey: env.SUPABASE_ANON_KEY },
    {
      getAll: () =>
        Object.entries(getCookies()).map(([name, value]) => ({ name, value })),
      setAll: (cookies) => {
        for (const c of cookies) {
          setCookie(c.name, c.value, c.options as SetCookieOptions);
        }
      },
    },
  );
}

export async function resolveSupplierSession(): Promise<SupplierSession> {
  const supabase = getSupabase();
  if (!supabase) {
    // Only treat missing Supabase env as intentional when AUTH_DISABLED=1.
    // Otherwise fail closed — the supplier portal must not grant access.
    const { AUTH_DISABLED } = getEnv();
    return AUTH_DISABLED ? { kind: "auth_disabled" } : { kind: "config_error" };
  }

  const { data } = await supabase.auth.getUser();
  const user = data.user;
  if (!user) return { kind: "anonymous" };

  const email = user.email ?? "";
  const userId = user.id;

  const db = tryCreateDb();
  if (!db) {
    // No DB — can't check shop; fall back to no_shop so they go to onboarding
    return { kind: "no_shop", userId, email };
  }

  const role = await getUserRole(db, userId);

  // Admins skip the shop check — they always have full access.
  if (role === "admin") {
    // For admins without a shop we still allow access — return a synthetic session.
    const shop = await getShopByOwner(db, userId);
    if (!shop) {
      // Admin with no personal shop: grant access anyway.
      return {
        kind: "supplier",
        userId,
        email,
        role: "admin",
        shopId: "",
        shopNameEn: "",
        verificationStatus: "verified",
      };
    }
    return {
      kind: "supplier",
      userId,
      email,
      role: "admin",
      shopId: shop.id,
      shopNameEn: shop.nameEn,
      verificationStatus: shop.verificationStatus,
    };
  }

  // Buyers and suppliers: check if they have a shop.
  const shop = await getShopByOwner(db, userId);
  if (!shop) {
    return { kind: "no_shop", userId, email };
  }

  return {
    kind: "supplier",
    userId,
    email,
    role: role ?? "buyer",
    shopId: shop.id,
    shopNameEn: shop.nameEn,
    verificationStatus: shop.verificationStatus,
  };
}
