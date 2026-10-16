import { createServerFn } from "@tanstack/react-start";
import { requireDb, getSupplierReadiness, listSupplierOrders, updateSupplierFulfilment, savePortalSettings, submitShopReview, askSupplierQuestion, type PortalSettingsInput } from "@flowers/api";
import { resolveSupplierSession } from "./session";

export const listOrdersFn = createServerFn({ method: "GET" }).handler(async () => {
  const session = await resolveSupplierSession();
  if (session.kind !== "supplier" || !session.shopId) return [];
  return listSupplierOrders(requireDb(), session.shopId);
});
export const getReadinessFn = createServerFn({ method: "GET" }).handler(async () => {
  const session = await resolveSupplierSession();
  if (session.kind !== "supplier" || !session.shopId) return null;
  return getSupplierReadiness(requireDb(), session.shopId);
});
export const saveSettingsFn = createServerFn({ method: "POST" }).validator((input: PortalSettingsInput) => input).handler(async ({ data }) => {
  const session = await resolveSupplierSession();
  if (session.kind !== "supplier" || !session.shopId) return { ok: false as const, code: "auth_required" as const, message: "Sign in to save your settings." };
  return savePortalSettings(requireDb(), session.shopId, data);
});
export const submitReviewFn = createServerFn({ method: "POST" }).handler(async () => {
  const session = await resolveSupplierSession();
  if (session.kind !== "supplier" || !session.shopId) return { ok: false as const, message: "Sign in to submit your shop." };
  return submitShopReview(requireDb(), session.shopId);
});
export const updateFulfilmentFn = createServerFn({ method: "POST" }).validator((input: { awardId: string; next: string }) => input).handler(async ({ data }) => {
  const session = await resolveSupplierSession();
  if (session.kind !== "supplier" || !session.shopId) return { ok: false as const, message: "Sign in to update confirmed work." };
  return updateSupplierFulfilment(requireDb(), session.shopId, session.userId, data.awardId, data.next);
});
export const askQuestionFn = createServerFn({ method: "POST" }).validator((input: { rfqId: string; text: string }) => input).handler(async ({ data }) => {
  const session = await resolveSupplierSession();
  if (session.kind !== "supplier" || !session.shopId) return { ok: false as const, message: "Sign in to ask a question." };
  return askSupplierQuestion(requireDb(), session.shopId, data.rfqId, data.text);
});
