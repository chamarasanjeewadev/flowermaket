import * as React from "react";
import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { Button } from "@flowers/ui/components/button";
import { Badge } from "@flowers/ui/components/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@flowers/ui/components/card";
import { EmptyState } from "@flowers/ui/components/empty-state";
import { Flower, Loader2, Star, Trash2, Upload } from "lucide-react";
import {
  listCategoriesFn,
  getShopProductFn,
  updateProductFn,
  uploadProductImageFn,
  deleteProductImageFn,
  setPrimaryImageFn,
  type OwnerProductImageDTO,
} from "../server/products";
import { ProductForm } from "../components/ProductForm";
import { toast } from "../components/toaster";
import { useT } from "../i18n/react";

export const Route = createFileRoute("/products/$productId")({
  loader: async ({ params }) => ({
    product: await getShopProductFn({ data: params.productId }),
    categories: await listCategoriesFn(),
  }),
  component: EditProductPage,
});

function EditProductPage() {
  const { t } = useT();
  const router = useRouter();
  const { product, categories } = Route.useLoaderData();
  const { productId } = Route.useParams();

  if (!product) {
    return (
      <div className="mx-auto max-w-2xl space-y-4">
        <Link
          to="/products"
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          {t.products.backToList}
        </Link>
        <EmptyState icon={<Flower />} title={t.products.notFound} />
      </div>
    );
  }

  const isPublished = product.status === "active";

  async function togglePublish() {
    const next = isPublished ? "paused" : "active";
    const result = await updateProductFn({
      data: { productId, patch: { status: next } },
    });
    if (result.ok) {
      toast.success(
        next === "active" ? t.products.published : t.products.unpublished,
      );
      await router.invalidate();
    } else {
      toast.error(result.message);
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <Link
        to="/products"
        className="text-sm text-muted-foreground hover:text-foreground"
      >
        {t.products.backToList}
      </Link>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <h1 className="font-display text-2xl sm:text-3xl">
            {product.nameEn}
          </h1>
          <Badge variant={isPublished ? "success" : "secondary"}>
            {isPublished ? t.products.statusActive : t.products.statusDraft}
          </Badge>
        </div>
        <Button
          variant={isPublished ? "outline" : "brand"}
          onClick={() => void togglePublish()}
        >
          {isPublished ? t.products.unpublish : t.products.publish}
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t.products.editTitle}</CardTitle>
        </CardHeader>
        <CardContent>
          <ProductForm
            categories={categories}
            initial={{
              categoryId: product.categoryId,
              nameEn: product.nameEn,
              nameSi: product.nameSi,
              descriptionEn: product.descriptionEn,
              descriptionSi: product.descriptionSi,
              listingType: product.listingType,
              price: product.price,
              compareAtPrice: product.compareAtPrice,
              stockQty: product.stockQty,
              minOrderQty: product.minOrderQty,
              leadTimeDays: product.leadTimeDays,
            }}
            submitLabel={t.products.save}
            submittingLabel={t.products.saving}
            onSubmit={async (payload) => {
              const result = await updateProductFn({
                data: {
                  productId,
                  patch: {
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
                  },
                },
              });
              if (result.ok) {
                toast.success(t.products.saved);
                await router.invalidate();
                return { ok: true };
              }
              return { ok: false, message: result.message };
            }}
          />
        </CardContent>
      </Card>

      <ImageManager images={product.images} productId={productId} />
    </div>
  );
}

function ImageManager({
  images,
  productId,
}: {
  images: OwnerProductImageDTO[];
  productId: string;
}) {
  const { t } = useT();
  const router = useRouter();
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = React.useState(false);

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("productId", productId);
      formData.append("file", file);
      const result = await uploadProductImageFn({ data: formData });
      if (result.ok) {
        await router.invalidate();
      } else {
        toast.error(result.message);
      }
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function handleDelete(imageId: string) {
    if (!window.confirm(t.products.deleteImageConfirm)) return;
    const result = await deleteProductImageFn({ data: { imageId } });
    if (result.ok) {
      await router.invalidate();
    } else {
      toast.error(result.message);
    }
  }

  async function handleSetPrimary(imageId: string) {
    const result = await setPrimaryImageFn({ data: { imageId } });
    if (result.ok) {
      await router.invalidate();
    } else {
      toast.error(result.message);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{t.products.imagesTitle}</CardTitle>
        <CardDescription>{t.products.imagesHint}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {images.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {t.products.imagesEmpty}
          </p>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {images.map((img) => (
              <div
                key={img.id}
                className="group relative overflow-hidden rounded-lg border border-border"
              >
                <div className="aspect-square bg-muted">
                  {img.url ? (
                    <img
                      src={img.url}
                      alt={img.altText ?? ""}
                      className="size-full object-cover"
                    />
                  ) : (
                    <div className="flex size-full items-center justify-center">
                      <Flower className="size-6 text-muted-foreground" />
                    </div>
                  )}
                </div>
                {img.isPrimary && (
                  <Badge variant="brand" className="absolute left-2 top-2">
                    {t.products.primary}
                  </Badge>
                )}
                <div className="flex items-center justify-between gap-1 p-2">
                  {!img.isPrimary ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-7 px-2 text-xs"
                      onClick={() => void handleSetPrimary(img.id)}
                    >
                      <Star className="mr-1 size-3" />
                      {t.products.setPrimary}
                    </Button>
                  ) : (
                    <span />
                  )}
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-7 px-2 text-xs text-destructive hover:text-destructive"
                    onClick={() => void handleDelete(img.id)}
                  >
                    <Trash2 className="size-3" />
                    <span className="sr-only">{t.products.deleteImage}</span>
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}

        <div>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
            onChange={(e) => void handleFile(e)}
          />
          <Button
            type="button"
            variant="outline"
            disabled={uploading}
            onClick={() => fileInputRef.current?.click()}
          >
            {uploading ? (
              <Loader2 className="mr-2 size-4 animate-spin" />
            ) : (
              <Upload className="mr-2 size-4" />
            )}
            {uploading ? t.products.uploading : t.products.upload}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
