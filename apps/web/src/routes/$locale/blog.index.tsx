import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowUpRight } from "lucide-react";
import type { Locale } from "../../i18n";
import { useT } from "../../i18n/react";
import { absoluteUrl, hreflangLinks } from "../../lib/site";
import { jsonLdScript, SITE_NAME } from "../../lib/seo";
import { formatPostDate } from "../../lib/date";
import { listPosts } from "../../content/posts";

export const Route = createFileRoute("/$locale/blog/")({
  head: ({ params }) => {
    const locale = params.locale as Locale;
    const posts = listPosts();
    const title =
      locale === "si"
        ? "මල් මාර්ගෝපදේශ සහ උපදෙස් | FlowerMarket.lk"
        : "Flower Guides & Tips for Sri Lanka | FlowerMarket.lk";
    const description =
      locale === "si"
        ? "ශ්‍රී ලංකාව සඳහා ප්‍රායෝගික මල් මාර්ගෝපදේශ — විවාහ මල්, මල් නැවුම්ව තබා ගැනීම, තොග මිලදී ගැනීම සහ පොහෝ දින මල්."
        : "Practical flower guides for Sri Lanka — wedding flower planning, keeping cut flowers fresh, buying wholesale, and flowers for Poya and temple offerings.";
    const blogJsonLd = {
      "@context": "https://schema.org",
      "@type": "Blog",
      name: `${SITE_NAME} Guides`,
      url: absoluteUrl(`/${locale}/blog`),
      inLanguage: locale,
      blogPost: posts.map((p) => ({
        "@type": "BlogPosting",
        headline: p.title,
        url: absoluteUrl(`/${locale}/blog/${p.slug}`),
        datePublished: p.datePublished,
        dateModified: p.dateModified ?? p.datePublished,
      })),
    };
    return {
      meta: [
        { title },
        { name: "description", content: description },
        { property: "og:title", content: title },
        { property: "og:description", content: description },
      ],
      links: hreflangLinks("/blog", locale),
      scripts: [jsonLdScript(blogJsonLd)],
    };
  },
  component: BlogIndexPage,
});

function BlogIndexPage() {
  const { locale, t } = useT();
  const posts = listPosts();

  return (
    <div className="mx-auto max-w-4xl px-4 py-10">
      <header className="mb-10 max-w-2xl">
        <h1 className="font-display text-4xl sm:text-5xl">{t.blog.title}</h1>
        <p className="mt-3 text-base text-muted-foreground">{t.blog.subtitle}</p>
      </header>

      <ul className="flex flex-col divide-y divide-border">
        {posts.map((post) => (
          <li key={post.slug}>
            <Link
              to="/$locale/blog/$slug"
              params={{ locale, slug: post.slug }}
              className="group grid gap-2 py-6 focus-visible:outline-none sm:grid-cols-[1fr_auto] sm:items-start sm:gap-6"
            >
              <div>
                <div className="flex flex-wrap items-center gap-2 text-xs font-medium text-muted-foreground">
                  <span className="rounded-full bg-accent px-2.5 py-0.5 text-accent-foreground">
                    {post.tag}
                  </span>
                  <span>{formatPostDate(post.datePublished, locale)}</span>
                  <span aria-hidden="true">·</span>
                  <span>{t.blog.readTime.replace("{min}", String(post.readingMinutes))}</span>
                </div>
                <h2 className="mt-2 font-display text-2xl leading-tight transition-colors group-hover:text-brand sm:text-3xl">
                  {post.title}
                </h2>
                <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
                  {post.excerpt}
                </p>
              </div>
              <span className="mt-1 inline-flex size-10 shrink-0 items-center justify-center rounded-full border border-foreground/20 text-foreground transition-colors group-hover:bg-foreground group-hover:text-background">
                <ArrowUpRight className="size-4" aria-hidden="true" />
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
