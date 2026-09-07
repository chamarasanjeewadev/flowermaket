import { useT } from "../i18n/react";

export function Footer() {
  const { t, f } = useT();
  return (
    <footer className="mt-4 bg-sage-deep text-background">
      <div className="mx-auto max-w-6xl px-4 py-10">
        <div className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-end">
          <div>
            <p className="font-display text-2xl text-background">
              FlowerMarket<span className="text-butter">.lk</span>
            </p>
            <p className="mt-2 max-w-xs text-sm text-background/70">
              {t.footer.tagline}
            </p>
          </div>
          <div className="text-left sm:text-right">
            <p className="text-xs text-background/70">
              {f(t.footer.copyright, { year: new Date().getFullYear() })}
            </p>
            <p className="mt-1 text-xs text-background/60">{t.footer.strip}</p>
          </div>
        </div>
      </div>
    </footer>
  );
}
