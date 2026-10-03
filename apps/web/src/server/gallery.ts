import { createServerFn } from "@tanstack/react-start";
import { tryCreateDb, listBouquetGenerations } from "@flowers/api";

export const listPublicGallery = createServerFn({ method: "GET" }).handler(async () => {
  const db = tryCreateDb();
  if (!db) return [];
  return listBouquetGenerations(db, { limit: 48, publicOnly: true });
});
