/**
 * Documents repo — snapshot documents lifecycle:
 *   buildDocumentDraft → issueDocument → (reviseDocument) → markPaid
 *
 * Conventions match repos/orders.ts, repos/awards.ts:
 * - `db`-first arg, `DbOrTx` alias so callers compose transactions.
 * - Returns `ActionResult<T>` — no throws from business logic.
 * - Pure helper (`assertEditable`) exported separately for unit tests.
 *
 * Snapshot immutability: once `issuedAt` is set the document is frozen.
 * `assertEditable` enforces this. Any mutation that could alter an issued
 * document must call `assertEditable` first.
 *
 * docNo / publicToken — Task 17 will add `nextDocNo` / `generatePublicToken`
 * helpers. For now:
 *   - Draft publicToken: a crypto-random placeholder (prefix "draft_") so the
 *     NOT NULL + unique constraint is satisfied at insert time.
 *   - docNo at draft: also a placeholder prefixed "DRAFT-" with a short random
 *     suffix. `issueDocument` overwrites both with production values per Task 17.
 */
import { and, desc, eq, sql } from "drizzle-orm";
import { schema } from "@flowers/db/client";
import type { Db } from "../db";
import { err, isPgError, ok, type ActionResult } from "../errors";
import { DEFAULT_MARGIN_BPS } from "../constants";
import { applyMargin, documentTotals } from "../pricing";
import { orderCostRollup } from "./awards";
import type {
  DocumentLineSnapshot,
  DocumentCustomerSnapshot,
} from "@flowers/db/schema";

// ---------------------------------------------------------------------------
// DbOrTx — live client or an open transaction
// ---------------------------------------------------------------------------

/** A live client or an open transaction — both expose the query builder. */
type DbOrTx = Db | Parameters<Parameters<Db["transaction"]>[0]>[0];

// ---------------------------------------------------------------------------
// Document type aliases (from schema enums)
// ---------------------------------------------------------------------------

export type DocumentType = "quotation" | "invoice" | "receipt";
export type DocumentStatus = "draft" | "sent" | "viewed" | "accepted" | "paid" | "void";

// ---------------------------------------------------------------------------
// Output / option types
// ---------------------------------------------------------------------------

/** Slim view of a document row returned by repo functions. */
export interface DocumentRow {
  id: string;
  orderId: string;
  type: DocumentType;
  docNo: string;
  status: DocumentStatus;
  currency: string;
  subtotal: number;
  discount: number;
  deliveryFee: number;
  taxAmount: number;
  total: number;
  lineSnapshot: DocumentLineSnapshot[];
  customerSnapshot: DocumentCustomerSnapshot;
  notes: string | null;
  validUntil: Date | null;
  publicToken: string;
  issuedAt: Date | null;
  paidAt: Date | null;
  paymentMethod: string | null;
  paymentRef: string | null;
  pdfPath: string | null;
  supersededByDocumentId: string | null;
  createdByUserId: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface BuildDocumentDraftOpts {
  /**
   * Per-line customer price overrides: map from orderItemId → unitPrice (LKR cents).
   * When present for a given item, the override bypasses margin math entirely.
   */
  linePriceOverrides?: Record<string, number>;
  /**
   * Per-order margin override in basis points.
   * Fallback: DEFAULT_MARGIN_BPS (2500).
   */
  marginBps?: number;
  discount?: number;
  deliveryFee?: number;
  taxAmount?: number;
  notes?: string | null;
  validUntil?: Date | null;
  createdByUserId: string;
}

// ---------------------------------------------------------------------------
// Pure helpers for document identifiers
// ---------------------------------------------------------------------------

/**
 * Map document type to its prefix in the docNo format.
 * - quotation → "FM-Q"
 * - invoice → "FM-INV"
 * - receipt → "FM-RCP"
 */
export function docNoPrefix(type: DocumentType): string {
  switch (type) {
    case "quotation":
      return "FM-Q";
    case "invoice":
      return "FM-INV";
    case "receipt":
      return "FM-RCP";
  }
}

/**
 * Format a document number: `${docNoPrefix(type)}-${year}-${seq.toString().padStart(4,"0")}`.
 * Example: nextDocNo("invoice", 2026, 7) === "FM-INV-2026-0007".
 */
export function nextDocNo(type: DocumentType, year: number, seq: number): string {
  const prefix = docNoPrefix(type);
  const paddedSeq = seq.toString().padStart(4, "0");
  return `${prefix}-${year}-${paddedSeq}`;
}

/**
 * Generate a URL-safe random token (32+ chars, [A-Za-z0-9_-]).
 * Uses crypto.getRandomValues with base64url encoding.
 */
export function generatePublicToken(): string {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);

  // Base64url encode without padding
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
  let token = "";
  let bits = 0;
  let value = 0;

  for (let i = 0; i < bytes.length; i++) {
    value = (value << 8) | bytes[i];
    bits += 8;

    while (bits >= 6) {
      bits -= 6;
      token += chars[(value >> bits) & 0x3f];
    }
  }

  // Flush remaining bits
  if (bits > 0) {
    token += chars[(value << (6 - bits)) & 0x3f];
  }

  return token;
}

// ---------------------------------------------------------------------------
// Pure guard
// ---------------------------------------------------------------------------

/**
 * Guard: returns `err("forbidden", ...)` when the document has already been
 * issued (issuedAt != null). Issued documents are immutable snapshots.
 *
 * Exported separately for unit tests — no DB dependency.
 */
export function assertEditable(
  doc: { issuedAt: Date | null },
): ActionResult<void> {
  if (doc.issuedAt != null) {
    return err(
      "forbidden",
      "Document is already issued and cannot be edited. Use reviseDocument to create a new draft.",
    );
  }
  return ok(undefined);
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** Generate a temporary unique token for the document (placeholder for Task 17). */
function tempToken(prefix: string): string {
  const rand = crypto.randomUUID().replace(/-/g, "");
  return `${prefix}_${rand}`;
}

/** Generate a temporary docNo placeholder for the document (placeholder for Task 17). */
function tempDocNo(prefix: string): string {
  const rand = crypto.randomUUID().slice(0, 8).toUpperCase();
  return `${prefix}-${rand}`;
}

// ---------------------------------------------------------------------------
// Repo functions
// ---------------------------------------------------------------------------

/**
 * Build a draft document for a given order.
 *
 * For `quotation`:
 *   1. Pull the award cost rollup (per-item: {itemId, awardedQty, cost}).
 *   2. Fetch order items and the order's customer data.
 *   3. Compute per-line customer price:
 *      a. linePriceOverrides[itemId] if present.
 *      b. Else: applyMargin(unitCost, opts.marginBps ?? DEFAULT_MARGIN_BPS).
 *         unitCost = cost / awardedQty (divide-by-zero guarded: 0 when awardedQty === 0).
 *   4. Build lineSnapshot at customer price.
 *   5. Build customerSnapshot from order data.
 *   6. Compute totals via documentTotals().
 *   7. Insert a draft document row.
 *
 * For `invoice` / `receipt`:
 *   Copy the snapshot from the latest accepted quotation / latest invoice.
 */
export async function buildDocumentDraft(
  db: Db,
  orderId: string,
  type: DocumentType,
  opts: BuildDocumentDraftOpts,
): Promise<ActionResult<DocumentRow>> {
  try {
    // Fetch the order for customer data.
    const [order] = await db
      .select()
      .from(schema.orders)
      .where(eq(schema.orders.id, orderId))
      .limit(1);

    if (!order) {
      return err("not_found", `Order ${orderId} not found.`);
    }

    const customerSnapshot: DocumentCustomerSnapshot = {
      name: order.customerName,
      phone: order.customerPhone,
      email: order.customerEmail ?? null,
      address: order.deliveryAddress ?? null,
      district: order.deliveryDistrict ?? null,
      city: order.deliveryCity ?? null,
    };

    let lineSnapshot: DocumentLineSnapshot[];
    let totalsOpts = {
      discount: opts.discount ?? 0,
      deliveryFee: opts.deliveryFee ?? 0,
      taxAmount: opts.taxAmount ?? 0,
    };

    if (type === "quotation") {
      // Pull award cost rollup.
      const rollupResult = await orderCostRollup(db, orderId);
      if (!rollupResult.ok) {
        return err(rollupResult.code, rollupResult.message);
      }
      const rollup = rollupResult.data;

      // Map rollup by itemId for fast lookup.
      const rollupByItemId = new Map(rollup.map((r) => [r.itemId, r]));

      // Fetch order items.
      const items = await db
        .select()
        .from(schema.orderItems)
        .where(eq(schema.orderItems.orderId, orderId))
        .orderBy(schema.orderItems.sortOrder);

      const effectiveMarginBps = opts.marginBps ?? DEFAULT_MARGIN_BPS;
      const linePriceOverrides = opts.linePriceOverrides ?? {};

      lineSnapshot = items.map((item): DocumentLineSnapshot => {
        const row = rollupByItemId.get(item.id);

        // Per-line price: override → margin applied to unit cost → 0 fallback.
        let unitPrice: number;
        if (linePriceOverrides[item.id] !== undefined) {
          unitPrice = linePriceOverrides[item.id];
        } else if (row && row.awardedQty > 0) {
          // Divide-by-zero guard: awardedQty > 0 checked above.
          const unitCost = Math.round(row.cost / row.awardedQty);
          unitPrice = applyMargin(unitCost, effectiveMarginBps);
        } else {
          // No awards for this item — price is 0 (will be revised when awards land).
          unitPrice = 0;
        }

        const qty = row?.awardedQty ?? item.quantity;
        const lineTotal = qty * unitPrice;

        return {
          descriptionEn: item.descriptionEn,
          descriptionSi: item.descriptionSi ?? null,
          variant: item.variant ?? null,
          qty,
          unit: item.unit,
          unitPrice,
          lineTotal,
        };
      });
    } else {
      // invoice / receipt: copy snapshot from the appropriate source document.
      // invoice → copy from latest ACCEPTED quotation.
      // receipt → copy from latest PAID invoice.
      // The admin lifecycle (Task 20 UI) drives these transitions: a quotation
      // must be marked accepted before invoicing, and an invoice must be paid
      // before a receipt can be produced.
      let sourceStatus: DocumentStatus;
      let sourceType: DocumentType;
      if (type === "invoice") {
        sourceType = "quotation";
        sourceStatus = "accepted";
      } else {
        // receipt
        sourceType = "invoice";
        sourceStatus = "paid";
      }

      const [sourceDoc] = await db
        .select({
          lineSnapshot: schema.documents.lineSnapshot,
          customerSnapshot: schema.documents.customerSnapshot,
          discount: schema.documents.discount,
          deliveryFee: schema.documents.deliveryFee,
          taxAmount: schema.documents.taxAmount,
        })
        .from(schema.documents)
        .where(
          and(
            eq(schema.documents.orderId, orderId),
            eq(schema.documents.type, sourceType),
            eq(schema.documents.status, sourceStatus),
          ),
        )
        .orderBy(desc(schema.documents.createdAt))
        .limit(1);

      if (!sourceDoc) {
        return err(
          "not_found",
          `No ${sourceStatus} ${sourceType} found for order ${orderId} to copy snapshot from.`,
        );
      }

      lineSnapshot = sourceDoc.lineSnapshot as DocumentLineSnapshot[];
      totalsOpts = {
        discount: opts.discount ?? sourceDoc.discount,
        deliveryFee: opts.deliveryFee ?? sourceDoc.deliveryFee,
        taxAmount: opts.taxAmount ?? sourceDoc.taxAmount,
      };
    }

    const { subtotal, total } = documentTotals(
      lineSnapshot.map((l) => ({ qty: l.qty, unitPrice: l.unitPrice })),
      totalsOpts,
    );

    const now = new Date();

    const [inserted] = await db
      .insert(schema.documents)
      .values({
        orderId,
        type,
        docNo: tempDocNo("DRAFT"),
        status: "draft",
        currency: "LKR",
        subtotal,
        discount: totalsOpts.discount,
        deliveryFee: totalsOpts.deliveryFee,
        taxAmount: totalsOpts.taxAmount,
        total,
        lineSnapshot,
        customerSnapshot,
        notes: opts.notes ?? null,
        validUntil: opts.validUntil ?? null,
        publicToken: tempToken("draft"),
        issuedAt: null,
        paidAt: null,
        paymentMethod: null,
        paymentRef: null,
        pdfPath: null,
        supersededByDocumentId: null,
        createdByUserId: opts.createdByUserId,
        createdAt: now,
        updatedAt: now,
      })
      .returning();

    return ok(inserted as DocumentRow);
  } catch (e) {
    if (isPgError(e, "23503")) {
      return err("validation", "Referenced order or user does not exist.");
    }
    return err(
      "unknown",
      e instanceof Error ? e.message : "Could not build document draft.",
    );
  }
}

/**
 * Freeze a draft document: set issuedAt=now, status='sent'.
 * Generates production-ready docNo (per-type, per-year sequence) and publicToken.
 *
 * Returns err("forbidden") if the document is already issued.
 * Returns err("conflict") if a unique constraint violation occurs (rare docNo race).
 */
export async function issueDocument(
  db: DbOrTx,
  draftId: string,
): Promise<ActionResult<{ token: string; docNo: string }>> {
  try {
    const [doc] = await db
      .select({
        id: schema.documents.id,
        type: schema.documents.type,
        createdAt: schema.documents.createdAt,
        issuedAt: schema.documents.issuedAt,
      })
      .from(schema.documents)
      .where(eq(schema.documents.id, draftId))
      .limit(1);

    if (!doc) {
      return err("not_found", `Document ${draftId} not found.`);
    }

    const editable = assertEditable(doc);
    if (!editable.ok) return editable;

    // Derive the document year from createdAt.
    const year = doc.createdAt.getFullYear();

    // Count existing documents of this type in this year to get the sequence.
    const [{ count }] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(schema.documents)
      .where(
        and(
          eq(schema.documents.type, doc.type),
          // Match documents created in the same year.
          sql`extract(year from ${schema.documents.createdAt}) = ${year}`,
          // Exclude this draft itself
          sql`${schema.documents.id} != ${draftId}`,
        ),
      );

    const seq = Number(count) + 1;
    const docNo = nextDocNo(doc.type, year, seq);
    const publicToken = generatePublicToken();
    const now = new Date();

    await db
      .update(schema.documents)
      .set({
        status: "sent",
        issuedAt: now,
        docNo,
        publicToken,
        updatedAt: now,
      })
      .where(eq(schema.documents.id, draftId));

    return ok({ token: publicToken, docNo });
  } catch (e) {
    // Handle unique constraint violation on docNo (rare race condition).
    if (isPgError(e, "23505")) {
      return err("conflict", "Document number already issued (race condition).");
    }
    return err(
      "unknown",
      e instanceof Error ? e.message : "Could not issue document.",
    );
  }
}

/**
 * Mark a document as paid.
 * Returns err("forbidden") if the document is not yet issued.
 */
export async function markPaid(
  db: DbOrTx,
  docId: string,
  method: string,
  ref: string,
): Promise<ActionResult<void>> {
  try {
    const [doc] = await db
      .select({
        id: schema.documents.id,
        issuedAt: schema.documents.issuedAt,
      })
      .from(schema.documents)
      .where(eq(schema.documents.id, docId))
      .limit(1);

    if (!doc) {
      return err("not_found", `Document ${docId} not found.`);
    }

    if (doc.issuedAt == null) {
      return err("validation", "Cannot mark an unissued document as paid.");
    }

    const now = new Date();

    await db
      .update(schema.documents)
      .set({
        status: "paid",
        paidAt: now,
        paymentMethod: method,
        paymentRef: ref,
        updatedAt: now,
      })
      .where(eq(schema.documents.id, docId));

    return ok(undefined);
  } catch (e) {
    return err(
      "unknown",
      e instanceof Error ? e.message : "Could not mark document as paid.",
    );
  }
}

/**
 * Clone an issued document as a new draft, marking the old document as
 * superseded by the new one.
 *
 * Returns err("forbidden") when called on a draft (use the original draft;
 * there is nothing to revise until it has been issued).
 */
export async function reviseDocument(
  db: Db,
  docId: string,
): Promise<ActionResult<{ id: string }>> {
  try {
    return await db.transaction(async (tx) => {
      const [doc] = await tx
        .select()
        .from(schema.documents)
        .where(eq(schema.documents.id, docId))
        .limit(1);

      if (!doc) {
        return err("not_found", `Document ${docId} not found.`);
      }

      // Only issued documents can be revised (must have issuedAt).
      if (doc.issuedAt == null) {
        return err(
          "validation",
          "Only issued documents can be revised. Edit the draft directly.",
        );
      }

      const now = new Date();

      // Clone the document as a new draft.
      const [newDoc] = await tx
        .insert(schema.documents)
        .values({
          orderId: doc.orderId,
          type: doc.type,
          docNo: tempDocNo("DRAFT"),
          status: "draft",
          currency: doc.currency,
          subtotal: doc.subtotal,
          discount: doc.discount,
          deliveryFee: doc.deliveryFee,
          taxAmount: doc.taxAmount,
          total: doc.total,
          lineSnapshot: doc.lineSnapshot,
          customerSnapshot: doc.customerSnapshot,
          notes: doc.notes,
          validUntil: doc.validUntil,
          publicToken: tempToken("draft"),
          issuedAt: null,
          paidAt: null,
          paymentMethod: null,
          paymentRef: null,
          pdfPath: null,
          supersededByDocumentId: null,
          createdByUserId: doc.createdByUserId,
          createdAt: now,
          updatedAt: now,
        })
        .returning({ id: schema.documents.id });

      // Mark the old document as superseded.
      await tx
        .update(schema.documents)
        .set({
          supersededByDocumentId: newDoc.id,
          status: "void",
          updatedAt: now,
        })
        .where(eq(schema.documents.id, docId));

      return ok({ id: newDoc.id });
    });
  } catch (e) {
    if (isPgError(e, "23503")) {
      return err("validation", "Referenced order or user does not exist.");
    }
    return err(
      "unknown",
      e instanceof Error ? e.message : "Could not revise document.",
    );
  }
}
