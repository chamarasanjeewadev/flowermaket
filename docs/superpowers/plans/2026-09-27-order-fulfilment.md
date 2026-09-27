# Order-Fulfilment Subsystem Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn a WhatsApp order into a system record that is sourced from growers (RFQ + WhatsApp nudge), awarded per-line across suppliers, then billed to the customer as OTP-gated Quotation → Invoice → Receipt documents (web link + PDF).

**Architecture:** New Drizzle schema modules (`orders.ts`, `documents.ts`) drive five new `packages/api` repos (`orders`, `rfqs`, `awards`, `documents`, `documentAccess`) that follow the established db-first / `ActionResult<T>` / no-throw / app-layer-guard convention. Admin drives intake + sourcing + documents; suppliers respond to RFQs in their portal; the public web app renders OTP-gated documents. WhatsApp send is a new Evolution API client in `packages/integrations`; PDFs use pure-JS `pdf-lib` (Workers-compatible).

**Tech Stack:** TanStack Start (React 19, Vite, file routes), Drizzle ORM + Supabase Postgres, Cloudflare Workers, Tailwind v4 + shadcn/ui (`@flowers/ui`), Vitest, `pdf-lib`, Evolution API (WhatsApp).

**Spec:** `docs/superpowers/specs/2026-09-27-order-fulfilment-subsystem-design.md`

## Global Constraints

- **Money is integer LKR cents.** Every price/cost/total column is `integer`. Never store floats. Display with `formatRupees` from `@flowers/api` (subpath), never `formatCents` (that is PayHere wire only).
- **Bilingual columns.** User-visible text is `*_en` / `*_si` pairs; English required (`notNull`), Sinhala nullable; display falls back to `en`.
- **No `any`, no raw SQL** outside migrations. All DB access via Drizzle.
- **Lazy env on Workers.** Call `getEnv()` / `tryCreateDb()` / `requireDb()` inside request handlers or server functions, never at module top level.
- **Repos:** `db` first arg (accept `Db | transaction`), return `ActionResult<T>`, never throw from business logic, filter every supplier-scoped query by `shopId` (app-layer guard replacing RLS — the pooler bypasses RLS). Export pure validators/calculators separately for unit tests.
- **Cloudflare connection:** `{ max: 1, prepare: false }` (already handled by `createDb`).
- **New env vars:** `EVOLUTION_API_URL`, `EVOLUTION_API_KEY`, `EVOLUTION_INSTANCE`, `DOC_ACCESS_SECRET`. Add to each app's `.dev.vars` and `wrangler` config; read lazily.
- **Build before typecheck.** `pnpm build` (generates `routeTree.gen.ts`) before `pnpm typecheck`.
- **Column naming:** Drizzle camelCase → Postgres snake_case (`nameEn` → `name_en`).

## Review Focus

These are the inputs the spec implies but that no single feature's happy path exercises. Each is pinned to a test in the owning task.

- **Award over-allocation** — awarding more than an order line's quantity (sum across suppliers) must be rejected, not silently accepted. → Task 14 tests (`validateAward`).
- **Document mutation after issue** — editing an order after a Quotation/Invoice is issued must not change the issued document's snapshot or total. → Task 16 tests (`assertEditable`).
- **OTP brute force / replay** — wrong codes beyond `max_attempts`, expired codes, and reused (consumed) codes must all fail closed with a generic error. → Task 18 tests (`otpVerdict`).
- **Missing WhatsApp config** — Evolution env unset must return a typed `err`, never throw or block the order-state write that preceded the send. → Task 10 tests (client) + Task 12 verify (dispatch after commit).
- **Supplier cross-tenant access** — a supplier reading/answering an RFQ that belongs to another shop must get `not_found`/`forbidden`. → Task 8 tests (`assertOwnsRfq`).

---

## File Structure

**Created:**
- `packages/db/src/schema/orders.ts` — orders, order_items, rfqs, rfq_quote_lines, order_item_awards
- `packages/db/src/schema/documents.ts` — documents, document_otps
- `packages/db/migrations/0006_orders.sql` — generated tables (via drizzle-kit)
- `packages/db/migrations/0007_orders_rls.sql` — hand-journaled RLS
- `packages/api/src/repos/orders.ts` (+ `orders.test.ts`)
- `packages/api/src/repos/rfqs.ts` (+ `rfqs.test.ts`)
- `packages/api/src/repos/awards.ts` (+ `awards.test.ts`)
- `packages/api/src/repos/documents.ts` (+ `documents.test.ts`)
- `packages/api/src/repos/documentAccess.ts` (+ `documentAccess.test.ts`)
- `packages/api/src/pricing.ts` (+ `pricing.test.ts`)
- `packages/integrations/src/evolution.ts` (+ `evolution.test.ts`)
- `packages/integrations/src/rfqMessages.ts` (+ `rfqMessages.test.ts`)
- `packages/integrations/src/pdf.ts` (+ `pdf.test.ts`)
- admin routes: `orders.index.tsx`, `orders.new.tsx`, `orders.$orderId.tsx`, `-orders/` server fns
- supplier routes: `rfqs.index.tsx`, `rfqs.$rfqId.tsx`, `-rfqs/` server fns
- web routes: `$locale/d.$token.tsx`, `$locale/d.$token.pdf.ts`, `-documents/` server fns

**Modified:**
- `packages/db/src/schema/enums.ts` — new enums
- `packages/db/src/schema/index.ts` — export new modules
- `packages/api/src/constants.ts` — margin default + order units
- `packages/api/src/index.ts` / package `exports` — expose new subpaths if needed
- `packages/integrations/src/index.ts` — export evolution, rfqMessages, pdf
- each app `.dev.vars` + `wrangler.jsonc` — new env vars

---

# STAGE 1 — Schema & migrations

### Task 1: Add order enums

**Files:**
- Modify: `packages/db/src/schema/enums.ts`

**Interfaces:**
- Produces: `orderStatus`, `rfqStatus`, `awardStatus`, `documentType`, `documentStatus`, `orderSource` pgEnums.

- [ ] **Step 1: Append the enums**

```ts
export const orderStatus = pgEnum("order_status", [
  "draft", "sourcing", "quoted", "confirmed",
  "invoiced", "paid", "fulfilling", "completed", "cancelled",
]);

export const rfqStatus = pgEnum("rfq_status", [
  "sent", "viewed", "quoted", "declined", "expired", "awarded", "closed",
]);

export const awardStatus = pgEnum("award_status", ["pending", "confirmed", "cancelled"]);

export const documentType = pgEnum("document_type", ["quotation", "invoice", "receipt"]);

export const documentStatus = pgEnum("document_status", [
  "draft", "sent", "viewed", "accepted", "paid", "void",
]);

export const orderSource = pgEnum("order_source", ["whatsapp", "phone", "web", "walk_in"]);
```

- [ ] **Step 2: Commit**

```bash
git add packages/db/src/schema/enums.ts
git commit -m "feat(db): add order-fulfilment enums"
```

### Task 2: Orders + order_items tables

**Files:**
- Create: `packages/db/src/schema/orders.ts`

**Interfaces:**
- Consumes: `users` (`./users`), `categories`/`shops` (`./catalog`, `./shops`), enums (Task 1).
- Produces: `orders`, `orderItems` Drizzle tables.

- [ ] **Step 1: Write orders + order_items**

```ts
import {
  date, index, integer, pgTable, text, timestamp, uniqueIndex, uuid,
} from "drizzle-orm/pg-core";
import { language } from "./enums";
import { orderSource, orderStatus } from "./enums";
import { users } from "./users";
import { categories } from "./catalog";

export const orders = pgTable(
  "orders",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orderNo: text("order_no").unique().notNull(),
    source: orderSource("source").notNull().default("whatsapp"),
    buyerUserId: uuid("buyer_user_id").references(() => users.id),
    customerName: text("customer_name").notNull(),
    customerPhone: text("customer_phone").notNull(),
    customerEmail: text("customer_email"),
    customerLocale: language("customer_locale").notNull().default("en"),
    deliveryAddress: text("delivery_address"),
    deliveryDistrict: text("delivery_district"),
    deliveryCity: text("delivery_city"),
    neededByDate: date("needed_by_date"),
    notesInternal: text("notes_internal"),
    notesCustomer: text("notes_customer"),
    status: orderStatus("status").notNull().default("draft"),
    createdByUserId: uuid("created_by_user_id").references(() => users.id).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("orders_status_idx").on(t.status),
    index("orders_created_by_idx").on(t.createdByUserId),
  ],
);

export const orderItems = pgTable(
  "order_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orderId: uuid("order_id").references(() => orders.id, { onDelete: "cascade" }).notNull(),
    categoryId: uuid("category_id").references(() => categories.id),
    descriptionEn: text("description_en").notNull(),
    descriptionSi: text("description_si"),
    variant: text("variant"),
    quantity: integer("quantity").notNull(),
    unit: text("unit").notNull().default("stem"),
    notes: text("notes"),
    sortOrder: integer("sort_order").notNull().default(0),
  },
  (t) => [index("order_items_order_id_idx").on(t.orderId)],
);
```

- [ ] **Step 2: Add rfqs, rfq_quote_lines, order_item_awards to the same file**

```ts
import { shops } from "./shops";
import { awardStatus, rfqStatus } from "./enums";

export const rfqs = pgTable(
  "rfqs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orderId: uuid("order_id").references(() => orders.id, { onDelete: "cascade" }).notNull(),
    supplierShopId: uuid("supplier_shop_id").references(() => shops.id).notNull(),
    status: rfqStatus("status").notNull().default("sent"),
    message: text("message"),
    quoteNotes: text("quote_notes"),
    quoteValidUntil: timestamp("quote_valid_until", { withTimezone: true }),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    viewedAt: timestamp("viewed_at", { withTimezone: true }),
    respondedAt: timestamp("responded_at", { withTimezone: true }),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("rfqs_order_supplier_uq").on(t.orderId, t.supplierShopId),
    index("rfqs_supplier_idx").on(t.supplierShopId),
  ],
);

export const rfqQuoteLines = pgTable(
  "rfq_quote_lines",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    rfqId: uuid("rfq_id").references(() => rfqs.id, { onDelete: "cascade" }).notNull(),
    orderItemId: uuid("order_item_id").references(() => orderItems.id).notNull(),
    availableQty: integer("available_qty").notNull(),
    unitPrice: integer("unit_price").notNull(),
    leadTimeDays: integer("lead_time_days"),
    notes: text("notes"),
  },
  (t) => [
    index("rfq_quote_lines_rfq_idx").on(t.rfqId),
    index("rfq_quote_lines_item_idx").on(t.orderItemId),
  ],
);

export const orderItemAwards = pgTable(
  "order_item_awards",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orderItemId: uuid("order_item_id").references(() => orderItems.id, { onDelete: "cascade" }).notNull(),
    supplierShopId: uuid("supplier_shop_id").references(() => shops.id).notNull(),
    rfqQuoteLineId: uuid("rfq_quote_line_id").references(() => rfqQuoteLines.id),
    awardedQty: integer("awarded_qty").notNull(),
    unitCost: integer("unit_cost").notNull(),
    status: awardStatus("status").notNull().default("pending"),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("order_item_awards_item_idx").on(t.orderItemId),
    index("order_item_awards_supplier_idx").on(t.supplierShopId),
  ],
);
```

- [ ] **Step 3: Commit**

```bash
git add packages/db/src/schema/orders.ts
git commit -m "feat(db): orders, items, rfqs, quote lines, awards tables"
```

### Task 3: Documents + document_otps tables

**Files:**
- Create: `packages/db/src/schema/documents.ts`

**Interfaces:**
- Consumes: `orders` (Task 2), `users`, enums (Task 1).
- Produces: `documents`, `documentOtps` tables.

- [ ] **Step 1: Write the file**

```ts
import {
  index, integer, jsonb, pgTable, text, timestamp, uniqueIndex, uuid,
} from "drizzle-orm/pg-core";
import { documentStatus, documentType } from "./enums";
import { orders } from "./orders";
import { users } from "./users";

export interface DocumentLineSnapshot {
  descriptionEn: string;
  descriptionSi: string | null;
  variant: string | null;
  qty: number;
  unit: string;
  unitPrice: number; // customer price, LKR cents
  lineTotal: number; // LKR cents
}

export interface DocumentCustomerSnapshot {
  name: string;
  phone: string;
  email: string | null;
  address: string | null;
  district: string | null;
  city: string | null;
}

export const documents = pgTable(
  "documents",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orderId: uuid("order_id").references(() => orders.id).notNull(),
    type: documentType("type").notNull(),
    docNo: text("doc_no").unique().notNull(),
    status: documentStatus("status").notNull().default("draft"),
    currency: text("currency").notNull().default("LKR"),
    subtotal: integer("subtotal").notNull().default(0),
    discount: integer("discount").notNull().default(0),
    deliveryFee: integer("delivery_fee").notNull().default(0),
    taxAmount: integer("tax_amount").notNull().default(0),
    total: integer("total").notNull().default(0),
    lineSnapshot: jsonb("line_snapshot").$type<DocumentLineSnapshot[]>().notNull(),
    customerSnapshot: jsonb("customer_snapshot").$type<DocumentCustomerSnapshot>().notNull(),
    notes: text("notes"),
    validUntil: timestamp("valid_until", { withTimezone: true }),
    publicToken: text("public_token").unique().notNull(),
    issuedAt: timestamp("issued_at", { withTimezone: true }),
    paidAt: timestamp("paid_at", { withTimezone: true }),
    paymentMethod: text("payment_method"),
    paymentRef: text("payment_ref"),
    pdfPath: text("pdf_path"),
    supersededByDocumentId: uuid("superseded_by_document_id"),
    createdByUserId: uuid("created_by_user_id").references(() => users.id).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("documents_order_idx").on(t.orderId),
    uniqueIndex("documents_public_token_uq").on(t.publicToken),
  ],
);

export const documentOtps = pgTable(
  "document_otps",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    documentId: uuid("document_id").references(() => documents.id, { onDelete: "cascade" }).notNull(),
    phone: text("phone").notNull(),
    codeHash: text("code_hash").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    attempts: integer("attempts").notNull().default(0),
    maxAttempts: integer("max_attempts").notNull().default(5),
    consumedAt: timestamp("consumed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("document_otps_doc_created_idx").on(t.documentId, t.createdAt)],
);
```

Note: `supersededByDocumentId` intentionally has no FK (self-reference avoided to keep drizzle-kit output simple); integrity enforced in the repo.

- [ ] **Step 2: Commit**

```bash
git add packages/db/src/schema/documents.ts
git commit -m "feat(db): documents + document_otps tables with snapshot columns"
```

### Task 4: Export schema + generate migration + RLS

**Files:**
- Modify: `packages/db/src/schema/index.ts`
- Create: `packages/db/migrations/0006_orders.sql` (generated)
- Create: `packages/db/migrations/0007_orders_rls.sql` (hand-written)

**Interfaces:**
- Produces: exported tables available via `@flowers/db/client` `schema`.

- [ ] **Step 1: Re-export the new modules**

Add to `packages/db/src/schema/index.ts`:

```ts
export * from "./orders";
export * from "./documents";
```

- [ ] **Step 2: Generate the table migration**

Run: `pnpm db:generate` (needs `DIRECT_DATABASE_URL`).
Expected: a new `packages/db/migrations/0006_*.sql` creating the enums + 7 tables. Rename it to `0006_orders.sql` if the journal allows, or keep the generated name and reference it. Inspect the SQL: confirm all `integer` money columns, enum types, and the two unique indexes exist.

- [ ] **Step 3: Write the RLS migration** `0007_orders_rls.sql`

```sql
-- RLS for order-fulfilment tables. The app connects as table owner (bypasses
-- RLS); these policies guard the anon/authenticated PostgREST path.

ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE public.order_item_awards ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE public.documents ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE public.document_otps ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE public.rfqs ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE public.rfq_quote_lines ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint

-- Admins: full access to every order-fulfilment table.
CREATE POLICY orders_admin_all ON public.orders FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());
--> statement-breakpoint
CREATE POLICY order_items_admin_all ON public.order_items FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());
--> statement-breakpoint
CREATE POLICY awards_admin_all ON public.order_item_awards FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());
--> statement-breakpoint
CREATE POLICY documents_admin_all ON public.documents FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());
--> statement-breakpoint

-- Suppliers: read RFQs addressed to a shop they own; write their own quote lines.
CREATE POLICY rfqs_supplier_read ON public.rfqs FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.shops s WHERE s.id = rfqs.supplier_shop_id AND s.owner_user_id = auth.uid())
);
--> statement-breakpoint
CREATE POLICY rfqs_admin_all ON public.rfqs FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());
--> statement-breakpoint
CREATE POLICY quote_lines_supplier_rw ON public.rfq_quote_lines FOR ALL USING (
  EXISTS (
    SELECT 1 FROM public.rfqs r JOIN public.shops s ON s.id = r.supplier_shop_id
    WHERE r.id = rfq_quote_lines.rfq_id AND s.owner_user_id = auth.uid()
  )
) WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.rfqs r JOIN public.shops s ON s.id = r.supplier_shop_id
    WHERE r.id = rfq_quote_lines.rfq_id AND s.owner_user_id = auth.uid()
  )
);
--> statement-breakpoint
CREATE POLICY quote_lines_admin_all ON public.rfq_quote_lines FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());
--> statement-breakpoint

-- document_otps: server-only. No anon/authenticated policy => deny all via RLS.
-- (The public document view reads through the app owner connection, not PostgREST.)
```

Register `0007_orders_rls.sql` in the drizzle journal exactly as `0001_rls_policies.sql` is registered (copy that journal entry's shape).

- [ ] **Step 4: Apply + verify**

Run: `pnpm db:migrate` then `pnpm db:studio` (or a `SELECT` via studio) to confirm the 7 tables + enums exist.

- [ ] **Step 5: Commit**

```bash
git add packages/db/src/schema/index.ts packages/db/migrations/
git commit -m "feat(db): generate order tables + RLS migration"
```

---

# STAGE 2 — Order intake (admin)

### Task 5: Constants + order validators

**Files:**
- Modify: `packages/api/src/constants.ts`
- Create: `packages/api/src/repos/orders.ts` (validators only this task)
- Create: `packages/api/src/repos/orders.test.ts`

**Interfaces:**
- Produces: `DEFAULT_MARGIN_BPS`, `ORDER_UNITS`; `validateCreateOrderInput(input): ValidationError[]`, `validateOrderItemInput(item): ValidationError[]`, types `CreateOrderInput`, `OrderItemInput`.
- Consumes: `ValidationError` type from `repos/shops.ts`, `DISTRICTS` from constants.

- [ ] **Step 1: Add constants**

Append to `packages/api/src/constants.ts`:

```ts
/** Default marketplace markup on sourcing cost, in basis points (2500 = 25%). */
export const DEFAULT_MARGIN_BPS = 2500;

/** Allowed order/quote units. */
export const ORDER_UNITS = ["stem", "bunch", "box"] as const;
export type OrderUnit = (typeof ORDER_UNITS)[number];
```

- [ ] **Step 2: Write the failing validator test** (`orders.test.ts`)

```ts
import { describe, expect, it } from "vitest";
import { validateCreateOrderInput, validateOrderItemInput } from "./orders";

describe("validateCreateOrderInput", () => {
  const valid = { customerName: "Nimal", customerPhone: "0771234567" };

  it("passes for minimal valid input", () => {
    expect(validateCreateOrderInput(valid)).toEqual([]);
  });
  it("rejects empty customerName", () => {
    expect(validateCreateOrderInput({ ...valid, customerName: " " }).some((e) => e.field === "customerName")).toBe(true);
  });
  it("rejects short phone", () => {
    expect(validateCreateOrderInput({ ...valid, customerPhone: "123" }).some((e) => e.field === "customerPhone")).toBe(true);
  });
  it("rejects unknown delivery district", () => {
    expect(validateCreateOrderInput({ ...valid, deliveryDistrict: "mars" }).some((e) => e.field === "deliveryDistrict")).toBe(true);
  });
});

describe("validateOrderItemInput", () => {
  const item = { descriptionEn: "White Roses", quantity: 100, unit: "stem" };
  it("passes for valid item", () => {
    expect(validateOrderItemInput(item)).toEqual([]);
  });
  it("rejects quantity <= 0", () => {
    expect(validateOrderItemInput({ ...item, quantity: 0 }).some((e) => e.field === "quantity")).toBe(true);
  });
  it("rejects non-integer quantity", () => {
    expect(validateOrderItemInput({ ...item, quantity: 1.5 }).some((e) => e.field === "quantity")).toBe(true);
  });
  it("rejects unknown unit", () => {
    expect(validateOrderItemInput({ ...item, unit: "ton" }).some((e) => e.field === "unit")).toBe(true);
  });
});
```

- [ ] **Step 3: Run — expect fail** `pnpm --filter @flowers/api test orders` → FAIL (module not found).

- [ ] **Step 4: Implement validators** (top of `orders.ts`)

```ts
import { DISTRICTS, ORDER_UNITS } from "../constants";
import type { ValidationError } from "./shops";

export interface OrderItemInput {
  categoryId?: string | null;
  descriptionEn: string;
  descriptionSi?: string | null;
  variant?: string | null;
  quantity: number;
  unit: string;
  notes?: string | null;
}

export interface CreateOrderInput {
  customerName: string;
  customerPhone: string;
  customerEmail?: string | null;
  customerLocale?: "en" | "si";
  deliveryAddress?: string | null;
  deliveryDistrict?: string | null;
  deliveryCity?: string | null;
  neededByDate?: string | null;
  notesInternal?: string | null;
  notesCustomer?: string | null;
  items?: OrderItemInput[];
}

export function validateOrderItemInput(item: OrderItemInput): ValidationError[] {
  const errors: ValidationError[] = [];
  if (!item.descriptionEn?.trim()) errors.push({ field: "descriptionEn", message: "Description is required" });
  if (!Number.isInteger(item.quantity) || item.quantity <= 0)
    errors.push({ field: "quantity", message: "Quantity must be a positive whole number" });
  if (!ORDER_UNITS.includes(item.unit as (typeof ORDER_UNITS)[number]))
    errors.push({ field: "unit", message: "Unknown unit" });
  return errors;
}

export function validateCreateOrderInput(input: CreateOrderInput): ValidationError[] {
  const errors: ValidationError[] = [];
  if (!input.customerName?.trim()) errors.push({ field: "customerName", message: "Customer name is required" });
  const digits = (input.customerPhone ?? "").replace(/\D/g, "");
  if (digits.length < 9) errors.push({ field: "customerPhone", message: "A valid phone number is required" });
  if (input.deliveryDistrict && !DISTRICTS.some((d) => d.slug === input.deliveryDistrict))
    errors.push({ field: "deliveryDistrict", message: "Unknown district" });
  (input.items ?? []).forEach((it, i) => {
    for (const e of validateOrderItemInput(it)) errors.push({ field: `items.${i}.${e.field}`, message: e.message });
  });
  return errors;
}
```

- [ ] **Step 5: Run — expect pass.** `pnpm --filter @flowers/api test orders` → PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/api/src/constants.ts packages/api/src/repos/orders.ts packages/api/src/repos/orders.test.ts
git commit -m "feat(api): order + item validators, margin/unit constants"
```

### Task 6: Orders repo — create, order_no, status guard

**Files:**
- Modify: `packages/api/src/repos/orders.ts`
- Modify: `packages/api/src/repos/orders.test.ts`

**Interfaces:**
- Consumes: validators (Task 5), `Db`, `schema`, `ActionResult`/`ok`/`err`/`isPgError`.
- Produces:
  - `nextOrderNo(year: number, seq: number): string`
  - `canTransition(from: OrderStatus, to: OrderStatus): boolean`
  - `createOrder(db, input, createdByUserId): Promise<ActionResult<{ id: string; orderNo: string }>>`
  - `getOrder(db, orderId): Promise<ActionResult<OrderDetail>>` (order + items + rfqs + awards + documents)
  - `updateOrderStatus(db, orderId, to): Promise<ActionResult<void>>`
  - types `OrderStatus`, `OrderDetail`.

- [ ] **Step 1: Write failing pure-helper tests**

```ts
import { canTransition, nextOrderNo } from "./orders";

describe("nextOrderNo", () => {
  it("zero-pads the sequence", () => {
    expect(nextOrderNo(2026, 1)).toBe("FM-2026-0001");
    expect(nextOrderNo(2026, 42)).toBe("FM-2026-0042");
  });
});

describe("canTransition", () => {
  it("allows draft -> sourcing", () => expect(canTransition("draft", "sourcing")).toBe(true));
  it("allows any -> cancelled", () => expect(canTransition("quoted", "cancelled")).toBe(true));
  it("rejects skipping quoted -> paid", () => expect(canTransition("quoted", "paid")).toBe(false));
  it("rejects backward completed -> draft", () => expect(canTransition("completed", "draft")).toBe(false));
});
```

- [ ] **Step 2: Run — expect fail.**

- [ ] **Step 3: Implement helpers + repo functions**

```ts
import { and, desc, eq, sql } from "drizzle-orm";
import { schema } from "@flowers/db/client";
import type { Db } from "../db";
import { err, isPgError, ok, type ActionResult } from "../errors";

type DbOrTx = Db | Parameters<Parameters<Db["transaction"]>[0]>[0];

export type OrderStatus =
  | "draft" | "sourcing" | "quoted" | "confirmed"
  | "invoiced" | "paid" | "fulfilling" | "completed" | "cancelled";

const NEXT: Record<OrderStatus, OrderStatus[]> = {
  draft: ["sourcing", "cancelled"],
  sourcing: ["quoted", "cancelled"],
  quoted: ["confirmed", "cancelled"],
  confirmed: ["invoiced", "cancelled"],
  invoiced: ["paid", "cancelled"],
  paid: ["fulfilling", "cancelled"],
  fulfilling: ["completed", "cancelled"],
  completed: [],
  cancelled: [],
};

export function canTransition(from: OrderStatus, to: OrderStatus): boolean {
  return NEXT[from]?.includes(to) ?? false;
}

export function nextOrderNo(year: number, seq: number): string {
  return `FM-${year}-${seq.toString().padStart(4, "0")}`;
}

export async function createOrder(
  db: DbOrTx,
  input: CreateOrderInput,
  createdByUserId: string,
): Promise<ActionResult<{ id: string; orderNo: string }>> {
  const errors = validateCreateOrderInput(input);
  if (errors.length) return err("validation", errors.map((e) => `${e.field}: ${e.message}`).join("; "));

  try {
    return await db.transaction(async (tx) => {
      const year = new Date().getUTCFullYear();
      // Count existing orders this year to derive the next sequence.
      const [{ count }] = await tx
        .select({ count: sql<number>`count(*)::int` })
        .from(schema.orders)
        .where(sql`extract(year from ${schema.orders.createdAt}) = ${year}`);
      const orderNo = nextOrderNo(year, Number(count) + 1);

      const [row] = await tx
        .insert(schema.orders)
        .values({
          orderNo,
          customerName: input.customerName.trim(),
          customerPhone: input.customerPhone.trim(),
          customerEmail: input.customerEmail ?? null,
          customerLocale: input.customerLocale ?? "en",
          deliveryAddress: input.deliveryAddress ?? null,
          deliveryDistrict: input.deliveryDistrict ?? null,
          deliveryCity: input.deliveryCity ?? null,
          neededByDate: input.neededByDate ?? null,
          notesInternal: input.notesInternal ?? null,
          notesCustomer: input.notesCustomer ?? null,
          createdByUserId,
        })
        .returning({ id: schema.orders.id });

      if (input.items?.length) {
        await tx.insert(schema.orderItems).values(
          input.items.map((it, i) => ({
            orderId: row.id,
            categoryId: it.categoryId ?? null,
            descriptionEn: it.descriptionEn.trim(),
            descriptionSi: it.descriptionSi ?? null,
            variant: it.variant ?? null,
            quantity: it.quantity,
            unit: it.unit,
            notes: it.notes ?? null,
            sortOrder: i,
          })),
        );
      }
      return ok({ id: row.id, orderNo });
    });
  } catch (e) {
    if (isPgError(e, "23505")) return err("conflict", "Order number collision, retry");
    return err("unknown", "Failed to create order");
  }
}

export async function updateOrderStatus(
  db: DbOrTx, orderId: string, to: OrderStatus,
): Promise<ActionResult<void>> {
  const [current] = await db.select({ status: schema.orders.status }).from(schema.orders).where(eq(schema.orders.id, orderId));
  if (!current) return err("not_found", "Order not found");
  if (!canTransition(current.status as OrderStatus, to))
    return err("validation", `Illegal transition ${current.status} -> ${to}`);
  await db.update(schema.orders).set({ status: to, updatedAt: new Date() }).where(eq(schema.orders.id, orderId));
  return ok(undefined);
}
```

Also implement `getOrder` returning `OrderDetail` (order row + `items` + `rfqs` with quote lines + `awards` + `documents`), assembling via `eq(...orderId)` queries. Define and export the `OrderDetail` type with all nested arrays.

- [ ] **Step 4: Run — expect pass** for pure-helper tests.

- [ ] **Step 5: Commit**

```bash
git add packages/api/src/repos/orders.ts packages/api/src/repos/orders.test.ts
git commit -m "feat(api): orders repo — create, order_no, status guard, getOrder"
```

### Task 7: Admin order-intake UI

**Files:**
- Create: `apps/admin/src/routes/-orders/server.ts` (server functions)
- Create: `apps/admin/src/routes/orders.index.tsx`
- Create: `apps/admin/src/routes/orders.new.tsx`
- Create: `apps/admin/src/routes/orders.$orderId.tsx`

**Interfaces:**
- Consumes: `createOrder`, `getOrder`, listing helper from orders repo; admin auth guard used by existing admin routes (mirror `apps/admin/src/routes/index.tsx` + whatever `beforeLoad`/auth the app already uses).
- Produces: `createOrderFn`, `listOrdersFn`, `getOrderFn` server functions.

- [ ] **Step 1: Server functions** (`-orders/server.ts`) — use TanStack `createServerFn`, `requireDb()`, resolve the admin user id via the app's existing auth helper (`@flowers/auth`), and call the repo. Example:

```ts
import { createServerFn } from "@tanstack/react-start";
import { requireDb } from "@flowers/api/db";
import { createOrder, getOrder, listOrders } from "@flowers/api/repos/orders";
// ...resolve admin session id via existing helper, then:
export const createOrderFn = createServerFn({ method: "POST" })
  .validator((d: CreateOrderInput) => d)
  .handler(async ({ data }) => createOrder(requireDb(), data, await currentAdminId()));
```

Follow the exact server-fn + auth pattern already used in `apps/supplier/src/routes/products.new.tsx` (products CRUD is the closest precedent — read it first).

- [ ] **Step 2: `/orders` list** — table of orders (order_no, customer, status badge, created date, needed-by), "New order" button linking to `/orders/new`, empty state. Uses `listOrdersFn` in the route loader.

- [ ] **Step 3: `/orders/new` intake form** — fields for customer + delivery + a repeatable line-item editor (description_en/si, variant, quantity, unit select from `ORDER_UNITS`, optional category select). On submit call `createOrderFn`; on `ok` navigate to `/orders/$orderId`; on `err` render the message. Reuse `@flowers/ui` form components used in supplier product form.

- [ ] **Step 4: `/orders/$orderId` detail (overview only this stage)** — loader calls `getOrderFn`; render customer/delivery/status/timeline and the line items. Sourcing + documents panels are added in later stages (leave labelled section placeholders that render "No RFQs yet" / "No documents yet" — these are real empty states, not TODOs).

- [ ] **Step 5: Verify manually** — `pnpm --filter @flowers/admin dev`, create an order with 100 white + 15 red roses, confirm it appears in `/orders` and the detail page shows both lines and status `draft`.

- [ ] **Step 6: Commit**

```bash
git add apps/admin/src/routes/orders.index.tsx apps/admin/src/routes/orders.new.tsx apps/admin/src/routes/orders.\$orderId.tsx apps/admin/src/routes/-orders/
git commit -m "feat(admin): order intake — list, create, detail overview"
```

---

# STAGE 3 — RFQ + supplier quotes

### Task 8: rfqs repo — match growers + tenant guard

**Files:**
- Create: `packages/api/src/repos/rfqs.ts`
- Create: `packages/api/src/repos/rfqs.test.ts`

**Interfaces:**
- Produces:
  - `matchRoseGrowers(db, orderId): Promise<ActionResult<MatchedSupplier[]>>` — distinct growers (`shopType='grower'`, `isActive`) with an `active` product whose `categoryId` is in the order's item categories.
  - `listSupplierRfqs(db, shopId): Promise<ActionResult<SupplierRfqSummary[]>>`
  - `getSupplierRfq(db, rfqId, shopId): Promise<ActionResult<SupplierRfqDetail>>` — returns `err("not_found", …)` if the RFQ's `supplierShopId !== shopId` (tenant guard — Review Focus).
  - types `MatchedSupplier`, `SupplierRfqSummary`, `SupplierRfqDetail`.

- [ ] **Step 1: Write failing tenant-guard test** (uses a live test db if the suite has one; otherwise assert on a pure guard helper `assertOwnsRfq(rfq, shopId)` extracted for unit testing):

```ts
import { assertOwnsRfq } from "./rfqs";
it("rejects RFQ owned by another shop", () => {
  expect(assertOwnsRfq({ supplierShopId: "A" }, "B").ok).toBe(false);
});
it("passes RFQ owned by the shop", () => {
  expect(assertOwnsRfq({ supplierShopId: "A" }, "A").ok).toBe(true);
});
```

- [ ] **Step 2: Run — expect fail.**

- [ ] **Step 3: Implement `assertOwnsRfq` + queries.** `matchRoseGrowers` query sketch:

```ts
// order item categories
const items = await db.select({ categoryId: schema.orderItems.categoryId })
  .from(schema.orderItems).where(eq(schema.orderItems.orderId, orderId));
const catIds = items.map((i) => i.categoryId).filter((c): c is string => !!c);
if (!catIds.length) return ok([]);
const rows = await db.selectDistinct({
    shopId: schema.shops.id, nameEn: schema.shops.nameEn, district: schema.shops.district,
  })
  .from(schema.shops)
  .innerJoin(schema.products, eq(schema.products.shopId, schema.shops.id))
  .where(and(
    eq(schema.shops.shopType, "grower"),
    eq(schema.shops.isActive, true),
    eq(schema.products.status, "active"),
    inArray(schema.products.categoryId, catIds),
  ));
return ok(rows);
```

- [ ] **Step 4: Run — expect pass.**

- [ ] **Step 5: Commit**

```bash
git add packages/api/src/repos/rfqs.ts packages/api/src/repos/rfqs.test.ts
git commit -m "feat(api): rfqs repo — grower matching + tenant guard"
```

### Task 9: rfqs repo — create RFQs, dispatch, record quotes

**Files:**
- Modify: `packages/api/src/repos/rfqs.ts` (+ test)

**Interfaces:**
- Consumes: `matchRoseGrowers`, orders repo `updateOrderStatus`, Evolution client (Task 10) — but dispatch is passed in as a callback so the repo stays pure of I/O ordering.
- Produces:
  - `createRfqs(db, orderId, supplierShopIds, message?): Promise<ActionResult<{ created: string[] }>>` — idempotent on `(orderId, supplierShopId)`, sets order → `sourcing`.
  - `recordSupplierQuote(db, rfqId, shopId, lines, quoteNotes?, validUntil?): Promise<ActionResult<void>>` — writes `rfq_quote_lines`, sets rfq → `quoted`, `respondedAt`.
  - `markRfqViewed(db, rfqId, shopId)`.

- [ ] **Step 1: Failing test** — dispatch/state ordering & idempotency covered by unit test on the pure `dedupeSupplierIds(existing, requested)` helper:

```ts
import { dedupeSupplierIds } from "./rfqs";
it("drops suppliers already RFQ'd", () => {
  expect(dedupeSupplierIds(["A", "B"], ["B", "C"])).toEqual(["C"]);
});
```

- [ ] **Step 2: Run — expect fail.**

- [ ] **Step 3: Implement** `dedupeSupplierIds`, `createRfqs` (insert new rows in a tx, then `updateOrderStatus(tx, orderId, "sourcing")` if currently `draft`), `recordSupplierQuote` (validate lines: `availableQty >= 0`, `unitPrice >= 0`; insert; update rfq). **Dispatch note:** `createRfqs` does NOT send WhatsApp — the caller (server fn, Task 12) sends after the tx commits so a send failure never rolls back the RFQ (Review Focus: missing WhatsApp config).

- [ ] **Step 4: Run — expect pass.**

- [ ] **Step 5: Commit**

```bash
git commit -am "feat(api): rfqs repo — create RFQs, record supplier quotes"
```

### Task 10: Evolution WhatsApp client

**Files:**
- Create: `packages/integrations/src/evolution.ts`
- Create: `packages/integrations/src/evolution.test.ts`
- Modify: `packages/integrations/src/index.ts`

**Interfaces:**
- Produces:
  - `toWhatsappJid(phone: string): string` — normalise a Sri Lankan number to `94XXXXXXXXX@s.whatsapp.net` (pure).
  - `sendWhatsappText(config, to, message): Promise<ActionResult<void>>` where `config = { apiUrl, apiKey, instance }`.
- Consumes: global `fetch` (Workers-native).

- [ ] **Step 1: Failing test for the pure normaliser**

```ts
import { toWhatsappJid } from "./evolution";
it("keeps a 94-prefixed number", () => expect(toWhatsappJid("94771234567")).toBe("94771234567@s.whatsapp.net"));
it("converts local 0-prefixed", () => expect(toWhatsappJid("0771234567")).toBe("94771234567@s.whatsapp.net"));
it("strips spaces and +", () => expect(toWhatsappJid("+94 77 123 4567")).toBe("94771234567@s.whatsapp.net"));
```

- [ ] **Step 2: Run — expect fail.**

- [ ] **Step 3: Implement**

```ts
import { err, ok, type ActionResult } from "@flowers/api/errors"; // or duplicate a local Result type if cross-pkg import is undesirable

export interface EvolutionConfig { apiUrl: string; apiKey: string; instance: string; }

export function toWhatsappJid(phone: string): string {
  let d = phone.replace(/\D/g, "");
  if (d.startsWith("0")) d = `94${d.slice(1)}`;
  if (!d.startsWith("94")) d = `94${d}`;
  return `${d}@s.whatsapp.net`;
}

export async function sendWhatsappText(
  config: EvolutionConfig, to: string, message: string,
): Promise<ActionResult<void>> {
  if (!config.apiUrl || !config.apiKey || !config.instance)
    return err("db_unavailable", "WhatsApp (Evolution API) is not configured");
  try {
    const res = await fetch(`${config.apiUrl.replace(/\/$/, "")}/message/sendText/${config.instance}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: config.apiKey },
      body: JSON.stringify({ number: toWhatsappJid(to), text: message }),
    });
    if (!res.ok) return err("unknown", `WhatsApp send failed (${res.status})`);
    return ok(undefined);
  } catch {
    return err("unknown", "WhatsApp send failed");
  }
}
```

(If importing `ActionResult` across packages is awkward, define a local `type SendResult = { ok: true } | { ok: false; message: string }` — keep it typed, no `any`.)

- [ ] **Step 4: Run — expect pass.** Export from `index.ts`.

- [ ] **Step 5: Commit**

```bash
git add packages/integrations/src/evolution.ts packages/integrations/src/evolution.test.ts packages/integrations/src/index.ts
git commit -m "feat(integrations): Evolution API WhatsApp client + JID normaliser"
```

### Task 11: RFQ + OTP + document message builders

**Files:**
- Create: `packages/integrations/src/rfqMessages.ts`
- Create: `packages/integrations/src/rfqMessages.test.ts`
- Modify: `packages/integrations/src/index.ts`

**Interfaces:**
- Produces (all pure, bilingual via a `locale` arg):
  - `buildRfqNudge(input: { shopName: string; orderNo: string; portalUrl: string; locale: "en"|"si" }): string`
  - `buildOtpMessage(input: { code: string; locale: "en"|"si" }): string`
  - `buildDocumentLinkMessage(input: { type: "quotation"|"invoice"|"receipt"; docNo: string; url: string; locale: "en"|"si" }): string`

- [ ] **Step 1: Failing tests** — assert each contains its dynamic values:

```ts
import { buildRfqNudge, buildOtpMessage, buildDocumentLinkMessage } from "./rfqMessages";
it("rfq nudge includes order no + url", () => {
  const m = buildRfqNudge({ shopName: "Green Grove", orderNo: "FM-2026-0001", portalUrl: "https://s.lk/rfqs/1", locale: "en" });
  expect(m).toContain("FM-2026-0001"); expect(m).toContain("https://s.lk/rfqs/1");
});
it("otp message includes the code", () => expect(buildOtpMessage({ code: "482913", locale: "en" })).toContain("482913"));
it("doc link message includes url + docNo", () => {
  const m = buildDocumentLinkMessage({ type: "invoice", docNo: "FM-INV-2026-0001", url: "https://f.lk/en/d/tok", locale: "en" });
  expect(m).toContain("FM-INV-2026-0001"); expect(m).toContain("https://f.lk/en/d/tok");
});
```

- [ ] **Step 2: Run — expect fail. Step 3: Implement the three builders** (mirror the tone/format of `whatsapp.ts` / `quotation.ts`; provide `en` + `si` strings). **Step 4: Run — expect pass.**

- [ ] **Step 5: Commit**

```bash
git add packages/integrations/src/rfqMessages.ts packages/integrations/src/rfqMessages.test.ts packages/integrations/src/index.ts
git commit -m "feat(integrations): RFQ, OTP, document WhatsApp message builders"
```

### Task 12: Admin sourcing panel (send RFQs)

**Files:**
- Modify: `apps/admin/src/routes/orders.$orderId.tsx`
- Modify: `apps/admin/src/routes/-orders/server.ts`
- Modify: `apps/admin/.dev.vars` + `apps/admin/wrangler.jsonc`

**Interfaces:**
- Consumes: `matchRoseGrowers`, `createRfqs` (repo), `sendWhatsappText` + `buildRfqNudge` (integrations), `getEnv()` for Evolution config + supplier portal origin.
- Produces: `matchSuppliersFn`, `sendRfqsFn` server functions.

- [ ] **Step 1:** Add `EVOLUTION_API_URL`, `EVOLUTION_API_KEY`, `EVOLUTION_INSTANCE`, and `SUPPLIER_PORTAL_URL` to admin `.dev.vars` (dummy values ok locally) and wrangler vars; extend `getEnv()` typing.

- [ ] **Step 2:** `matchSuppliersFn(orderId)` → `matchRoseGrowers`. `sendRfqsFn({ orderId, supplierShopIds, message })` → `createRfqs` (commits), then for each created RFQ call `sendWhatsappText(evolutionConfig, supplierPhone, buildRfqNudge(...))`; collect per-supplier send results and return them (partial-success UI). A send failure must not fail the whole call.

- [ ] **Step 3:** Sourcing panel UI in the detail route: "Find rose growers" button → renders matched suppliers with checkboxes → "Send RFQs" → shows per-supplier sent/failed. After sending, the order status shows `sourcing`.

- [ ] **Step 4: Verify manually** — with dummy Evolution config, sending returns a "WhatsApp not configured / failed" per-supplier notice but the RFQs are still created and the order moves to `sourcing`. (Confirms Review Focus: send failure doesn't block state.)

- [ ] **Step 5: Commit**

```bash
git commit -am "feat(admin): sourcing panel — match growers, create + dispatch RFQs"
```

### Task 13: Supplier RFQ inbox + response

**Files:**
- Create: `apps/supplier/src/routes/rfqs.index.tsx`
- Create: `apps/supplier/src/routes/rfqs.$rfqId.tsx`
- Create: `apps/supplier/src/routes/-rfqs/server.ts`

**Interfaces:**
- Consumes: `listSupplierRfqs`, `getSupplierRfq`, `recordSupplierQuote`, `markRfqViewed` (all shop-scoped); the supplier app's existing auth → shop resolution (mirror `products.index.tsx`).
- Produces: `listRfqsFn`, `getRfqFn`, `submitQuoteFn`, `declineRfqFn`.

- [ ] **Step 1:** Server fns resolve the logged-in supplier's `shopId` (existing helper) and pass it to the repo — every call is shop-scoped (tenant guard).
- [ ] **Step 2:** `/rfqs` inbox — list RFQs (order_no, item summary, status, sent date). Opening one calls `markRfqViewed`.
- [ ] **Step 3:** `/rfqs/$rfqId` — per-line inputs (available qty, unit price in rupees → convert to cents on submit, lead time), overall notes + validity; submit → `submitQuoteFn`; decline button → `declineRfqFn`.
- [ ] **Step 4: Verify manually** — log in as the demo grower (from seed), see the RFQ from Task 12, submit a quote for the white-roses line, confirm the admin order detail shows the quote.
- [ ] **Step 5: Commit**

```bash
git commit -am "feat(supplier): RFQ inbox + per-line quote submission"
```

---

# STAGE 4 — Award / sourcing decision

### Task 14: awards repo — allocate, invariant, rollup

**Files:**
- Create: `packages/api/src/repos/awards.ts`
- Create: `packages/api/src/repos/awards.test.ts`

**Interfaces:**
- Produces:
  - `remainingQty(itemQty: number, existingAwards: {awardedQty:number;status:string}[]): number` (pure)
  - `validateAward(itemQty, existingAwards, newQty): ValidationError[]` (pure — rejects when it would exceed remaining; **Review Focus: over-allocation**)
  - `createAward(db, input): Promise<ActionResult<{id:string}>>`
  - `cancelAward(db, awardId): Promise<ActionResult<void>>`
  - `orderCostRollup(db, orderId): Promise<ActionResult<{ itemId: string; awardedQty: number; cost: number }[]>>`

- [ ] **Step 1: Failing tests**

```ts
import { remainingQty, validateAward } from "./awards";
const item = 100;
it("remaining subtracts non-cancelled awards", () => {
  expect(remainingQty(item, [{ awardedQty: 40, status: "pending" }, { awardedQty: 10, status: "cancelled" }])).toBe(60);
});
it("rejects award exceeding remaining", () => {
  expect(validateAward(item, [{ awardedQty: 90, status: "confirmed" }], 20).length).toBeGreaterThan(0);
});
it("accepts award within remaining", () => {
  expect(validateAward(item, [{ awardedQty: 90, status: "confirmed" }], 10)).toEqual([]);
});
it("rejects non-positive award", () => {
  expect(validateAward(item, [], 0).length).toBeGreaterThan(0);
});
```

- [ ] **Step 2: Run — expect fail. Step 3: Implement** the pure helpers + repo (createAward re-reads existing awards inside the tx and re-validates before insert). **Step 4: Run — expect pass.**
- [ ] **Step 5: Commit**

```bash
git add packages/api/src/repos/awards.ts packages/api/src/repos/awards.test.ts
git commit -m "feat(api): awards repo — allocation invariant + cost rollup"
```

### Task 15: Admin quote matrix + award splitter

**Files:**
- Modify: `apps/admin/src/routes/orders.$orderId.tsx`, `-orders/server.ts`

**Interfaces:**
- Consumes: `getOrder` (includes rfqs+quote lines+awards), `createAward`, `cancelAward`.
- Produces: `createAwardFn`, `cancelAwardFn`.

- [ ] **Step 1:** Server fns wrapping the awards repo.
- [ ] **Step 2:** Quote-comparison matrix: rows = order items, columns = responding suppliers, each cell shows available qty / unit price (via `formatRupees`) / lead time. Per item, an "award" control lets the admin allocate a quantity to a supplier's quote line; shows live "remaining N of {qty}". Blocks submitting more than remaining (server also enforces).
- [ ] **Step 3:** Show awarded summary per item + total sourcing cost (from `orderCostRollup`).
- [ ] **Step 4: Verify manually** — split 100 white roses across two growers (e.g. 60 + 40) and confirm remaining hits 0 and over-allocation is rejected.
- [ ] **Step 5: Commit**

```bash
git commit -am "feat(admin): quote matrix + per-line award splitter"
```

---

# STAGE 5 — Documents + OTP + PDF

### Task 16: Pricing + documents repo

**Files:**
- Create: `packages/api/src/pricing.ts` (+ `pricing.test.ts`)
- Create: `packages/api/src/repos/documents.ts` (+ `documents.test.ts`)

**Interfaces:**
- Produces:
  - `applyMargin(costCents: number, marginBps: number): number` (pure; rounds to nearest cent)
  - `documentTotals(lines: {qty:number; unitPrice:number}[], opts?: {discount?:number; deliveryFee?:number; taxAmount?:number}): {subtotal:number; total:number}` (pure)
  - `buildDocumentDraft(db, orderId, type, opts): Promise<ActionResult<DraftDocument>>` — for quotations, pulls awarded cost rollup, applies margin (per-line override → per-order marginBps → `DEFAULT_MARGIN_BPS`), builds `lineSnapshot` at **customer** price; for invoice/receipt copies from the latest accepted quotation snapshot.
  - `issueDocument(db, draftId): Promise<ActionResult<{token:string; docNo:string}>>` — freezes snapshot, sets `issuedAt`, `docNo`, `publicToken`.
  - `markPaid(db, docId, method, ref): Promise<ActionResult<void>>`
  - `reviseDocument(db, docId): Promise<ActionResult<{id:string}>>` — clones, sets `supersededByDocumentId` on the old.

- [ ] **Step 1: Failing pricing tests**

```ts
import { applyMargin, documentTotals } from "./pricing";
it("applies 25% margin", () => expect(applyMargin(10000, 2500)).toBe(12500));
it("rounds to nearest cent", () => expect(applyMargin(333, 2500)).toBe(416)); // 416.25 -> 416
it("totals sum line qty*price", () => {
  expect(documentTotals([{ qty: 100, unitPrice: 125 }, { qty: 15, unitPrice: 200 }]).subtotal).toBe(15500);
});
it("total adds delivery and subtracts discount", () => {
  expect(documentTotals([{ qty: 1, unitPrice: 1000 }], { discount: 200, deliveryFee: 300 }).total).toBe(1100);
});
```

- [ ] **Step 2: Run — expect fail. Step 3: Implement** `applyMargin` = `Math.round(costCents * (10000 + marginBps) / 10000)`, `documentTotals`, then the repo functions. **Step 4: Run — expect pass.**

- [ ] **Step 5: Failing document immutability test** (Review Focus) — pure guard: `issueDocument` sets `issuedAt`; add `assertEditable(doc)` returning `err` when `issuedAt != null`, and unit-test it:

```ts
import { assertEditable } from "./documents";
it("blocks edits after issue", () => expect(assertEditable({ issuedAt: new Date() }).ok).toBe(false));
it("allows edits on draft", () => expect(assertEditable({ issuedAt: null }).ok).toBe(true));
```

- [ ] **Step 6: Implement `assertEditable`, use it in `reviseDocument`/any mutation. Run — expect pass.**

- [ ] **Step 7: Commit**

```bash
git add packages/api/src/pricing.ts packages/api/src/pricing.test.ts packages/api/src/repos/documents.ts packages/api/src/repos/documents.test.ts
git commit -m "feat(api): pricing math + documents repo (snapshot, issue, revise, markPaid)"
```

### Task 17: docNo + token helpers

**Files:**
- Modify: `packages/api/src/repos/documents.ts` (+ test) — or a small `packages/api/src/repos/docIdentifiers.ts`

**Interfaces:**
- Produces:
  - `docNoPrefix(type): "FM-Q" | "FM-INV" | "FM-RCP"` (pure)
  - `nextDocNo(type, year, seq): string` (pure)
  - `generatePublicToken(): string` — 32+ char URL-safe random via `crypto.getRandomValues` (Workers-native).

- [ ] **Step 1: Failing tests**

```ts
import { docNoPrefix, nextDocNo, generatePublicToken } from "./documents";
it("prefixes by type", () => { expect(docNoPrefix("quotation")).toBe("FM-Q"); expect(docNoPrefix("invoice")).toBe("FM-INV"); expect(docNoPrefix("receipt")).toBe("FM-RCP"); });
it("formats doc no", () => expect(nextDocNo("invoice", 2026, 7)).toBe("FM-INV-2026-0007"));
it("token is url-safe and long", () => { const t = generatePublicToken(); expect(t).toMatch(/^[A-Za-z0-9_-]{32,}$/); });
```

- [ ] **Step 2: Run — expect fail. Step 3: Implement** (`generatePublicToken` uses `crypto.getRandomValues(new Uint8Array(24))` → base64url). **Step 4: Run — expect pass. Step 5: Commit.**

```bash
git commit -am "feat(api): document number + public token helpers"
```

### Task 18: documentAccess repo — OTP + signed cookie

**Files:**
- Create: `packages/api/src/repos/documentAccess.ts` (+ `documentAccess.test.ts`)

**Interfaces:**
- Produces:
  - `hashOtp(code, secret): Promise<string>` (HMAC-SHA256 via WebCrypto)
  - `generateOtpCode(): string` (6 digits, crypto-random)
  - `requestOtp(db, token, phone, opts): Promise<ActionResult<void>>` — rate-limit: reject if > N unconsumed codes issued in the last window; store hash; returns the plaintext via `opts.onCode(code)` callback so the server fn dispatches WhatsApp (repo stays I/O-light).
  - `verifyOtp(db, token, phone, code, secret): Promise<ActionResult<{ cookie: string }>>` — increments attempts, rejects when `attempts >= maxAttempts`, expired, or already consumed; on success marks consumed + returns a signed cookie value.
  - `signDocCookie(token, secret): Promise<string>` / `verifyDocCookie(value, token, secret): Promise<boolean>` (HMAC + exp).

- [ ] **Step 1: Failing tests** (Review Focus: brute force / replay)

```ts
import { generateOtpCode, signDocCookie, verifyDocCookie } from "./documentAccess";
it("otp is 6 digits", () => expect(generateOtpCode()).toMatch(/^\d{6}$/));
it("valid cookie verifies", async () => {
  const c = await signDocCookie("tok", "secret");
  expect(await verifyDocCookie(c, "tok", "secret")).toBe(true);
});
it("cookie for another token fails", async () => {
  const c = await signDocCookie("tok", "secret");
  expect(await verifyDocCookie(c, "other", "secret")).toBe(false);
});
it("tampered cookie fails", async () => {
  const c = await signDocCookie("tok", "secret");
  expect(await verifyDocCookie(c + "x", "tok", "secret")).toBe(false);
});
```

Add DB-backed tests for `verifyOtp` if the suite has a live test db (wrong code increments attempts; > maxAttempts → `err`; expired → `err`; consumed → `err`). If no live db, extract and unit-test the pure decision helper `otpVerdict({ attempts, maxAttempts, expiresAt, consumedAt, matches }, now)`.

- [ ] **Step 2: Run — expect fail. Step 3: Implement** WebCrypto HMAC (`crypto.subtle.importKey`/`sign`), `otpVerdict`, rate-limit query, cookie sign/verify (payload `token.exp.sig`, generic errors only). **Step 4: Run — expect pass. Step 5: Commit.**

```bash
git add packages/api/src/repos/documentAccess.ts packages/api/src/repos/documentAccess.test.ts
git commit -m "feat(api): document OTP issue/verify + signed doc-scoped cookie"
```

### Task 19: PDF generation

**Files:**
- Create: `packages/integrations/src/pdf.ts` (+ `pdf.test.ts`)
- Modify: `packages/integrations/package.json` (add `pdf-lib`), `packages/integrations/src/index.ts`

**Interfaces:**
- Produces: `renderDocumentPdf(input: DocumentPdfInput): Promise<Uint8Array>` where `DocumentPdfInput` carries doc type, docNo, issued date, customer snapshot, line snapshot, totals (all already-computed; pure formatting inside).

- [ ] **Step 1:** `pnpm --filter @flowers/integrations add pdf-lib`.
- [ ] **Step 2: Failing test** — smoke test that output is a valid PDF:

```ts
import { renderDocumentPdf } from "./pdf";
it("produces a PDF byte stream", async () => {
  const bytes = await renderDocumentPdf({
    type: "invoice", docNo: "FM-INV-2026-0001", issuedAt: "2026-09-27",
    customer: { name: "Nimal", phone: "0771234567", address: null, email: null, district: null, city: null },
    lines: [{ descriptionEn: "White Roses", descriptionSi: null, variant: "white", qty: 100, unit: "stem", unitPrice: 125, lineTotal: 12500 }],
    subtotal: 12500, discount: 0, deliveryFee: 0, taxAmount: 0, total: 12500, currency: "LKR",
  });
  expect(bytes.length).toBeGreaterThan(100);
  expect(new TextDecoder().decode(bytes.slice(0, 5))).toBe("%PDF-");
});
```

- [ ] **Step 3: Run — expect fail. Step 4: Implement** with `pdf-lib` (`PDFDocument.create()`, draw header, customer block, line table using `formatRupees`-style rupee formatting, totals; return `await pdf.save()`). **Step 5: Run — expect pass.**
- [ ] **Step 6: Commit.**

```bash
git add packages/integrations/src/pdf.ts packages/integrations/src/pdf.test.ts packages/integrations/src/index.ts packages/integrations/package.json pnpm-lock.yaml
git commit -m "feat(integrations): pdf-lib document PDF renderer"
```

> **Risk gate (spec §7):** if `pdf-lib` layout proves too costly here, descope to the print-optimized web page only (Task 21 covers `@media print`) and stub `renderDocumentPdf` to throw `not_implemented`; the `.pdf` route (Task 22) then 404s and the link path still ships. Re-confirm with the user before descoping.

### Task 20: Admin documents panel

**Files:**
- Modify: `apps/admin/src/routes/orders.$orderId.tsx`, `-orders/server.ts`, admin `.dev.vars`/wrangler (`DOC_ACCESS_SECRET`, `WEB_PUBLIC_URL`).

**Interfaces:**
- Consumes: `buildDocumentDraft`, `issueDocument`, `markPaid`, `reviseDocument`; `sendWhatsappText` + `buildDocumentLinkMessage`; `requestOtp` not here.
- Produces: `createDocumentFn`, `issueDocumentFn`, `sendDocumentFn`, `markPaidFn`.

- [ ] **Step 1:** Documents panel: create Quotation (choose margin or accept default, edit per-line customer prices, discount, delivery fee), preview totals, **Issue**, then **Send WhatsApp link** (builds `${WEB_PUBLIC_URL}/${locale}/d/${token}` and dispatches). After acceptance, create Invoice; after payment, **Mark paid** → create Receipt.
- [ ] **Step 2:** Each issued document row shows docNo, status, total, public link (copyable), "Download PDF" (opens the web `.pdf` route), and the order status advances via `updateOrderStatus` on the relevant actions (`quoted`/`invoiced`/`paid`).
- [ ] **Step 3: Verify manually** — issue a quotation for the sample order, copy the link.
- [ ] **Step 4: Commit.**

```bash
git commit -am "feat(admin): documents panel — quotation/invoice/receipt issue + send"
```

### Task 21: Public OTP-gated document view

**Files:**
- Create: `apps/web/src/routes/$locale/d.$token.tsx`
- Create: `apps/web/src/routes/-documents/server.ts`
- Modify: web `.dev.vars`/wrangler (`DOC_ACCESS_SECRET`, Evolution vars)

**Interfaces:**
- Consumes: `documentAccess` (`requestOtp`, `verifyOtp`, `verifyDocCookie`), a `getPublicDocument(db, token)` reader on the documents repo (returns snapshot fields only — never internal cost/awards), `sendWhatsappText` + `buildOtpMessage`.
- Produces: `requestDocOtpFn`, `verifyDocOtpFn`, `getPublicDocumentFn`.

- [ ] **Step 1:** `getPublicDocument` returns only customer-facing snapshot + totals + type/docNo/status/issuedAt (assert no supplier cost leaks).
- [ ] **Step 2:** Route loader checks the doc-scoped cookie; if absent/invalid → render OTP challenge (enter phone → `requestDocOtpFn` sends code via WhatsApp → enter code → `verifyDocOtpFn` sets cookie); if valid → render the document (print-optimized, `@media print`) with a "Download PDF" button linking to `./d/$token/pdf`.
- [ ] **Step 3:** All OTP errors render a single generic "Invalid or expired code" (no enumeration).
- [ ] **Step 4: Verify manually** — open the link from Task 20, request an OTP (with real Evolution config it arrives on WhatsApp; with dummy config, read the code from server logs in dev), verify, see the document; wrong code 6× is locked out.
- [ ] **Step 5: Commit.**

```bash
git commit -am "feat(web): OTP-gated public document view"
```

### Task 22: Public PDF download route

**Files:**
- Create: `apps/web/src/routes/$locale/d.$token.pdf.ts` (server route returning `application/pdf`)

**Interfaces:**
- Consumes: `verifyDocCookie` (gate — same cookie as the view), `getPublicDocument`, `renderDocumentPdf`; on first generation, upload to Supabase Storage and set `pdf_path`, else stream stored bytes.

- [ ] **Step 1:** Server route: verify cookie for `$token`; if missing → 401/redirect to the view for OTP. If `pdf_path` set, stream from storage; else `renderDocumentPdf(snapshot)` → store → stream. Response headers `Content-Type: application/pdf`, `Content-Disposition: inline; filename="<docNo>.pdf"`.
- [ ] **Step 2: Verify manually** — from an OTP-verified session, "Download PDF" returns a valid PDF that opens; hitting the URL without the cookie is blocked.
- [ ] **Step 3: Commit.**

```bash
git commit -am "feat(web): gated PDF download for documents"
```

---

## Final verification (whole branch)

- [ ] `pnpm build` then `pnpm typecheck` — clean.
- [ ] `pnpm test` — all new suites pass.
- [ ] End-to-end walkthrough of the real order: create order (100 white + 15 red roses) → match growers → send RFQs → (as supplier) quote → award split → issue quotation → OTP-view as customer → invoice → mark paid → receipt.
- [ ] Confirm no supplier cost appears anywhere in the public document view or PDF.
- [ ] Confirm `.dev.vars`/wrangler documentation for all four new env vars.
