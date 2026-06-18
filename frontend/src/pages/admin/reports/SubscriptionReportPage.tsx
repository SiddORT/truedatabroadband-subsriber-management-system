import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Download, RefreshCw, CheckCircle, Clock, XCircle } from "lucide-react";
import { AppLayout } from "@/layouts/AppLayout";
import { DataTable, type DataTableState } from "@/components/DataTable";
import type { DataTableColumn } from "@/components/DataTable";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { reportsService } from "@/services/reports";
import type { SubscriptionReportRow, SubscriptionReportSummary } from "@/types/reports";
import { useExport } from "./useExport";

const STATUS_COLORS: Record<string, string> = {
  ACTIVE: "bg-green-100 text-green-800",
  EXPIRED: "bg-red-100 text-red-800",
  SUSPENDED: "bg-amber-100 text-amber-800",
  CANCELLED: "bg-muted text-muted-foreground",
};

const fmtDate = (d: string) => d ? new Date(d).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : "—";

const COLUMNS: DataTableColumn<SubscriptionReportRow>[] = [
  { key: "sr_no", header: "#", render: (_, i) => <span className="text-xs text-muted-foreground tabular-nums">{i + 1}</span> },
  { key: "subscription_code", header: "Code", sortable: true, render: (r) => <span className="font-mono text-xs text-muted-foreground">{r.subscription_code}</span> },
  {
    key: "customer_name", header: "Customer", sortable: true,
    render: (r) => (
      <div>
        <p className="font-medium text-foreground text-xs">{r.customer_name}</p>
        <p className="text-[10px] text-muted-foreground">{r.customer_code}</p>
      </div>
    ),
  },
  { key: "connection_name", header: "Connection", render: (r) => <span className="text-xs">{r.connection_name || "—"}</span> },
  { key: "plan_name", header: "Plan", render: (r) => <span className="text-xs">{r.plan_name}</span> },
  { key: "billing_cycle", header: "Cycle", render: (r) => <span className="text-xs capitalize">{r.billing_cycle.toLowerCase()}</span> },
  { key: "start_date", header: "Start", sortable: true, render: (r) => <span className="text-xs">{fmtDate(r.start_date)}</span> },
  { key: "renewal_date", header: "Renewal", sortable: true, render: (r) => <span className="text-xs">{fmtDate(r.renewal_date)}</span> },
  { key: "expiry_date", header: "Expiry", sortable: true, render: (r) => <span className="text-xs font-medium">{fmtDate(r.expiry_date)}</span> },
  {
    key: "status", header: "Status", sortable: true,
    render: (r) => (
      <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${STATUS_COLORS[r.status] ?? "bg-muted text-muted-foreground"}`}>
        {r.status}
      </span>
    ),
  },
];

function SummaryCard({ label, value, icon: Icon, color }: { label: string; value: string | number; icon: React.ComponentType<{ className?: string }>; color: string }) {
  return (
    <Card>
      <CardContent className="flex items-center gap-3 p-4">
        <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${color}`}>
          <Icon className="h-4 w-4" />
        </div>
        <div>
          <p className="text-xs text-muted-foreground">{label}</p>
          <p className="text-lg font-bold text-foreground">{value}</p>
        </div>
      </CardContent>
    </Card>
  );
}

const QUICK_FILTERS = [
  { label: "All", value: "" },
  { label: "Expiring 7d", value: "7d" },
  { label: "Expiring 15d", value: "15d" },
  { label: "Expiring 30d", value: "30d" },
  { label: "Expired", value: "expired" },
];

const DEFAULT_STATE: DataTableState = { page: 1, pageSize: 25, search: "", sortBy: "expiry_date", sortDir: "asc" };

export function SubscriptionReportPage() {
  const [state, setState] = useState<DataTableState>(DEFAULT_STATE);
  const [statusFilter, setStatusFilter] = useState("");
  const [plan, setPlan] = useState("");
  const [quickFilter, setQuickFilter] = useState("");
  const [expiryFrom, setExpiryFrom] = useState("");
  const [expiryTo, setExpiryTo] = useState("");
  const { triggerExport, exporting } = useExport();

  const params = useMemo(() => ({
    page: state.page,
    page_size: state.pageSize,
    search: state.search || undefined,
    sort_by: state.sortBy ?? "expiry_date",
    sort_order: state.sortDir,
    status: statusFilter || undefined,
    plan: plan || undefined,
    quick_filter: quickFilter || undefined,
    expiry_date_from: expiryFrom || undefined,
    expiry_date_to: expiryTo || undefined,
  }), [state, statusFilter, plan, quickFilter, expiryFrom, expiryTo]);

  const { data, isLoading } = useQuery({
    queryKey: ["report", "subscriptions", params],
    queryFn: () => reportsService.getSubscriptions(params),
    staleTime: 30_000,
  });

  const summary = data?.summary as SubscriptionReportSummary | undefined;
  const filterCount = [statusFilter, plan, quickFilter, expiryFrom, expiryTo].filter(Boolean).length;

  const handleExport = (fmt: "csv" | "xlsx") => {
    triggerExport("subscriptions", {
      search: state.search || undefined,
      status: statusFilter || undefined,
      plan: plan || undefined,
      quick_filter: quickFilter || undefined,
      expiry_date_from: expiryFrom || undefined,
      expiry_date_to: expiryTo || undefined,
    }, fmt);
  };

  return (
    <AppLayout title="Subscription Report" portalLabel="Admin Portal">
      <div className="space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-foreground">Subscription Report</h2>
            <p className="text-xs text-muted-foreground">All subscriptions with expiry and status details</p>
          </div>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={() => handleExport("csv")} disabled={exporting}>
              <Download className="mr-1.5 h-3.5 w-3.5" /> CSV
            </Button>
            <Button size="sm" variant="outline" onClick={() => handleExport("xlsx")} disabled={exporting}>
              <Download className="mr-1.5 h-3.5 w-3.5" /> Excel
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <SummaryCard label="Total" value={summary?.total_subscriptions ?? "—"} icon={RefreshCw} color="bg-primary/10 text-primary" />
          <SummaryCard label="Active" value={summary?.active_subscriptions ?? "—"} icon={CheckCircle} color="bg-green-100 text-green-700" />
          <SummaryCard label="Expiring Soon" value={summary?.expiring_soon ?? "—"} icon={Clock} color="bg-amber-100 text-amber-700" />
          <SummaryCard label="Expired" value={summary?.expired ?? "—"} icon={XCircle} color="bg-red-100 text-red-700" />
        </div>

        <div className="flex flex-wrap gap-2">
          {QUICK_FILTERS.map((qf) => (
            <button
              key={qf.value}
              onClick={() => { setQuickFilter(qf.value); setState((s) => ({ ...s, page: 1 })); }}
              className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${quickFilter === qf.value ? "bg-primary text-white" : "bg-muted text-muted-foreground hover:bg-muted/80"}`}
            >
              {qf.label}
            </button>
          ))}
        </div>

        <DataTable
          columns={COLUMNS}
          rows={data?.items ?? []}
          total={data?.total ?? 0}
          state={state}
          onStateChange={(s) => setState(s)}
          rowKey={(r) => r.id}
          isLoading={isLoading}
          emptyMessage="No subscriptions match the current filters"
          filterCount={filterCount}
          filtersNode={
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              <div>
                <label className="mb-1 block text-xs font-medium text-muted-foreground">Status</label>
                <select value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); setState((s) => ({ ...s, page: 1 })); }}
                  className="w-full rounded-lg border border-input bg-background px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-primary/30">
                  <option value="">All Statuses</option>
                  <option value="ACTIVE">Active</option>
                  <option value="EXPIRED">Expired</option>
                  <option value="SUSPENDED">Suspended</option>
                  <option value="CANCELLED">Cancelled</option>
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-muted-foreground">Plan</label>
                <input type="text" value={plan} onChange={(e) => { setPlan(e.target.value); setState((s) => ({ ...s, page: 1 })); }}
                  placeholder="Filter by plan…"
                  className="w-full rounded-lg border border-input bg-background px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-primary/30" />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-muted-foreground">Expiry From</label>
                <input type="date" value={expiryFrom} onChange={(e) => { setExpiryFrom(e.target.value); setState((s) => ({ ...s, page: 1 })); }}
                  className="w-full rounded-lg border border-input bg-background px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-primary/30" />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-muted-foreground">Expiry To</label>
                <input type="date" value={expiryTo} onChange={(e) => { setExpiryTo(e.target.value); setState((s) => ({ ...s, page: 1 })); }}
                  className="w-full rounded-lg border border-input bg-background px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-primary/30" />
              </div>
            </div>
          }
        />
      </div>
    </AppLayout>
  );
}
