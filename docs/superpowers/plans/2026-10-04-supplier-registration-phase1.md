# Supplier Registration — Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let admin staff provision supplier accounts (farmers, middlemen, florists) on behalf of WhatsApp/field-agent intakes, and review/flip shop verification status — the assisted-first half of supplier registration.

**Architecture:** Extend the `shops` schema with an aggregator flag, a subscription `plan` seam, and inline verification-review fields. Add repo functions in `@flowers/api` for admin provisioning + verification review + a `canSellCheck` gate. Add two admin-portal routes (create supplier, verification queue) backed by server functions that use the Supabase **service-role** client to provision auth accounts.

**Tech Stack:** TanStack Start (React 19), Drizzle ORM, Supabase (Postgres + Auth service-role), vitest, shadcn/ui, Tailwind v4, Turborepo + pnpm.

**Spec:** `docs/superpowers/specs/2026-10-04-supplier-registration-design.md` (Phases 2 & 3 — self-serve register, WhatsApp invite, handover login — are deferred to their own plans).

## Global Constraints

- Money is integer LKR cents (not relevant to this phase, but never introduce float money).
- Bilingual columns: every user-visible text field is `*_en` / `*_si`; English required, Sinhala nullable.
- No `any`, no raw SQL outside migrations. All DB access via Drizzle.
- Lazy env access: call `getEnv()` / `tryCreateDb()` / `requireDb()` **inside** handlers, never at module top level.
- Drizzle schema is the source of truth; generate migrations with `pnpm db:generate` — never hand-edit generated SQL. Deliberate custom SQL migrations are journaled additions.
- Server mutations return `ActionResult<T>` (`ok`/`err` from `@flowers/api`); do not throw from business logic in repos.
- Admin server functions must call `requireAdmin()` before any privileged work.
- `createShop` already flips `buyer → supplier` and sets `verificationStatus: 'pending'` in one transaction — do not reimplement that; extend it.
- Build before typecheck on a fresh clone: `pnpm build` then `pnpm typecheck`.
- Shop types are exactly `florist | grower`; a middleman is `grower` with `isAggregator = true`.

## Review Focus

- **Duplicate provisioning:** admin creates a supplier with an email/phone that already has an auth user — must reuse the existing user, not error out or create a second shop. (Task 5 test: `validateAdminCreateSupplierInput` requires email or phone; Task 6 reuses existing user via `getUserByEmail`.)
- **Owner already has a shop:** provisioning a second shop for a user who owns one must return a `conflict`, not a duplicate row. (Task 5 test: `adminCreateSupplier` surfaces the existing-shop conflict path; covered by the one-shop-per-owner guard reused from `createShop`.)
- **Verification gate correctness:** `canSellCheck` must be `false` for `pending`/`unverified`/`rejected` and for inactive shops, `true` only for `verified` + active. (Task 2 tests pin every branch.)
- **Invalid review transition input:** review action with an out-of-enum status must be rejected before touching the DB. (Task 4 test: `validateReviewInput` rejects unknown status.)
- **Missing service-role config:** provisioning when `SUPABASE_SERVICE_ROLE_KEY`/`SUPABASE_URL` is absent must fail with a clear message, not a crash. (Task 6 server fn guards and returns `err("db_unavailable", …)`-style result.)

---

### Task 1: Extend `shops` schema + generate migration

**Files:**
- Modify: `packages/db/src/schema/shops.ts`
- Generate: `packages/db/migrations/0007_*.sql` (via `pnpm db:generate`)

**Interfaces:**
- Consumes: existing `shops` table, `users` table (for FK).
- Produces: new columns `is_aggregator`, `plan`, `verification_notes`, `verification_proof`, `verification_submitted_at`, `verification_reviewed_at`, `verification_reviewed_by`.

- [ ] **Step 1: Add columns to the shops table**

In `packages/db/src/schema/shops.ts`, inside the `shops` column object, add these fields immediately after the existing `bankDetails` line (all needed imports — `boolean`, `jsonb`, `text`, `timestamp`, `uuid` — are already imported in this file):

```ts
    /** Middleman/aggregator flag: a grower who sources from multiple farmers. */
    isAggregator: boolean("is_aggregator").notNull().default(false),
    /** Subscription seam. "free" for everyone today; gated features read this later. */
    plan: text("plan").notNull().default("free"),
    verificationNotes: text("verification_notes"),
    /** Submitted proof: { phoneVerified?, idPhotoPath?, businessRegNo?, ... }. */
    verificationProof: jsonb("verification_proof"),
    verificationSubmittedAt: timestamp("verification_submitted_at", {
      withTimezone: true,
    }),
    verificationReviewedAt: timestamp("verification_reviewed_at", {
      withTimezone: true,
    }),
    verificationReviewedBy: uuid("verification_reviewed_by").references(
      () => users.id,
    ),
```

- [ ] **Step 2: Generate the migration**

Run: `pnpm db:generate`
Expected: a new `packages/db/migrations/0007_*.sql` adds the seven columns; `migrations/meta/_journal.json` gains an entry. No changes to unrelated tables.

- [ ] **Step 3: Sanity-check the generated SQL**

Open the new `0007_*.sql`. Confirm it contains `ALTER TABLE "shops" ADD COLUMN "is_aggregator" boolean NOT NULL DEFAULT false` and the other six columns, and nothing destructive (no DROP). If it touches any other table, stop and investigate.

- [ ] **Step 4: Commit**

```bash
git add packages/db/src/schema/shops.ts packages/db/migrations
git commit -m "feat(db): add aggregator flag, plan seam, verification fields to shops"
```

> Note: `pnpm db:migrate` (applying to the live DB) needs `DIRECT_DATABASE_URL` and is run as a deploy step, not part of this task.

---

### Task 2: Repo — new types, `ShopRow` fields, and `canSellCheck`

**Files:**
- Modify: `packages/api/src/repos/shops.ts`
- Test: `packages/api/src/repos/shops.test.ts`

**Interfaces:**
- Consumes: existing `ShopRow`, `CreateShopInput`, `ShopType`.
- Produces: `VerificationStatus` type; `ShopRow` extended with `isAggregator`, `plan`, `verificationNotes`, `verificationProof`, `verificationSubmittedAt`, `verificationReviewedAt`, `verificationReviewedBy`; `CreateShopInput.isAggregator?: boolean`; `canSellCheck(shop): boolean`.

- [ ] **Step 1: Write the failing test**

Add to `packages/api/src/repos/shops.test.ts`:

```ts
import { canSellCheck } from "./shops";

describe("canSellCheck", () => {
  const base = { verificationStatus: "verified" as const, isActive: true, plan: "free" };

  it("allows a verified, active shop", () => {
    expect(canSellCheck(base)).toBe(true);
  });

  it("blocks a pending shop", () => {
    expect(canSellCheck({ ...base, verificationStatus: "pending" })).toBe(false);
  });

  it("blocks an unverified shop", () => {
    expect(canSellCheck({ ...base, verificationStatus: "unverified" })).toBe(false);
  });

  it("blocks a rejected shop", () => {
    expect(canSellCheck({ ...base, verificationStatus: "rejected" })).toBe(false);
  });

  it("blocks a verified but inactive shop", () => {
    expect(canSellCheck({ ...base, isActive: false })).toBe(false);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @flowers/api test -- shops`
Expected: FAIL — `canSellCheck` is not exported.

- [ ] **Step 3: Implement the types and helper**

In `packages/api/src/repos/shops.ts`:

Add the `VerificationStatus` type near `ShopType`:

```ts
export type VerificationStatus = "unverified" | "pending" | "verified" | "rejected";
```

Extend `CreateShopInput` with:

```ts
  isAggregator?: boolean | null;
```

Extend the `ShopRow` interface by adding these fields after `verificationStatus`:

```ts
  isAggregator: boolean;
  plan: string;
  verificationNotes: string | null;
  verificationProof: unknown;
  verificationSubmittedAt: Date | null;
  verificationReviewedAt: Date | null;
  verificationReviewedBy: string | null;
```

Add the pure gate helper (after the validation helpers section):

```ts
/**
 * Single choke point for "may this shop list/sell?". Verification must be
 * `verified` and the shop active. The `plan` seam is accepted for future
 * gating but intentionally not enforced yet (everyone is on "free").
 */
export function canSellCheck(shop: {
  verificationStatus: VerificationStatus;
  isActive: boolean;
  plan?: string;
}): boolean {
  return shop.verificationStatus === "verified" && shop.isActive;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter @flowers/api test -- shops`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/api/src/repos/shops.ts packages/api/src/repos/shops.test.ts
git commit -m "feat(api): VerificationStatus type, shop fields, canSellCheck gate"
```

---

### Task 3: Repo — `createShop` persists `isAggregator` + optional verification override

**Files:**
- Modify: `packages/api/src/repos/shops.ts`

**Interfaces:**
- Consumes: `CreateShopInput.isAggregator`, `VerificationStatus` (Task 2).
- Produces: `createShop(db, ownerUserId, input, opts?: { verificationStatus?: VerificationStatus })` — now writes `isAggregator` and honors an initial-status override (defaults to the existing `'pending'`).

- [ ] **Step 1: Update the `createShop` signature and insert values**

In `createShop`, change the signature to:

```ts
export async function createShop(
  db: Db,
  ownerUserId: string,
  input: CreateShopInput,
  opts?: { verificationStatus?: VerificationStatus },
): Promise<ActionResult<{ id: string; slug: string }>> {
```

In the `.values({ … })` of the shop insert, add `isAggregator` and replace the hard-coded status:

```ts
          shopType: input.shopType ?? "florist",
          isAggregator: input.isAggregator ?? false,
          verificationStatus: opts?.verificationStatus ?? "pending",
```

(Leave the rest of the transaction — the one-shop-per-owner guard and the `buyer → supplier` role upgrade — unchanged.)

- [ ] **Step 2: Typecheck**

Run: `pnpm --filter @flowers/api typecheck`
Expected: PASS (no `any`, signature consistent).

- [ ] **Step 3: Run the existing api tests**

Run: `pnpm --filter @flowers/api test`
Expected: PASS — existing validator tests unaffected.

- [ ] **Step 4: Commit**

```bash
git add packages/api/src/repos/shops.ts
git commit -m "feat(api): createShop persists isAggregator and accepts verification override"
```

---

### Task 4: Repo — verification review (`listShopsForReview`, `reviewShop`, `validateReviewInput`)

**Files:**
- Modify: `packages/api/src/repos/shops.ts`
- Test: `packages/api/src/repos/shops.test.ts`

**Interfaces:**
- Consumes: `schema.shops`, `schema.users`, `VerificationStatus`, `ActionResult`, `ok`/`err`.
- Produces:
  - `ReviewableShop` DTO (shop summary + owner email).
  - `listShopsForReview(db, filter?: { status?: VerificationStatus }): Promise<ReviewableShop[]>`.
  - `validateReviewInput(input: { status: string }): ValidationError[]`.
  - `reviewShop(db, shopId, reviewerId: string | null, status, notes?): Promise<ActionResult<{ id: string }>>` (reviewerId is nullable so dev/`auth_disabled` reviews don't FK-violate `verification_reviewed_by`).

- [ ] **Step 1: Write the failing test**

Add to `packages/api/src/repos/shops.test.ts`:

```ts
import { validateReviewInput } from "./shops";

describe("validateReviewInput", () => {
  it("accepts verified", () => {
    expect(validateReviewInput({ status: "verified" })).toEqual([]);
  });
  it("accepts rejected", () => {
    expect(validateReviewInput({ status: "rejected" })).toEqual([]);
  });
  it("accepts pending", () => {
    expect(validateReviewInput({ status: "pending" })).toEqual([]);
  });
  it("rejects an unknown status", () => {
    const errors = validateReviewInput({ status: "banished" });
    expect(errors.some((e) => e.field === "status")).toBe(true);
  });
  it("rejects an empty status", () => {
    const errors = validateReviewInput({ status: "" });
    expect(errors.some((e) => e.field === "status")).toBe(true);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @flowers/api test -- shops`
Expected: FAIL — `validateReviewInput` not exported.

- [ ] **Step 3: Implement the DTO, validator, and reads/writes**

In `packages/api/src/repos/shops.ts` add the imports needed (`and`, `desc` from `drizzle-orm` — merge into the existing `import { eq } from "drizzle-orm";`):

```ts
import { and, desc, eq } from "drizzle-orm";
```

Add the valid-status set near `SHOP_TYPES`:

```ts
const VERIFICATION_STATUSES = new Set<VerificationStatus>([
  "unverified",
  "pending",
  "verified",
  "rejected",
]);
```

Add the validator:

```ts
export function validateReviewInput(input: { status: string }): ValidationError[] {
  const errors: ValidationError[] = [];
  if (!VERIFICATION_STATUSES.has(input.status as VerificationStatus)) {
    errors.push({ field: "status", message: "Status must be a valid verification status." });
  }
  return errors;
}
```

Add the DTO and reads/writes:

```ts
export interface ReviewableShop {
  id: string;
  slug: string;
  nameEn: string;
  shopType: ShopType;
  isAggregator: boolean;
  district: string;
  city: string | null;
  verificationStatus: VerificationStatus;
  verificationNotes: string | null;
  ownerEmail: string;
  createdAt: Date;
}

/** List shops for the admin verification queue, newest first; optional status filter. */
export async function listShopsForReview(
  db: Db,
  filter?: { status?: VerificationStatus },
): Promise<ReviewableShop[]> {
  const where = filter?.status
    ? eq(schema.shops.verificationStatus, filter.status)
    : undefined;

  const rows = await db
    .select({
      id: schema.shops.id,
      slug: schema.shops.slug,
      nameEn: schema.shops.nameEn,
      shopType: schema.shops.shopType,
      isAggregator: schema.shops.isAggregator,
      district: schema.shops.district,
      city: schema.shops.city,
      verificationStatus: schema.shops.verificationStatus,
      verificationNotes: schema.shops.verificationNotes,
      ownerEmail: schema.users.email,
      createdAt: schema.shops.createdAt,
    })
    .from(schema.shops)
    .innerJoin(schema.users, eq(schema.users.id, schema.shops.ownerUserId))
    .where(where)
    .orderBy(desc(schema.shops.createdAt));

  return rows as ReviewableShop[];
}

/** Flip a shop's verification status and record the reviewer + notes. */
export async function reviewShop(
  db: Db,
  shopId: string,
  reviewerId: string | null,
  status: VerificationStatus,
  notes?: string | null,
): Promise<ActionResult<{ id: string }>> {
  const errors = validateReviewInput({ status });
  if (errors.length > 0) {
    return err("validation", errors.map((e) => e.message).join(" "));
  }
  try {
    const [row] = await db
      .update(schema.shops)
      .set({
        verificationStatus: status,
        verificationNotes: notes ?? null,
        verificationReviewedBy: reviewerId,
        verificationReviewedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(schema.shops.id, shopId))
      .returning({ id: schema.shops.id });

    if (!row) return err("not_found", "Shop not found.");
    return ok({ id: row.id });
  } catch (e) {
    return err("unknown", e instanceof Error ? e.message : "Could not update verification.");
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter @flowers/api test -- shops`
Expected: PASS.

- [ ] **Step 5: Typecheck**

Run: `pnpm --filter @flowers/api typecheck`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/api/src/repos/shops.ts packages/api/src/repos/shops.test.ts
git commit -m "feat(api): shop verification review (list, reviewShop, validator)"
```

---

### Task 5: Repo — admin provisioning (`adminCreateSupplier`, `getUserByEmail`, validator)

**Files:**
- Modify: `packages/api/src/repos/shops.ts`
- Modify: `packages/api/src/users.ts`
- Test: `packages/api/src/repos/shops.test.ts`

**Interfaces:**
- Consumes: `schema.users`, `schema.shops`, `createShop`'s slug/guard conventions, `VerificationStatus`.
- Produces:
  - `getUserByEmail(db, email): Promise<{ id: string; email: string } | null>` (in `users.ts`).
  - `AdminCreateSupplierInput` + `validateAdminCreateSupplierInput(input): ValidationError[]`.
  - `adminCreateSupplier(db, params): Promise<ActionResult<{ shopId: string; slug: string }>>`.

- [ ] **Step 1: Write the failing test**

Add to `packages/api/src/repos/shops.test.ts`:

```ts
import { validateAdminCreateSupplierInput } from "./shops";

describe("validateAdminCreateSupplierInput", () => {
  const valid = {
    email: "farmer@example.com",
    phone: "94771234567",
    shop: { nameEn: "Green Fields", district: "nuwara-eliya", shopType: "grower" as const },
    verificationStatus: "verified" as const,
  };

  it("passes for valid input with email + phone", () => {
    expect(validateAdminCreateSupplierInput(valid)).toEqual([]);
  });

  it("passes with only an email (no phone)", () => {
    expect(validateAdminCreateSupplierInput({ ...valid, phone: null })).toEqual([]);
  });

  it("passes with only a phone (no email)", () => {
    expect(
      validateAdminCreateSupplierInput({ ...valid, email: null, phone: "94771234567" }),
    ).toEqual([]);
  });

  it("rejects when both email and phone are missing", () => {
    const errors = validateAdminCreateSupplierInput({ ...valid, email: null, phone: null });
    expect(errors.some((e) => e.field === "contact")).toBe(true);
  });

  it("rejects a bad shop (invalid district)", () => {
    const errors = validateAdminCreateSupplierInput({
      ...valid,
      shop: { nameEn: "X", district: "mars" },
    });
    expect(errors.length).toBeGreaterThan(0);
  });

  it("rejects an invalid verification status", () => {
    const errors = validateAdminCreateSupplierInput({ ...valid, verificationStatus: "nope" as never });
    expect(errors.some((e) => e.field === "verificationStatus")).toBe(true);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @flowers/api test -- shops`
Expected: FAIL — `validateAdminCreateSupplierInput` not exported.

- [ ] **Step 3: Add `getUserByEmail`**

In `packages/api/src/users.ts`, add:

```ts
/** Find a user by email (case-insensitive not needed — emails stored lowercased by Supabase). */
export async function getUserByEmail(
  db: Db,
  email: string,
): Promise<{ id: string; email: string } | null> {
  const [row] = await db
    .select({ id: schema.users.id, email: schema.users.email })
    .from(schema.users)
    .where(eq(schema.users.email, email))
    .limit(1);
  return row ?? null;
}
```

- [ ] **Step 4: Add the admin-provisioning input, validator, and function**

In `packages/api/src/repos/shops.ts`:

```ts
export interface AdminCreateSupplierInput {
  /** The already-provisioned auth user id (from Supabase service-role createUser). */
  userId?: string;
  email: string | null;
  phone?: string | null;
  fullName?: string | null;
  shop: CreateShopInput;
  verificationStatus: VerificationStatus;
}

export function validateAdminCreateSupplierInput(
  input: AdminCreateSupplierInput,
): ValidationError[] {
  const errors: ValidationError[] = [];
  const hasEmail = !!input.email?.trim();
  const hasPhone = !!input.phone?.trim();
  if (!hasEmail && !hasPhone) {
    errors.push({ field: "contact", message: "An email or a phone number is required." });
  }
  errors.push(...validateCreateShopInput(input.shop));
  if (!VERIFICATION_STATUSES.has(input.verificationStatus)) {
    errors.push({ field: "verificationStatus", message: "Invalid verification status." });
  }
  return errors;
}

/**
 * Provision a supplier shop for an auth user the admin already created via the
 * service-role client. Upserts the `users` row (role → supplier) and inserts
 * the shop in one transaction. Returns `conflict` if the user already owns a shop.
 */
export async function adminCreateSupplier(
  db: Db,
  params: Required<Pick<AdminCreateSupplierInput, "userId" | "email">> &
    AdminCreateSupplierInput,
): Promise<ActionResult<{ shopId: string; slug: string }>> {
  const errors = validateAdminCreateSupplierInput(params);
  if (errors.length > 0) {
    return err("validation", errors.map((e) => e.message).join(" "));
  }

  const nameEn = params.shop.nameEn.trim();
  const base = slugify(nameEn) || "shop";
  const suffix = Math.random().toString(36).slice(2, 8);
  const slug = `${base}-${suffix}`;

  try {
    return await db.transaction(async (tx) => {
      const [existing] = await tx
        .select({ id: schema.shops.id })
        .from(schema.shops)
        .where(eq(schema.shops.ownerUserId, params.userId))
        .limit(1);
      if (existing) return err("conflict", "This user already owns a shop.");

      // Upsert the users row (the handle_new_user trigger usually created it).
      await tx
        .insert(schema.users)
        .values({
          id: params.userId,
          email: params.email,
          role: "supplier",
          fullName: params.fullName ?? null,
          phone: params.phone ?? null,
        })
        .onConflictDoUpdate({
          target: schema.users.id,
          set: {
            role: "supplier",
            fullName: params.fullName ?? null,
            phone: params.phone ?? null,
            updatedAt: new Date(),
          },
        });

      const [shop] = await tx
        .insert(schema.shops)
        .values({
          ownerUserId: params.userId,
          slug,
          nameEn,
          nameSi: params.shop.nameSi ?? null,
          descriptionEn: params.shop.descriptionEn ?? null,
          descriptionSi: params.shop.descriptionSi ?? null,
          district: params.shop.district,
          city: params.shop.city ?? null,
          shopType: params.shop.shopType ?? "florist",
          isAggregator: params.shop.isAggregator ?? false,
          verificationStatus: params.verificationStatus,
          verificationReviewedAt: new Date(),
        })
        .returning({ id: schema.shops.id, slug: schema.shops.slug });

      return ok({ shopId: shop.id, slug: shop.slug });
    });
  } catch (e) {
    if (isPgError(e, "23505")) return err("conflict", "This user already owns a shop.");
    return err("unknown", e instanceof Error ? e.message : "Could not create supplier.");
  }
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `pnpm --filter @flowers/api test -- shops`
Expected: PASS.

- [ ] **Step 6: Typecheck**

Run: `pnpm --filter @flowers/api typecheck`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add packages/api/src/repos/shops.ts packages/api/src/users.ts packages/api/src/repos/shops.test.ts
git commit -m "feat(api): adminCreateSupplier provisioning + getUserByEmail + validator"
```

---

### Task 6: Admin server functions — provisioning + review

**Files:**
- Create: `apps/admin/src/server/suppliers.ts`

**Interfaces:**
- Consumes: `resolveAdminSession`, `createSupabaseAdminClient` (`@flowers/auth`), `getEnv`, `tryCreateDb`, `adminCreateSupplier`, `getUserByEmail`, `listShopsForReview`, `reviewShop`, `ReviewableShop`, `AdminCreateSupplierInput`, `VerificationStatus` (all from `@flowers/api`).
- Produces server fns: `listSuppliersForReview` (GET), `createSupplierFn` (POST), `reviewSupplierFn` (POST).

- [ ] **Step 1: Create the server-function module**

Create `apps/admin/src/server/suppliers.ts`:

```ts
/**
 * Supplier provisioning + verification server functions for the Admin Portal.
 * Uses the Supabase service-role client to create auth accounts on behalf of
 * farmers/florists onboarded via WhatsApp or a field agent.
 */
import { createServerFn } from "@tanstack/react-start";
import {
  getEnv,
  tryCreateDb,
  adminCreateSupplier,
  getUserByEmail,
  listShopsForReview,
  reviewShop,
  type ActionResult,
  type ReviewableShop,
  type VerificationStatus,
  type CreateShopInput,
} from "@flowers/api";
import { createSupabaseAdminClient } from "@flowers/auth";
import { resolveAdminSession } from "./session";

async function requireAdmin() {
  const session = await resolveAdminSession();
  if (session.kind !== "admin" && session.kind !== "auth_disabled") {
    throw new Error("Unauthorized");
  }
  return session;
}

export const listSuppliersForReview = createServerFn({ method: "GET" })
  .validator((input: { status?: VerificationStatus } | undefined) => input ?? {})
  .handler(async ({ data }): Promise<ReviewableShop[]> => {
    await requireAdmin();
    const db = tryCreateDb();
    if (!db) return [];
    return listShopsForReview(db, data.status ? { status: data.status } : undefined);
  });

export interface CreateSupplierPayload {
  email: string | null;
  phone: string | null;
  fullName: string | null;
  shop: CreateShopInput;
  verificationStatus: VerificationStatus;
}

export const createSupplierFn = createServerFn({ method: "POST" })
  .validator((input: CreateSupplierPayload) => input)
  .handler(async ({ data }): Promise<ActionResult<{ shopId: string; slug: string }>> => {
    await requireAdmin();

    const db = tryCreateDb();
    if (!db) return { ok: false, code: "db_unavailable", message: "Database is not configured." };

    const env = getEnv();
    if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
      return {
        ok: false,
        code: "db_unavailable",
        message: "Supabase service-role is not configured; cannot provision accounts.",
      };
    }

    const admin = createSupabaseAdminClient({
      url: env.SUPABASE_URL,
      serviceRoleKey: env.SUPABASE_SERVICE_ROLE_KEY,
    });

    // Provision (or reuse) the auth user.
    let userId: string | undefined;
    const email = data.email?.trim() || null;
    const phone = data.phone?.trim() || null;

    const { data: created, error } = await admin.auth.admin.createUser({
      email: email ?? undefined,
      phone: phone ?? undefined,
      email_confirm: !!email,
      phone_confirm: !!phone,
      user_metadata: data.fullName ? { full_name: data.fullName } : undefined,
    });

    if (created?.user) {
      userId = created.user.id;
    } else if (error) {
      // Likely already registered — reuse the existing user by email.
      if (email) {
        const existing = await getUserByEmail(db, email);
        if (existing) userId = existing.id;
      }
      if (!userId) {
        return { ok: false, code: "conflict", message: error.message };
      }
    }

    if (!userId) {
      return { ok: false, code: "unknown", message: "Could not resolve a user id." };
    }

    return adminCreateSupplier(db, {
      userId,
      email: email ?? "",
      phone,
      fullName: data.fullName,
      shop: data.shop,
      verificationStatus: data.verificationStatus,
    });
  });

export const reviewSupplierFn = createServerFn({ method: "POST" })
  .validator(
    (input: { shopId: string; status: VerificationStatus; notes?: string | null }) => input,
  )
  .handler(async ({ data }): Promise<ActionResult<{ id: string }>> => {
    const session = await requireAdmin();
    const reviewerId = session.kind === "admin" ? session.userId : null;
    const db = tryCreateDb();
    if (!db) return { ok: false, code: "db_unavailable", message: "Database is not configured." };
    return reviewShop(db, data.shopId, reviewerId, data.status, data.notes ?? null);
  });
```

- [ ] **Step 2: Ensure `CreateShopInput` is exported from `@flowers/api`**

`CreateShopInput` is exported from `packages/api/src/repos/shops.ts` which is re-exported by `src/index.ts` (`export * from "./repos/shops"`). No change needed — confirm by typecheck in Step 3.

- [ ] **Step 3: Typecheck the admin app**

Run: `pnpm build && pnpm --filter @flowers/admin typecheck`
Expected: PASS. (Build first so `routeTree.gen.ts` exists.)

- [ ] **Step 4: Commit**

```bash
git add apps/admin/src/server/suppliers.ts
git commit -m "feat(admin): supplier provisioning + verification review server fns"
```

---

### Task 7: Admin route — Create supplier form

**Files:**
- Create: `apps/admin/src/routes/suppliers.new.tsx`

**Interfaces:**
- Consumes: `createSupplierFn`, `CreateSupplierPayload` (Task 6); `DISTRICTS` (`@flowers/api/constants`); shadcn components.
- Produces: route `/suppliers/new`.

- [ ] **Step 1: Create the route**

Create `apps/admin/src/routes/suppliers.new.tsx`:

```tsx
import * as React from "react";
import { createFileRoute, useRouter, Link } from "@tanstack/react-router";
import { Button } from "@flowers/ui/components/button";
import { Input } from "@flowers/ui/components/input";
import { Label } from "@flowers/ui/components/label";
import { Textarea } from "@flowers/ui/components/textarea";
import { Alert, AlertDescription } from "@flowers/ui/components/alert";
import { ArrowLeft, Loader2 } from "lucide-react";
import { DISTRICTS } from "@flowers/api/constants";
import { createSupplierFn } from "../server/suppliers";

export const Route = createFileRoute("/suppliers/new")({
  component: NewSupplierPage,
});

const selectClass =
  "flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring";

function NewSupplierPage() {
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [form, setForm] = React.useState({
    nameEn: "",
    nameSi: "",
    descriptionEn: "",
    shopType: "grower" as "florist" | "grower",
    isAggregator: false,
    district: "",
    city: "",
    email: "",
    phone: "",
    fullName: "",
    verificationStatus: "verified" as "verified" | "pending",
  });

  function set<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!form.nameEn.trim() || !form.district) {
      setError("Shop name and district are required.");
      return;
    }
    if (!form.email.trim() && !form.phone.trim()) {
      setError("Provide an email or a phone number.");
      return;
    }
    setBusy(true);
    try {
      const result = await createSupplierFn({
        data: {
          email: form.email.trim() || null,
          phone: form.phone.trim() || null,
          fullName: form.fullName.trim() || null,
          verificationStatus: form.verificationStatus,
          shop: {
            nameEn: form.nameEn.trim(),
            nameSi: form.nameSi.trim() || null,
            descriptionEn: form.descriptionEn.trim() || null,
            shopType: form.shopType,
            isAggregator: form.isAggregator,
            district: form.district,
            city: form.city.trim() || null,
          },
        },
      });
      if (!result.ok) {
        setError(result.message);
        return;
      }
      await router.navigate({ to: "/suppliers" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-xl space-y-6">
      <Link to="/suppliers" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> Back to suppliers
      </Link>
      <h1 className="font-display text-3xl">Create supplier</h1>
      <p className="text-sm text-muted-foreground">
        Provision an account for a farmer, middleman, or florist onboarded via WhatsApp or a field agent.
      </p>

      {error && (
        <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>
      )}

      <form className="space-y-4" onSubmit={(e) => void handleSubmit(e)}>
        <div className="space-y-1.5">
          <Label htmlFor="nameEn">Shop name (English) *</Label>
          <Input id="nameEn" value={form.nameEn} onChange={(e) => set("nameEn", e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="nameSi">Shop name (Sinhala)</Label>
          <Input id="nameSi" value={form.nameSi} onChange={(e) => set("nameSi", e.target.value)} />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label htmlFor="shopType">Type *</Label>
            <select id="shopType" className={selectClass} value={form.shopType}
              onChange={(e) => set("shopType", e.target.value as "florist" | "grower")}>
              <option value="grower">Grower / farmer</option>
              <option value="florist">Florist</option>
            </select>
          </div>
          <div className="flex items-end pb-2">
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={form.isAggregator}
                onChange={(e) => set("isAggregator", e.target.checked)} />
              Aggregator / middleman
            </label>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label htmlFor="district">District *</Label>
            <select id="district" className={selectClass} value={form.district}
              onChange={(e) => set("district", e.target.value)}>
              <option value="">Select district…</option>
              {DISTRICTS.map((d) => (
                <option key={d.slug} value={d.slug}>{d.nameEn}</option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="city">City</Label>
            <Input id="city" value={form.city} onChange={(e) => set("city", e.target.value)} />
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="fullName">Owner name</Label>
          <Input id="fullName" value={form.fullName} onChange={(e) => set("fullName", e.target.value)} />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label htmlFor="email">Email</Label>
            <Input id="email" type="email" value={form.email} onChange={(e) => set("email", e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="phone">Phone (94…)</Label>
            <Input id="phone" value={form.phone} onChange={(e) => set("phone", e.target.value)} />
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="descriptionEn">Description</Label>
          <Textarea id="descriptionEn" rows={3} value={form.descriptionEn}
            onChange={(e) => set("descriptionEn", e.target.value)} />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="verificationStatus">Verification (staff-vouched)</Label>
          <select id="verificationStatus" className={selectClass} value={form.verificationStatus}
            onChange={(e) => set("verificationStatus", e.target.value as "verified" | "pending")}>
            <option value="verified">Verified (vouched now)</option>
            <option value="pending">Pending (review later)</option>
          </select>
        </div>

        <Button type="submit" disabled={busy} className="w-full">
          {busy ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
          {busy ? "Creating…" : "Create supplier"}
        </Button>
      </form>
    </div>
  );
}
```

- [ ] **Step 2: Build + typecheck**

Run: `pnpm build && pnpm --filter @flowers/admin typecheck`
Expected: PASS; `/suppliers/new` appears in `routeTree.gen.ts`.

- [ ] **Step 3: Commit**

```bash
git add apps/admin/src/routes/suppliers.new.tsx
git commit -m "feat(admin): create-supplier form route"
```

---

### Task 8: Admin route — verification queue + nav link

**Files:**
- Create: `apps/admin/src/routes/suppliers.index.tsx`
- Modify: `apps/admin/src/routes/__root.tsx` (add a "Suppliers" nav link)

**Interfaces:**
- Consumes: `listSuppliersForReview`, `reviewSupplierFn` (Task 6); shadcn `Badge`, `Button`.
- Produces: route `/suppliers`.

- [ ] **Step 1: Create the queue route**

Create `apps/admin/src/routes/suppliers.index.tsx`:

```tsx
import * as React from "react";
import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { Plus, Store } from "lucide-react";
import { Button } from "@flowers/ui/components/button";
import { Badge } from "@flowers/ui/components/badge";
import { listSuppliersForReview, reviewSupplierFn } from "../server/suppliers";
import type { VerificationStatus } from "@flowers/api";

export const Route = createFileRoute("/suppliers/")({
  loader: async () => ({ suppliers: await listSuppliersForReview({ data: {} }) }),
  component: SuppliersPage,
});

const STATUS_VARIANT: Record<VerificationStatus, "default" | "secondary" | "destructive" | "outline"> = {
  verified: "default",
  pending: "secondary",
  unverified: "outline",
  rejected: "destructive",
};

function SuppliersPage() {
  const { suppliers } = Route.useLoaderData();
  const router = useRouter();
  const [busyId, setBusyId] = React.useState<string | null>(null);

  async function review(shopId: string, status: VerificationStatus) {
    setBusyId(shopId);
    try {
      const result = await reviewSupplierFn({ data: { shopId, status } });
      if (result.ok) await router.invalidate();
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <h1 className="font-display text-3xl">Suppliers</h1>
          <p className="text-sm text-muted-foreground">{suppliers.length} shops</p>
        </div>
        <Button asChild>
          <Link to="/suppliers/new"><Plus className="size-4" /> Create supplier</Link>
        </Button>
      </div>

      {suppliers.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border py-16 text-center">
          <Store className="size-8 text-muted-foreground/40" />
          <p className="text-sm text-muted-foreground">No suppliers yet.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {suppliers.map((s) => (
            <div key={s.id} className="flex items-center justify-between rounded-lg border border-border bg-card px-4 py-3 text-sm">
              <div className="flex min-w-0 flex-col">
                <span className="font-medium">
                  {s.nameEn}
                  {s.isAggregator ? <span className="ml-2 text-xs text-muted-foreground">· aggregator</span> : null}
                </span>
                <span className="text-xs text-muted-foreground">
                  {s.shopType} · {s.district} · {s.ownerEmail}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant={STATUS_VARIANT[s.verificationStatus]}>{s.verificationStatus}</Badge>
                {s.verificationStatus !== "verified" && (
                  <Button size="sm" variant="outline" disabled={busyId === s.id}
                    onClick={() => void review(s.id, "verified")}>Verify</Button>
                )}
                {s.verificationStatus !== "rejected" && (
                  <Button size="sm" variant="ghost" disabled={busyId === s.id}
                    onClick={() => void review(s.id, "rejected")}>Reject</Button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Add the nav link**

In `apps/admin/src/routes/__root.tsx`, inside the `<nav>` block, add a "Suppliers" link after the Orders link (match the existing link styling):

```tsx
          <Link
            to="/suppliers"
            className="rounded-md px-3 py-2 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            activeProps={{ className: "bg-accent font-medium text-brand" }}
          >
            Suppliers
          </Link>
```

- [ ] **Step 3: Build + typecheck**

Run: `pnpm build && pnpm --filter @flowers/admin typecheck`
Expected: PASS; `/suppliers` in `routeTree.gen.ts`.

- [ ] **Step 4: Manual smoke test**

Run the admin app (`pnpm --filter @flowers/admin dev`, with `AUTH_DISABLED=1` + a local `DATABASE_URL` in `apps/admin/.dev.vars`). Visit `/suppliers` → "Create supplier" → submit a grower with a phone only and status "verified". Confirm it appears in the queue as verified, and that Reject flips it.

- [ ] **Step 5: Commit**

```bash
git add apps/admin/src/routes/suppliers.index.tsx apps/admin/src/routes/__root.tsx
git commit -m "feat(admin): supplier verification queue + nav link"
```

---

### Task 9: Full-suite verification

**Files:** none (verification only).

- [ ] **Step 1: Run the whole test suite**

Run: `pnpm test`
Expected: PASS (packages/api + integrations).

- [ ] **Step 2: Build + typecheck the monorepo**

Run: `pnpm build && pnpm typecheck`
Expected: PASS across all apps and packages.

- [ ] **Step 3: Commit any lockfile/gen churn (if present)**

```bash
git add -A && git commit -m "chore: phase-1 supplier registration verification" || echo "nothing to commit"
```

---

## Deferred to later plans

- **Phase 2:** self-serve `register.tsx` (email/Google), `supplier_invites` table + tokenized `/join/$token` landing, admin "Invite via WhatsApp" action using the Evolution integration, type-aware bilingual benefits templates.
- **Phase 3:** phone-OTP / WhatsApp handover login for email-less farmers.
- **DB apply:** `pnpm db:migrate` against the live database (needs `DIRECT_DATABASE_URL`) as a deploy step.
