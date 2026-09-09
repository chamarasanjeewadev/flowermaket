import { Link } from "@tanstack/react-router";
import { useT } from "../i18n/react";

export function Footer() {
  const { t, f, locale } = useT();
  const linkClass =
    "text-sm text-background/70 transition-colors hover:text-background";
  return (
    <footer className="mt-4 bg-sage-deep text-background">
      <div className="mx-auto max-w-6xl px-4 py-10">
        <div className="flex flex-col gap-8 sm:flex-row sm:justify-between">
          <div>
            <p className="font-display text-2xl text-background">
              FlowerMarket<span className="text-butter">.lk</span>
            </p>
            <p className="mt-2 max-w-xs text-sm text-background/70">
              {t.footer.tagline}
            </p>
          </div>
          <nav
            aria-label={t.footer.explore}
            className="flex flex-col gap-2 sm:items-end"
          >
            <p className="text-xs font-semibold uppercase tracking-wide text-background/50">
              {t.footer.explore}
            </p>
            <Link
              to="/$locale/products"
              params={{ locale }}
              className={linkClass}
            >
              {t.nav.browse}
            </Link>
            <Link
              to="/$locale/products"
              params={{ locale }}
              search={{ type: "wholesale" }}
              className={linkClass}
            >
              {t.nav.wholesale}
            </Link>
            <Link to="/$locale/blog" params={{ locale }} className={linkClass}>
              {t.footer.guides}
            </Link>
          </nav>
        </div>
        <div className="mt-8 flex flex-col gap-1 border-t border-background/15 pt-6 text-left">
          <p className="text-xs text-background/70">
            {f(t.footer.copyright, { year: new Date().getFullYear() })}
          </p>
          <p className="text-xs text-background/60">{t.footer.strip}</p>
        </div>
      </div>
    </footer>
  );
}
