/**
 * Shop server functions for the Supplier Portal.
 */
import { createServerFn } from "@tanstack/react-start";
import {
  requireDb,
  createShop,
  updateShop,
  type CreateShopInput,
  type UpdateShopInput,
  type ActionResult,
} from "@flowers/api";
import { resolveSupplierSession } from "./session";

export const createShopFn = createServerFn({ method: "POST" })
  .validator((input: CreateShopInput) => input)
  .handler(async ({ data }): Promise<ActionResult<{ id: string; slug: string }>> => {
    const session = await resolveSupplierSession();
    if (session.kind === "anonymous") {
      return { ok: false, code: "auth_required", message: "You must be signed in." };
    }
    if (session.kind === "auth_disabled") {
      // Dev mode: simulate success without hitting the DB.
      return { ok: true, data: { id: "dev-shop-id", slug: "dev-shop" } };
    }

    const userId = session.kind === "no_shop" ? session.userId : session.userId;
    const db = requireDb();
    return createShop(db, userId, data);
  });

export const updateShopFn = createServerFn({ method: "POST" })
  .validator((input: UpdateShopInput) => input)
  .handler(async ({ data }): Promise<ActionResult<{ id: string }>> => {
    const session = await resolveSupplierSession();
    if (session.kind === "anonymous") {
      return { ok: false, code: "auth_required", message: "You must be signed in." };
    }
    if (session.kind === "auth_disabled") {
      return { ok: true, data: { id: "dev-shop-id" } };
    }
    if (session.kind === "no_shop") {
      return { ok: false, code: "not_found", message: "You do not have a shop yet." };
    }

    const db = requireDb();
    return updateShop(db, session.userId, data);
  });
