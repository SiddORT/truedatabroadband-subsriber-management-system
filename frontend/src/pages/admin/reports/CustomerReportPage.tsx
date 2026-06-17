import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Download, Users, UserCheck, Building2, User } from "lucide-react";
import { AppLayout } from "@/layouts/AppLayout";
import { DataTable, type DataTableState } from "@/components/DataTable";
import type { DataTableColumn } from "@/components/DataTable";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { reportsService } from "@/services/reports";
import type { CustomerReportRow, CustomerReportSummary } from "@/types/reports";
import { useExport } from "./useExport";

const fmtINR = (v: number) =>
  new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(v);

const STATUS_COLORS: Record<string, string> = {
  ACTIVE: "bg-green-100 text-green-800",
  SUSPENDED: "bg-amber-100 text-amber-800",
  DISCONNECTED: "bg-red-100 text-red-800",
};

const COLUMNS: DataTableColumn<CustomerReportRow>[] = [
  { key: "customer_code", header: "Code", sortable: true, render: (r) => <span className="font-mono text-xs text-muted-foreground">{r.customer_code}</span> },
  { key: "full_name", header: "Customer Name", sortable: true, render: (r) => <span className="font-medium text-foreground">{r.full_name}</span> },
  { key: "customer_type", header: "Type", render: (r) => <span className="capitalize text-xs">{r.customer_type.toLowerCase()}</span> },
  { key: "city", header: "City", sortable: true },
  { key: "mobile_number", header: "Mobile" },
  {
    key: "active_subscription_count",
    header: "Active Subs",
    sortable: false,
    render: (r) => <span className={`font-semibold ${r.active_subscription_count > 0 ? "text-green-700" : "text-muted-foreground"}`}>{r.active_subscription_count}</span>,
  },
  {
    key: "outstanding_amount",
    header: "Outstanding",
    sortable: false,
    render: (r) => <span className={r.outstanding_amount > 0 ? "font-semibold text-red-600" : "text-muted-foreground"}>{fmtINR(r.outstanding_amount)}</span>,
  },
  {
    key: "status",
    header: "Status",
    sortable: true,
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

const DEFAULT_STATE: DataTableState = { page: 1, pageSize: 25, search: "", sortBy: "created_at", sortDir: "desc" };

export function CustomerReportPage() {
  const [state, setState] = useState<DataTableState>(DEFAULT_STATE);
  const [status, setStatus] = useState("");
  const [customerType, setCustomerType] = useState("");
  const [city, setCity] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const { triggerExport, exporting } = useExport();

  const params = useMemo(() => ({
    page: state.page,
    page_size: state.pageSize,
    search: state.search || undefined,
    sort_by: state.sortBy ?? "created_at",
    sort_order: state.sortDir,
    status: status || undefined,
    customer_type: customerType || undefined,
    city: city || undefined,
    date_from: dateFrom || undefined,
    date_to: dateTo || undefined,
  }), [state, status, customerType, city, dateFrom, dateTo]);

  const { data, isLoading } = useQuery({
    queryKey: ["report", "customers", params],
    queryFn: () => reportsService.getCustomers(params),
    staleTime: 30_000,
  });

  const summary = data?.summary as CustomerReportSummary | undefined;
  const filterCount = [status, customerType, city, dateFrom, dateTo].filter(Boolean).length;

  const handleExport = (fmt: "csv" | "xlsx") => {
    triggerExport("customers", {
      search: state.search || undefined,
      status: status || undefined,
      customer_type: customerType || undefined,
      city: city || undefined,
      date_from: dateFrom || undefined,
      date_to: dateTo || undefined,
    }, fmt);
  };

  return (
    <AppLayout title="Customer Report" portalLabel="Admin Portal">
      <div className="space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-foreground">Customer Report</h2>
            <p className="text-xs text-muted-foreground">All customers with subscription and outstanding data</p>
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
          <SummaryCard label="Total Customers" value={summary?.total_customers ?? "—"} icon={Users} color="bg-primary/10 text-primary" />
          <SummaryCard label="Active Customers" value={summary?.active_customers ?? "—"} icon={UserCheck} color="bg-green-100 text-green-700" />
          <SummaryCard label="Business" value={summary?.business_customers ?? "—"} icon={Building2} color="bg-blue-100 text-blue-700" />
          <SummaryCard label="Individual" value={summary?.individual_customers ?? "—"} icon={User} color="bg-secondary/20 text-secondary" />
        </div>

        <DataTable
          columns={COLUMNS}
          rows={data?.items ?? []}
          total={data?.total ?? 0}
          state={state}
          onStateChange={(s) => setState({ ...s, page: s.search !== state.search || JSON.stringify(s) !== JSON.stringify(state) ? (s.page !== state.page ? s.page : 1) : s.page })}
          rowKey={(r) => r.id}
          isLoading={isLoading}
          emptyMessage="No customers match the current filters"
          filterCount={filterCount}
          filtersNode={
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
              <div>
                <label className="mb-1 block text-xs font-medium text-muted-foreground">Status</label>
                <select value={status} onChange={(e) => { setStatus(e.target.value); setState((s) => ({ ...s, page: 1 })); }}
                  className="w-full rounded-lg border border-input bg-background px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-primary/30">
                  <option value="">All Statuses</option>
                  <option value="ACTIVE">Active</option>
                  <option value="SUSPENDED">Suspended</option>
                  <option value="DISCONNECTED">Disconnected</option>
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-muted-foreground">Type</label>
                <select value={customerType} onChange={(e) => { setCustomerType(e.target.value); setState((s) => ({ ...s, page: 1 })); }}
                  className="w-full rounded-lg border border-input bg-background px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-primary/30">
                  <option value="">All Types</option>
                  <option value="INDIVIDUAL">Individual</option>
                  <option value="BUSINESS">Business</option>
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-muted-foreground">City</label>
                <input type="text" value={city} onChange={(e) => { setCity(e.target.value); setState((s) => ({ ...s, page: 1 })); }}
                  placeholder="Filter by city…"
                  className="w-full rounded-lg border border-input bg-background px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-primary/30" />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-muted-foreground">Created From</label>
                <input type="date" value={dateFrom} onChange={(e) => { setDateFrom(e.target.value); setState((s) => ({ ...s, page: 1 })); }}
                  className="w-full rounded-lg border border-input bg-background px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-primary/30" />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-muted-foreground">Created To</label>
                <input type="date" value={dateTo} onChange={(e) => { setDateTo(e.target.value); setState((s) => ({ ...s, page: 1 })); }}
                  className="w-full rounded-lg border border-input bg-background px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-primary/30" />
              </div>
            </div>
          }
        />
      </div>
    </AppLayout>
  );
}
