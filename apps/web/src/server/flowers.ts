import { createServerFn } from "@tanstack/react-start";
import {
  getEnv,
  listFeaturedVariants as repoListFeatured,
  listFlowerVariants as repoListAll,
  tryCreateDb,
  type FlowerVariantRow,
} from "@flowers/api";

export type { FlowerVariantRow };

export const listFeaturedVariants = createServerFn().handler(
  async (): Promise<FlowerVariantRow[]> => {
    const db = tryCreateDb();
    if (!db) return [];
    const { SUPABASE_URL } = getEnv();
    if (!SUPABASE_URL) return [];
    return repoListFeatured(db, SUPABASE_URL);
  },
);

export const listFlowerVariants = createServerFn().handler(
  async (): Promise<FlowerVariantRow[]> => {
    const db = tryCreateDb();
    if (!db) return [];
    const { SUPABASE_URL } = getEnv();
    if (!SUPABASE_URL) return [];
    return repoListAll(db, SUPABASE_URL);
  },
);
