import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Download, ReceiptText, IndianRupee, Wallet, AlertCircle } from "lucide-react";
import { AppLayout } from "@/layouts/AppLayout";
import { DataTable, type DataTableState } from "@/components/DataTable";
import type { DataTableColumn } from "@/components/DataTable";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { reportsService } from "@/services/reports";
import type { InvoiceReportRow, InvoiceReportSummary } from "@/types/reports";
import { useExport } from "./useExport";

const fmtINR = (v: number) =>
  new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(v);
const fmtDate = (d: string) => d ? new Date(d).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : "—";

const STATUS_COLORS: Record<string, string> = {
  DRAFT: "bg-muted text-muted-foreground",
  UNPAID: "bg-amber-100 text-amber-800",
  PARTIALLY_PAID: "bg-blue-100 text-blue-800",
  PAID: "bg-green-100 text-green-800",
  OVERDUE: "bg-red-100 text-red-800",
  CANCELLED: "bg-gray-100 text-gray-500",
};

const COLUMNS: DataTableColumn<InvoiceReportRow>[] = [
  { key: "invoice_number", header: "Invoice #", sortable: true, render: (r) => <span className="font-mono text-xs text-muted-foreground">{r.invoice_number}</span> },
  {
    key: "customer_name", header: "Customer", sortable: false,
    render: (r) => (
      <div>
        <p className="font-medium text-foreground text-xs">{r.customer_name}</p>
        {r.connection_name && <p className="text-[10px] text-muted-foreground">{r.connection_name}</p>}
      </div>
    ),
  },
  { key: "plan_name", header: "Plan", render: (r) => <span className="text-xs">{r.plan_name || "—"}</span> },
  { key: "invoice_date", header: "Invoice Date", sortable: true, render: (r) => <span className="text-xs whitespace-nowrap">{fmtDate(r.invoice_date)}</span> },
  { key: "due_date", header: "Due Date", sortable: true, render: (r) => <span className="text-xs whitespace-nowrap">{fmtDate(r.due_date)}</span> },
  { key: "total_amount", header: "Total", sortable: true, render: (r) => <span className="text-xs font-semibold whitespace-nowrap">{fmtINR(r.total_amount)}</span> },
  { key: "paid_amount", header: "Paid", sortable: false, render: (r) => <span className="text-xs text-green-700 whitespace-nowrap">{fmtINR(r.paid_amount)}</span> },
  { key: "balance_amount", header: "Balance", sortable: true, render: (r) => <span className={`text-xs font-bold whitespace-nowrap ${r.balance_amount > 0 ? "text-red-600" : "text-muted-foreground"}`}>{fmtINR(r.balance_amount)}</span> },
  {
    key: "status", header: "Status", sortable: true,
    render: (r) => (
      <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${STATUS_COLORS[r.status] ?? "bg-muted text-muted-foreground"}`}>
        {r.status.replace("_", " ")}
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
        <div className="min-w-0">
          <p className="text-xs text-muted-foreground">{label}</p>
          <p className="text-sm font-bold text-foreground">{value}</p>
        </div>
      </CardContent>
    </Card>
  );
}

const QUICK_FILTERS = [
  { label: "All", value: "" },
  { label: "Due Today", value: "due_today" },
  { label: "Due 7d", value: "due_7d" },
  { label: "Due 15d", value: "due_15d" },
  { label: "Due 30d", value: "due_30d" },
  { label: "Overdue", value: "overdue" },
];

const DEFAULT_STATE: DataTableState = { page: 1, pageSize: 25, search: "", sortBy: "created_at", sortDir: "desc" };

export function InvoiceReportPage() {
  const [state, setState] = useState<DataTableState>(DEFAULT_STATE);
  const [statusFilter, setStatusFilter] = useState("");
  const [plan, setPlan] = useState("");
  const [quickFilter, setQuickFilter] = useState("");
  const [invDateFrom, setInvDateFrom] = useState("");
  const [invDateTo, setInvDateTo] = useState("");
  const [dueDateFrom, setDueDateFrom] = useState("");
  const [dueDateTo, setDueDateTo] = useState("");
  const { triggerExport, exporting } = useExport();

  const params = useMemo(() => ({
    page: state.page,
    page_size: state.pageSize,
    search: state.search || undefined,
    sort_by: state.sortBy ?? "created_at",
    sort_order: state.sortDir,
    status: statusFilter || undefined,
    plan: plan || undefined,
    quick_filter: quickFilter || undefined,
    invoice_date_from: invDateFrom || undefined,
    invoice_date_to: invDateTo || undefined,
    due_date_from: dueDateFrom || undefined,
    due_date_to: dueDateTo || undefined,
  }), [state, statusFilter, plan, quickFilter, invDateFrom, invDateTo, dueDateFrom, dueDateTo]);

  const { data, isLoading } = useQuery({
    queryKey: ["report", "invoices", params],
    queryFn: () => reportsService.getInvoices(params),
    staleTime: 30_000,
  });

  const summary = data?.summary as InvoiceReportSummary | undefined;
  const filterCount = [statusFilter, plan, quickFilter, invDateFrom, invDateTo, dueDateFrom, dueDateTo].filter(Boolean).length;

  const handleExport = (fmt: "csv" | "xlsx") => {
    triggerExport("invoices", {
      search: state.search || undefined,
      status: statusFilter || undefined,
      plan: plan || undefined,
      quick_filter: quickFilter || undefined,
      invoice_date_from: invDateFrom || undefined,
      invoice_date_to: invDateTo || undefined,
      due_date_from: dueDateFrom || undefined,
      due_date_to: dueDateTo || undefined,
    }, fmt);
  };

  return (
    <AppLayout title="Invoice Report" portalLabel="Admin Portal">
      <div className="space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-foreground">Invoice Report</h2>
            <p className="text-xs text-muted-foreground">Full invoice history with payment tracking</p>
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
          <SummaryCard label="Total Invoices" value={summary?.total_invoices ?? "—"} icon={ReceiptText} color="bg-primary/10 text-primary" />
          <SummaryCard label="Total Invoiced" value={summary ? fmtINR(summary.total_invoiced_amount) : "—"} icon={IndianRupee} color="bg-blue-100 text-blue-700" />
          <SummaryCard label="Collected" value={summary ? fmtINR(summary.total_collected_amount) : "—"} icon={Wallet} color="bg-green-100 text-green-700" />
          <SummaryCard label="Outstanding" value={summary ? fmtINR(summary.total_outstanding_amount) : "—"} icon={AlertCircle} color="bg-red-100 text-red-700" />
        </div>

        <div className="flex flex-wrap gap-2">
          {QUICK_FILTERS.map((qf) => (
            <button key={qf.value}
              onClick={() => { setQuickFilter(qf.value); setState((s) => ({ ...s, page: 1 })); }}
              className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${quickFilter === qf.value ? "bg-primary text-white" : "bg-muted text-muted-foreground hover:bg-muted/80"}`}>
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
          emptyMessage="No invoices match the current filters"
          filterCount={filterCount}
          filtersNode={
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              <div>
                <label className="mb-1 block text-xs font-medium text-muted-foreground">Status</label>
                <select value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); setState((s) => ({ ...s, page: 1 })); }}
                  className="w-full rounded-lg border border-input bg-background px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-primary/30">
                  <option value="">All Statuses</option>
                  <option value="DRAFT">Draft</option>
                  <option value="UNPAID">Unpaid</option>
                  <option value="PARTIALLY_PAID">Partially Paid</option>
                  <option value="PAID">Paid</option>
                  <option value="OVERDUE">Overdue</option>
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
                <label className="mb-1 block text-xs font-medium text-muted-foreground">Invoice From</label>
                <input type="date" value={invDateFrom} onChange={(e) => { setInvDateFrom(e.target.value); setState((s) => ({ ...s, page: 1 })); }}
                  className="w-full rounded-lg border border-input bg-background px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-primary/30" />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-muted-foreground">Invoice To</label>
                <input type="date" value={invDateTo} onChange={(e) => { setInvDateTo(e.target.value); setState((s) => ({ ...s, page: 1 })); }}
                  className="w-full rounded-lg border border-input bg-background px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-primary/30" />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-muted-foreground">Due From</label>
                <input type="date" value={dueDateFrom} onChange={(e) => { setDueDateFrom(e.target.value); setState((s) => ({ ...s, page: 1 })); }}
                  className="w-full rounded-lg border border-input bg-background px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-primary/30" />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-muted-foreground">Due To</label>
                <input type="date" value={dueDateTo} onChange={(e) => { setDueDateTo(e.target.value); setState((s) => ({ ...s, page: 1 })); }}
                  className="w-full rounded-lg border border-input bg-background px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-primary/30" />
              </div>
            </div>
          }
        />
      </div>
    </AppLayout>
  );
}
