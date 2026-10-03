import { createServerFn } from "@tanstack/react-start";
import { tryCreateDb, listBouquetGenerations, type BouquetGenerationRow } from "@flowers/api";
import { resolveAdminSession } from "./session";

export type { BouquetGenerationRow };

export const listBouquetUsageFn = createServerFn({ method: "GET" }).handler(
  async (): Promise<BouquetGenerationRow[]> => {
    const session = await resolveAdminSession();
    if (
      session.kind === "anonymous" ||
      session.kind === "config_error" ||
      session.kind === "forbidden"
    ) {
      return [];
    }
    const db = tryCreateDb();
    if (!db) return [];
    return listBouquetGenerations(db, { limit: 200 });
  },
);
