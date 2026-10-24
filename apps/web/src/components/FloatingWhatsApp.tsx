import {
  buildEnquiryText,
  buildWhatsappUrl,
  WHATSAPP_NUMBER,
} from "@flowers/integrations";
import { useRouterState } from "@tanstack/react-router";
import { useT } from "../i18n/react";
import { useEnquiry } from "../lib/enquiry";
import { siteUrl } from "../lib/site";
import { track } from "../lib/analytics";
import { WhatsAppGlyph } from "./WhatsAppGlyph";

/**
 * Persistent bottom-right WhatsApp button. Opens a chat with the marketplace
 * number, pre-filled with a greeting plus whatever is in the enquiry list.
 */
export function FloatingWhatsApp() {
  const { t, locale } = useT();
  const { items, count, hydrated } = useEnquiry();
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  });

  // The quotation page has its own contextual WhatsApp order action.
  if (pathname.endsWith("/fresh-flower-quotation-generator")) return null;

  const text = buildEnquiryText({
    items: hydrated ? items : [],
    locale,
    siteUrl: siteUrl(),
  });
  const href = buildWhatsappUrl(text, WHATSAPP_NUMBER);

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      onClick={() => track.whatsappLead("floating_button", hydrated ? items : [])}
      aria-label={t.enquiry.floatingLabel}
      className="fixed bottom-4 right-4 z-50 flex size-12 sm:bottom-5 sm:right-5 sm:size-14 items-center justify-center rounded-full bg-[#25D366] text-white shadow-float transition-transform hover:scale-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#25D366] focus-visible:ring-offset-2"
    >
      <WhatsAppGlyph className="size-6 sm:size-7" />
      {hydrated && count > 0 && (
        <span className="absolute -right-1 -top-1 flex min-w-5 items-center justify-center rounded-full bg-brand px-1.5 text-xs font-semibold text-background">
          {count}
        </span>
      )}
      <span className="sr-only">{t.enquiry.floatingLabel}</span>
    </a>
  );
}
