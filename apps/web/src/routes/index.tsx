import { createFileRoute, redirect } from "@tanstack/react-router";
import { detectLocale } from "../server/locale";

/**
 * `/` — redirect to `/{locale}/` using:
 *  1. `locale` cookie
 *  2. Accept-Language header (si if it lists si before en)
 *  3. Default: en
 */
export const Route = createFileRoute("/")({
  beforeLoad: async () => {
    const locale = await detectLocale();
    throw redirect({ to: "/$locale", params: { locale } });
  },
});
