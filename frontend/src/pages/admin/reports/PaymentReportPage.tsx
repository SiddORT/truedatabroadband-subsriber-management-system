import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Download, IndianRupee, Wallet } from "lucide-react";
import { AppLayout } from "@/layouts/AppLayout";
import { DataTable, type DataTableState } from "@/components/DataTable";
import type { DataTableColumn } from "@/components/DataTable";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { reportsService } from "@/services/reports";
import type { PaymentReportRow, PaymentReportSummary } from "@/types/reports";
import { useExport } from "./useExport";

const fmtINR = (v: number) =>
  new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(v);
const fmtDate = (d: string) => d ? new Date(d).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : "—";

const METHOD_COLORS: Record<string, string> = {
  CASH: "bg-green-100 text-green-800",
  UPI: "bg-blue-100 text-blue-800",
  BANK_TRANSFER: "bg-primary/10 text-primary",
  CHEQUE: "bg-amber-100 text-amber-800",
};

const COLUMNS: DataTableColumn<PaymentReportRow>[] = [
  { key: "payment_number", header: "Payment #", sortable: true, render: (r) => <span className="font-mono text-xs text-muted-foreground">{r.payment_number}</span> },
  { key: "invoice_number", header: "Invoice #", render: (r) => <span className="font-mono text-xs text-muted-foreground">{r.invoice_number}</span> },
  { key: "customer_name", header: "Customer", render: (r) => <span className="text-xs font-medium text-foreground">{r.customer_name}</span> },
  { key: "amount", header: "Amount", sortable: true, render: (r) => <span className="text-xs font-bold text-green-700 whitespace-nowrap">{fmtINR(r.amount)}</span> },
  {
    key: "payment_method", header: "Method",
    render: (r) => (
      <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${METHOD_COLORS[r.payment_method] ?? "bg-muted text-muted-foreground"}`}>
        {r.payment_method.replace("_", " ")}
      </span>
    ),
  },
  { key: "payment_date", header: "Payment Date", sortable: true, render: (r) => <span className="text-xs whitespace-nowrap">{fmtDate(r.payment_date)}</span> },
  { key: "transaction_reference", header: "Ref #", render: (r) => <span className="text-xs text-muted-foreground">{r.transaction_reference || "—"}</span> },
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
          <p className="text-sm font-bold text-foreground">{value}</p>
        </div>
      </CardContent>
    </Card>
  );
}

const DEFAULT_STATE: DataTableState = { page: 1, pageSize: 25, search: "", sortBy: "payment_date", sortDir: "desc" };

export function PaymentReportPage() {
  const [state, setState] = useState<DataTableState>(DEFAULT_STATE);
  const [paymentMethod, setPaymentMethod] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const { triggerExport, exporting } = useExport();

  const params = useMemo(() => ({
    page: state.page,
    page_size: state.pageSize,
    search: state.search || undefined,
    sort_by: state.sortBy ?? "payment_date",
    sort_order: state.sortDir,
    payment_method: paymentMethod || undefined,
    date_from: dateFrom || undefined,
    date_to: dateTo || undefined,
  }), [state, paymentMethod, dateFrom, dateTo]);

  const { data, isLoading } = useQuery({
    queryKey: ["report", "payments", params],
    queryFn: () => reportsService.getPayments(params),
    staleTime: 30_000,
  });

  const summary = data?.summary as PaymentReportSummary | undefined;
  const filterCount = [paymentMethod, dateFrom, dateTo].filter(Boolean).length;

  const handleExport = (fmt: "csv" | "xlsx") => {
    triggerExport("payments", {
      search: state.search || undefined,
      payment_method: paymentMethod || undefined,
      date_from: dateFrom || undefined,
      date_to: dateTo || undefined,
    }, fmt);
  };

  return (
    <AppLayout title="Payment Report" portalLabel="Admin Portal">
      <div className="space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-foreground">Payment Report</h2>
            <p className="text-xs text-muted-foreground">All collected payments with method and reference details</p>
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

        <div className="grid grid-cols-2 gap-3">
          <SummaryCard label="Total Payments" value={summary?.total_payments ?? "—"} icon={IndianRupee} color="bg-primary/10 text-primary" />
          <SummaryCard label="Total Collected" value={summary ? fmtINR(summary.total_collection_amount) : "—"} icon={Wallet} color="bg-green-100 text-green-700" />
        </div>

        <DataTable
          columns={COLUMNS}
          rows={data?.items ?? []}
          total={data?.total ?? 0}
          state={state}
          onStateChange={(s) => setState(s)}
          rowKey={(r) => r.id}
          isLoading={isLoading}
          emptyMessage="No payments match the current filters"
          filterCount={filterCount}
          filtersNode={
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-muted-foreground">Payment Method</label>
                <select value={paymentMethod} onChange={(e) => { setPaymentMethod(e.target.value); setState((s) => ({ ...s, page: 1 })); }}
                  className="w-full rounded-lg border border-input bg-background px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-primary/30">
                  <option value="">All Methods</option>
                  <option value="CASH">Cash</option>
                  <option value="UPI">UPI</option>
                  <option value="BANK_TRANSFER">Bank Transfer</option>
                  <option value="CHEQUE">Cheque</option>
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-muted-foreground">Payment From</label>
                <input type="date" value={dateFrom} onChange={(e) => { setDateFrom(e.target.value); setState((s) => ({ ...s, page: 1 })); }}
                  className="w-full rounded-lg border border-input bg-background px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-primary/30" />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-muted-foreground">Payment To</label>
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
