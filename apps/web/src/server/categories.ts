/** Category server functions. DB access lives here (server-only) so the
 * `postgres` driver is never bundled into the client — see the loader in
 * `routes/$locale/index.tsx`, which calls this via RPC. */
import { createServerFn } from "@tanstack/react-start";
import { tryCreateDb } from "@flowers/api";

export interface CategoryRow {
  id: string;
  slug: string;
  nameEn: string;
  nameSi: string | null;
}

/** Active categories for the home grid; returns [] when the DB is unset or errors. */
export const getActiveCategories = createServerFn({ method: "GET" }).handler(
  async (): Promise<CategoryRow[]> => {
    const db = tryCreateDb();
    if (!db) return [];
    try {
      return await db.query.categories.findMany({
        where: (c, { eq }) => eq(c.isActive, true),
        orderBy: (c, { asc }) => [asc(c.sortOrder), asc(c.nameEn)],
        columns: { id: true, slug: true, nameEn: true, nameSi: true },
      });
    } catch {
      return [];
    }
  },
);
