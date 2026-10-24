import { Link } from "@tanstack/react-router";
import { useT } from "../i18n/react";
import {
  CONTACT_EMAIL,
  CONTACT_WHATSAPP_DISPLAY,
  CONTACT_WHATSAPP_URL,
} from "../lib/site";
import { track } from "../lib/analytics";
import { WhatsAppGlyph } from "./WhatsAppGlyph";

const SISTER_PRODUCTS = [
  { name: "BabyJourney", url: "https://babyjourney.lk" },
  { name: "HelaVoice", url: "https://helavoice.lk" },
  { name: "FindAJob", url: "https://findajob.lk" },
] as const;

export function Footer() {
  const { t, f, locale } = useT();
  const linkClass =
    "text-[13px] text-muted-foreground transition-colors hover:text-foreground";
  return (
    <footer className="border-t border-border/70 bg-stage text-foreground">
      <div className="mx-auto max-w-6xl px-4 py-10">
        <div className="flex flex-col gap-8 sm:flex-row sm:justify-between">
          <div>
            <p className="font-display text-2xl">
              FlowerMarket<span className="text-brand">.lk</span>
            </p>
            <p className="mt-2 max-w-xs text-[13px] leading-relaxed text-muted-foreground">
              {t.footer.tagline}
            </p>
          </div>
          <nav
            aria-label={t.footer.explore}
            className="flex flex-col gap-2 sm:items-end"
          >
            <p className="text-[13px] font-semibold text-foreground">
              {t.footer.explore}
            </p>
            <Link
              to="/$locale/products"
              params={{ locale }}
              className={linkClass}
            >
              {t.nav.browse}
            </Link>
            <Link to="/$locale/shops" params={{ locale }} className={linkClass}>
              {t.nav.shops}
            </Link>
            <Link
              to="/$locale/fresh-flowers-near-me"
              params={{ locale }}
              className={linkClass}
            >
              {t.nav.nearMe}
            </Link>
            <Link
              to="/$locale/products"
              params={{ locale }}
              search={{ type: "wholesale" }}
              className={linkClass}
            >
              {t.nav.wholesale}
            </Link>
            <Link
              to="/$locale/fresh-flower-quotation-generator"
              params={{ locale }}
              search={{ q: undefined }}
              className={linkClass}
            >
              {t.nav.quotation}
            </Link>
            <Link to="/$locale/blog" params={{ locale }} className={linkClass}>
              {t.footer.guides}
            </Link>
          </nav>
          <nav
            aria-label={t.footer.contact}
            className="flex flex-col gap-2 sm:items-end"
          >
            <p className="text-[13px] font-semibold text-foreground">
              {t.footer.contact}
            </p>
            <a
              href={CONTACT_WHATSAPP_URL}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => track.whatsappLead("footer")}
              className="inline-flex items-center gap-1.5 text-[13px] font-medium text-foreground transition-colors hover:text-[#128C7E]"
            >
              <WhatsAppGlyph className="size-4 text-[#25D366]" />
              {CONTACT_WHATSAPP_DISPLAY}
            </a>
            <p className="text-xs text-muted-foreground">
              {t.footer.whatsappOnly}
            </p>
            <a href={`mailto:${CONTACT_EMAIL}`} className={linkClass}>
              {CONTACT_EMAIL}
            </a>
          </nav>
          <nav
            aria-label={t.footer.moreFromGritTech}
            className="flex flex-col gap-2 sm:items-end"
          >
            <p className="text-[13px] font-semibold text-foreground">
              {t.footer.moreFromGritTech}
            </p>
            {SISTER_PRODUCTS.map((p) => (
              <a
                key={p.name}
                href={p.url}
                target="_blank"
                rel="noopener"
                className={linkClass}
              >
                {p.name}
              </a>
            ))}
          </nav>
        </div>
        <div className="mt-8 flex flex-col gap-1 border-t border-border pt-6 text-left">
          <p className="text-xs text-muted-foreground">
            {f(t.footer.copyright, { year: new Date().getFullYear() })}
          </p>
          <p className="text-xs text-muted-foreground">{t.footer.strip}</p>
          <p className="text-xs text-muted-foreground">
            {t.footer.builtBy}{" "}
            <a
              href="https://grittech.lk"
              target="_blank"
              rel="noopener"
              className={linkClass}
            >
              GritTech
            </a>
          </p>
        </div>
      </div>
    </footer>
  );
}
