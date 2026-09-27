import { createFileRoute, Link } from "@tanstack/react-router";
import { Badge } from "@flowers/ui/components/badge";
import { EmptyState } from "@flowers/ui/components/empty-state";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@flowers/ui/components/table";
import { Inbox } from "lucide-react";
import { listRfqsFn } from "../server/rfqs";
import { useT } from "../i18n/react";

export const Route = createFileRoute("/rfqs/")({
  loader: async () => ({ rfqs: await listRfqsFn() }),
  component: RfqInboxPage,
});

type RfqStatus =
  | "sent"
  | "viewed"
  | "quoted"
  | "declined"
  | "expired"
  | "awarded"
  | "closed";

function RfqStatusBadge({ status }: { status: string }) {
  const { t } = useT();

  const labels: Record<RfqStatus, string> = {
    sent: t.rfqs.statusSent,
    viewed: t.rfqs.statusViewed,
    quoted: t.rfqs.statusQuoted,
    declined: t.rfqs.statusDeclined,
    expired: t.rfqs.statusExpired,
    awarded: t.rfqs.statusAwarded,
    closed: t.rfqs.statusClosed,
  };

  const variants: Record<
    RfqStatus,
    "secondary" | "warning" | "success" | "outline" | "destructive"
  > = {
    sent: "warning",
    viewed: "secondary",
    quoted: "success",
    declined: "outline",
    expired: "outline",
    awarded: "success",
    closed: "outline",
  };

  const key = status as RfqStatus;
  const label = labels[key] ?? status;
  const variant = variants[key] ?? "secondary";

  return <Badge variant={variant}>{label}</Badge>;
}

function formatDate(date: Date | null | string): string {
  if (!date) return "—";
  const d = date instanceof Date ? date : new Date(date);
  return d.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function RfqInboxPage() {
  const { t } = useT();
  const { rfqs } = Route.useLoaderData();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl sm:text-4xl">{t.rfqs.title}</h1>
        <p className="mt-1 max-w-xl text-sm text-muted-foreground">
          {t.rfqs.subtitle}
        </p>
      </div>

      {rfqs.length === 0 ? (
        <EmptyState
          icon={<Inbox />}
          title={t.rfqs.empty}
          description={t.rfqs.emptyDescription}
        />
      ) : (
        <div className="rounded-xl border border-border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t.rfqs.colOrder}</TableHead>
                <TableHead>{t.rfqs.colItems}</TableHead>
                <TableHead>{t.rfqs.colStatus}</TableHead>
                <TableHead>{t.rfqs.colSent}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rfqs.map((rfq) => (
                <TableRow key={rfq.id}>
                  <TableCell>
                    <Link
                      to="/rfqs/$rfqId"
                      params={{ rfqId: rfq.id }}
                      className="font-medium text-foreground hover:text-brand hover:underline"
                    >
                      {rfq.orderNo}
                    </Link>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {rfq.firstItemDescription
                      ? rfq.itemCount > 1
                        ? `${rfq.firstItemDescription} +${rfq.itemCount - 1} more`
                        : rfq.firstItemDescription
                      : `${rfq.itemCount} item${rfq.itemCount !== 1 ? "s" : ""}`}
                  </TableCell>
                  <TableCell>
                    <RfqStatusBadge status={rfq.status} />
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {formatDate(rfq.sentAt)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
