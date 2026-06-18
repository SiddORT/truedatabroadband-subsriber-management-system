import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, TrendingUp, Users, RefreshCw } from "lucide-react";
import {
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";
import { AppLayout } from "@/layouts/AppLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { reportsService } from "@/services/reports";

const fmtINR = (v: number) =>
  new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(v);
const fmtINRShort = (v: number) =>
  v >= 100000 ? `₹${(v / 100000).toFixed(1)}L` : v >= 1000 ? `₹${(v / 1000).toFixed(0)}K` : `₹${v}`;

const CHART_COLORS = ["#1F4959", "#5C7C89", "#2E7D9B", "#86B5C7", "#3D9BBC", "#7AADBE", "#A0C5D1", "#BFD9E3", "#D72B20", "#E8A09A"];

function SummaryCard({ label, value, icon: Icon, color, sub }: { label: string; value: string; icon: React.ComponentType<{ className?: string }>; color: string; sub?: string }) {
  return (
    <Card>
      <CardContent className="flex items-center gap-3 p-4">
        <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${color}`}>
          <Icon className="h-4 w-4" />
        </div>
        <div>
          <p className="text-xs text-muted-foreground">{label}</p>
          <p className="text-sm font-bold text-foreground">{value}</p>
          {sub && <p className="text-[10px] text-muted-foreground">{sub}</p>}
        </div>
      </CardContent>
    </Card>
  );
}

function ChartTip({ active, payload, label, currency }: { active?: boolean; payload?: { name: string; value: number }[]; label?: string; currency?: boolean }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-border bg-background px-3 py-2 shadow-md">
      {label && <p className="mb-1 text-xs font-semibold text-foreground">{label}</p>}
      {payload.map((p) => (
        <p key={p.name} className="text-xs text-muted-foreground">
          <span className="font-medium text-foreground">{currency !== false ? fmtINR(p.value) : p.value}</span>
          {p.name !== "revenue" && ` — ${p.name}`}
        </p>
      ))}
    </div>
  );
}

function SkeletonChart({ height = 220 }: { height?: number }) {
  return <div className="animate-pulse rounded-lg bg-muted" style={{ height }} />;
}

const PRESETS = [
  { id: "3m", label: "3 Months", from: () => { const d = new Date(); d.setMonth(d.getMonth() - 3); return d.toISOString().split("T")[0]; } },
  { id: "6m", label: "6 Months", from: () => { const d = new Date(); d.setMonth(d.getMonth() - 6); return d.toISOString().split("T")[0]; } },
  { id: "1y", label: "1 Year", from: () => { const d = new Date(); d.setFullYear(d.getFullYear() - 1); return d.toISOString().split("T")[0]; } },
  { id: "all", label: "All Time", from: () => "" },
];

export function RevenueReportPage() {
  const navigate = useNavigate();
  const [preset, setPreset] = useState("1y");
  const [plan, setPlan] = useState("");
  const [city, setCity] = useState("");

  const dateFrom = useMemo(() => {
    const p = PRESETS.find((p) => p.id === preset);
    return p ? p.from() : "";
  }, [preset]);

  const params = useMemo(() => ({
    date_from: dateFrom || undefined,
    plan: plan || undefined,
    city: city || undefined,
  }), [dateFrom, plan, city]);

  const { data, isLoading } = useQuery({
    queryKey: ["report", "revenue", params],
    queryFn: () => reportsService.getRevenue(params),
    staleTime: 60_000,
  });

  const summary = data?.summary;

  return (
    <AppLayout title="Revenue Report" portalLabel="Admin Portal">
      <div className="space-y-5">
        <Button variant="ghost" size="sm" className="-ml-2" onClick={() => navigate("/admin/reports")}>
          <ArrowLeft className="mr-1 h-4 w-4" />
          Reports
        </Button>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-foreground">Revenue Report</h2>
            <p className="text-xs text-muted-foreground">Aggregated revenue analytics by month, plan, customer, and city</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {PRESETS.map((p) => (
              <button key={p.id} onClick={() => setPreset(p.id)}
                className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${preset === p.id ? "bg-primary text-white" : "bg-muted text-muted-foreground hover:bg-muted/80"}`}>
                {p.label}
              </button>
            ))}
            <div className="flex gap-2">
              <input type="text" value={plan} onChange={(e) => setPlan(e.target.value)} placeholder="Plan…"
                className="rounded-lg border border-input bg-background px-2 py-1 text-xs w-28 focus:outline-none focus:ring-2 focus:ring-primary/30" />
              <input type="text" value={city} onChange={(e) => setCity(e.target.value)} placeholder="City…"
                className="rounded-lg border border-input bg-background px-2 py-1 text-xs w-24 focus:outline-none focus:ring-2 focus:ring-primary/30" />
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <SummaryCard label="Total Revenue" value={summary ? fmtINR(summary.total_revenue) : "—"} icon={TrendingUp} color="bg-primary/10 text-primary" />
          <SummaryCard label="Avg / Customer" value={summary ? fmtINR(summary.avg_revenue_per_customer) : "—"} icon={Users} color="bg-blue-100 text-blue-700" sub="per unique customer" />
          <SummaryCard label="Avg / Subscription" value={summary ? fmtINR(summary.avg_revenue_per_subscription) : "—"} icon={RefreshCw} color="bg-green-100 text-green-700" sub="per subscription invoice" />
        </div>

        {/* Revenue by Month */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold">Revenue by Month</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? <SkeletonChart /> : !data?.revenue_by_month?.length ? (
              <p className="py-10 text-center text-sm text-muted-foreground">No revenue data for selected period</p>
            ) : (
              <ResponsiveContainer width="100%" height={240}>
                <AreaChart data={data.revenue_by_month} margin={{ top: 4, right: 8, left: 0, bottom: 4 }}>
                  <defs>
                    <linearGradient id="revGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#1F4959" stopOpacity={0.15} />
                      <stop offset="95%" stopColor="#1F4959" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                  <XAxis dataKey="label" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} />
                  <YAxis tick={{ fontSize: 10 }} tickLine={false} axisLine={false} tickFormatter={fmtINRShort} />
                  <Tooltip content={<ChartTip currency />} />
                  <Area type="monotone" dataKey="revenue" stroke="#1F4959" strokeWidth={2.5} fill="url(#revGrad)" name="Revenue" />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {/* Revenue by Plan */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold">Revenue by Plan</CardTitle>
            </CardHeader>
            <CardContent>
              {isLoading ? <SkeletonChart height={200} /> : !data?.revenue_by_plan?.length ? (
                <p className="py-8 text-center text-sm text-muted-foreground">No data</p>
              ) : (
                <>
                  <ResponsiveContainer width="100%" height={180}>
                    <BarChart data={data.revenue_by_plan} margin={{ top: 4, right: 8, left: 0, bottom: 4 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                      <XAxis dataKey="plan_name" tick={{ fontSize: 9 }} tickLine={false} axisLine={false} />
                      <YAxis tick={{ fontSize: 9 }} tickLine={false} axisLine={false} tickFormatter={fmtINRShort} />
                      <Tooltip content={<ChartTip currency />} />
                      <Bar dataKey="revenue" name="Revenue" radius={[4, 4, 0, 0]}>
                        {data.revenue_by_plan.map((_, i) => (
                          <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </>
              )}
            </CardContent>
          </Card>

          {/* Revenue by City */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold">Revenue by City</CardTitle>
            </CardHeader>
            <CardContent>
              {isLoading ? <SkeletonChart height={200} /> : !data?.revenue_by_city?.length ? (
                <p className="py-8 text-center text-sm text-muted-foreground">No data</p>
              ) : (
                <>
                  <ResponsiveContainer width="100%" height={150}>
                    <PieChart>
                      <Pie data={data.revenue_by_city} dataKey="revenue" nameKey="city"
                        cx="50%" cy="50%" innerRadius={40} outerRadius={70} paddingAngle={2}>
                        {data.revenue_by_city.map((_, i) => (
                          <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip formatter={(v) => [fmtINR(Number(v)), ""]} />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="mt-2 space-y-1">
                    {data.revenue_by_city.slice(0, 6).map((c, i) => (
                      <div key={c.city} className="flex items-center gap-2 text-xs">
                        <span className="h-2 w-2 shrink-0 rounded-sm" style={{ background: CHART_COLORS[i % CHART_COLORS.length] }} />
                        <span className="flex-1 truncate text-foreground">{c.city}</span>
                        <span className="font-semibold text-foreground">{fmtINR(c.revenue)}</span>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Revenue by Customer (top 10) */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold">Top Customers by Revenue</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? <SkeletonChart height={180} /> : !data?.revenue_by_customer?.length ? (
              <p className="py-8 text-center text-sm text-muted-foreground">No data</p>
            ) : (
              <ResponsiveContainer width="100%" height={180}>
                <BarChart data={data.revenue_by_customer} layout="vertical" margin={{ top: 4, right: 8, left: 80, bottom: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" horizontal={false} />
                  <XAxis type="number" tick={{ fontSize: 9 }} tickLine={false} axisLine={false} tickFormatter={fmtINRShort} />
                  <YAxis type="category" dataKey="customer_name" tick={{ fontSize: 9 }} tickLine={false} axisLine={false} width={75} />
                  <Tooltip content={<ChartTip currency />} />
                  <Bar dataKey="revenue" name="Revenue" fill="#1F4959" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}
