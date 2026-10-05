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
  listActiveShops,
  listCategoryCoverImages,
  listDesignerFlowers as repoListDesignerFlowers,
  tryCreateDb,
  type CategoryWithCount,
  type ListingType,
  type ProductDetail,
  type ProductListItem,
  type SellerType,
  type ShopDirectoryEntry,
  type ShopSummary,
} from "@flowers/api";
import { setPublicCatalogCache } from "./http-cache";

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

/** Shop summary with the district slug resolved to localized names and the
 * logo / banner storage paths resolved to public URLs. */
export type ShopSummaryDTO = Omit<ShopSummary, "logoPath" | "bannerPath"> & {
  districtNameEn: string;
  districtNameSi: string;
  logoUrl: string | null;
  bannerUrl: string | null;
};

export type ShopDirectoryDTO = ShopSummaryDTO &
  Pick<ShopDirectoryEntry, "productCount" | "minPrice"> & {
    previewImageUrls: string[];
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
  const { logoPath, bannerPath, ...rest } = shop;
  const d = DISTRICTS.find((x) => x.slug === shop.district);
  return {
    ...rest,
    districtNameEn: d?.nameEn ?? shop.district,
    districtNameSi: d?.nameSi ?? shop.district,
    logoUrl: resolveImageUrl(logoPath),
    bannerUrl: resolveImageUrl(bannerPath),
  };
}

function toDirectoryDTO(entry: ShopDirectoryEntry): ShopDirectoryDTO {
  const { productCount, minPrice, previewImagePaths, ...shop } = entry;
  const previewImageUrls: string[] = [];
  for (const path of previewImagePaths) {
    const url = resolveImageUrl(path);
    if (url) previewImageUrls.push(url);
  }
  return { ...enrichShop(shop), productCount, minPrice, previewImageUrls };
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
  sellerType?: SellerType;
  q?: string;
  page?: number;
}

export const listProducts = createServerFn({ method: "GET" })
  .validator((data: ListProductsInput) => data)
  .handler(async ({ data }): Promise<ProductListResultDTO> => {
    setPublicCatalogCache();
    const db = tryCreateDb();
    if (!db) return emptyResult();
    try {
      const result = await listActiveProducts(db, {
        categorySlug: data.category,
        listingType: data.type,
        district: data.district,
        sellerType: data.sellerType,
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
    setPublicCatalogCache();
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
    setPublicCatalogCache();
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

export type CategoryWithCountDTO = CategoryWithCount & {
  coverImageUrl: string | null;
};

export const getCategoriesWithCounts = createServerFn({
  method: "GET",
}).handler(async (): Promise<CategoryWithCountDTO[]> => {
  setPublicCatalogCache();
  const db = tryCreateDb();
  if (!db) return [];
  try {
    const [categories, covers] = await Promise.all([
      listActiveCategoriesWithCounts(db),
      listCategoryCoverImages(db),
    ]);
    return categories.map((c) => ({
      ...c,
      coverImageUrl: resolveImageUrl(covers.get(c.slug) ?? null),
    }));
  } catch {
    return [];
  }
});

export const getFeaturedProducts = createServerFn({ method: "GET" }).handler(
  async (): Promise<ProductListItemDTO[]> => {
    setPublicCatalogCache();
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

export interface ListShopsInput {
  sellerType?: SellerType;
  district?: string;
}

export const listShops = createServerFn({ method: "GET" })
  .validator((data: ListShopsInput | undefined) => data ?? {})
  .handler(async ({ data }): Promise<ShopDirectoryDTO[]> => {
    setPublicCatalogCache();
    const db = tryCreateDb();
    if (!db) return [];
    try {
      const shops = await listActiveShops(db, data);
      return shops.map(toDirectoryDTO);
    } catch {
      return [];
    }
  });
