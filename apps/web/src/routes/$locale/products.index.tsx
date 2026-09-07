import { createFileRoute } from "@tanstack/react-router";
import { DISTRICTS } from "@flowers/api/constants";
import {
  Pagination,
  PaginationButton,
  PaginationContent,
  PaginationItem,
} from "@flowers/ui/components/pagination";
import { ChevronLeft, ChevronRight } from "lucide-react";
import {
  ALL,
  CatalogFilters,
  type CatalogFilterPatch,
} from "../../components/catalog/CatalogFilters";
import {
  ProductGrid,
  ProductGridSkeleton,
} from "../../components/catalog/ProductGrid";
import type { Locale } from "../../i18n";
import { useT } from "../../i18n/react";
import { hreflangLinks } from "../../lib/site";
import { getCategoriesWithCounts, listProducts } from "../../server/catalog";

interface ProductsSearch {
  category?: string;
  type?: "retail" | "wholesale";
  district?: string;
  q?: string;
  page?: number;
}

export const Route = createFileRoute("/$locale/products/")({
  validateSearch: (search: Record<string, unknown>): ProductsSearch => {
    const pageRaw =
      typeof search.page === "number"
        ? search.page
        : typeof search.page === "string"
          ? Number(search.page)
          : NaN;
    return {
      category:
        typeof search.category === "string" ? search.category : undefined,
      type:
        search.type === "retail" || search.type === "wholesale"
          ? search.type
          : undefined,
      district:
        typeof search.district === "string" ? search.district : undefined,
      q:
        typeof search.q === "string" && search.q.trim()
          ? search.q.trim()
          : undefined,
      page: Number.isFinite(pageRaw) && pageRaw > 1 ? pageRaw : undefined,
    };
  },
  loaderDeps: ({ search }) => search,
  loader: async ({ deps }) => ({
    result: await listProducts({
      data: {
        category: deps.category,
        type: deps.type,
        district: deps.district,
        q: deps.q,
        page: deps.page,
      },
    }),
    categories: await getCategoriesWithCounts(),
  }),
  head: ({ params }) => {
    const locale = params.locale as Locale;
    return {
      meta:
        locale === "si"
          ? [
              { title: "මල් බ්‍රවුස් කරන්න | FlowerMarket.lk" },
              {
                name: "description",
                content:
                  "සිල්ලර මල් කළඹ හා තොග මල් කඳ, ප්‍රාදේශීය ගොවීන් හා මල් සාප්පුවලින් කෙලින්ම.",
              },
            ]
          : [
              { title: "Browse flowers — retail & wholesale | FlowerMarket.lk" },
              {
                name: "description",
                content:
                  "Browse retail bouquets and wholesale flower stems direct from local Sri Lankan growers and florists.",
              },
            ],
      links: hreflangLinks("/products", locale),
    };
  },
  pendingComponent: PendingBrowse,
  component: BrowsePage,
});

function BrowseHeader() {
  const { t } = useT();
  return (
    <div className="mb-8">
      <h1 className="font-display text-4xl sm:text-5xl">{t.catalog.browseTitle}</h1>
      <p className="mt-2 max-w-xl text-sm text-muted-foreground">
        {t.catalog.browseSub}
      </p>
    </div>
  );
}

function PendingBrowse() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <BrowseHeader />
      <ProductGridSkeleton count={12} />
    </div>
  );
}

function BrowsePage() {
  const { result, categories } = Route.useLoaderData();
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const { t, f } = useT();

  function applyPatch(patch: CatalogFilterPatch) {
    navigate({
      search: (prev: ProductsSearch): ProductsSearch => {
        const next: ProductsSearch = { ...prev };
        if ("category" in patch) {
          next.category =
            patch.category && patch.category !== ALL
              ? patch.category
              : undefined;
        }
        if ("district" in patch) {
          next.district =
            patch.district && patch.district !== ALL
              ? patch.district
              : undefined;
        }
        if ("type" in patch) {
          next.type =
            patch.type === "retail" || patch.type === "wholesale"
              ? patch.type
              : undefined;
        }
        if ("q" in patch) {
          next.q = patch.q && patch.q.trim() ? patch.q.trim() : undefined;
        }
        next.page = undefined;
        return next;
      },
    });
  }

  function goToPage(page: number) {
    navigate({
      search: (prev: ProductsSearch): ProductsSearch => ({
        ...prev,
        page: page > 1 ? page : undefined,
      }),
    });
  }

  const totalPages = Math.max(1, Math.ceil(result.total / result.pageSize));
  const currentPage = result.page;

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <BrowseHeader />

      <div className="mb-6">
        <CatalogFilters
          categories={categories}
          districts={[...DISTRICTS]}
          value={{
            category: search.category,
            type: search.type,
            district: search.district,
            q: search.q,
          }}
          onChange={applyPatch}
        />
      </div>

      <p className="mb-4 text-sm text-muted-foreground">
        {f(t.catalog.resultsCount, { count: result.total })}
      </p>

      <ProductGrid products={result.items} />

      {totalPages > 1 && (
        <Pagination className="mt-8">
          <PaginationContent>
            <PaginationItem>
              <PaginationButton
                size="default"
                className="gap-1 pl-2.5"
                disabled={currentPage <= 1}
                onClick={() => goToPage(currentPage - 1)}
              >
                <ChevronLeft className="size-4" />
                <span>{currentPage}/{totalPages}</span>
              </PaginationButton>
            </PaginationItem>
            <PaginationItem>
              <PaginationButton
                size="default"
                className="gap-1 pr-2.5"
                disabled={currentPage >= totalPages}
                onClick={() => goToPage(currentPage + 1)}
              >
                <ChevronRight className="size-4" />
              </PaginationButton>
            </PaginationItem>
          </PaginationContent>
        </Pagination>
      )}
    </div>
  );
}
