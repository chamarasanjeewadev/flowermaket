import * as React from "react";
import { Check, Plus } from "lucide-react";
import { cn } from "@flowers/ui/lib/utils";
import type { EnquiryListingType } from "@flowers/integrations";
import { useT } from "../../i18n/react";
import { useEnquiry } from "../../lib/enquiry";

/** Minimal product shape needed to add a line to the enquiry list. */
export interface EnquiryProductInput {
  id: string;
  slug: string;
  nameEn: string;
  nameSi: string | null;
  price: number;
  listingType: EnquiryListingType;
}

/**
 * Adds a product to the WhatsApp enquiry list. Used inside the product card
 * (whose whole surface is a link) so it stops event propagation, and on the
 * product detail page via the `detail` variant.
 */
export function AddToEnquiryButton({
  product,
  variant = "card",
  className,
}: {
  product: EnquiryProductInput;
  variant?: "card" | "detail";
  className?: string;
}) {
  const { t } = useT();
  const { add, has, hydrated } = useEnquiry();
  const inList = hydrated && has(product.id);

  function handleClick(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    add(product);
  }

  const label = inList ? t.enquiry.inEnquiry : t.enquiry.addToEnquiry;
  const Icon = inList ? Check : Plus;

  const base =
    "inline-flex items-center justify-center gap-1.5 font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";
  const byVariant =
    variant === "detail"
      ? "rounded-full px-6 py-3 text-sm"
      : "rounded-full px-3 py-1.5 text-xs";
  const byState = inList
    ? "border border-brand/40 bg-brand/10 text-brand"
    : variant === "detail"
      ? "bg-foreground text-background hover:opacity-90"
      : "border border-border bg-background text-foreground hover:border-brand/50";

  return (
    <button
      type="button"
      onClick={handleClick}
      aria-pressed={inList}
      className={cn(base, byVariant, byState, className)}
    >
      <Icon className={variant === "detail" ? "size-4" : "size-3.5"} aria-hidden="true" />
      {label}
    </button>
  );
}
