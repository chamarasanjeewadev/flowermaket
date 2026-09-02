import { useT } from "../i18n/react";

export function Footer() {
  const { t, f } = useT();
  return (
    <footer className="border-t bg-muted/30">
      <div className="mx-auto max-w-6xl px-4 py-8">
        <div className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
          <div>
            <p className="text-lg font-bold tracking-tight">
              <span className="text-primary">Flowers</span>
              <span className="text-muted-foreground">.lk</span>
            </p>
            <p className="mt-1 text-sm text-muted-foreground">{t.footer.tagline}</p>
          </div>
          <div className="text-right">
            <p className="text-xs text-muted-foreground">
              {f(t.footer.copyright, { year: new Date().getFullYear() })}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">{t.footer.strip}</p>
          </div>
        </div>
      </div>
    </footer>
  );
}
