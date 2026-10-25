import * as React from "react";
import { useRouter } from "@tanstack/react-router";
import { HandCoins, Smartphone, Sprout } from "lucide-react";
import { setLocale } from "../server/auth";
import { useT } from "../i18n/react";
import type { Locale } from "../i18n";

/** Large, thumb-friendly language switch — Sinhala is the default. */
function LanguageSwitch({ locale }: { locale: Locale }) {
  const router = useRouter();
  async function choose(next: Locale) {
    if (next === locale) return;
    await setLocale({ data: next });
    await router.invalidate();
  }
  const base =
    "min-h-9 rounded-full px-4 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";
  return (
    <div
      role="group"
      aria-label="Language"
      className="inline-flex rounded-full border border-border bg-card p-1 shadow-sm"
    >
      {(
        [
          ["si", "සිංහල"],
          ["en", "English"],
        ] as const
      ).map(([code, label]) => (
        <button
          key={code}
          type="button"
          aria-pressed={locale === code}
          onClick={() => void choose(code)}
          className={`${base} ${
            locale === code
              ? "bg-brand text-brand-foreground"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

/**
 * Shared sign-in / sign-up layout: a vivid garden panel on one side, the form
 * on the other. On phones the panel collapses to a short banner above the form.
 */
export function AuthShell({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  const { t, locale } = useT();
  const perks = [
    { icon: Sprout, label: t.auth.perk1 },
    { icon: Smartphone, label: t.auth.perk2 },
    { icon: HandCoins, label: t.auth.perk3 },
  ];

  return (
    <div className="flex min-h-dvh flex-col bg-background lg:flex-row">
      <aside className="relative isolate overflow-hidden bg-background lg:flex lg:w-[48%] lg:flex-col lg:justify-between">
        {/* Grower photo, fading into the cream canvas on the text side */}
        <img
          src="/hero-farmer.webp"
          alt=""
          className="absolute inset-x-0 bottom-0 -z-10 h-[46%] w-full object-cover object-[center_85%] lg:object-[center_40%] [mask-image:linear-gradient(to_bottom,transparent,#000_30%)] lg:h-[52%]"
        />
        <div className="flex min-h-[32rem] flex-col px-6 pb-14 pt-7 lg:min-h-dvh lg:justify-between lg:px-14 lg:py-12">
          <img src="/logo.png" alt="FlowerMarket.lk" className="h-12 w-auto self-start lg:h-16" />

          <div className="mt-5 max-w-[22rem] sm:max-w-xl lg:mt-0 lg:max-w-lg">
            <p className="text-lg font-bold leading-snug text-brand sm:text-xl lg:text-2xl">
              {t.auth.heroKicker}
            </p>
            <h1 className="mt-2 text-[1.6rem] font-black leading-[1.35] text-[#0f3d22] sm:text-4xl sm:leading-[1.3] lg:text-[2.75rem] lg:leading-[1.3]">
              {t.auth.heroTitle}
            </h1>
            <p className="mt-3 hidden max-w-sm text-lg font-medium leading-8 text-foreground sm:block">
              {t.auth.heroSub}
            </p>
          </div>

          <ul className="mt-6 hidden flex-col gap-3 lg:flex">
            {perks.map(({ icon: Icon, label }) => (
              <li
                key={label}
                className="flex w-fit items-center gap-3 rounded-full bg-card/90 py-2 pl-2 pr-5 text-base font-semibold text-foreground shadow-sm backdrop-blur-sm"
              >
                <span className="grid size-9 place-items-center rounded-full bg-brand text-brand-foreground">
                  <Icon className="size-5" />
                </span>
                {label}
              </li>
            ))}
          </ul>
        </div>
      </aside>

      <main className="relative -mt-8 flex flex-1 flex-col rounded-t-[2rem] border-t border-border bg-background px-5 pb-10 pt-6 sm:px-10 lg:mt-0 lg:rounded-none lg:px-16 lg:py-10">
        <div className="flex justify-end">
          <LanguageSwitch locale={locale} />
        </div>
        <div className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center py-6">
          <h2 className="text-2xl font-bold leading-snug text-foreground sm:text-3xl sm:leading-snug">
            {title}
          </h2>
          <p className="mt-2 text-base leading-7 text-muted-foreground">
            {subtitle}
          </p>
          <div className="mt-7">{children}</div>
        </div>
        <p className="text-center text-sm text-muted-foreground">
          {t.auth.needHelp}{" "}
          <a
            href="mailto:hi@flowermarket.lk"
            className="font-medium text-brand-ink underline underline-offset-4"
          >
            hi@flowermarket.lk
          </a>
        </p>
      </main>
    </div>
  );
}
