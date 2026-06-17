import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  AreaChart, Area, LineChart, Line, PieChart, Pie, Cell,
  CartesianGrid, XAxis, YAxis, Tooltip, ResponsiveContainer,
} from "recharts";
import {
  Users, Wifi, RefreshCw, ReceiptText, IndianRupee,
  AlertTriangle, TrendingUp, Clock, Plus, ArrowRight,
  Calendar, ChevronDown, X,
} from "lucide-react";

import { AppLayout } from "@/layouts/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { dashboardService } from "@/services/dashboard";

// ── Formatters ────────────────────────────────────────────────────────────────

const fmtINR = (n: number) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency", currency: "INR",
    minimumFractionDigits: 0, maximumFractionDigits: 0,
  }).format(n);

function fmtDate(iso: string) {
  if (!iso) return "—";
  const d = new Date(iso.includes("T") ? iso : iso + "T00:00:00");
  return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

const STATUS_COLORS: Record<string, string> = {
  DRAFT: "bg-muted text-muted-foreground",
  UNPAID: "bg-amber-100 text-amber-800",
  PARTIALLY_PAID: "bg-blue-100 text-blue-800",
  PAID: "bg-green-100 text-green-800",
  OVERDUE: "bg-red-100 text-red-800",
  CANCELLED: "bg-gray-100 text-gray-500",
  ACTIVE: "bg-green-100 text-green-800",
  SUSPENDED: "bg-amber-100 text-amber-800",
  DISCONNECTED: "bg-gray-100 text-gray-500",
};

function StatusBadge({ status }: { status: string }) {
  return (
    <span className={`inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-semibold ${STATUS_COLORS[status] ?? "bg-muted text-muted-foreground"}`}>
      {status.replace(/_/g, " ")}
    </span>
  );
}

// ── Time Filter ───────────────────────────────────────────────────────────────

type Preset = "today" | "7d" | "30d" | "this_month" | "last_month" | "this_quarter" | "this_year" | "custom";

const PRESETS: { id: Preset; label: string }[] = [
  { id: "today", label: "Today" },
  { id: "7d", label: "Last 7 Days" },
  { id: "30d", label: "Last 30 Days" },
  { id: "this_month", label: "This Month" },
  { id: "last_month", label: "Last Month" },
  { id: "this_quarter", label: "This Quarter" },
  { id: "this_year", label: "This Year" },
  { id: "custom", label: "Custom" },
];

function toIso(d: Date) { return d.toISOString().slice(0, 10); }

function getPresetDates(preset: Preset): { from: string; to: string } {
  const today = new Date();
  const y = today.getFullYear();
  const m = today.getMonth();
  const d = today.getDate();
  switch (preset) {
    case "today": return { from: toIso(today), to: toIso(today) };
    case "7d": { const f = new Date(today); f.setDate(d - 6); return { from: toIso(f), to: toIso(today) }; }
    case "30d": { const f = new Date(today); f.setDate(d - 29); return { from: toIso(f), to: toIso(today) }; }
    case "this_month": return { from: toIso(new Date(y, m, 1)), to: toIso(today) };
    case "last_month": return { from: toIso(new Date(y, m - 1, 1)), to: toIso(new Date(y, m, 0)) };
    case "this_quarter": { const qm = Math.floor(m / 3) * 3; return { from: toIso(new Date(y, qm, 1)), to: toIso(today) }; }
    case "this_year": return { from: toIso(new Date(y, 0, 1)), to: toIso(today) };
    default: return { from: toIso(new Date(y, m, 1)), to: toIso(today) };
  }
}

// ── Skeletons ─────────────────────────────────────────────────────────────────

function SkeletonCard() {
  return (
    <div className="animate-pulse rounded-xl border border-border bg-surface p-5">
      <div className="mb-3 flex items-center justify-between">
        <div className="h-3 w-24 rounded bg-muted" />
        <div className="h-8 w-8 rounded-lg bg-muted" />
      </div>
      <div className="h-7 w-20 rounded bg-muted" />
      <div className="mt-2 h-3 w-16 rounded bg-muted" />
    </div>
  );
}

function SkeletonChart({ height = 220 }: { height?: number }) {
  return (
    <div className="animate-pulse rounded-lg bg-muted/40" style={{ height }} />
  );
}

function SkeletonRows({ n = 5 }: { n?: number }) {
  return (
    <div className="animate-pulse space-y-2.5">
      {Array.from({ length: n }).map((_, i) => (
        <div key={i} className="flex items-center gap-3">
          <div className="h-4 flex-1 rounded bg-muted" />
          <div className="h-4 w-16 rounded bg-muted" />
        </div>
      ))}
    </div>
  );
}

// ── KPI Card ──────────────────────────────────────────────────────────────────

interface KpiProps {
  label: string; value: string;
  icon: React.ComponentType<{ className?: string }>;
  iconBg: string; iconColor: string;
  sub?: string; subColor?: string;
}

function KpiCard({ label, value, icon: Icon, iconBg, iconColor, sub, subColor }: KpiProps) {
  return (
    <div className="rounded-xl border border-border bg-surface p-5 shadow-sm transition-shadow hover:shadow-md">
      <div className="mb-3 flex items-start justify-between">
        <p className="text-xs font-medium text-muted-foreground leading-tight">{label}</p>
        <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${iconBg}`}>
          <Icon className={`h-4 w-4 ${iconColor}`} />
        </div>
      </div>
      <p className="text-2xl font-bold tracking-tight text-foreground">{value}</p>
      {sub && <p className={`mt-1 text-xs ${subColor ?? "text-muted-foreground"}`}>{sub}</p>}
    </div>
  );
}

// ── Chart Tooltip ─────────────────────────────────────────────────────────────

function ChartTip({ active, payload, label, currency = false }: {
  active?: boolean; payload?: { value: number; name: string; color: string }[];
  label?: string; currency?: boolean;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-border bg-surface px-3 py-2 shadow-lg text-xs">
      <p className="mb-1 font-semibold text-foreground">{label}</p>
      {payload.map((p) => (
        <p key={p.name} style={{ color: p.color }}>
          {currency ? fmtINR(p.value) : p.value.toLocaleString("en-IN")}
        </p>
      ))}
    </div>
  );
}

const DONUT_COLORS = ["#1F4959", "#5C7C89", "#2E7D9B", "#86B5C7", "#3D9BBC", "#7AADBE", "#A0C5D1", "#BFD9E3"];

// ── Main ──────────────────────────────────────────────────────────────────────

export function AdminDashboard() {
  const navigate = useNavigate();
  const [preset, setPreset] = useState<Preset>("this_month");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [showCustom, setShowCustom] = useState(false);

  const { from: dateFrom, to: dateTo } = useMemo(() => {
    if (preset === "custom" && customFrom && customTo) return { from: customFrom, to: customTo };
    return getPresetDates(preset);
  }, [preset, customFrom, customTo]);

  const apiParams = { date_from: dateFrom, date_to: dateTo };
  const STALE60 = 60_000;
  const STALE30 = 30_000;

  const { data: summary, isLoading: loadSum } = useQuery({
    queryKey: ["dash", "summary", dateFrom, dateTo],
    queryFn: () => dashboardService.getSummary(apiParams),
    staleTime: STALE60,
  });

  const { data: revTrend, isLoading: loadRev } = useQuery({
    queryKey: ["dash", "revenue-trend"],
    queryFn: () => dashboardService.getRevenueTrend(),
    staleTime: STALE60,
  });

  const { data: custGrowth, isLoading: loadCG } = useQuery({
    queryKey: ["dash", "customer-growth"],
    queryFn: () => dashboardService.getCustomerGrowth(),
    staleTime: STALE60,
  });

  const { data: subGrowth, isLoading: loadSG } = useQuery({
    queryKey: ["dash", "subscription-growth"],
    queryFn: () => dashboardService.getSubscriptionGrowth(),
    staleTime: STALE60,
  });

  const { data: planDist, isLoading: loadPD } = useQuery({
    queryKey: ["dash", "plan-distribution"],
    queryFn: () => dashboardService.getPlanDistribution(),
    staleTime: STALE60,
  });

  const { data: recentCust, isLoading: loadRC } = useQuery({
    queryKey: ["dash", "recent-customers"],
    queryFn: () => dashboardService.getRecentCustomers(),
    staleTime: 0,
  });

  const { data: recentInv, isLoading: loadRI } = useQuery({
    queryKey: ["dash", "recent-invoices"],
    queryFn: () => dashboardService.getRecentInvoices(),
    staleTime: 0,
  });

  const { data: recentPay, isLoading: loadRP } = useQuery({
    queryKey: ["dash", "recent-payments"],
    queryFn: () => dashboardService.getRecentPayments(),
    staleTime: 0,
  });

  const { data: expiringSubs, isLoading: loadExp } = useQuery({
    queryKey: ["dash", "expiring-subs", dateFrom, dateTo],
    queryFn: () => dashboardService.getExpiringSubscriptions(),
    staleTime: STALE30,
  });

  const { data: overdueInvs, isLoading: loadOD } = useQuery({
    queryKey: ["dash", "overdue-invoices", dateFrom, dateTo],
    queryFn: () => dashboardService.getOverdueInvoices(),
    staleTime: STALE30,
  });

  const periodLabel = useMemo(() => {
    if (preset === "custom" && customFrom && customTo)
      return `${fmtDate(customFrom)} – ${fmtDate(customTo)}`;
    return PRESETS.find((p) => p.id === preset)?.label ?? "This Month";
  }, [preset, customFrom, customTo]);

  const kpis: KpiProps[] = summary ? [
    { label: "Total Customers", value: summary.total_customers.toLocaleString("en-IN"), icon: Users, iconBg: "bg-primary/10", iconColor: "text-primary", sub: `${summary.active_customers} active` },
    { label: "Active Customers", value: summary.active_customers.toLocaleString("en-IN"), icon: Users, iconBg: "bg-green-100", iconColor: "text-green-700" },
    { label: "Business Customers", value: summary.business_customers.toLocaleString("en-IN"), icon: Users, iconBg: "bg-purple-100", iconColor: "text-purple-700" },
    { label: "Individual Customers", value: summary.individual_customers.toLocaleString("en-IN"), icon: Users, iconBg: "bg-sky-100", iconColor: "text-sky-700" },
    { label: "Active Subscriptions", value: summary.active_subscriptions.toLocaleString("en-IN"), icon: Wifi, iconBg: "bg-primary/10", iconColor: "text-primary" },
    { label: "Expiring (30 days)", value: summary.expiring_subscriptions.toLocaleString("en-IN"), icon: Clock, iconBg: "bg-amber-100", iconColor: "text-amber-700", sub: summary.expiring_subscriptions > 0 ? "Needs attention" : "All good", subColor: summary.expiring_subscriptions > 0 ? "text-amber-600" : "text-green-600" },
    { label: "Expired Subscriptions", value: summary.expired_subscriptions.toLocaleString("en-IN"), icon: RefreshCw, iconBg: "bg-red-100", iconColor: "text-red-600" },
    { label: "Unpaid Invoices", value: summary.unpaid_invoices.toLocaleString("en-IN"), icon: ReceiptText, iconBg: "bg-amber-100", iconColor: "text-amber-700", sub: summary.unpaid_invoices > 0 ? "Awaiting payment" : undefined, subColor: "text-amber-600" },
    { label: "Overdue Invoices", value: summary.overdue_invoices.toLocaleString("en-IN"), icon: AlertTriangle, iconBg: "bg-red-100", iconColor: "text-red-600", sub: summary.overdue_invoices > 0 ? "Action needed" : undefined, subColor: "text-red-500" },
    { label: "Outstanding Amount", value: fmtINR(summary.outstanding_amount), icon: IndianRupee, iconBg: "bg-red-100", iconColor: "text-red-600" },
    { label: `Collections · ${periodLabel}`, value: fmtINR(summary.collections_this_period), icon: TrendingUp, iconBg: "bg-green-100", iconColor: "text-green-700" },
    { label: `Revenue · ${periodLabel}`, value: fmtINR(summary.revenue_this_period), icon: TrendingUp, iconBg: "bg-primary/10", iconColor: "text-primary" },
  ] : [];

  return (
    <AppLayout title="Dashboard" portalLabel="Administration">
      <div className="space-y-6">

        {/* Header + Quick Actions */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-foreground">Overview</h2>
            <p className="text-sm text-muted-foreground">Real-time business metrics for True Data Broadband</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" onClick={() => navigate("/admin/customers/new")}>
              <Plus className="mr-1.5 h-3.5 w-3.5" />Add Customer
            </Button>
            <Button size="sm" variant="outline" onClick={() => navigate("/admin/subscriptions/new")}>
              <Plus className="mr-1.5 h-3.5 w-3.5" />Subscription
            </Button>
            <Button size="sm" variant="outline" onClick={() => navigate("/admin/invoices/new")}>
              <Plus className="mr-1.5 h-3.5 w-3.5" />Invoice
            </Button>
            <Button size="sm" variant="outline" onClick={() => navigate("/admin/payments/new")}>
              <Plus className="mr-1.5 h-3.5 w-3.5" />Payment
            </Button>
          </div>
        </div>

        {/* Time Filter */}
        <div className="rounded-xl border border-border bg-surface px-4 py-3">
          <div className="flex flex-wrap items-center gap-2">
            <Calendar className="h-4 w-4 shrink-0 text-muted-foreground" />
            <span className="text-xs font-medium text-muted-foreground">Period:</span>
            <div className="flex flex-wrap gap-1.5">
              {PRESETS.map((p) => (
                <button key={p.id}
                  onClick={() => {
                    setPreset(p.id);
                    if (p.id === "custom") setShowCustom((v) => !v);
                    else setShowCustom(false);
                  }}
                  className={`flex items-center gap-1 rounded-lg px-3 py-1 text-xs font-medium transition-colors ${
                    preset === p.id
                      ? "bg-primary text-white"
                      : "bg-muted text-muted-foreground hover:bg-primary/10 hover:text-primary"
                  }`}
                >
                  {p.label}{p.id === "custom" && <ChevronDown className="h-3 w-3" />}
                </button>
              ))}
            </div>
          </div>
          {showCustom && (
            <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-border pt-3">
              <span className="text-xs text-muted-foreground">From</span>
              <input type="date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)}
                className="rounded-lg border border-input bg-background px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
              <span className="text-xs text-muted-foreground">to</span>
              <input type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)}
                className="rounded-lg border border-input bg-background px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
              <button onClick={() => setShowCustom(false)} className="ml-1 rounded p-1 text-muted-foreground hover:text-foreground">
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          )}
        </div>

        {/* KPI Grid */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {loadSum
            ? Array.from({ length: 12 }).map((_, i) => <SkeletonCard key={i} />)
            : kpis.map((k) => <KpiCard key={k.label} {...k} />)
          }
        </div>

        {/* Charts row 1 */}
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold">Monthly Revenue Trend</CardTitle>
              <p className="text-xs text-muted-foreground">Last 12 months — invoiced, excl. draft/cancelled</p>
            </CardHeader>
            <CardContent>
              {loadRev ? <SkeletonChart /> : !revTrend?.length ? (
                <p className="py-10 text-center text-sm text-muted-foreground">No revenue data yet</p>
              ) : (
                <ResponsiveContainer width="100%" height={220}>
                  <LineChart data={revTrend} margin={{ top: 4, right: 8, left: 0, bottom: 4 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                    <XAxis dataKey="label" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} />
                    <YAxis tick={{ fontSize: 10 }} tickLine={false} axisLine={false}
                      tickFormatter={(v: number) => v >= 1000 ? `₹${(v / 1000).toFixed(0)}k` : `₹${v}`}
                    />
                    <Tooltip content={<ChartTip currency />} />
                    <Line type="monotone" dataKey="revenue" stroke="#1F4959" strokeWidth={2.5}
                      dot={{ r: 3, fill: "#1F4959", strokeWidth: 0 }} activeDot={{ r: 5 }} name="Revenue"
                    />
                  </LineChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold">Customer Growth</CardTitle>
              <p className="text-xs text-muted-foreground">New customers per month (last 12 months)</p>
            </CardHeader>
            <CardContent>
              {loadCG ? <SkeletonChart /> : !custGrowth?.length ? (
                <p className="py-10 text-center text-sm text-muted-foreground">No data yet</p>
              ) : (
                <ResponsiveContainer width="100%" height={220}>
                  <AreaChart data={custGrowth} margin={{ top: 4, right: 8, left: 0, bottom: 4 }}>
                    <defs>
                      <linearGradient id="cgGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#1F4959" stopOpacity={0.15} />
                        <stop offset="95%" stopColor="#1F4959" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                    <XAxis dataKey="label" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} />
                    <YAxis tick={{ fontSize: 10 }} tickLine={false} axisLine={false} allowDecimals={false} />
                    <Tooltip content={<ChartTip />} />
                    <Area type="monotone" dataKey="new_customers" stroke="#1F4959" strokeWidth={2.5}
                      fill="url(#cgGrad)" name="New Customers"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Charts row 2 */}
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">

          <div className="lg:col-span-2">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold">Subscription Growth</CardTitle>
                <p className="text-xs text-muted-foreground">New subscriptions per month (last 12 months)</p>
              </CardHeader>
              <CardContent>
                {loadSG ? <SkeletonChart /> : !subGrowth?.length ? (
                  <p className="py-10 text-center text-sm text-muted-foreground">No data yet</p>
                ) : (
                  <ResponsiveContainer width="100%" height={220}>
                    <AreaChart data={subGrowth} margin={{ top: 4, right: 8, left: 0, bottom: 4 }}>
                      <defs>
                        <linearGradient id="sgGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#5C7C89" stopOpacity={0.2} />
                          <stop offset="95%" stopColor="#5C7C89" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                      <XAxis dataKey="label" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} />
                      <YAxis tick={{ fontSize: 10 }} tickLine={false} axisLine={false} allowDecimals={false} />
                      <Tooltip content={<ChartTip />} />
                      <Area type="monotone" dataKey="new_subscriptions" stroke="#5C7C89" strokeWidth={2.5}
                        fill="url(#sgGrad)" name="New Subscriptions"
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold">Plan Distribution</CardTitle>
              <p className="text-xs text-muted-foreground">Active subscriptions by plan</p>
            </CardHeader>
            <CardContent>
              {loadPD ? <SkeletonChart height={200} /> : !planDist?.length || planDist.every((p) => p.active_count === 0) ? (
                <p className="py-10 text-center text-sm text-muted-foreground">No active subscriptions</p>
              ) : (
                <>
                  <ResponsiveContainer width="100%" height={175}>
                    <PieChart>
                      <Pie data={planDist} dataKey="active_count" nameKey="plan_name"
                        cx="50%" cy="50%" innerRadius={50} outerRadius={80} paddingAngle={2}
                      >
                        {planDist.map((_, i) => (
                          <Cell key={i} fill={DONUT_COLORS[i % DONUT_COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip formatter={(v) => [`${String(v)} subscriptions`, ""]} />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="mt-2 space-y-1.5">
                    {planDist.slice(0, 5).map((p, i) => (
                      <div key={p.plan_id} className="flex items-center gap-2 text-xs">
                        <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: DONUT_COLORS[i % DONUT_COLORS.length] }} />
                        <span className="flex-1 truncate text-foreground">{p.plan_name}</span>
                        <span className="font-semibold text-foreground">{p.active_count}</span>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Expiring Subs + Overdue Invoices */}
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
              <div>
                <CardTitle className="text-sm font-semibold">Expiring Subscriptions</CardTitle>
                <p className="mt-0.5 text-xs text-muted-foreground">Active — expiring within 30 days</p>
              </div>
              <Button size="sm" variant="outline" onClick={() => navigate("/admin/subscriptions")}>
                View All <ArrowRight className="ml-1 h-3.5 w-3.5" />
              </Button>
            </CardHeader>
            <CardContent>
              {loadExp ? <SkeletonRows /> : !expiringSubs?.length ? (
                <p className="py-8 text-center text-sm text-green-600 font-medium">✓ No subscriptions expiring in the next 30 days</p>
              ) : (
                <div className="overflow-x-auto -mx-1">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-border">
                        {["Customer", "Plan", "Expiry", "Days", ""].map((h) => (
                          <th key={h} className={`pb-2 text-xs font-medium text-muted-foreground ${h === "" || h === "Days" || h === "Expiry" ? "text-right" : "text-left"}`}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {expiringSubs.slice(0, 8).map((s) => (
                        <tr key={s.id} className="hover:bg-muted/30">
                          <td className="py-2">
                            <p className="font-medium text-foreground">{s.customer_name}</p>
                            {s.connection_name && <p className="text-[10px] text-muted-foreground">{s.connection_name}</p>}
                          </td>
                          <td className="py-2 text-muted-foreground max-w-[100px] truncate">{s.plan_name}</td>
                          <td className="py-2 text-right text-foreground whitespace-nowrap">{fmtDate(s.expiry_date)}</td>
                          <td className="py-2 text-right">
                            <span className={`font-bold ${s.days_remaining <= 7 ? "text-red-600" : "text-amber-600"}`}>{s.days_remaining}d</span>
                          </td>
                          <td className="py-2 pl-2">
                            <div className="flex gap-1 justify-end">
                              <button onClick={() => navigate(`/admin/subscriptions/${s.id}`)}
                                className="rounded px-2 py-0.5 text-[10px] font-semibold text-primary hover:bg-primary/10 transition-colors">
                                View
                              </button>
                              <button onClick={() => navigate(`/admin/subscriptions/${s.id}`)}
                                className="rounded px-2 py-0.5 text-[10px] font-semibold text-green-700 hover:bg-green-50 transition-colors">
                                Renew
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
              <div>
                <CardTitle className="text-sm font-semibold">Overdue Invoices</CardTitle>
                <p className="mt-0.5 text-xs text-muted-foreground">Past due date with outstanding balance</p>
              </div>
              <Button size="sm" variant="outline" onClick={() => navigate("/admin/invoices")}>
                View All <ArrowRight className="ml-1 h-3.5 w-3.5" />
              </Button>
            </CardHeader>
            <CardContent>
              {loadOD ? <SkeletonRows /> : !overdueInvs?.length ? (
                <p className="py-8 text-center text-sm text-green-600 font-medium">✓ No overdue invoices</p>
              ) : (
                <div className="overflow-x-auto -mx-1">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-border">
                        {["Invoice", "Customer", "Due", "Outstanding", ""].map((h) => (
                          <th key={h} className={`pb-2 text-xs font-medium text-muted-foreground ${h === "" || h === "Outstanding" || h === "Due" ? "text-right" : "text-left"}`}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {overdueInvs.slice(0, 8).map((inv) => (
                        <tr key={inv.id} className="hover:bg-muted/30">
                          <td className="py-2 font-mono text-[10px] text-muted-foreground whitespace-nowrap">{inv.invoice_number}</td>
                          <td className="py-2">
                            <p className="font-medium text-foreground">{inv.customer_name}</p>
                            <p className="text-[10px] text-muted-foreground">{inv.connection_name}</p>
                          </td>
                          <td className="py-2 text-right text-red-600 whitespace-nowrap">{fmtDate(inv.due_date)}</td>
                          <td className="py-2 text-right font-bold text-red-600 whitespace-nowrap">{fmtINR(inv.balance_amount)}</td>
                          <td className="py-2 pl-2">
                            <div className="flex gap-1 justify-end">
                              <button onClick={() => navigate(`/admin/invoices/${inv.id}`)}
                                className="rounded px-2 py-0.5 text-[10px] font-semibold text-primary hover:bg-primary/10 transition-colors">
                                View
                              </button>
                              <button onClick={() => navigate(`/admin/payments/new`)}
                                className="rounded px-2 py-0.5 text-[10px] font-semibold text-green-700 hover:bg-green-50 transition-colors">
                                Pay
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Recent Activity */}
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">

          {/* Recent Customers */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
              <CardTitle className="text-sm font-semibold">Recent Customers</CardTitle>
              <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => navigate("/admin/customers")}>
                All <ArrowRight className="ml-1 h-3.5 w-3.5" />
              </Button>
            </CardHeader>
            <CardContent>
              {loadRC ? <SkeletonRows /> : !recentCust?.length ? (
                <p className="py-6 text-center text-sm text-muted-foreground">No customers yet</p>
              ) : (
                <div className="space-y-1">
                  {recentCust.map((c) => (
                    <div key={c.id}
                      className="flex cursor-pointer items-center justify-between rounded-lg px-2 py-2 hover:bg-muted/40 transition-colors"
                      onClick={() => navigate(`/admin/customers/${c.id}`)}
                    >
                      <div className="min-w-0">
                        <p className="truncate text-xs font-medium text-foreground">{c.full_name}</p>
                        <p className="text-[10px] text-muted-foreground">{c.customer_code} · {c.city}</p>
                      </div>
                      <div className="ml-2 shrink-0 text-right">
                        <StatusBadge status={c.status} />
                        <p className="mt-0.5 text-[10px] text-muted-foreground">{fmtDate(c.created_at)}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Recent Invoices */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
              <CardTitle className="text-sm font-semibold">Recent Invoices</CardTitle>
              <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => navigate("/admin/invoices")}>
                All <ArrowRight className="ml-1 h-3.5 w-3.5" />
              </Button>
            </CardHeader>
            <CardContent>
              {loadRI ? <SkeletonRows /> : !recentInv?.length ? (
                <p className="py-6 text-center text-sm text-muted-foreground">No invoices yet</p>
              ) : (
                <div className="space-y-1">
                  {recentInv.map((inv) => (
                    <div key={inv.id}
                      className="flex cursor-pointer items-center justify-between rounded-lg px-2 py-2 hover:bg-muted/40 transition-colors"
                      onClick={() => navigate(`/admin/invoices/${inv.id}`)}
                    >
                      <div className="min-w-0">
                        <p className="text-[10px] font-mono text-muted-foreground">{inv.invoice_number}</p>
                        <p className="truncate text-xs font-medium text-foreground">{inv.customer_name}</p>
                        <p className="truncate text-[10px] text-muted-foreground">{inv.connection_name}</p>
                      </div>
                      <div className="ml-2 shrink-0 text-right">
                        <StatusBadge status={inv.status} />
                        <p className="mt-0.5 text-xs font-semibold text-foreground">{fmtINR(inv.total_amount)}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Recent Payments */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
              <CardTitle className="text-sm font-semibold">Recent Payments</CardTitle>
              <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => navigate("/admin/payments")}>
                All <ArrowRight className="ml-1 h-3.5 w-3.5" />
              </Button>
            </CardHeader>
            <CardContent>
              {loadRP ? <SkeletonRows /> : !recentPay?.length ? (
                <p className="py-6 text-center text-sm text-muted-foreground">No payments yet</p>
              ) : (
                <div className="space-y-1">
                  {recentPay.map((p) => (
                    <div key={p.id}
                      className="flex cursor-pointer items-center justify-between rounded-lg px-2 py-2 hover:bg-muted/40 transition-colors"
                      onClick={() => navigate(`/admin/invoices/${p.invoice_id}`)}
                    >
                      <div className="min-w-0">
                        <p className="text-[10px] font-mono text-muted-foreground">{p.payment_number}</p>
                        <p className="truncate text-xs font-medium text-foreground">{p.customer_name}</p>
                        <p className="text-[10px] text-muted-foreground">{p.invoice_number}</p>
                      </div>
                      <div className="ml-2 shrink-0 text-right">
                        <p className="text-xs font-bold text-green-700">{fmtINR(p.amount)}</p>
                        <p className="mt-0.5 text-[10px] text-muted-foreground">{fmtDate(p.payment_date)}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

      </div>
    </AppLayout>
  );
}
