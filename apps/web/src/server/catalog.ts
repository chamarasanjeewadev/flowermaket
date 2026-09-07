/** Catalog server functions. DB access lives here (server-only) so the
 * `postgres` driver is never bundled into the client — route loaders call
 * these via RPC. Mirrors `server/categories.ts` (graceful [] / null on a
 * missing or erroring DB). Image storage paths are resolved to public URLs
 * here, where `getEnv().SUPABASE_URL` is available, so components never touch
 * Workers env. */
import { createServerFn } from "@tanstack/react-start";
import {
  CATALOG_PAGE_SIZE,
  DISTRICTS,
  getActiveProductBySlug,
  getEnv,
  getShopWithProducts,
  listActiveCategoriesWithCounts,
  listActiveProducts,
  tryCreateDb,
  type CategoryWithCount,
  type ListingType,
  type ProductDetail,
  type ProductListItem,
  type ShopSummary,
} from "@flowers/api";

// ---------------------------------------------------------------------------
// DTOs (image paths resolved to public URLs)
// ---------------------------------------------------------------------------

export type ProductListItemDTO = Omit<ProductListItem, "primaryImagePath"> & {
  imageUrl: string | null;
};

export interface ProductImageDTO {
  url: string;
  altText: string | null;
}

/** Shop summary with the district slug resolved to localized names. */
export type ShopSummaryDTO = ShopSummary & {
  districtNameEn: string;
  districtNameSi: string;
};

export type ProductDetailDTO = Omit<ProductDetail, "images" | "shop"> & {
  images: ProductImageDTO[];
  shop: ShopSummaryDTO;
};

export interface ProductListResultDTO {
  items: ProductListItemDTO[];
  total: number;
  page: number;
  pageSize: number;
}

export interface ShopWithProductsDTO {
  shop: ShopSummaryDTO;
  products: ProductListItemDTO[];
}

// ---------------------------------------------------------------------------
// Helpers (server-only)
// ---------------------------------------------------------------------------

/**
 * Resolve a stored image path to a public URL. Absolute URLs and `/public`
 * asset paths pass through unchanged; anything else is treated as an object
 * key in the public `product-images` Supabase Storage bucket.
 */
function resolveImageUrl(storagePath: string | null): string | null {
  if (!storagePath) return null;
  if (/^https?:\/\//.test(storagePath) || storagePath.startsWith("/")) {
    return storagePath;
  }
  const { SUPABASE_URL } = getEnv();
  if (!SUPABASE_URL) return null;
  return `${SUPABASE_URL.replace(/\/$/, "")}/storage/v1/object/public/product-images/${storagePath}`;
}

function toListItemDTO(item: ProductListItem): ProductListItemDTO {
  const { primaryImagePath, ...rest } = item;
  return { ...rest, imageUrl: resolveImageUrl(primaryImagePath) };
}

/** Attach localized district names to a shop (called only inside handlers so
 * DISTRICTS is never referenced at module scope / in the client bundle). */
function enrichShop(shop: ShopSummary): ShopSummaryDTO {
  const d = DISTRICTS.find((x) => x.slug === shop.district);
  return {
    ...shop,
    districtNameEn: d?.nameEn ?? shop.district,
    districtNameSi: d?.nameSi ?? shop.district,
  };
}

const emptyResult = (): ProductListResultDTO => ({
  items: [],
  total: 0,
  page: 1,
  pageSize: CATALOG_PAGE_SIZE,
});

// ---------------------------------------------------------------------------
// Server functions
// ---------------------------------------------------------------------------

export interface ListProductsInput {
  category?: string;
  type?: ListingType;
  district?: string;
  q?: string;
  page?: number;
}

export const listProducts = createServerFn({ method: "GET" })
  .validator((data: ListProductsInput) => data)
  .handler(async ({ data }): Promise<ProductListResultDTO> => {
    const db = tryCreateDb();
    if (!db) return emptyResult();
    try {
      const result = await listActiveProducts(db, {
        categorySlug: data.category,
        listingType: data.type,
        district: data.district,
        q: data.q,
        page: data.page,
      });
      return { ...result, items: result.items.map(toListItemDTO) };
    } catch {
      return emptyResult();
    }
  });

export const getProductBySlug = createServerFn({ method: "GET" })
  .validator((slug: string) => slug)
  .handler(async ({ data: slug }): Promise<ProductDetailDTO | null> => {
    const db = tryCreateDb();
    if (!db) return null;
    try {
      const product = await getActiveProductBySlug(db, slug);
      if (!product) return null;
      const { images, shop, ...rest } = product;
      const resolved: ProductImageDTO[] = [];
      for (const img of images) {
        const url = resolveImageUrl(img.storagePath);
        if (url) resolved.push({ url, altText: img.altText });
      }
      return { ...rest, images: resolved, shop: enrichShop(shop) };
    } catch {
      return null;
    }
  });

export const getShopBySlug = createServerFn({ method: "GET" })
  .validator((slug: string) => slug)
  .handler(async ({ data: slug }): Promise<ShopWithProductsDTO | null> => {
    const db = tryCreateDb();
    if (!db) return null;
    try {
      const result = await getShopWithProducts(db, slug);
      if (!result) return null;
      return {
        shop: enrichShop(result.shop),
        products: result.products.map(toListItemDTO),
      };
    } catch {
      return null;
    }
  });

export const getCategoriesWithCounts = createServerFn({
  method: "GET",
}).handler(async (): Promise<CategoryWithCount[]> => {
  const db = tryCreateDb();
  if (!db) return [];
  try {
    return await listActiveCategoriesWithCounts(db);
  } catch {
    return [];
  }
});

export const getFeaturedProducts = createServerFn({ method: "GET" }).handler(
  async (): Promise<ProductListItemDTO[]> => {
    const db = tryCreateDb();
    if (!db) return [];
    try {
      const result = await listActiveProducts(db, { page: 1 });
      return result.items.slice(0, 8).map(toListItemDTO);
    } catch {
      return [];
    }
  },
);
