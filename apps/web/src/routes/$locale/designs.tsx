import { createFileRoute } from "@tanstack/react-router";
import { Link } from "@tanstack/react-router";
import { Sparkles } from "lucide-react";
import { Button } from "@flowers/ui/components/button";
import { type Locale } from "../../i18n";
import { getDict } from "../../i18n";
import { useT } from "../../i18n/react";
import { absoluteUrl, hreflangLinks } from "../../lib/site";
import { socialMeta } from "../../lib/seo";
import { listPublicGallery } from "../../server/gallery";

export const Route = createFileRoute("/$locale/designs")({
  loader: async () => {
    const items = await listPublicGallery();
    return { items };
  },
  head: ({ params }) => {
    const locale = params.locale as Locale;
    const dict = getDict(locale);
    const title = dict.gallery.metaTitle;
    const description = dict.gallery.metaDescription;
    const pageUrl = absoluteUrl(`/${locale}/designs`);
    return {
      meta: [
        { title },
        { name: "description", content: description },
        ...socialMeta({ title, description, url: pageUrl, locale }),
      ],
      links: hreflangLinks("/designs", locale),
    };
  },
  component: GalleryPage,
});

interface FlowerItem {
  nameEn: string;
  qty: number;
}

function parseFlowers(json: string | null): FlowerItem[] {
  if (!json) return [];
  try {
    return JSON.parse(json) as FlowerItem[];
  } catch {
    return [];
  }
}

function GalleryPage() {
  const { items } = Route.useLoaderData();
  const { t, locale } = useT();

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <header className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="font-display text-4xl sm:text-5xl">{t.gallery.title}</h1>
          <p className="mt-2 text-sm text-foreground/70 sm:text-base">{t.gallery.subtitle}</p>
        </div>
        <Button asChild>
          <Link to="/$locale/design" params={{ locale }}>
            <Sparkles className="size-4" aria-hidden="true" />
            {t.gallery.designYours}
          </Link>
        </Button>
      </header>

      {items.length === 0 ? (
        <div className="flex flex-col items-center gap-4 rounded-xl border border-dashed border-border py-20 text-center">
          <Sparkles className="size-10 text-muted-foreground/30" />
          <p className="text-muted-foreground">{t.gallery.empty}</p>
          <Button asChild variant="outline">
            <Link to="/$locale/design" params={{ locale }}>
              {t.gallery.viewDesign}
            </Link>
          </Button>
        </div>
      ) : (
        <div className="columns-2 gap-4 sm:columns-3 lg:columns-4">
          {items.map((item) => {
            const flowers = parseFlowers(item.flowersJson);
            return (
              <div
                key={item.id}
                className="mb-4 break-inside-avoid overflow-hidden rounded-xl border border-border bg-card"
              >
                <img
                  src={item.imagePublicUrl!}
                  alt={
                    flowers.length > 0
                      ? flowers.map((f) => `${f.qty}× ${f.nameEn}`).join(", ")
                      : "AI-generated bouquet"
                  }
                  className="w-full object-cover"
                  loading="lazy"
                />
                {flowers.length > 0 && (
                  <div className="px-3 py-2">
                    <p className="truncate text-xs text-muted-foreground">
                      {flowers.map((f) => f.nameEn).join(" · ")}
                    </p>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <div className="mt-12 rounded-xl bg-sage px-6 py-8 text-center sm:px-10">
        <h2 className="font-display text-2xl">{t.gallery.designYours}</h2>
        <p className="mt-2 text-sm text-foreground/70">{t.design.subtitle}</p>
        <Button asChild className="mt-4">
          <Link to="/$locale/design" params={{ locale }}>
            <Sparkles className="size-4" aria-hidden="true" />
            {t.gallery.viewDesign}
          </Link>
        </Button>
      </div>
    </div>
  );
}
