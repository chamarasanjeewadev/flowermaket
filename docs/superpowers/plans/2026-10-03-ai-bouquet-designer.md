# AI Bouquet Designer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a standalone `/$locale/design` page where buyers pick flowers from the live catalog, generate a photo-realistic AI bouquet preview, and send the selection as a WhatsApp enquiry.

**Architecture:** Pure, unit-tested logic (prompt building, Imagen request/parse, WhatsApp config) lives in `@flowers/integrations`. A TanStack Start server function in `apps/web` wires lazy `getEnv()` + `fetch` to Google's Imagen API and returns a base64 data URL. A new catalog query sources flowers from a configured category-slug set. React components reuse the existing `useEnquiry()` basket for the WhatsApp handoff. The feature fails soft end-to-end.

**Tech Stack:** TanStack Start (React 19) on Cloudflare Workers, Drizzle ORM, vitest, Tailwind v4 + shadcn/ui, Google Imagen (Generative Language API) via raw `fetch`.

**Spec:** `docs/superpowers/specs/2026-10-03-ai-bouquet-designer-design.md`

## Global Constraints

- **Lazy env on Workers:** never read `process.env` / call `getEnv()` at module top level — only inside a server-function handler. (CLAUDE.md)
- **No `any`, no untyped SQL:** all DB access via Drizzle; end-to-end types. (CLAUDE.md)
- **Money is integer LKR cents.** Never store/compute floats for price.
- **Bilingual:** every user-visible string comes from the i18n dictionaries (`en.ts` + `si.ts`), never hardcoded in components. Prompt text sent to Imagen is English-only regardless of locale.
- **`pnpm build` before `pnpm typecheck`** on a fresh clone (generates `routeTree.gen.ts`).
- **Tests run in `packages/api` + `packages/integrations` only** (`pnpm test`). `apps/web` has no unit-test runner — logic that must be tested lives in `@flowers/integrations`; component/route behavior is verified by typecheck + manual smoke.
- **WhatsApp marketplace number:** `94778540633` — after Task 1 it exists in exactly one source literal (`packages/integrations/src/config.ts`).
- **Commit** after each task's tests pass. Branch off `main` first (do not commit to `main`).

## Review Focus

Inputs/failure modes the spec implies; each is pinned to a task's tests where the logic is testable, or flagged as manual (no `apps/web` test runner):

- **A flower left at quantity 0** (user decremented it) must not appear in the AI prompt or the WhatsApp enquiry → pinned in Task 3 (`buildBouquetPrompt` filters `qty < 1`) and Task 7 (selection prunes `qty === 0`).
- **Imagen returns HTTP 200 but no image bytes** (empty/missing `predictions`) must surface as a friendly error, not a crash → pinned in Task 3 (`extractImagenImage` returns `null`) + Task 4 (server fn maps `null` → `{ ok: false, reason: "api_error" }`).
- **Oversized selection** (many distinct flowers) must not produce an unbounded prompt → pinned in Task 3 (`buildBouquetPrompt` caps distinct flowers at `MAX_PROMPT_FLOWERS = 12`, logs nothing, silently trims with the count preserved in copy).
- **`GEMINI_API_KEY` absent** (prod misconfig or local dev) must hide/disable generation while leaving picker + WhatsApp fully working → pinned in Task 4 (`{ ok: false, reason: "unconfigured" }`); UI hide is manual (Task 7).
- **Generation fails or is in flight** must never block the WhatsApp enquiry and must not allow duplicate concurrent calls → manual (Task 7): WhatsApp action is independent of generation state; Generate is disabled while a request is in flight.

---

### Task 1: WhatsApp number → single config file

**Files:**
- Create: `packages/integrations/src/config.ts`
- Modify: `packages/integrations/src/whatsapp.ts:31-32` (remove inline const, re-export from config)
- Modify: `packages/integrations/src/index.ts` (add `export * from "./config";`)
- Test: `packages/integrations/src/config.test.ts`

**Interfaces:**
- Produces: `export const WHATSAPP_NUMBER: string` from `@flowers/integrations` (unchanged import path for all existing consumers).

- [ ] **Step 1: Write the failing test**

```ts
// packages/integrations/src/config.test.ts
import { describe, it, expect } from "vitest";
import { WHATSAPP_NUMBER } from "./config";

describe("marketplace config", () => {
  it("exposes the WhatsApp number as digits only", () => {
    expect(WHATSAPP_NUMBER).toBe("94778540633");
    expect(WHATSAPP_NUMBER).toMatch(/^\d+$/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @flowers/integrations test -- config`
Expected: FAIL — `Cannot find module './config'`.

- [ ] **Step 3: Create the config module**

```ts
// packages/integrations/src/config.ts
/**
 * Single source of truth for marketplace-wide runtime constants that a human
 * edits by hand. Changing the WhatsApp number here changes it everywhere
 * (floating button, /enquiry, bouquet designer) — no other file hardcodes it.
 */

/** Marketplace WhatsApp number that receives enquiries (digits only). */
export const WHATSAPP_NUMBER = "94778540633";
```

- [ ] **Step 4: Point whatsapp.ts at the config and re-export**

In `packages/integrations/src/whatsapp.ts`, delete the inline constant (lines 31–32) and add an import + re-export near the top (after the type exports):

```ts
import { WHATSAPP_NUMBER } from "./config";
export { WHATSAPP_NUMBER };
```

`buildWhatsappUrl`'s default parameter `numberDigits: string = WHATSAPP_NUMBER` now resolves to the imported value — no other change needed. The existing `import { WHATSAPP_NUMBER } from "./whatsapp"` in `whatsapp.test.ts` keeps working via the re-export.

- [ ] **Step 5: Wire the barrel**

In `packages/integrations/src/index.ts`, add (keep alphabetical-ish with siblings):

```ts
export * from "./config";
```

Both `./config` and `./whatsapp` export `WHATSAPP_NUMBER`; because `whatsapp.ts` re-exports the same binding from `config.ts`, the star-exports reference one identity (no "ambiguous re-export" error). If the bundler complains, drop the `export { WHATSAPP_NUMBER }` line from `whatsapp.ts` (consumers already importing from the barrel get it via `./config`).

- [ ] **Step 6: Run tests to verify they pass**

Run: `pnpm --filter @flowers/integrations test`
Expected: PASS — new `config.test.ts` and the existing `whatsapp.test.ts` (which asserts `buildWhatsappUrl` uses `WHATSAPP_NUMBER`) both green.

- [ ] **Step 7: Commit**

```bash
git add packages/integrations/src/config.ts packages/integrations/src/whatsapp.ts packages/integrations/src/index.ts packages/integrations/src/config.test.ts
git commit -m "refactor(integrations): move WHATSAPP_NUMBER into single config module"
```

---

### Task 2: Optional design note on the enquiry message  — **DROPPABLE**

> Spec §4 flags this as optional. It adds one line to the WhatsApp message so the florist knows an AI design image is attached. If you'd rather leave `whatsapp.ts` untouched, skip this task entirely — Task 7 then omits `designNote` from its `buildEnquiryText` call and the feature still works.

**Files:**
- Modify: `packages/integrations/src/whatsapp.ts` (`BuildEnquiryTextInput` + `buildEnquiryText`)
- Test: `packages/integrations/src/whatsapp.test.ts` (add cases)

**Interfaces:**
- Produces: `BuildEnquiryTextInput` gains optional `designNote?: string`.

- [ ] **Step 1: Write the failing test**

Add to `packages/integrations/src/whatsapp.test.ts` inside the `describe("buildEnquiryText", …)` block:

```ts
it("includes the design note line when provided", () => {
  const text = buildEnquiryText({
    items: [roses],
    locale: "en",
    siteUrl: SITE,
    designNote: "AI bouquet design (image attached)",
  });
  expect(text).toContain("AI bouquet design (image attached)");
});

it("omits the design note line when absent or blank", () => {
  const text = buildEnquiryText({ items: [roses], locale: "en", siteUrl: SITE, designNote: "  " });
  expect(text).not.toContain("design");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @flowers/integrations test -- whatsapp`
Expected: FAIL — `designNote` not on the input type / line not present.

- [ ] **Step 3: Implement**

In `packages/integrations/src/whatsapp.ts`, add the field to the interface:

```ts
export interface BuildEnquiryTextInput {
  items: readonly EnquiryItem[];
  form?: EnquiryForm;
  locale: EnquiryLocale;
  siteUrl: string;
  /** Optional single line noting an attached AI bouquet design. */
  designNote?: string;
}
```

In `buildEnquiryText`, destructure `designNote` and push its line right after the greeting block (before the items list):

```ts
const { items, form, locale, siteUrl, designNote } = input;
const base = siteUrl.replace(/\/$/, "");
const lines: string[] = ["Hello FlowerMarket.lk 🌸", ""];
if (designNote?.trim()) lines.push(`— ${designNote.trim()} —`, "");
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @flowers/integrations test -- whatsapp`
Expected: PASS — new cases green, all existing `buildEnquiryText` cases still green.

- [ ] **Step 5: Commit**

```bash
git add packages/integrations/src/whatsapp.ts packages/integrations/src/whatsapp.test.ts
git commit -m "feat(integrations): optional designNote line in enquiry message"
```

---

### Task 3: Bouquet prompt + Imagen request/parse helpers (pure)

**Files:**
- Create: `packages/integrations/src/bouquet.ts`
- Create: `packages/integrations/src/bouquet.test.ts`
- Modify: `packages/integrations/src/index.ts` (add `export * from "./bouquet";`)

**Interfaces:**
- Produces:
  - `interface BouquetPromptItem { nameEn: string; qty: number }`
  - `const MAX_PROMPT_FLOWERS = 12`
  - `buildBouquetPrompt(items: readonly BouquetPromptItem[], locale: "en" | "si"): string`
  - `const IMAGEN_MODEL = "imagen-3.0-generate-002"`
  - `buildImagenEndpoint(apiKey: string): string`
  - `buildImagenRequest(prompt: string): { instances: { prompt: string }[]; parameters: { sampleCount: number; aspectRatio: string } }`
  - `extractImagenImage(json: unknown): string | null`

- [ ] **Step 1: Write the failing tests**

```ts
// packages/integrations/src/bouquet.test.ts
import { describe, it, expect } from "vitest";
import {
  buildBouquetPrompt,
  buildImagenEndpoint,
  buildImagenRequest,
  extractImagenImage,
  IMAGEN_MODEL,
  MAX_PROMPT_FLOWERS,
  type BouquetPromptItem,
} from "./bouquet";

const items: BouquetPromptItem[] = [
  { nameEn: "Red Rose (per stem)", qty: 5 },
  { nameEn: "Pink Gerbera (per stem)", qty: 1 },
];

describe("buildBouquetPrompt", () => {
  it("lists flowers with quantities and photorealistic framing", () => {
    const p = buildBouquetPrompt(items, "en");
    expect(p).toContain("5 Red Rose (per stem)");
    expect(p).toContain("1 Pink Gerbera (per stem)");
    expect(p.toLowerCase()).toContain("photorealistic");
    expect(p.toLowerCase()).toContain("bouquet");
  });

  it("drops flowers with qty < 1", () => {
    const p = buildBouquetPrompt(
      [{ nameEn: "Red Rose (per stem)", qty: 0 }, { nameEn: "White Lily", qty: 3 }],
      "en",
    );
    expect(p).not.toContain("Red Rose");
    expect(p).toContain("3 White Lily");
  });

  it("caps the number of distinct flowers at MAX_PROMPT_FLOWERS", () => {
    const many: BouquetPromptItem[] = Array.from({ length: 20 }, (_, i) => ({
      nameEn: `Flower${i}`,
      qty: 1,
    }));
    const p = buildBouquetPrompt(many, "en");
    expect(p).toContain("Flower0");
    expect(p).not.toContain(`Flower${MAX_PROMPT_FLOWERS}`); // the 13th (index 12) is trimmed
  });

  it("returns an empty string when nothing is selected", () => {
    expect(buildBouquetPrompt([], "en")).toBe("");
    expect(buildBouquetPrompt([{ nameEn: "X", qty: 0 }], "en")).toBe("");
  });
});

describe("imagen helpers", () => {
  it("builds the predict endpoint with the model and key", () => {
    expect(buildImagenEndpoint("KEY123")).toBe(
      `https://generativelanguage.googleapis.com/v1beta/models/${IMAGEN_MODEL}:predict?key=KEY123`,
    );
  });

  it("builds a single-sample square request", () => {
    const body = buildImagenRequest("a bouquet");
    expect(body.instances[0].prompt).toBe("a bouquet");
    expect(body.parameters.sampleCount).toBe(1);
    expect(body.parameters.aspectRatio).toBe("1:1");
  });

  it("extracts the base64 image from a prediction", () => {
    expect(
      extractImagenImage({ predictions: [{ bytesBase64Encoded: "AAAA" }] }),
    ).toBe("AAAA");
  });

  it("returns null when predictions are missing or empty", () => {
    expect(extractImagenImage({})).toBeNull();
    expect(extractImagenImage({ predictions: [] })).toBeNull();
    expect(extractImagenImage({ predictions: [{}] })).toBeNull();
    expect(extractImagenImage(null)).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @flowers/integrations test -- bouquet`
Expected: FAIL — `Cannot find module './bouquet'`.

- [ ] **Step 3: Implement**

```ts
// packages/integrations/src/bouquet.ts
/**
 * Pure, dependency-free helpers for the AI bouquet designer: building the
 * Imagen text prompt from a flower selection, and shaping/parsing the Google
 * Generative Language API (Imagen `:predict`) request/response. No I/O here —
 * the server function in apps/web supplies `fetch` and the API key.
 */

export interface BouquetPromptItem {
  /** English flower name — Imagen prompting is English-only. */
  nameEn: string;
  qty: number;
}

/** Keep the prompt (and image) coherent by bounding distinct flower types. */
export const MAX_PROMPT_FLOWERS = 12;

export function buildBouquetPrompt(
  items: readonly BouquetPromptItem[],
  _locale: "en" | "si",
): string {
  const picked = items.filter((i) => i.qty >= 1).slice(0, MAX_PROMPT_FLOWERS);
  if (picked.length === 0) return "";
  const list = picked.map((i) => `${i.qty} ${i.nameEn}`).join(", ");
  return (
    `A photorealistic professional florist bouquet containing ${list}, ` +
    `hand-tied and wrapped in kraft paper, soft natural studio lighting, ` +
    `clean neutral background, high detail, no text, no watermark.`
  );
}

/** Imagen model id — confirm it is enabled on the project's API key. */
export const IMAGEN_MODEL = "imagen-3.0-generate-002";

export function buildImagenEndpoint(apiKey: string): string {
  return `https://generativelanguage.googleapis.com/v1beta/models/${IMAGEN_MODEL}:predict?key=${apiKey}`;
}

export function buildImagenRequest(prompt: string) {
  return {
    instances: [{ prompt }],
    parameters: { sampleCount: 1, aspectRatio: "1:1" },
  };
}

export function extractImagenImage(json: unknown): string | null {
  if (typeof json !== "object" || json === null) return null;
  const preds = (json as { predictions?: unknown }).predictions;
  if (!Array.isArray(preds) || preds.length === 0) return null;
  const first = preds[0] as { bytesBase64Encoded?: unknown };
  return typeof first?.bytesBase64Encoded === "string"
    ? first.bytesBase64Encoded
    : null;
}
```

- [ ] **Step 4: Wire the barrel**

Add to `packages/integrations/src/index.ts`:

```ts
export * from "./bouquet";
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `pnpm --filter @flowers/integrations test -- bouquet`
Expected: PASS (all cases).

- [ ] **Step 6: Commit**

```bash
git add packages/integrations/src/bouquet.ts packages/integrations/src/bouquet.test.ts packages/integrations/src/index.ts
git commit -m "feat(integrations): bouquet prompt + Imagen request/parse helpers"
```

---

### Task 4: `GEMINI_API_KEY` env + `generateBouquetImage` server function

**Files:**
- Modify: `packages/api/src/env.ts` (`AppEnv` + `getEnv()`)
- Create: `apps/web/src/server/bouquet.ts`

**Interfaces:**
- Consumes: `getEnv()`, `buildBouquetPrompt`, `buildImagenEndpoint`, `buildImagenRequest`, `extractImagenImage`, `BouquetPromptItem`.
- Produces:
  - `AppEnv.GEMINI_API_KEY: string | undefined`
  - `type GenerateBouquetResult = { ok: true; dataUrl: string } | { ok: false; reason: "unconfigured" | "empty" | "api_error" }`
  - `generateBouquetImage` server fn — input `{ items: BouquetPromptItem[] }`, returns `GenerateBouquetResult`.

- [ ] **Step 1: Add the env field**

In `packages/api/src/env.ts`, add to the `AppEnv` interface (after `ANTHROPIC_API_KEY`):

```ts
  /** Google Generative Language API key for Imagen bouquet rendering. Absent → designer generation disabled (fails soft). */
  GEMINI_API_KEY: string | undefined;
```

And to the `getEnv()` return object (after the `ANTHROPIC_API_KEY` line):

```ts
    GEMINI_API_KEY: read("GEMINI_API_KEY"),
```

- [ ] **Step 2: Implement the server function**

```ts
// apps/web/src/server/bouquet.ts
/** AI bouquet image generation (server-only). Lazily reads GEMINI_API_KEY and
 * calls Google's Imagen :predict endpoint via fetch. All testable logic lives
 * in @flowers/integrations; this file is the thin Workers wire. Never throws to
 * the client — always returns a discriminated result. */
import { createServerFn } from "@tanstack/react-start";
import {
  buildBouquetPrompt,
  buildImagenEndpoint,
  buildImagenRequest,
  extractImagenImage,
  getEnv,
  type BouquetPromptItem,
} from "@flowers/api"; // NOTE: see Step 3 — getEnv is from @flowers/api; the bouquet helpers are from @flowers/integrations

export type GenerateBouquetResult =
  | { ok: true; dataUrl: string }
  | { ok: false; reason: "unconfigured" | "empty" | "api_error" };

export interface GenerateBouquetInput {
  items: BouquetPromptItem[];
}

export const generateBouquetImage = createServerFn({ method: "POST" })
  .validator((data: GenerateBouquetInput) => data)
  .handler(async ({ data }): Promise<GenerateBouquetResult> => {
    const { GEMINI_API_KEY } = getEnv();
    if (!GEMINI_API_KEY) return { ok: false, reason: "unconfigured" };

    const prompt = buildBouquetPrompt(data.items, "en");
    if (!prompt) return { ok: false, reason: "empty" };

    try {
      const res = await fetch(buildImagenEndpoint(GEMINI_API_KEY), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(buildImagenRequest(prompt)),
      });
      if (!res.ok) return { ok: false, reason: "api_error" };
      const b64 = extractImagenImage(await res.json());
      if (!b64) return { ok: false, reason: "api_error" };
      return { ok: true, dataUrl: `data:image/png;base64,${b64}` };
    } catch {
      return { ok: false, reason: "api_error" };
    }
  });
```

- [ ] **Step 3: Fix the imports**

`getEnv` is exported from `@flowers/api`; the bouquet helpers (`buildBouquetPrompt`, etc.) and `BouquetPromptItem` are exported from `@flowers/integrations`. Split the import accordingly:

```ts
import { createServerFn } from "@tanstack/react-start";
import { getEnv } from "@flowers/api";
import {
  buildBouquetPrompt,
  buildImagenEndpoint,
  buildImagenRequest,
  extractImagenImage,
  type BouquetPromptItem,
} from "@flowers/integrations";
```

- [ ] **Step 4: Typecheck**

Run: `pnpm build && pnpm --filter @flowers/web typecheck && pnpm --filter @flowers/api typecheck`
Expected: PASS. (Logic is covered by Task 3's unit tests; this wire is verified by the type system. No `apps/web` unit runner.)

- [ ] **Step 5: Add the secret for local dev**

Append to `apps/web/.dev.vars` (create the line; do not commit real secrets — `.dev.vars` is gitignored):

```
GEMINI_API_KEY=your-local-key
```

Document in the PR/handoff that the Cloudflare secret must be set for `apps/web`: `wrangler secret put GEMINI_API_KEY` (per the Cloudflare deploy conventions).

- [ ] **Step 6: Commit**

```bash
git add packages/api/src/env.ts apps/web/src/server/bouquet.ts
git commit -m "feat(web): generateBouquetImage server fn + GEMINI_API_KEY env"
```

---

### Task 5: Designable-flower catalog query

**Files:**
- Modify: `packages/api/src/constants.ts` (add `DESIGNER_CATEGORY_SLUGS`)
- Create: `packages/api/src/constants.test.ts` (or extend if one exists)
- Modify: `packages/api/src/repos/catalog.ts` (add `listDesignerFlowers`)
- Modify: `apps/web/src/server/catalog.ts` (add `listDesignerFlowers` server fn)

**Interfaces:**
- Consumes: `publicConditions()`, `selectListItems()` (internal to `repos/catalog.ts`), `ProductListItem`, `toListItemDTO`, `tryCreateDb`, `setPublicCatalogCache`.
- Produces:
  - `const DESIGNER_CATEGORY_SLUGS: readonly string[]`
  - `listDesignerFlowers(db: Db): Promise<ProductListItem[]>`
  - `listDesignerFlowers` server fn (named `listDesignerFlowers` in `apps/web/src/server/catalog.ts`) → `Promise<{ items: ProductListItemDTO[] }>`

- [ ] **Step 1: Write the failing test (the pure, testable piece)**

```ts
// packages/api/src/constants.test.ts
import { describe, it, expect } from "vitest";
import { DESIGNER_CATEGORY_SLUGS } from "./constants";

describe("DESIGNER_CATEGORY_SLUGS", () => {
  it("includes the flower-ingredient categories the designer pulls from", () => {
    expect(DESIGNER_CATEGORY_SLUGS).toEqual([
      "roses",
      "gerberas",
      "orchids",
      "chrysanthemums",
      "loose-flowers",
    ]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @flowers/api test -- constants`
Expected: FAIL — `DESIGNER_CATEGORY_SLUGS` not exported.

- [ ] **Step 3: Add the constant**

Append to `packages/api/src/constants.ts`:

```ts
/**
 * Category slugs whose products are offered as "ingredients" in the AI bouquet
 * designer. Editable in one place — add a slug here to expose that category's
 * stems in the picker. Must match seeded category slugs.
 */
export const DESIGNER_CATEGORY_SLUGS: readonly string[] = [
  "roses",
  "gerberas",
  "orchids",
  "chrysanthemums",
  "loose-flowers",
];
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @flowers/api test -- constants`
Expected: PASS.

- [ ] **Step 5: Add the repo query**

In `packages/api/src/repos/catalog.ts`, import the constant at the top (it lives in `../constants`):

```ts
import { DESIGNER_CATEGORY_SLUGS } from "../constants";
```

Add the read below `listActiveProducts` (reuses the existing private `selectListItems` + `publicConditions`; mirrors `getShopWithProducts`):

```ts
/** Publicly-visible products in the designer's configured category set,
 * ordered by category then name. Used by the AI bouquet designer picker. */
export async function listDesignerFlowers(db: Db): Promise<ProductListItem[]> {
  const conditions: SQL[] = [
    ...publicConditions(),
    inArray(schema.categories.slug, [...DESIGNER_CATEGORY_SLUGS]),
  ];
  return selectListItems(db, conditions, { limit: 200 });
}
```

(`inArray` and `SQL` are already imported at the top of the file.)

- [ ] **Step 6: Add the server function**

In `apps/web/src/server/catalog.ts`, add `listDesignerFlowers` to the `@flowers/api` import list, then add a server fn near `getFeaturedProducts`:

```ts
export const listDesignerFlowers = createServerFn({ method: "GET" }).handler(
  async (): Promise<{ items: ProductListItemDTO[] }> => {
    setPublicCatalogCache();
    const db = tryCreateDb();
    if (!db) return { items: [] };
    try {
      const items = await repoListDesignerFlowers(db);
      return { items: items.map(toListItemDTO) };
    } catch {
      return { items: [] };
    }
  },
);
```

Import the repo fn under an alias to avoid colliding with the server fn name:

```ts
import {
  // …existing…
  listDesignerFlowers as repoListDesignerFlowers,
} from "@flowers/api";
```

- [ ] **Step 7: Typecheck**

Run: `pnpm build && pnpm --filter @flowers/api typecheck && pnpm --filter @flowers/web typecheck`
Expected: PASS. (The DB query follows the untested-sibling pattern in `repos/catalog.ts`; verified by typecheck + manual smoke, like `listActiveProducts`.)

- [ ] **Step 8: Commit**

```bash
git add packages/api/src/constants.ts packages/api/src/constants.test.ts packages/api/src/repos/catalog.ts apps/web/src/server/catalog.ts
git commit -m "feat: listDesignerFlowers query + configured category slug set"
```

---

### Task 6: i18n strings for the designer

**Files:**
- Modify: `apps/web/src/i18n/en.ts` (add a `design` block)
- Modify: `apps/web/src/i18n/si.ts` (add the matching `design` block)

**Interfaces:**
- Produces: `t.design.*` keys available via `useT()`.

- [ ] **Step 1: Add the English strings**

In `apps/web/src/i18n/en.ts`, add a `design` block as a sibling of the existing `enquiry` block (match the file's object style and trailing commas):

```ts
  design: {
    title: "Design your own bouquet",
    subtitle: "Pick your flowers, preview an AI arrangement, and send it to a florist on WhatsApp.",
    pickHeading: "Choose flowers",
    empty: "No flowers available right now. Please check back soon.",
    selectedSummary: "{flowers} flowers · {stems} stems",
    generate: "Generate preview",
    generating: "Creating your bouquet…",
    regenerate: "Regenerate",
    previewAlt: "AI-generated bouquet preview",
    previewPlaceholder: "Your AI bouquet preview will appear here.",
    download: "Download image",
    sendWhatsapp: "Send to a florist on WhatsApp",
    genUnavailable: "AI preview is unavailable right now — you can still send your flower list on WhatsApp.",
    genError: "Couldn't create the preview. Please try again — your flower selection is saved.",
    add: "Add",
    remove: "Remove",
  },
```

- [ ] **Step 2: Add the Sinhala strings**

In `apps/web/src/i18n/si.ts`, add the matching `design` block with Sinhala translations (same keys; keep `{flowers}`/`{stems}` placeholders intact):

```ts
  design: {
    title: "ඔබේම මල් කළඹක් සාදන්න",
    subtitle: "මල් තෝරන්න, AI මල් කළඹක් පෙරදසුන් බලන්න, WhatsApp හරහා මල් සාප්පුවකට එවන්න.",
    pickHeading: "මල් තෝරන්න",
    empty: "දැනට මල් නොමැත. කරුණාකර පසුව නැවත පරීක්ෂා කරන්න.",
    selectedSummary: "මල් වර්ග {flowers} · කඳ {stems}",
    generate: "පෙරදසුන සාදන්න",
    generating: "ඔබේ මල් කළඹ සාදමින්…",
    regenerate: "නැවත සාදන්න",
    previewAlt: "AI මඟින් සෑදූ මල් කළඹ පෙරදසුන",
    previewPlaceholder: "ඔබේ AI මල් කළඹ පෙරදසුන මෙහි දිස්වේ.",
    download: "රූපය බාගන්න",
    sendWhatsapp: "WhatsApp හරහා මල් සාප්පුවකට එවන්න",
    genUnavailable: "AI පෙරදසුන දැනට ලබාගත නොහැක — ඔබට තවමත් WhatsApp හරහා මල් ලැයිස්තුව එවිය හැක.",
    genError: "පෙරදසුන සෑදීමට නොහැකි විය. නැවත උත්සාහ කරන්න — ඔබේ තේරීම සුරැකී ඇත.",
    add: "එකතු කරන්න",
    remove: "ඉවත් කරන්න",
  },
```

- [ ] **Step 3: Typecheck (locale dictionaries must stay structurally identical)**

Run: `pnpm build && pnpm --filter @flowers/web typecheck`
Expected: PASS. If the dictionary type is derived from `en.ts`, a missing `si.ts` key fails here — fix any mismatch.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/i18n/en.ts apps/web/src/i18n/si.ts
git commit -m "i18n: strings for the bouquet designer"
```

---

### Task 7: Designer UI components

**Files:**
- Create: `apps/web/src/components/design/FlowerPicker.tsx`
- Create: `apps/web/src/components/design/BouquetPreview.tsx`
- Create: `apps/web/src/components/design/BouquetDesigner.tsx`

**Interfaces:**
- Consumes: `ProductListItemDTO` (from `apps/web/src/server/catalog`), `generateBouquetImage` + `GenerateBouquetResult` (from `apps/web/src/server/bouquet`), `useEnquiry()`, `useT()`, `siteUrl`, `buildEnquiryText`, `buildWhatsappUrl`, `WHATSAPP_NUMBER`, `EnquiryItem`.
- Produces: `BouquetDesigner({ flowers }: { flowers: ProductListItemDTO[] })` default-exported for the route.

- [ ] **Step 1: FlowerPicker — grid with per-flower quantity steppers**

```tsx
// apps/web/src/components/design/FlowerPicker.tsx
import { Minus, Plus } from "lucide-react";
import { localizedName, type Locale } from "../../i18n";
import { useT } from "../../i18n/react";
import type { ProductListItemDTO } from "../../server/catalog";

export interface PickerProps {
  flowers: ProductListItemDTO[];
  /** Current quantity per flower id (0 = not selected). */
  quantities: Record<string, number>;
  onChange: (id: string, qty: number) => void;
  locale: Locale;
}

export function FlowerPicker({ flowers, quantities, onChange, locale }: PickerProps) {
  const { t } = useT();
  if (flowers.length === 0) {
    return <p className="py-12 text-center text-muted-foreground">{t.design.empty}</p>;
  }
  return (
    <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
      {flowers.map((f) => {
        const qty = quantities[f.id] ?? 0;
        return (
          <li key={f.id} className="flex flex-col rounded-lg border border-border p-3">
            {f.imageUrl ? (
              <img
                src={f.imageUrl}
                alt={localizedName(f, locale)}
                className="aspect-square w-full rounded-md object-cover"
                loading="lazy"
              />
            ) : (
              <div className="aspect-square w-full rounded-md bg-muted" />
            )}
            <span className="mt-2 line-clamp-1 text-sm font-medium">
              {localizedName(f, locale)}
            </span>
            <div className="mt-2 flex items-center justify-between">
              <button
                type="button"
                aria-label={t.design.remove}
                onClick={() => onChange(f.id, Math.max(0, qty - 1))}
                className="flex size-8 items-center justify-center rounded-full border border-border hover:bg-accent"
              >
                <Minus className="size-3.5" aria-hidden="true" />
              </button>
              <span className="w-8 text-center text-sm tabular-nums">{qty}</span>
              <button
                type="button"
                aria-label={t.design.add}
                onClick={() => onChange(f.id, qty + 1)}
                className="flex size-8 items-center justify-center rounded-full border border-border hover:bg-accent"
              >
                <Plus className="size-3.5" aria-hidden="true" />
              </button>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
```

- [ ] **Step 2: BouquetPreview — image, states, download**

```tsx
// apps/web/src/components/design/BouquetPreview.tsx
import { Download } from "lucide-react";
import { Button } from "@flowers/ui/components/button";
import { useT } from "../../i18n/react";

export interface PreviewProps {
  status: "idle" | "loading" | "ready" | "error" | "unconfigured";
  dataUrl: string | null;
}

export function BouquetPreview({ status, dataUrl }: PreviewProps) {
  const { t } = useT();
  return (
    <div className="flex flex-col gap-3">
      <div className="flex aspect-square w-full items-center justify-center overflow-hidden rounded-lg border border-border bg-muted/40">
        {status === "ready" && dataUrl ? (
          <img src={dataUrl} alt={t.design.previewAlt} className="h-full w-full object-cover" />
        ) : status === "loading" ? (
          <span className="animate-pulse text-sm text-muted-foreground">{t.design.generating}</span>
        ) : status === "error" ? (
          <span className="px-6 text-center text-sm text-destructive">{t.design.genError}</span>
        ) : status === "unconfigured" ? (
          <span className="px-6 text-center text-sm text-muted-foreground">{t.design.genUnavailable}</span>
        ) : (
          <span className="px-6 text-center text-sm text-muted-foreground">{t.design.previewPlaceholder}</span>
        )}
      </div>
      {status === "ready" && dataUrl && (
        <Button asChild variant="outline" size="sm">
          <a href={dataUrl} download="flowermarket-bouquet.png">
            <Download className="size-4" aria-hidden="true" />
            {t.design.download}
          </a>
        </Button>
      )}
    </div>
  );
}
```

- [ ] **Step 3: BouquetDesigner — orchestrator (selection state, generate, WhatsApp)**

```tsx
// apps/web/src/components/design/BouquetDesigner.tsx
import * as React from "react";
import { Send, Sparkles } from "lucide-react";
import {
  buildEnquiryText,
  buildWhatsappUrl,
  WHATSAPP_NUMBER,
  type EnquiryItem,
} from "@flowers/integrations";
import { Button } from "@flowers/ui/components/button";
import { type Locale } from "../../i18n";
import { useT } from "../../i18n/react";
import { siteUrl } from "../../lib/site";
import { useEnquiry } from "../../lib/enquiry";
import { generateBouquetImage } from "../../server/bouquet";
import type { ProductListItemDTO } from "../../server/catalog";
import { FlowerPicker } from "./FlowerPicker";
import { BouquetPreview } from "./BouquetPreview";

type PreviewStatus = "idle" | "loading" | "ready" | "error" | "unconfigured";

export default function BouquetDesigner({ flowers }: { flowers: ProductListItemDTO[] }) {
  const { t, f, locale } = useT();
  const { add } = useEnquiry();
  const [quantities, setQuantities] = React.useState<Record<string, number>>({});
  const [status, setStatus] = React.useState<PreviewStatus>("idle");
  const [dataUrl, setDataUrl] = React.useState<string | null>(null);

  const byId = React.useMemo(() => new Map(flowers.map((fl) => [fl.id, fl])), [flowers]);

  // Selection = flowers with qty >= 1, shaped as EnquiryItem for the basket.
  const selection = React.useMemo<EnquiryItem[]>(() => {
    const out: EnquiryItem[] = [];
    for (const [id, qty] of Object.entries(quantities)) {
      const fl = byId.get(id);
      if (!fl || qty < 1) continue;
      out.push({
        id: fl.id, slug: fl.slug, nameEn: fl.nameEn, nameSi: fl.nameSi,
        price: fl.price, listingType: fl.listingType, qty,
      });
    }
    return out;
  }, [quantities, byId]);

  const stems = selection.reduce((n, i) => n + i.qty, 0);

  function onChange(id: string, qty: number) {
    setQuantities((prev) => ({ ...prev, [id]: qty }));
  }

  async function onGenerate() {
    if (selection.length === 0 || status === "loading") return;
    setStatus("loading");
    const result = await generateBouquetImage({
      data: { items: selection.map((i) => ({ nameEn: i.nameEn, qty: i.qty })) },
    });
    if (result.ok) {
      setDataUrl(result.dataUrl);
      setStatus("ready");
    } else {
      setDataUrl(null);
      setStatus(result.reason === "unconfigured" ? "unconfigured" : "error");
    }
  }

  const waHref = buildWhatsappUrl(
    buildEnquiryText({
      items: selection,
      locale,
      siteUrl: siteUrl(),
      designNote: status === "ready" ? "AI bouquet design (image attached)" : undefined,
    }),
    WHATSAPP_NUMBER,
  );

  function onSendWhatsapp() {
    for (const item of selection) {
      const { qty, ...draft } = item;
      add({ ...draft, qty });
    }
  }

  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_380px]">
      <section>
        <h2 className="font-display text-2xl">{t.design.pickHeading}</h2>
        <div className="mt-4">
          <FlowerPicker flowers={flowers} quantities={quantities} onChange={onChange} locale={locale as Locale} />
        </div>
      </section>

      <aside className="lg:sticky lg:top-6 lg:self-start">
        <BouquetPreview status={status} dataUrl={dataUrl} />
        <p className="mt-3 text-sm text-muted-foreground">
          {f(t.design.selectedSummary, { flowers: selection.length, stems })}
        </p>
        <div className="mt-4 flex flex-col gap-2">
          <Button onClick={onGenerate} disabled={selection.length === 0 || status === "loading"} size="lg">
            <Sparkles className="size-4" aria-hidden="true" />
            {status === "loading" ? t.design.generating : status === "ready" ? t.design.regenerate : t.design.generate}
          </Button>
          <Button
            asChild
            size="lg"
            className="bg-[#25D366] text-white hover:bg-[#1fb457]"
            disabled={selection.length === 0}
          >
            <a href={waHref} target="_blank" rel="noopener noreferrer" onClick={onSendWhatsapp}>
              <Send className="size-4" aria-hidden="true" />
              {t.design.sendWhatsapp}
            </a>
          </Button>
        </div>
      </aside>
    </div>
  );
}
```

Note the `generateBouquetImage({ data: { items } })` call shape — TanStack server fns take `{ data }`, matching `listProducts({ data: {...} })` in the existing routes.

- [ ] **Step 4: Typecheck**

Run: `pnpm build && pnpm --filter @flowers/web typecheck`
Expected: PASS. If `Button` doesn't forward `disabled` through `asChild`, wrap the WhatsApp `<a>` disabling in a conditional (`selection.length === 0 ? <disabled button> : <a>`), or gate the anchor with `aria-disabled` + `pointer-events-none` — keep the flower list independent of generation status (Review Focus: WhatsApp must work even when generation fails).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/design/
git commit -m "feat(web): bouquet designer UI (picker, preview, orchestrator)"
```

---

### Task 8: `/design` route, navigation link, and SEO entry

**Files:**
- Create: `apps/web/src/routes/$locale/design.tsx`
- Modify: the primary nav component (discover in Step 3)
- Modify: `docs/seo-strategy.md`

**Interfaces:**
- Consumes: `listDesignerFlowers` server fn, `BouquetDesigner`, `useT`, SEO helpers (`hreflangLinks`, `absoluteUrl`, `socialMeta`, `jsonLdScript`, `localePath`).

- [ ] **Step 1: Create the route**

```tsx
// apps/web/src/routes/$locale/design.tsx
import { createFileRoute } from "@tanstack/react-router";
import { getDict, type Locale } from "../../i18n";
import { useT } from "../../i18n/react";
import { absoluteUrl, hreflangLinks } from "../../lib/site";
import { jsonLdScript, socialMeta } from "../../lib/seo";
import { listDesignerFlowers } from "../../server/catalog";
import BouquetDesigner from "../../components/design/BouquetDesigner";

export const Route = createFileRoute("/$locale/design")({
  loader: async () => {
    const { items } = await listDesignerFlowers();
    return { items };
  },
  head: ({ params }) => {
    const locale = params.locale as Locale;
    const dict = getDict(locale);
    const title =
      locale === "si"
        ? `${dict.design.title} | FlowerMarket.lk`
        : `Design Your Own Bouquet Online in Sri Lanka | FlowerMarket.lk`;
    const description = dict.design.subtitle;
    const webApp = {
      "@context": "https://schema.org",
      "@type": "WebApplication",
      name: dict.design.title,
      applicationCategory: "LifestyleApplication",
      url: absoluteUrl(`/${locale}/design`),
      description,
    };
    return {
      meta: [
        { title },
        { name: "description", content: description },
        ...socialMeta({ title, description, url: absoluteUrl(`/${locale}/design`), locale }),
      ],
      links: hreflangLinks("/design", locale),
      scripts: [jsonLdScript(webApp)],
    };
  },
  component: DesignPage,
});

function DesignPage() {
  const { items } = Route.useLoaderData();
  const { t } = useT();
  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <header className="mb-8 rounded-lg bg-sage px-6 py-10 sm:px-10 sm:py-12">
        <h1 className="font-display text-4xl sm:text-5xl">{t.design.title}</h1>
        <p className="mt-3 max-w-2xl text-sm text-foreground/70 sm:text-base">{t.design.subtitle}</p>
      </header>
      <BouquetDesigner flowers={items} />
    </div>
  );
}
```

- [ ] **Step 2: Build to generate the route tree, then typecheck**

Run: `pnpm build && pnpm --filter @flowers/web typecheck`
Expected: PASS — `routeTree.gen.ts` now includes `/$locale/design`. Fix any SEO-helper signature mismatch (compare against `c.$slug.tsx`, which uses the same helpers).

- [ ] **Step 3: Add a navigation link**

Find where the primary nav links to the catalog:

Run: `grep -rn 'to="/\$locale/products"' apps/web/src/components`
Open the nav/header component it reveals and add a sibling link to the designer, using an i18n label (reuse `t.design.title` or add a short `t.nav.design` key in both dictionaries if the nav uses a dedicated namespace):

```tsx
<Link to="/$locale/design" params={{ locale }}>{t.design.title}</Link>
```

Match the existing links' styling/props exactly. Typecheck again: `pnpm --filter @flowers/web typecheck`.

- [ ] **Step 4: Add the SEO-strategy entry**

In `docs/seo-strategy.md`, add a row/entry for `/design` with the target keyword "design your own bouquet online sri lanka" and a one-line intent note, matching the file's existing format.

- [ ] **Step 5: Manual smoke test**

Run: `pnpm --filter @flowers/web dev` and visit `http://localhost:3000/en/design`.
Verify: flowers render (requires `DATABASE_URL` in `apps/web/.dev.vars` and seeded data — run `pnpm db:seed` if empty); steppers update the summary; with `GEMINI_API_KEY` set, Generate shows a bouquet; without it, the preview shows the "unavailable" copy and WhatsApp still opens with the flower list. Check `/si/design` renders Sinhala copy.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/routes/$locale/design.tsx docs/seo-strategy.md
git add -A apps/web/src/components   # nav link
git commit -m "feat(web): /design route, nav link, SEO entry"
```

---

## Self-Review Notes

- **Spec coverage:** §1 architecture → Tasks 4–8; §2 catalog/picker → Tasks 5, 7; §3 AI generation → Tasks 3, 4; §4 WhatsApp + §4.1 config → Tasks 1, 2, 7; §5 error handling → Tasks 3, 4, 7 (fail-soft branches); §6 SEO → Task 8; §7 testing → Tasks 1, 3, 5; §8 file manifest → all tasks.
- **Placeholder scan:** no TBD/TODO; the only deferred concrete is the Imagen model id (`imagen-3.0-generate-002`), given as a working default and isolated in `IMAGEN_MODEL` for one-line swap (spec §3.2).
- **Type consistency:** `BouquetPromptItem` (Task 3) is consumed verbatim by Task 4's server fn and Task 7's `onGenerate`; `GenerateBouquetResult` reasons (`unconfigured`/`empty`/`api_error`) map 1:1 to Task 7's `PreviewStatus`; `ProductListItemDTO` flows loader → route → `BouquetDesigner` → `FlowerPicker`.
- **Review Focus:** qty-0 and oversize pinned in Task 3 tests; empty/api_error/unconfigured pinned in Tasks 3–4; the two UI-only behaviors (WhatsApp independent of generation, in-flight Generate guard) are flagged manual in Task 7 because `apps/web` has no unit runner.
