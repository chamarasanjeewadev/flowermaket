import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@flowers/ui/components/card";
import { listCategoriesFn, createProductFn } from "../server/products";
import { ProductForm } from "../components/ProductForm";
import { toast } from "../components/toaster";
import { useT } from "../i18n/react";

export const Route = createFileRoute("/products/new")({
  loader: async () => ({ categories: await listCategoriesFn() }),
  component: NewProductPage,
});

function NewProductPage() {
  const { t } = useT();
  const router = useRouter();
  const { categories } = Route.useLoaderData();

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
              if (result.ok) {
                toast.success(t.products.created);
                await router.navigate({
                  to: "/products/$productId",
                  params: { productId: result.data.id },
                });
                return { ok: true };
              }
              return { ok: false, message: result.message };
            }}
          />
        </CardContent>
      </Card>
    </div>
  );
}
