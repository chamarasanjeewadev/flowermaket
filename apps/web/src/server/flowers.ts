import { createServerFn } from "@tanstack/react-start";
import {
  getEnv,
  listFeaturedVariants as repoListFeatured,
  listFlowerVariants as repoListAll,
  tryCreateDb,
  type FlowerVariantRow,
} from "@flowers/api";

export type { FlowerVariantRow };

export const listFeaturedVariants = createServerFn({ method: "GET" }).handler(
  async (): Promise<FlowerVariantRow[]> => {
    try {
      const db = tryCreateDb();
      if (!db) return [];
      const { SUPABASE_URL } = getEnv();
      if (!SUPABASE_URL) return [];
      return await repoListFeatured(db, SUPABASE_URL);
    } catch {
      return [];
    }
  },
);

export const listFlowerVariants = createServerFn({ method: "GET" }).handler(
  async (): Promise<FlowerVariantRow[]> => {
    try {
      const db = tryCreateDb();
      if (!db) return [];
      const { SUPABASE_URL } = getEnv();
      if (!SUPABASE_URL) return [];
      return await repoListAll(db, SUPABASE_URL);
    } catch {
      return [];
    }
  },
);
