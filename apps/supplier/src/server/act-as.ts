/**
 * "Manage as owner" — lets an admin operate the supplier portal for any shop.
 * The target shop id lives in an admin-only httpOnly cookie that
 * resolveSupplierSession() honours only when the signed-in user is an admin.
 */
import { createServerFn } from "@tanstack/react-start";
import { setCookie } from "@tanstack/react-start/server";
import { getEnv, getShopById, getUserRole, requireDb } from "@flowers/api";
import {
  ACT_AS_COOKIE,
  ACT_AS_MAX_AGE,
  getSupabase,
} from "./session";

export type StartActingResult =
  | { ok: true; shopNameEn: string }
  | { ok: false; message: string };

export const startActingAsFn = createServerFn({ method: "POST" })
  .validator((input: { shopId: string }) => input)
  .handler(async ({ data }): Promise<StartActingResult> => {
    const supabase = getSupabase();
    if (!supabase) return { ok: false, message: "Auth is not configured." };
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) return { ok: false, message: "Sign in first." };

    const db = requireDb();
    if ((await getUserRole(db, auth.user.id)) !== "admin") {
      return { ok: false, message: "Only admins can manage other shops." };
    }
    const shop = await getShopById(db, data.shopId);
    if (!shop) return { ok: false, message: "Shop not found." };

    setCookie(ACT_AS_COOKIE, shop.id, {
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      path: "/",
      maxAge: ACT_AS_MAX_AGE,
    });
    return { ok: true, shopNameEn: shop.nameEn };
  });

/** Stop acting as a shop; returns where to send the admin next. */
export const stopActingAsFn = createServerFn({ method: "POST" }).handler(
  async (): Promise<{ adminUrl: string | null }> => {
    setCookie(ACT_AS_COOKIE, "", {
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      path: "/",
      maxAge: 0,
    });
    const adminUrl = getEnv().ADMIN_URL;
    return { adminUrl: adminUrl ? `${adminUrl.replace(/\/$/, "")}/suppliers` : null };
  },
);
