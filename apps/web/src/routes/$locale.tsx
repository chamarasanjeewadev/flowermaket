import { createFileRoute, notFound, Outlet } from "@tanstack/react-router";
import { I18nProvider } from "../i18n/react";
import { isLocale, type Locale } from "../i18n";

export const Route = createFileRoute("/$locale")({
  beforeLoad: ({ params }) => {
    if (!isLocale(params.locale)) {
      throw notFound();
    }
    return { locale: params.locale as Locale };
  },
  component: LocaleLayout,
});

function LocaleLayout() {
  const { locale } = Route.useRouteContext();
  return (
    <I18nProvider locale={locale}>
      <Outlet />
    </I18nProvider>
  );
}
