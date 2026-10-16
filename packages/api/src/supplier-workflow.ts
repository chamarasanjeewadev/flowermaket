/** Browser-safe workflow rules shared by the portal and its server authorization. */
export const CONFIRMED_ORDER_STATUSES = [
  "confirmed", "invoiced", "paid", "fulfilling", "completed",
] as const;

export const FULFILMENT_NEXT = {
  confirmed: "preparing",
  preparing: "ready",
  ready: "handed_over",
  handed_over: "completed",
} as const;

export type FulfilmentStatus = keyof typeof FULFILMENT_NEXT | "completed";

export function isConfirmedOrder(status: string): boolean {
  return CONFIRMED_ORDER_STATUSES.some((confirmed) => confirmed === status);
}

export function nextFulfilmentStatus(
  orderStatus: string,
  current: string,
): FulfilmentStatus | undefined {
  if (orderStatus === "completed" || !isConfirmedOrder(orderStatus)) return undefined;
  if (!Object.hasOwn(FULFILMENT_NEXT, current)) return undefined;
  return FULFILMENT_NEXT[current as keyof typeof FULFILMENT_NEXT];
}

export function canUpdateFulfilment(orderStatus: string, current: string, next: string): boolean {
  return nextFulfilmentStatus(orderStatus, current) === next;
}

interface StoreProfile {
  descriptionEn: string | null;
  serviceSettings: { areas: string; delivery: boolean; collection: boolean } | null;
}

export function storeReviewChecklist(shop: StoreProfile, hasProduct: boolean) {
  const description = Boolean(shop.descriptionEn?.trim());
  const services = Boolean(
    shop.serviceSettings?.areas.trim() &&
    (shop.serviceSettings.delivery || shop.serviceSettings.collection),
  );
  return { description, services, hasProduct, ready: description && services && hasProduct };
}
