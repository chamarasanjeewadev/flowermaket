import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import type { Locale } from "../../i18n";
import { useT } from "../../i18n/react";
import { absoluteUrl, hreflangLinks } from "../../lib/site";
import {
  breadcrumbJsonLd,
  jsonLdScript,
  localePath,
  SITE_NAME,
} from "../../lib/seo";
import { formatPostDate } from "../../lib/date";
import { PostBody } from "../../components/blog/PostBody";
import { getPost } from "../../content/posts";

export const Route = createFileRoute("/$locale/blog/$slug")({
  loader: ({ params }) => {
    const post = getPost(params.slug);
    if (!post) throw notFound();
    return { post };
  },
  head: ({ loaderData, params }) => {
    const locale = params.locale as Locale;
    const post = loaderData?.post;
    if (!post) {
      return { links: hreflangLinks(`/blog/${params.slug}`, locale) };
    }
    const url = absoluteUrl(`/${locale}/blog/${post.slug}`);
    const blogPosting = {
      "@context": "https://schema.org",
      "@type": "BlogPosting",
      headline: post.title,
      description: post.description,
      datePublished: post.datePublished,
      dateModified: post.dateModified ?? post.datePublished,
      mainEntityOfPage: { "@type": "WebPage", "@id": url },
      image: absoluteUrl("/og-image.png"),
      inLanguage: locale,
      keywords: [post.primaryKeyword, ...post.secondaryKeywords].join(", "),
      author: { "@type": "Organization", name: SITE_NAME },
      publisher: {
        "@type": "Organization",
        name: SITE_NAME,
        logo: { "@type": "ImageObject", url: absoluteUrl("/logo.png") },
      },
    };
    const breadcrumbs = breadcrumbJsonLd([
      { name: "Home", path: localePath(locale, "/") },
      { name: "Guides", path: localePath(locale, "/blog") },
      { name: post.title, path: localePath(locale, `/blog/${post.slug}`) },
    ]);
    return {
      meta: [
        { title: `${post.title} | FlowerMarket.lk` },
        { name: "description", content: post.description },
        { property: "og:type", content: "article" },
        { property: "og:title", content: post.title },
        { property: "og:description", content: post.description },
        { property: "og:url", content: url },
        { property: "og:image", content: absoluteUrl("/og-image.png") },
        { property: "article:published_time", content: post.datePublished },
      ],
      links: hreflangLinks(`/blog/${post.slug}`, locale),
      scripts: [jsonLdScript(blogPosting), jsonLdScript(breadcrumbs)],
    };
  },
  component: BlogPostPage,
});

function BlogPostPage() {
  const { post } = Route.useLoaderData();
  const { locale, t } = useT();

  return (
    <article className="mx-auto max-w-3xl px-4 py-10">
      <nav className="mb-6 text-sm" aria-label="Breadcrumb">
        <Link
          to="/$locale/blog"
          params={{ locale }}
          className="inline-flex items-center gap-1.5 text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" aria-hidden="true" />
          {t.blog.backToGuides}
        </Link>
      </nav>

      <header className="mb-8">
        <div className="flex flex-wrap items-center gap-2 text-xs font-medium text-muted-foreground">
          <span className="rounded-full bg-accent px-2.5 py-0.5 text-accent-foreground">
            {post.tag}
          </span>
          <span>{formatPostDate(post.datePublished, locale)}</span>
          <span aria-hidden="true">·</span>
          <span>
            {t.blog.readTime.replace("{min}", String(post.readingMinutes))}
          </span>
        </div>
        <h1 className="mt-3 font-display text-4xl leading-tight sm:text-5xl">
          {post.title}
        </h1>
        <p className="mt-4 text-lg leading-relaxed text-muted-foreground">
          {post.excerpt}
        </p>
      </header>

      <PostBody blocks={post.body} locale={locale} />

      <footer className="mt-12 rounded-lg bg-sage px-6 py-8 text-center">
        <p className="font-display text-2xl">{t.blog.ctaTitle}</p>
        <p className="mx-auto mt-2 max-w-md text-sm text-foreground/70">
          {t.blog.ctaBody}
        </p>
        <Link
          to="/$locale/products"
          params={{ locale }}
          className="mt-5 inline-flex items-center justify-center rounded-full bg-foreground px-6 py-2.5 text-sm font-medium text-background transition-opacity hover:opacity-90"
        >
          {t.blog.ctaButton}
        </Link>
      </footer>
    </article>
  );
}
