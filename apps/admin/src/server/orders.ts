/**
 * Order server functions for the Admin Portal.
 *
 * Admin-guarded: every handler checks for an authenticated admin session
 * (or auth_disabled dev mode) before touching the DB. `requireDb()` throws
 * DataUnavailableError when DATABASE_URL is absent, which surfaces as a 500
 * rather than silently swallowing the call — appropriate for mutations.
 *
 * Follows the pattern of `apps/supplier/src/server/products.ts`.
 */
import { createServerFn } from "@tanstack/react-start";
import {
  requireDb,
  tryCreateDb,
  getEnv,
  createOrder,
  getOrder,
  listOrders,
  matchRoseGrowers,
  createRfqs,
  resolveRfqDispatchInfo,
  createAward,
  cancelAward,
  orderCostRollup,
  buildDocumentDraft,
  issueDocument,
  acceptDocument,
  markPaid,
  updateOrderStatus,
  type ActionResult,
  type CreateOrderInput,
  type OrderDetail,
  type OrderSummary,
  type MatchedSupplier,
  type CreateAwardInput,
  type AwardCostRollupRow,
  type DocumentType,
  type DocumentRow,
} from "@flowers/api";
import {
  sendWhatsappText,
  buildRfqNudge,
  buildDocumentLinkMessage,
  type EvolutionConfig,
} from "@flowers/integrations";
import { resolveAdminSession } from "./session";

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

function authError<T>(): ActionResult<T> {
  return { ok: false, code: "auth_required", message: "Admin access required." };
}

/**
 * Returns the admin user's id for the current request.
 * - `auth_disabled` → returns a sentinel dev id (no DB user).
 * - `admin` session → returns the real user id.
 * - All other kinds → returns null (caller should return authError).
 */
async function resolveAdminUserId(): Promise<
  { ok: true; userId: string } | { ok: false }
> {
  const session = await resolveAdminSession();
  if (session.kind === "auth_disabled") {
    return { ok: true, userId: "00000000-0000-0000-0000-000000000000" };
  }
  if (session.kind === "admin") {
    return { ok: true, userId: session.userId };
  }
  return { ok: false };
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

export const listOrdersFn = createServerFn({ method: "GET" }).handler(
  async (): Promise<ActionResult<OrderSummary[]>> => {
    const session = await resolveAdminSession();
    if (
      session.kind === "anonymous" ||
      session.kind === "config_error" ||
      session.kind === "forbidden"
    ) {
      return authError();
    }
    const db = tryCreateDb();
    if (!db) {
      return { ok: true, data: [] };
    }
    return listOrders(db);
  },
);

export const getOrderFn = createServerFn({ method: "GET" })
  .validator((orderId: string) => orderId)
  .handler(async ({ data: orderId }): Promise<ActionResult<OrderDetail>> => {
    const session = await resolveAdminSession();
    if (
      session.kind === "anonymous" ||
      session.kind === "config_error" ||
      session.kind === "forbidden"
    ) {
      return authError();
    }
    const db = tryCreateDb();
    if (!db) {
      return { ok: false, code: "unknown", message: "Database is not configured." };
    }
    return getOrder(db, orderId);
  });

// ---------------------------------------------------------------------------
// Mutations
// ---------------------------------------------------------------------------

export const createOrderFn = createServerFn({ method: "POST" })
  .validator((input: CreateOrderInput) => input)
  .handler(
    async ({ data }): Promise<ActionResult<{ id: string; orderNo: string }>> => {
      const resolved = await resolveAdminUserId();
      if (!resolved.ok) return authError();

      const db = requireDb();
      return createOrder(db, data, resolved.userId);
    },
  );

// ---------------------------------------------------------------------------
// Sourcing server functions (Task 12)
// ---------------------------------------------------------------------------

export const matchSuppliersFn = createServerFn({ method: "GET" })
  .validator((orderId: string) => orderId)
  .handler(async ({ data: orderId }): Promise<ActionResult<MatchedSupplier[]>> => {
    const session = await resolveAdminSession();
    if (
      session.kind === "anonymous" ||
      session.kind === "config_error" ||
      session.kind === "forbidden"
    ) {
      return authError();
    }
    const db = tryCreateDb();
    if (!db) {
      return { ok: false, code: "unknown", message: "Database is not configured." };
    }
    return matchRoseGrowers(db, orderId);
  });

// Per-supplier dispatch result returned to the client.
export interface DispatchResult {
  supplierShopId: string;
  shopName: string;
  sent: boolean;
  error?: string;
}

export interface SendRfqsResult {
  created: string[];
  dispatch: DispatchResult[];
}

export interface SendRfqsInput {
  orderId: string;
  supplierShopIds: string[];
  message?: string;
}

export const sendRfqsFn = createServerFn({ method: "POST" })
  .validator((input: SendRfqsInput) => input)
  .handler(
    async ({ data }): Promise<ActionResult<SendRfqsResult>> => {
      const resolved = await resolveAdminUserId();
      if (!resolved.ok) return authError<SendRfqsResult>();

      const db = requireDb();

      // 1. Create RFQs (commits the transaction + transitions order draft→sourcing).
      const rfqResult = await createRfqs(db, data.orderId, data.supplierShopIds, data.message);
      if (!rfqResult.ok) {
        // Surface conflict and other errors to the caller without partial dispatch.
        return rfqResult;
      }

      const { created } = rfqResult.data;

      // 2. Dispatch-after-commit: WhatsApp nudges. Send failures MUST NOT
      //    fail the whole request or roll back the persisted RFQs.
      if (created.length === 0) {
        // All suppliers were already RFQ'd (idempotent path). No nudges to send.
        return { ok: true, data: { created: [], dispatch: [] } };
      }

      // Resolve the newly created RFQs and their supplier shops (name + owner phone).
      // This join lives in the repo layer so the server function stays free of
      // direct drizzle-orm / schema imports (Ruling P2).
      const dispatchInfoResult = await resolveRfqDispatchInfo(db, created, data.orderId);
      const dispatchInfoList = dispatchInfoResult.ok ? dispatchInfoResult.data : [];

      // Index by rfqId for quick lookup.
      const rfqMap = new Map(dispatchInfoList.map((r) => [r.rfqId, r]));

      // Build Evolution config from env — all fields may be absent in dev.
      const env = getEnv();
      const evolutionConfig: EvolutionConfig = {
        apiUrl: env.EVOLUTION_API_URL ?? "",
        apiKey: env.EVOLUTION_API_KEY ?? "",
        instance: env.EVOLUTION_INSTANCE ?? "",
      };
      const supplierPortalUrl = env.SUPPLIER_PORTAL_URL ?? "";

      // orderNo is returned from resolveRfqDispatchInfo; fall back to orderId
      // if the lookup failed.
      const orderNo = dispatchInfoList[0]?.orderNo ?? data.orderId;

      const dispatch: DispatchResult[] = await Promise.all(
        created.map(async (rfqId): Promise<DispatchResult> => {
          const row = rfqMap.get(rfqId);
          const shopName = row?.shopName ?? rfqId;
          const phone = row?.phone ?? null;

          if (!phone) {
            return {
              supplierShopId: row?.supplierShopId ?? rfqId,
              shopName,
              sent: false,
              error: "Supplier has no phone number on record.",
            };
          }

          const portalUrl = `${supplierPortalUrl}/rfqs/${rfqId}`;
          const message = buildRfqNudge({
            shopName,
            orderNo,
            portalUrl,
            locale: "en",
          });

          const sendResult = await sendWhatsappText(evolutionConfig, phone, message);

          if (sendResult.ok) {
            return { supplierShopId: row?.supplierShopId ?? rfqId, shopName, sent: true };
          }

          return {
            supplierShopId: row?.supplierShopId ?? rfqId,
            shopName,
            sent: false,
            error: sendResult.message,
          };
        }),
      );

      return { ok: true, data: { created, dispatch } };
    },
  );

export interface ResendRfqNudgeInput {
  orderId: string;
  rfqId: string;
}

/**
 * Re-send the WhatsApp nudge for an existing RFQ. Recovery path for RFQs
 * whose original dispatch failed (Evolution API down, supplier phone missing
 * at the time) — without this the RFQ sits in 'sent' with the supplier never
 * having been notified, and the admin has no way to retry.
 */
export const resendRfqNudgeFn = createServerFn({ method: "POST" })
  .validator((input: ResendRfqNudgeInput) => input)
  .handler(async ({ data }): Promise<ActionResult<DispatchResult>> => {
    const resolved = await resolveAdminUserId();
    if (!resolved.ok) return authError<DispatchResult>();

    const db = requireDb();
    const infoResult = await resolveRfqDispatchInfo(db, [data.rfqId], data.orderId);
    if (!infoResult.ok) return infoResult;

    const row = infoResult.data[0];
    if (!row) {
      return { ok: false, code: "not_found", message: "RFQ not found on this order." };
    }
    if (!row.phone) {
      return {
        ok: true,
        data: {
          supplierShopId: row.supplierShopId,
          shopName: row.shopName,
          sent: false,
          error: "Supplier has no phone number on record.",
        },
      };
    }

    const env = getEnv();
    const evolutionConfig: EvolutionConfig = {
      apiUrl: env.EVOLUTION_API_URL ?? "",
      apiKey: env.EVOLUTION_API_KEY ?? "",
      instance: env.EVOLUTION_INSTANCE ?? "",
    };
    const supplierPortalUrl = env.SUPPLIER_PORTAL_URL ?? "";

    const message = buildRfqNudge({
      shopName: row.shopName,
      orderNo: row.orderNo,
      portalUrl: `${supplierPortalUrl}/rfqs/${data.rfqId}`,
      locale: "en",
    });

    const sendResult = await sendWhatsappText(evolutionConfig, row.phone, message);
    return {
      ok: true,
      data: {
        supplierShopId: row.supplierShopId,
        shopName: row.shopName,
        sent: sendResult.ok,
        ...(sendResult.ok ? {} : { error: sendResult.message }),
      },
    };
  });

// ---------------------------------------------------------------------------
// Award server functions (Task 15)
// ---------------------------------------------------------------------------

export interface CreateAwardPayload {
  orderItemId: string;
  supplierShopId: string;
  rfqQuoteLineId?: string | null;
  awardedQty: number;
  unitCost: number;
  notes?: string | null;
}

export const createAwardFn = createServerFn({ method: "POST" })
  .validator((input: CreateAwardPayload) => input)
  .handler(
    async ({ data }): Promise<ActionResult<{ id: string }>> => {
      const resolved = await resolveAdminUserId();
      if (!resolved.ok) return authError<{ id: string }>();

      const db = requireDb();

      const awardInput: CreateAwardInput = {
        orderItemId: data.orderItemId,
        supplierShopId: data.supplierShopId,
        rfqQuoteLineId: data.rfqQuoteLineId ?? null,
        awardedQty: data.awardedQty,
        unitCost: data.unitCost,
        notes: data.notes ?? null,
      };

      return createAward(db, awardInput);
    },
  );

export const cancelAwardFn = createServerFn({ method: "POST" })
  .validator((awardId: string) => awardId)
  .handler(
    async ({ data: awardId }): Promise<ActionResult<void>> => {
      const resolved = await resolveAdminUserId();
      if (!resolved.ok) return authError<void>();

      const db = requireDb();
      return cancelAward(db, awardId);
    },
  );

export const getCostRollupFn = createServerFn({ method: "GET" })
  .validator((orderId: string) => orderId)
  .handler(
    async ({ data: orderId }): Promise<ActionResult<AwardCostRollupRow[]>> => {
      const resolved = await resolveAdminUserId();
      if (!resolved.ok) return authError<AwardCostRollupRow[]>();

      const db = requireDb();
      return orderCostRollup(db, orderId);
    },
  );

// ---------------------------------------------------------------------------
// Document server functions (Task 20)
// ---------------------------------------------------------------------------

export interface CreateDocumentInput {
  orderId: string;
  type: DocumentType;
  marginBps?: number;
  discount?: number;
  deliveryFee?: number;
  lineOverrides?: Record<string, number>;
}

export const createDocumentFn = createServerFn({ method: "POST" })
  .validator((input: CreateDocumentInput) => input)
  .handler(
    async ({ data }): Promise<ActionResult<DocumentRow>> => {
      const resolved = await resolveAdminUserId();
      if (!resolved.ok) return authError<DocumentRow>();

      const db = requireDb();
      return buildDocumentDraft(db, data.orderId, data.type, {
        marginBps: data.marginBps,
        discount: data.discount,
        deliveryFee: data.deliveryFee,
        linePriceOverrides: data.lineOverrides,
        createdByUserId: resolved.userId,
      });
    },
  );

export interface IssueDocumentResult {
  token: string;
  docNo: string;
}

export const issueDocumentFn = createServerFn({ method: "POST" })
  .validator(
    (input: { docId: string; orderId: string; type: DocumentType }) => input,
  )
  .handler(
    async ({
      data,
    }): Promise<ActionResult<IssueDocumentResult>> => {
      const resolved = await resolveAdminUserId();
      if (!resolved.ok) return authError<IssueDocumentResult>();

      const db = requireDb();
      const issueResult = await issueDocument(db, data.docId);
      if (!issueResult.ok) return issueResult;

      // Advance order status: quotation issued → quoted; invoice issued → invoiced.
      // Status transition errors are surfaced but do NOT roll back the issue — the
      // document is already immutably issued. The caller should reload to reflect
      // the current state.
      if (data.type === "quotation") {
        await updateOrderStatus(db, data.orderId, "quoted");
      } else if (data.type === "invoice") {
        await updateOrderStatus(db, data.orderId, "invoiced");
      }
      // receipt: order stays 'paid' (no further lifecycle step from issuing a receipt)

      return issueResult;
    },
  );

export const acceptDocumentFn = createServerFn({ method: "POST" })
  .validator((input: { docId: string; orderId: string }) => input)
  .handler(
    async ({ data }): Promise<ActionResult<void>> => {
      const resolved = await resolveAdminUserId();
      if (!resolved.ok) return authError<void>();

      const db = requireDb();
      const acceptResult = await acceptDocument(db, data.docId);
      if (!acceptResult.ok) return acceptResult;

      // Quotation accepted → order confirmed.
      await updateOrderStatus(db, data.orderId, "confirmed");

      return acceptResult;
    },
  );

export interface SendDocumentResult {
  sent: boolean;
  error?: string;
}

export const sendDocumentFn = createServerFn({ method: "POST" })
  .validator(
    (input: {
      docId: string;
      orderId: string;
      type: DocumentType;
      docNo: string;
      publicToken: string;
      customerLocale: string;
      customerPhone: string;
    }) => input,
  )
  .handler(
    async ({ data }): Promise<ActionResult<SendDocumentResult>> => {
      const resolved = await resolveAdminUserId();
      if (!resolved.ok) return authError<SendDocumentResult>();

      const env = getEnv();
      const webUrl = env.WEB_PUBLIC_URL ?? "";
      if (!webUrl) {
        // Without a base URL the WhatsApp message would carry a broken
        // protocol-relative link — refuse to send rather than mislead.
        return {
          ok: true,
          data: {
            sent: false,
            error: "WEB_PUBLIC_URL is not configured — cannot build the document link.",
          },
        };
      }
      const locale = data.customerLocale === "si" ? "si" : "en";
      const docUrl = `${webUrl}/${locale}/d/${data.publicToken}`;

      const message = buildDocumentLinkMessage({
        type: data.type,
        docNo: data.docNo,
        url: docUrl,
        locale,
      });

      const evolutionConfig: EvolutionConfig = {
        apiUrl: env.EVOLUTION_API_URL ?? "",
        apiKey: env.EVOLUTION_API_KEY ?? "",
        instance: env.EVOLUTION_INSTANCE ?? "",
      };

      // Dispatch-after-commit pattern: send failures are surfaced as a
      // non-fatal result. The document is already issued; a failed send
      // does not affect the document or order state.
      const sendResult = await sendWhatsappText(
        evolutionConfig,
        data.customerPhone,
        message,
      );

      if (sendResult.ok) {
        return { ok: true, data: { sent: true } };
      }

      return {
        ok: true,
        data: { sent: false, error: sendResult.message },
      };
    },
  );

export interface MarkPaidInput {
  docId: string;
  orderId: string;
  method: string;
  ref: string;
}

export const markPaidFn = createServerFn({ method: "POST" })
  .validator((input: MarkPaidInput) => input)
  .handler(
    async ({ data }): Promise<ActionResult<void>> => {
      const resolved = await resolveAdminUserId();
      if (!resolved.ok) return authError<void>();

      const db = requireDb();
      const paidResult = await markPaid(db, data.docId, data.method, data.ref);
      if (!paidResult.ok) return paidResult;

      // Invoice paid → order paid.
      await updateOrderStatus(db, data.orderId, "paid");

      return paidResult;
    },
  );
