import * as React from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useT } from "../i18n/react";

export interface OrderRow {
  orderNo: string;
  orderStatus: string;
  awardStatus: string;
  fulfilmentStatus: string;
  neededByDate: string | null;
  quantity: number;
  unitCost: number;
}
export interface RfqRow {
  status: string;
  createdAt: Date | string;
  expiresAt: Date | string | null;
}

const STAGES = ["confirmed", "preparing", "ready", "handed_over", "completed"] as const;
const STAGE_COLOR: Record<string, string> = {
  confirmed: "#f59e0b",
  preparing: "#3b82f6",
  ready: "#16a34a",
  handed_over: "#0f766e",
  completed: "#64748b",
};
const STAGE_SI: Record<string, string> = {
  confirmed: "තහවුරු කළ",
  preparing: "සකසමින්",
  ready: "සූදානම්",
  handed_over: "භාර දුන්",
  completed: "අවසන්",
};
const STAGE_EN: Record<string, string> = {
  confirmed: "Confirmed",
  preparing: "Preparing",
  ready: "Ready",
  handed_over: "Handed over",
  completed: "Completed",
};

function lkr(cents: number): string {
  return `Rs ${Math.round(cents / 100).toLocaleString("en-LK")}`;
}
function dayKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function ChartCard({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-3xl bg-card p-5 ring-1 ring-border/70 sm:p-6">
      <h2 className="text-lg font-semibold">{title}</h2>
      {hint && <p className="mt-0.5 text-sm text-muted-foreground">{hint}</p>}
      <div className="mt-4">{children}</div>
    </section>
  );
}

function Empty({ text }: { text: string }) {
  return (
    <div className="grid h-48 place-items-center rounded-2xl bg-muted/50 px-4 text-center text-sm text-muted-foreground">
      {text}
    </div>
  );
}

export function DashboardCharts({ orders, rfqs }: { orders: OrderRow[]; rfqs: RfqRow[] }) {
  const { locale } = useT();
  const si = locale === "si";
  const stageName = si ? STAGE_SI : STAGE_EN;

  const active = orders.filter(
    (o) => o.awardStatus !== "cancelled" && o.orderStatus !== "cancelled",
  );

  const stageData = STAGES.map((s) => ({
    key: s,
    name: stageName[s],
    value: active.filter((o) => o.fulfilmentStatus === s).length,
  }));
  const stageTotal = stageData.reduce((n, d) => n + d.value, 0);

  // Confirmed value due per day over the next 14 days.
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  const days = Array.from({ length: 14 }, (_, i) => {
    const d = new Date(today);
    d.setUTCDate(d.getUTCDate() + i);
    return d;
  });
  const upcoming = days.map((d) => {
    const k = dayKey(d);
    const rows = active.filter(
      (o) => o.neededByDate?.slice(0, 10) === k && o.fulfilmentStatus !== "completed",
    );
    return {
      label: d.toLocaleDateString(si ? "si-LK" : "en-GB", { day: "numeric", month: "short" }),
      value: rows.reduce((n, o) => n + o.quantity * o.unitCost, 0) / 100,
      orders: rows.length,
    };
  });
  const hasUpcoming = upcoming.some((d) => d.value > 0 || d.orders > 0);

  // RFQs received per day, last 14 days.
  const past = Array.from({ length: 14 }, (_, i) => {
    const d = new Date(today);
    d.setUTCDate(d.getUTCDate() - (13 - i));
    return d;
  });
  const rfqSeries = past.map((d) => ({
    label: d.toLocaleDateString(si ? "si-LK" : "en-GB", { day: "numeric", month: "short" }),
    value: rfqs.filter((r) => dayKey(new Date(r.createdAt)) === dayKey(d)).length,
  }));
  const hasRfqs = rfqSeries.some((d) => d.value > 0);

  const totalValue = active.reduce((n, o) => n + o.quantity * o.unitCost, 0);
  const tip = {
    contentStyle: { borderRadius: 12, border: "1px solid var(--border)", fontSize: 13 },
  };

  return (
    <div className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-5">
        <div className="lg:col-span-3">
          <ChartCard
            title={si ? "ඉදිරි දින 14 සඳහා ඇණවුම් වටිනාකම" : "Order value due, next 14 days"}
            hint={si ? `තහවුරු කළ මුළු වටිනාකම ${lkr(totalValue)}` : `Total confirmed value ${lkr(totalValue)}`}
          >
            {hasUpcoming ? (
              <div className="h-56" role="img" aria-label="Order value by delivery date">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={upcoming} margin={{ left: -12, right: 4, top: 4 }}>
                    <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="var(--border)" />
                    <XAxis dataKey="label" tickLine={false} axisLine={false} fontSize={11} interval={1} />
                    <YAxis tickLine={false} axisLine={false} fontSize={11} width={52} />
                    <Tooltip {...tip} formatter={(v: number) => [`Rs ${v.toLocaleString("en-LK")}`, si ? "වටිනාකම" : "Value"]} />
                    <Bar dataKey="value" fill="var(--brand)" radius={[6, 6, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <Empty text={si ? "ඉදිරි දින 14 තුළ බෙදාහැරීමට ඇණවුම් නැත." : "No deliveries due in the next 14 days."} />
            )}
          </ChartCard>
        </div>
        <div className="lg:col-span-2">
          <ChartCard title={si ? "ඇණවුම් තත්ත්වය" : "Orders by stage"} hint={si ? `ක්‍රියාත්මක ඇණවුම් ${stageTotal}` : `${stageTotal} order lines`}>
            {stageTotal > 0 ? (
              <>
                <div className="h-40" role="img" aria-label="Orders by stage">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={stageData} dataKey="value" nameKey="name" innerRadius={42} outerRadius={70} paddingAngle={2} stroke="none">
                        {stageData.map((d) => (
                          <Cell key={d.key} fill={STAGE_COLOR[d.key]} />
                        ))}
                      </Pie>
                      <Tooltip {...tip} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <ul className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1.5 text-sm">
                  {stageData.map((d) => (
                    <li key={d.key} className="flex items-center gap-2">
                      <span className="size-2.5 rounded-full" style={{ background: STAGE_COLOR[d.key] }} />
                      <span className="text-muted-foreground">{d.name}</span>
                      <span className="ml-auto font-semibold tabular-nums">{d.value}</span>
                    </li>
                  ))}
                </ul>
              </>
            ) : (
              <Empty text={si ? "තවම ඇණවුම් නැත." : "No orders yet."} />
            )}
          </ChartCard>
        </div>
      </div>

      <ChartCard
        title={si ? "ලැබුණු මිල ඉල්ලීම් (දින 14)" : "Quote requests received (14 days)"}
        hint={si ? "වැඩි ඉල්ලීම් යනු වැඩි අවස්ථා." : "More requests means more chances to win orders."}
      >
        {hasRfqs ? (
          <div className="h-40" role="img" aria-label="Quote requests per day">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={rfqSeries} margin={{ left: -24, right: 4, top: 4 }}>
                <defs>
                  <linearGradient id="rfqFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--brand)" stopOpacity={0.35} />
                    <stop offset="100%" stopColor="var(--brand)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="label" tickLine={false} axisLine={false} fontSize={11} interval={2} />
                <YAxis allowDecimals={false} tickLine={false} axisLine={false} fontSize={11} />
                <Tooltip {...tip} />
                <Area type="monotone" dataKey="value" stroke="var(--brand)" strokeWidth={2.5} fill="url(#rfqFill)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <Empty text={si ? "මෑත දිනවල මිල ඉල්ලීම් නැත." : "No quote requests in the last 14 days."} />
        )}
      </ChartCard>
    </div>
  );
}
