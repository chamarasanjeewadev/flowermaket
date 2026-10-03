import { createFileRoute } from "@tanstack/react-router";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@flowers/ui/components/table";
import { Sparkles } from "lucide-react";
import { listBouquetUsageFn } from "../server/bouquet-usage";

export const Route = createFileRoute("/bouquet-usage")({
  loader: async () => {
    const rows = await listBouquetUsageFn();
    return { rows };
  },
  component: BouquetUsagePage,
});

function BouquetUsagePage() {
  const { rows } = Route.useLoaderData();

  const totalToday = rows.filter(
    (r) => new Date(r.createdAt).getTime() > Date.now() - 24 * 60 * 60 * 1000,
  ).length;

  const anonCount = rows.filter((r) => !r.userId).length;
  const authCount = rows.filter((r) => !!r.userId).length;

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="font-display text-3xl">Bouquet AI Usage</h1>
        <p className="text-sm text-muted-foreground">
          Last 200 AI bouquet generations — newest first.
        </p>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <StatCard label="Total (all time)" value={rows.length} />
        <StatCard label="Last 24 h" value={totalToday} />
        <StatCard label="Anon / Auth" value={`${anonCount} / ${authCount}`} />
      </div>

      {rows.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border py-16 text-center">
          <Sparkles className="size-8 text-muted-foreground/40" />
          <p className="text-sm text-muted-foreground">No generations yet.</p>
        </div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Time</TableHead>
              <TableHead>User</TableHead>
              <TableHead>IP</TableHead>
              <TableHead>Image</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <TableRow key={row.id}>
                <TableCell className="whitespace-nowrap text-sm">
                  {new Date(row.createdAt).toLocaleString("en-LK", {
                    dateStyle: "short",
                    timeStyle: "short",
                  })}
                </TableCell>
                <TableCell className="font-mono text-xs text-muted-foreground">
                  {row.userId ? row.userId.slice(0, 8) + "…" : <span className="italic">anon</span>}
                </TableCell>
                <TableCell className="font-mono text-xs text-muted-foreground">
                  {row.ipAddress}
                </TableCell>
                <TableCell>
                  {row.imagePublicUrl ? (
                    <a
                      href={row.imagePublicUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-brand underline underline-offset-2"
                    >
                      View
                    </a>
                  ) : (
                    <span className="text-xs text-muted-foreground">—</span>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="mt-1 font-display text-2xl">{value}</p>
    </div>
  );
}
