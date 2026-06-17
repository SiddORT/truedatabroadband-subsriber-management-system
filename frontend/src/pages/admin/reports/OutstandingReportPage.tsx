import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Download, IndianRupee } from "lucide-react";
import { AppLayout } from "@/layouts/AppLayout";
import { DataTable, type DataTableState } from "@/components/DataTable";
import type { DataTableColumn } from "@/components/DataTable";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { reportsService } from "@/services/reports";
import type { OutstandingReportRow, OutstandingReportSummary } from "@/types/reports";
import { useExport } from "./useExport";

const fmtINR = (v: number) =>
  new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(v);
const fmtDate = (d: string) => d ? new Date(d).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : "—";

const BUCKET_COLORS: Record<string, string> = {
  "0-30": "bg-amber-100 text-amber-800",
  "31-60": "bg-orange-100 text-orange-800",
  "61-90": "bg-red-100 text-red-800",
  "90+": "bg-red-200 text-red-900",
};

const COLUMNS: DataTableColumn<OutstandingReportRow>[] = [
  { key: "invoice_number", header: "Invoice #", sortable: true, render: (r) => <span className="font-mono text-xs text-muted-foreground">{r.invoice_number}</span> },
  {
    key: "customer_name", header: "Customer", sortable: true,
    render: (r) => (
      <div>
        <p className="text-xs font-medium text-foreground">{r.customer_name}</p>
        {r.connection_name && <p className="text-[10px] text-muted-foreground">{r.connection_name}</p>}
      </div>
    ),
  },
  { key: "due_date", header: "Due Date", sortable: true, render: (r) => <span className="text-xs text-red-600 font-medium whitespace-nowrap">{fmtDate(r.due_date)}</span> },
  { key: "outstanding_amount", header: "Outstanding", sortable: true, render: (r) => <span className="text-xs font-bold text-red-700 whitespace-nowrap">{fmtINR(r.outstanding_amount)}</span> },
  { key: "days_overdue", header: "Days Overdue", sortable: true, render: (r) => <span className="text-xs font-bold text-red-700">{r.days_overdue}d</span> },
  {
    key: "aging_bucket", header: "Aging",
    render: (r) => (
      <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${BUCKET_COLORS[r.aging_bucket] ?? "bg-muted text-muted-foreground"}`}>
        {r.aging_bucket} days
      </span>
    ),
  },
];

function SummaryCard({ label, value, subcolor }: { label: string; value: string; subcolor?: string }) {
  return (
    <Card>
      <CardContent className="p-4">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className={`text-sm font-bold mt-1 ${subcolor ?? "text-foreground"}`}>{value}</p>
      </CardContent>
    </Card>
  );
}

const DEFAULT_STATE: DataTableState = { page: 1, pageSize: 25, search: "", sortBy: "days_overdue", sortDir: "desc" };

export function OutstandingReportPage() {
  const [state, setState] = useState<DataTableState>(DEFAULT_STATE);
  const [city, setCity] = useState("");
  const [plan, setPlan] = useState("");
  const { triggerExport, exporting } = useExport();

  const params = useMemo(() => ({
    page: state.page,
    page_size: state.pageSize,
    search: state.search || undefined,
    sort_by: state.sortBy ?? "days_overdue",
    sort_order: state.sortDir,
    city: city || undefined,
    plan: plan || undefined,
  }), [state, city, plan]);

  const { data, isLoading } = useQuery({
    queryKey: ["report", "outstanding", params],
    queryFn: () => reportsService.getOutstanding(params),
    staleTime: 30_000,
  });

  const summary = data?.summary as OutstandingReportSummary | undefined;
  const filterCount = [city, plan].filter(Boolean).length;

  const handleExport = (fmt: "csv" | "xlsx") => {
    triggerExport("outstanding", {
      search: state.search || undefined,
      city: city || undefined,
      plan: plan || undefined,
    }, fmt);
  };

  return (
    <AppLayout title="Outstanding Report" portalLabel="Admin Portal">
      <div className="space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-foreground">Outstanding Report</h2>
            <p className="text-xs text-muted-foreground">Overdue invoices with aging buckets</p>
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

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          <SummaryCard label="Total Outstanding" value={summary ? fmtINR(summary.total_outstanding) : "—"} subcolor="text-red-700" />
          <SummaryCard label="0–30 Days" value={summary ? fmtINR(summary.bucket_0_30) : "—"} subcolor="text-amber-700" />
          <SummaryCard label="31–60 Days" value={summary ? fmtINR(summary.bucket_31_60) : "—"} subcolor="text-orange-700" />
          <SummaryCard label="61–90 Days" value={summary ? fmtINR(summary.bucket_61_90) : "—"} subcolor="text-red-700" />
          <SummaryCard label="90+ Days" value={summary ? fmtINR(summary.bucket_90_plus) : "—"} subcolor="text-red-900" />
        </div>

        {!isLoading && data?.total === 0 && !state.search && !city && !plan && (
          <Card>
            <CardContent className="flex flex-col items-center justify-center gap-2 py-12">
              <IndianRupee className="h-8 w-8 text-green-500" />
              <p className="text-sm font-medium text-green-700">No outstanding invoices</p>
              <p className="text-xs text-muted-foreground">All invoices are paid or current</p>
            </CardContent>
          </Card>
        )}

        <DataTable
          columns={COLUMNS}
          rows={data?.items ?? []}
          total={data?.total ?? 0}
          state={state}
          onStateChange={(s) => setState(s)}
          rowKey={(r) => r.id}
          isLoading={isLoading}
          emptyMessage="No overdue invoices found"
          filterCount={filterCount}
          filtersNode={
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-muted-foreground">City</label>
                <input type="text" value={city} onChange={(e) => { setCity(e.target.value); setState((s) => ({ ...s, page: 1 })); }}
                  placeholder="Filter by city…"
                  className="w-full rounded-lg border border-input bg-background px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-primary/30" />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-muted-foreground">Plan</label>
                <input type="text" value={plan} onChange={(e) => { setPlan(e.target.value); setState((s) => ({ ...s, page: 1 })); }}
                  placeholder="Filter by plan…"
                  className="w-full rounded-lg border border-input bg-background px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-primary/30" />
              </div>
            </div>
          }
        />
      </div>
    </AppLayout>
  );
}
