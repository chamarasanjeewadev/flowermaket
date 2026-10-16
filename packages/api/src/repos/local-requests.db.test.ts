/**
 * DB smoke test for local requests — runs ONLY against a dev database
 * (DEV_DATABASE_URL); skipped otherwise. Never point this at production.
 * Everything runs inside one transaction that is always rolled back.
 */
import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { createDb, schema } from "@flowers/db/client";
import type { Db } from "../db";
import {
  createRequest,
  openRequestAfterVerification,
  type DispatchDeps,
} from "./local-requests";

const DEV_URL = process.env.DEV_DATABASE_URL;

class Rollback extends Error {}

describe.skipIf(!DEV_URL)("local requests (dev DB smoke)", () => {
  it("create → open with 0 listings → noFloristsInRange, customer told floristCount 0", async () => {
    const db = createDb(DEV_URL ?? "");
    const customerTexts: { floristCount: number }[] = [];
    const deps: DispatchDeps = {
      send: async () => ({ ok: true }),
      leadUrl: (t) => `https://example.test/lead/${t}`,
      pageUrl: (t) => `https://example.test/r/${t}`,
      templates: {},
      buildShopText: () => "shop",
      buildUnclaimedText: () => "unclaimed",
      buildCustomerOpenedText: (i) => {
        customerTexts.push({ floristCount: i.floristCount });
        return "opened";
      },
    };

    await expect(
      db.transaction(async (tx) => {
        // A transaction exposes the same query builder (nested calls become savepoints).
        const tdb = tx as unknown as Db;
        const today = new Date(Date.now() + 5.5 * 3600 * 1000).toISOString().slice(0, 10);
        const created = await createRequest(tdb, {
          customerName: "Smoke Test",
          customerPhone: "0770000000",
          language: "en",
          design: { flowers: [], fillers: [], wrapping: null, addons: [], cardMessage: null, notes: "Smoke test bouquet" },
          occasion: null,
          budgetBand: "3k_5k",
          fulfilment: "pickup",
          // Open sea off the south-east coast: inside the SL bbox, no florists within 25 km.
          point: { lat: 5.9, lng: 81.9 },
          deliveryArea: "Smoke Test Area",
          deliveryAddress: null,
          neededOn: today,
          neededWindow: "any",
          bouquetGenerationId: null,
          utm: null,
        });
        expect(created.ok).toBe(true);
        if (!created.ok) throw new Rollback();

        await tx
          .update(schema.bouquetRequests)
          .set({ phoneVerifiedAt: new Date() })
          .where(eq(schema.bouquetRequests.id, created.data.id));

        const opened = await openRequestAfterVerification(
          tdb, created.data.id, created.data.accessToken, new Date(), deps,
        );
        expect(opened).toEqual({ ok: true, data: { floristCount: 0, pendingApproval: 0 } });

        const [row] = await tx
          .select()
          .from(schema.bouquetRequests)
          .where(eq(schema.bouquetRequests.id, created.data.id));
        expect(row?.status).toBe("open");
        expect(row?.noFloristsInRange).toBe(true);
        expect(customerTexts).toEqual([{ floristCount: 0 }]);

        const again = await openRequestAfterVerification(
          tdb, created.data.id, created.data.accessToken, new Date(), deps,
        );
        expect(again.ok).toBe(false);
        if (!again.ok) expect(again.code).toBe("conflict");

        throw new Rollback();
      }),
    ).rejects.toBeInstanceOf(Rollback);
  });
});
