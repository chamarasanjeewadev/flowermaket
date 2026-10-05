import { Badge } from "@flowers/ui/components/badge";
import { useT } from "../i18n/react";

export type ModerationStatus = "pending" | "approved" | "blocked";

/** Admin review state of a product, as the supplier sees it. */
export function ModerationBadge({ status }: { status: ModerationStatus }) {
  const { t } = useT();
  const labels: Record<ModerationStatus, string> = {
    pending: t.products.moderationPending,
    approved: t.products.moderationApproved,
    blocked: t.products.moderationBlocked,
  };
  const variants: Record<ModerationStatus, "warning" | "success" | "destructive"> = {
    pending: "warning",
    approved: "success",
    blocked: "destructive",
  };
  return <Badge variant={variants[status]}>{labels[status]}</Badge>;
}

/** Explanatory notice for pending / blocked products (nothing when approved). */
export function ModerationNotice({
  status,
  note,
}: {
  status: ModerationStatus;
  note: string | null;
}) {
  const { t } = useT();
  if (status === "approved") return null;
  const blocked = status === "blocked";
  return (
    <div
      className={
        blocked
          ? "rounded-lg border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm"
          : "rounded-lg border border-warning/40 bg-warning/10 px-4 py-3 text-sm"
      }
    >
      <p>{blocked ? t.products.moderationBlockedNote : t.products.moderationPendingNote}</p>
      {note && (
        <p className="mt-1 font-medium">
          {t.products.moderationReason} {note}
        </p>
      )}
    </div>
  );
}
