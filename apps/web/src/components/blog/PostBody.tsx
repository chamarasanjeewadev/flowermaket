import * as React from "react";
import type { PostBlock } from "../../content/posts";
import type { Locale } from "../../i18n";

/**
 * Renders a post's structured body as semantic HTML. Inline links written as
 * `[label](/path)` become locale-prefixed internal links (crawlable) or plain
 * external links.
 */

const LINK_RE = /\[([^\]]+)\]\(([^)]+)\)/g;

/** Parse `[label](href)` spans within a string into React nodes. */
function renderInline(text: string, locale: Locale): React.ReactNode[] {
  const nodes: React.ReactNode[] = [];
  let lastIndex = 0;
  let key = 0;
  for (const match of text.matchAll(LINK_RE)) {
    const [full, label, href] = match;
    const start = match.index ?? 0;
    if (start > lastIndex) nodes.push(text.slice(lastIndex, start));
    const isInternal = href!.startsWith("/");
    const linkClass =
      "font-medium text-brand underline underline-offset-2 hover:no-underline";
    if (isInternal) {
      nodes.push(
        <a key={key++} href={`/${locale}${href}`} className={linkClass}>
          {label}
        </a>,
      );
    } else {
      nodes.push(
        <a
          key={key++}
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className={linkClass}
        >
          {label}
        </a>,
      );
    }
    lastIndex = start + full!.length;
  }
  if (lastIndex < text.length) nodes.push(text.slice(lastIndex));
  return nodes;
}

export function PostBody({
  blocks,
  locale,
}: {
  blocks: readonly PostBlock[];
  locale: Locale;
}) {
  return (
    <div className="flex flex-col gap-5">
      {blocks.map((block, i) => {
        switch (block.kind) {
          case "h2":
            return (
              <h2
                key={i}
                className="mt-4 font-display text-2xl sm:text-3xl"
              >
                {block.text}
              </h2>
            );
          case "h3":
            return (
              <h3 key={i} className="mt-2 font-display text-xl sm:text-2xl">
                {block.text}
              </h3>
            );
          case "p":
            return (
              <p key={i} className="text-base leading-relaxed text-foreground">
                {renderInline(block.text, locale)}
              </p>
            );
          case "ul":
            return (
              <ul
                key={i}
                className="ml-5 flex list-disc flex-col gap-2 text-base leading-relaxed text-foreground marker:text-brand"
              >
                {block.items.map((item, j) => (
                  <li key={j}>{renderInline(item, locale)}</li>
                ))}
              </ul>
            );
          case "ol":
            return (
              <ol
                key={i}
                className="ml-5 flex list-decimal flex-col gap-2 text-base leading-relaxed text-foreground marker:text-brand marker:font-semibold"
              >
                {block.items.map((item, j) => (
                  <li key={j}>{renderInline(item, locale)}</li>
                ))}
              </ol>
            );
          case "quote":
            return (
              <blockquote
                key={i}
                className="border-l-4 border-brand bg-accent/40 py-3 pl-5 pr-4 font-display text-lg italic text-foreground"
              >
                {block.text}
              </blockquote>
            );
          default:
            return null;
        }
      })}
    </div>
  );
}
