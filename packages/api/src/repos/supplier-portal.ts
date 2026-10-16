import { and, desc, eq, inArray, ne } from "drizzle-orm";
import { schema } from "@flowers/db/client";
import type { Db } from "../db";
import { err, ok, type ActionResult } from "../errors";

import { CONFIRMED_ORDER_STATUSES, canUpdateFulfilment, isConfirmedOrder, storeReviewChecklist } from "../supplier-workflow";
export { CONFIRMED_ORDER_STATUSES, FULFILMENT_NEXT, canUpdateFulfilment } from "../supplier-workflow";

export async function listSupplierOrders(db: Db, shopId: string) {
  const rows = await db.select({
    orderHistory: schema.orders.statusHistory,
    awardStatus: schema.orderItemAwards.status,
    id: schema.orderItemAwards.id, orderNo: schema.orders.orderNo,
    orderStatus: schema.orders.status, neededByDate: schema.orders.neededByDate,
    deliveryCity: schema.orders.deliveryCity, deliveryDistrict: schema.orders.deliveryDistrict,
    description: schema.orderItems.descriptionEn, quantity: schema.orderItemAwards.awardedQty,
    unit: schema.orderItems.unit, unitCost: schema.orderItemAwards.unitCost,
    fulfilmentStatus: schema.orderItemAwards.fulfilmentStatus,
    history: schema.orderItemAwards.fulfilmentHistory,
  }).from(schema.orderItemAwards)
    .innerJoin(schema.orderItems, eq(schema.orderItems.id, schema.orderItemAwards.orderItemId))
    .innerJoin(schema.orders, eq(schema.orders.id, schema.orderItems.orderId))
    .where(and(eq(schema.orderItemAwards.supplierShopId, shopId),
      inArray(schema.orders.status, [...CONFIRMED_ORDER_STATUSES, "cancelled"])))
    .orderBy(desc(schema.orders.createdAt));
  return rows.filter(row => row.orderStatus !== "cancelled" || row.orderHistory.some(event => isConfirmedOrder(event.status)));
}

export async function updateSupplierFulfilment(db: Db, shopId: string, userId: string, awardId: string, next: string): Promise<ActionResult<void>> {
  return db.transaction(async (tx) => {
    // Lock the award and customer order: cancellations and supplier updates cannot race.
    const [row] = await tx.select({ award: schema.orderItemAwards, orderStatus: schema.orders.status })
      .from(schema.orderItemAwards)
      .innerJoin(schema.orderItems, eq(schema.orderItems.id, schema.orderItemAwards.orderItemId))
      .innerJoin(schema.orders, eq(schema.orders.id, schema.orderItems.orderId))
      .where(and(eq(schema.orderItemAwards.id, awardId), eq(schema.orderItemAwards.supplierShopId, shopId)))
      .for("update");
    if (!row || row.award.status === "cancelled") return err("not_found", "Confirmed work not found.");
    if (!canUpdateFulfilment(row.orderStatus, row.award.fulfilmentStatus, next)) return err("validation", "This fulfilment update is no longer available. Refresh the order.");
    const now = new Date();
    await tx.update(schema.orderItemAwards).set({ fulfilmentStatus: next, updatedAt: now,
      fulfilmentHistory: [...row.award.fulfilmentHistory, { status: next, at: now.toISOString(), userId }],
    }).where(eq(schema.orderItemAwards.id, awardId));
    return ok(undefined);
  });
}

export interface PortalSettingsInput {
  phone: string; consent: boolean; language: "en" | "si";
  areas: string; delivery: boolean; collection: boolean; preparationDays: number;
}
export function normalizeNotificationPhone(raw: string): string | null {
  const digits = raw.replace(/[\s()+-]/g, "");
  const normalized = digits.startsWith("0") ? `94${digits.slice(1)}` : digits;
  return /^947\d{8}$/.test(normalized) ? `+${normalized}` : null;
}
export async function savePortalSettings(db: Db, shopId: string, input: PortalSettingsInput): Promise<ActionResult<void>> {
  const phone = input.phone.trim() ? normalizeNotificationPhone(input.phone) : null;
  if (input.phone.trim() && !phone) return err("validation", "Enter a Sri Lankan mobile number, e.g. +94 7X XXX XXXX.");
  if (input.consent && !phone) return err("validation", "Add a number before enabling notifications.");
  if (!Number.isSafeInteger(input.preparationDays) || input.preparationDays < 0 || input.preparationDays > 365 || input.areas.length > 1000 || !["en", "si"].includes(input.language)) return err("validation", "Check your service areas, language and preparation time.");
  return db.transaction(async (tx) => {
    const [shop] = await tx.select().from(schema.shops).where(eq(schema.shops.id, shopId)).for("update");
    if (!shop) return err("not_found", "Shop not found.");
    await tx.update(schema.shops).set({ notificationPhone: phone, notificationLanguage: input.language,
      notificationConsentAt: input.consent ? shop.notificationConsentAt ?? new Date() : null,
      notificationVerifiedAt: shop.notificationPhone === phone ? shop.notificationVerifiedAt : null,
      serviceSettings: { areas: input.areas.trim(), delivery: input.delivery, collection: input.collection, preparationDays: input.preparationDays },
      updatedAt: new Date(),
    }).where(eq(schema.shops.id, shopId));
    return ok(undefined);
  });
}

export async function submitShopReview(db: Db, shopId: string): Promise<ActionResult<void>> {
  return db.transaction(async (tx) => {
    const [shop] = await tx.select().from(schema.shops).where(eq(schema.shops.id, shopId)).for("update");
    if (!shop) return err("not_found", "Shop not found.");
    if (shop.verificationStatus === "verified" || shop.verificationStatus === "pending") return ok(undefined);
    const products = await tx.select({ id: schema.products.id }).from(schema.products).where(and(eq(schema.products.shopId, shopId), ne(schema.products.status, "archived"))).limit(1);
    if (!storeReviewChecklist(shop, products.length > 0).ready) return err("validation", "Add your description, service areas, delivery or collection option, and first product before submitting.");
    await tx.update(schema.shops).set({ verificationStatus: "pending", verificationSubmittedAt: new Date(), updatedAt: new Date() }).where(eq(schema.shops.id, shopId));
    return ok(undefined);
  });
}

export async function askSupplierQuestion(db: Db, shopId: string, rfqId: string, text: string): Promise<ActionResult<void>> {
  if (!text.trim() || text.length > 2000) return err("validation", "Enter a question of up to 2,000 characters.");
  return db.transaction(async (tx) => {
    const [rfq] = await tx.select().from(schema.rfqs).where(and(eq(schema.rfqs.id, rfqId), eq(schema.rfqs.supplierShopId, shopId))).for("update");
    if (!rfq) return err("not_found", "Enquiry not found.");
    if (!["sent", "viewed", "quoted"].includes(rfq.status) || (rfq.expiresAt && rfq.expiresAt <= new Date())) return err("validation", "This enquiry is closed.");
    await tx.update(schema.rfqs).set({ supplierQuestions: [...rfq.supplierQuestions, { text: text.trim(), createdAt: new Date().toISOString() }], updatedAt: new Date() }).where(eq(schema.rfqs.id, rfqId));
    return ok(undefined);
  });
}

export async function getSupplierReadiness(db: Db, shopId: string) {
  const [shop] = await db.select().from(schema.shops).where(eq(schema.shops.id, shopId));
  if (!shop) return null;
  const products = await db.select({ status: schema.products.status, moderation: schema.products.moderationStatus }).from(schema.products).where(and(eq(schema.products.shopId, shop.id), ne(schema.products.status, "archived")));
  const liveProducts = products.filter(p => p.status === "active" && p.moderation === "approved").length;
  const checklist = storeReviewChecklist(shop, products.length > 0);
  return { hasProduct: checklist.hasProduct, liveProducts,
    live: shop.isActive && shop.verificationStatus === "verified" && liveProducts > 0,
    status: !shop.isActive ? "Paused" : ({ unverified: "Draft", pending: "Submitted", rejected: "Changes requested", verified: "Approved" } as const)[shop.verificationStatus],
    reason: shop.verificationNotes, description: checklist.description,
    services: checklist.services,
    branding: !!shop.logoPath || !!shop.bannerPath,
    phone: shop.notificationPhone ?? "", consent: !!shop.notificationConsentAt,
    verified: !!shop.notificationVerifiedAt, language: shop.notificationLanguage === "si" ? "si" as const : "en" as const,
    service: shop.serviceSettings ?? { areas: "", delivery: false, collection: false, preparationDays: 0 },
  };
}

/** Only called by the admin server after manually confirming ownership of this exact number. */
export async function verifySupplierNotificationNumber(db: Db, shopId: string, expectedPhone: string): Promise<ActionResult<void>> {
  const updated = await db.update(schema.shops).set({ notificationVerifiedAt: new Date(), updatedAt: new Date() })
    .where(and(eq(schema.shops.id, shopId), eq(schema.shops.notificationPhone, expectedPhone))).returning({ id: schema.shops.id });
  return updated.length ? ok(undefined) : err("validation", "The supplier changed their number. Refresh before verifying.");
}
export async function claimRfqNotification(db: Db, rfqId: string, retry = false, expectedPhone?: string): Promise<boolean> {
  return db.transaction(async tx => {
    const [row] = await tx.select().from(schema.rfqs).where(eq(schema.rfqs.id, rfqId)).for("update");
    if (!row || !["sent", "viewed", "quoted"].includes(row.status) || (row.expiresAt && row.expiresAt <= new Date()) || !["pending", ...(retry ? ["failed"] : [])].includes(row.notificationStatus)) return false;
    const [order] = await tx.select({ status: schema.orders.status }).from(schema.orders).where(eq(schema.orders.id, row.orderId));
    if (!order || !["draft", "sourcing", "quoted"].includes(order.status)) return false;
    const [shop] = await tx.select().from(schema.shops).where(eq(schema.shops.id, row.supplierShopId)).for("update");
    if (!shop?.notificationConsentAt || !shop.notificationVerifiedAt || !shop.notificationPhone || shop.notificationPhone !== expectedPhone) return false;
    await tx.update(schema.rfqs).set({ notificationStatus: "sending", notificationAttemptedAt: new Date(), notificationError: null }).where(eq(schema.rfqs.id, rfqId));
    return true;
  });
}
export async function recordRfqNotification(db: Db, rfqId: string, sent: boolean, error?: string, providerId?: string, uncertain = false): Promise<void> {
  await db.update(schema.rfqs).set({ notificationProviderId: providerId, notificationStatus: sent ? "sent" : uncertain ? "uncertain" : "failed", notificationError: sent ? null : error ?? "Notification failed.", notificationAttemptedAt: new Date() }).where(eq(schema.rfqs.id, rfqId));
}

export async function listOrderSupplierAlerts(db: Db, orderId: string) {
  return db.select().from(schema.supplierAlerts).where(eq(schema.supplierAlerts.orderId, orderId)).orderBy(desc(schema.supplierAlerts.createdAt));
}
export async function claimOrderSupplierAlert(db: Db, alertId: string, orderId: string) {
  return db.transaction(async tx => {
    const [alert] = await tx.select().from(schema.supplierAlerts).where(and(eq(schema.supplierAlerts.id, alertId), eq(schema.supplierAlerts.orderId, orderId))).for("update");
    if (!alert || !["pending", "failed"].includes(alert.status)) return null;
    const [order] = await tx.select({ status: schema.orders.status }).from(schema.orders).where(eq(schema.orders.id, alert.orderId));
    if (!order || (alert.eventKey.endsWith(":confirmed") && ["cancelled", "completed"].includes(order.status))) {
      await tx.update(schema.supplierAlerts).set({ status: "superseded", error: "A later order update superseded this alert." }).where(eq(schema.supplierAlerts.id, alertId));
      return null;
    }
    const [shop] = await tx.select().from(schema.shops).where(eq(schema.shops.id, alert.shopId));
    if (!shop?.notificationConsentAt || !shop.notificationVerifiedAt || !shop.notificationPhone || shop.notificationPhone !== alert.phone) {
      await tx.update(schema.supplierAlerts).set({ status: "failed", error: "Number must still match the verified, opted-in supplier number." }).where(eq(schema.supplierAlerts.id, alertId));
      return null;
    }
    await tx.update(schema.supplierAlerts).set({ status: "sending", error: null, attemptedAt: new Date() }).where(eq(schema.supplierAlerts.id, alertId));
    return alert;
  });
}
export async function recordOrderSupplierAlert(db: Db, alertId: string, sent: boolean, error?: string, providerId?: string, uncertain = false) {
  await db.update(schema.supplierAlerts).set({ providerId, status: sent ? "sent" : uncertain ? "uncertain" : "failed", error: sent ? null : error ?? "Send failed.", attemptedAt: new Date() }).where(eq(schema.supplierAlerts.id, alertId));
}

export async function listSupplierAlertsLanguage(db: Db, shopId: string) {
  const [shop] = await db.select({ language: schema.shops.notificationLanguage }).from(schema.shops).where(eq(schema.shops.id, shopId));
  return shop?.language ?? "en";
}

export async function updateSupplierAlertDelivery(db: Db, alertId: string, orderId: string, status: "sent" | "delivered" | "failed") {
  await db.update(schema.supplierAlerts).set({ status, error: status === "failed" ? "Provider reports delivery failure." : null }).where(and(eq(schema.supplierAlerts.id, alertId), eq(schema.supplierAlerts.orderId, orderId)));
}

export async function updateRfqAlertDelivery(db: Db, rfqId: string, orderId: string, status: "sent" | "delivered" | "failed") {
  await db.update(schema.rfqs).set({ notificationStatus: status, notificationError: status === "failed" ? "Provider reports delivery failure." : null }).where(and(eq(schema.rfqs.id, rfqId), eq(schema.rfqs.orderId, orderId)));
}
