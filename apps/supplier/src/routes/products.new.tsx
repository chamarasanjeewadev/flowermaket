import * as React from "react";
import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@flowers/ui/components/card";
import {
  listCategoriesFn,
  createProductFn,
  uploadProductImageFn,
} from "../server/products";
import { ProductForm } from "../components/ProductForm";
import { ProductImagePicker } from "../components/ProductImagePicker";
import { toast } from "../components/toaster";
import { useT } from "../i18n/react";

/** Upload picked images for a freshly created product. Best-effort: returns
 * how many failed so the caller can warn without blocking creation. */
async function uploadImages(productId: string, files: File[]): Promise<number> {
  let failed = 0;
  for (const file of files) {
    try {
      const fd = new FormData();
      fd.append("productId", productId);
      fd.append("file", file);
      const res = await uploadProductImageFn({ data: fd });
      if (!res.ok) failed++;
    } catch {
      failed++;
    }
  }
  return failed;
}

export const Route = createFileRoute("/products/new")({
  loader: async () => ({ categories: await listCategoriesFn() }),
  component: NewProductPage,
});

function NewProductPage() {
  const { t } = useT();
  const router = useRouter();
  const { categories } = Route.useLoaderData();
  const [images, setImages] = React.useState<File[]>([]);

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <Link
        to="/products"
        className="text-sm text-muted-foreground hover:text-foreground"
      >
        {t.products.backToList}
      </Link>

      <Card>
        <CardHeader>
          <CardTitle className="font-display text-2xl">
            {t.products.newTitle}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ProductForm
            categories={categories}
            showStatus
            submitLabel={t.products.create}
            submittingLabel={t.products.creating}
            beforeSubmit={
              <div className="border-t border-border pt-4">
                <ProductImagePicker files={images} onChange={setImages} />
              </div>
            }
            onSubmit={async (payload) => {
              const result = await createProductFn({
                data: {
                  categoryId: payload.categoryId,
                  nameEn: payload.nameEn,
                  nameSi: payload.nameSi,
                  descriptionEn: payload.descriptionEn,
                  descriptionSi: payload.descriptionSi,
                  listingType: payload.listingType,
                  price: payload.price,
                  compareAtPrice: payload.compareAtPrice,
                  stockQty: payload.stockQty,
                  minOrderQty: payload.minOrderQty,
                  leadTimeDays: payload.leadTimeDays,
                  status: payload.status,
                },
              });
              if (!result.ok) {
                return { ok: false, message: result.message };
              }
              // Upload photos (best-effort — product is already created).
              const failed = images.length
                ? await uploadImages(result.data.id, images)
                : 0;
              if (failed > 0) {
                toast.error(t.products.imagesUploadWarn);
              } else {
                toast.success(t.products.created);
              }
              await router.navigate({
                to: "/products/$productId",
                params: { productId: result.data.id },
              });
              return { ok: true };
            }}
          />
        </CardContent>
      </Card>
    </div>
  );
}
