import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Download, Eye, Plus } from "lucide-react";

import { AppLayout } from "@/layouts/AppLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  DataTable,
  type DataTableColumn,
  type DataTableState,
  DEFAULT_PAGE_SIZE,
} from "@/components/DataTable";
import { invoicesService } from "@/services/invoices";
import { api } from "@/services/api";
import {
  type InvoiceListItem,
  INVOICE_STATUS_COLORS,
  INVOICE_STATUS_LABELS,
} from "@/types/invoice";

const STATUS_OPTIONS = [
  { label: "All Statuses", value: "" },
  { label: "Draft", value: "DRAFT" },
  { label: "Unpaid", value: "UNPAID" },
  { label: "Partially Paid", value: "PARTIALLY_PAID" },
  { label: "Paid", value: "PAID" },
  { label: "Overdue", value: "OVERDUE" },
  { label: "Cancelled", value: "CANCELLED" },
];

function fmtDate(d: string) {
  return new Date(d).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function fmtMoney(n: string | number) {
  return `₹${Number(n).toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export function InvoiceListPage() {
  const navigate = useNavigate();
  const [tableState, setTableState] = useState<DataTableState>({
    page: 1,
    pageSize: DEFAULT_PAGE_SIZE,
    search: "",
    sortBy: "invoice_date",
    sortDir: "desc",
  });
  const [statusFilter, setStatusFilter] = useState("");

  async function downloadPdf(row: InvoiceListItem) {
    try {
      const resp = await api.get(`/invoices/${row.id}/pdf`, { responseType: "blob" });
      const blob = new Blob([resp.data], { type: "application/pdf" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${row.invoice_number}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch {
      /* silently fail — user can still open the detail page */
    }
  }

  const { data, isLoading } = useQuery({
    queryKey: ["invoices", tableState, statusFilter],
    queryFn: () =>
      invoicesService.list({
        page: tableState.page,
        page_size: tableState.pageSize,
        search: tableState.search,
        sort_by: tableState.sortBy ?? undefined,
        sort_order: tableState.sortDir,
        status: statusFilter || undefined,
      }),
  });

  const columns: DataTableColumn<InvoiceListItem>[] = [
    {
      key: "_sr",
      header: "Sr.",
      className: "w-12 text-center",
      render: (_, index) => (
        <span className="text-sm text-muted-foreground tabular-nums">
          {(tableState.page - 1) * tableState.pageSize + index + 1}
        </span>
      ),
    },
    {
      key: "invoice_number",
      header: "Invoice No.",
      sortable: true,
      render: (row) => (
        <span className="font-mono text-sm font-semibold text-primary">
          {row.invoice_number}
        </span>
      ),
    },
    {
      key: "customer",
      header: "Customer",
      render: (row) => (
        <div>
          <p className="text-sm font-medium text-foreground">
            {row.customer_name_snapshot}
          </p>
          <p className="font-mono text-xs text-muted-foreground">
            {row.customer_code_snapshot}
          </p>
        </div>
      ),
    },
    {
      key: "connection_name_snapshot",
      header: "Connection",
      render: (row) => (
        <span className="font-mono text-xs text-muted-foreground">
          {row.connection_name_snapshot}
        </span>
      ),
    },
    {
      key: "invoice_date",
      header: "Invoice Date",
      sortable: true,
      render: (row) => (
        <span className="text-sm">{fmtDate(row.invoice_date)}</span>
      ),
    },
    {
      key: "due_date",
      header: "Due Date",
      sortable: true,
      render: (row) => (
        <span className="text-sm">{fmtDate(row.due_date)}</span>
      ),
    },
    {
      key: "total_amount",
      header: "Total",
      sortable: true,
      className: "text-right",
      render: (row) => (
        <span className="text-sm font-medium tabular-nums">
          {fmtMoney(row.total_amount)}
        </span>
      ),
    },
    {
      key: "balance_amount",
      header: "Balance",
      sortable: true,
      className: "text-right",
      render: (row) => (
        <span
          className={`text-sm font-medium tabular-nums ${
            Number(row.balance_amount) > 0
              ? "text-red-600"
              : "text-green-600"
          }`}
        >
          {fmtMoney(row.balance_amount)}
        </span>
      ),
    },
    {
      key: "status",
      header: "Status",
      sortable: true,
      render: (row) => (
        <span
          className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${INVOICE_STATUS_COLORS[row.status]}`}
        >
          {INVOICE_STATUS_LABELS[row.status]}
        </span>
      ),
    },
    {
      key: "actions",
      header: "",
      className: "w-32 text-right",
      render: (row) => (
        <div className="flex items-center justify-end gap-1.5">
          <Button
            variant="outline"
            size="sm"
            onClick={() => navigate(`/admin/invoices/${row.id}`)}
            className="gap-1"
          >
            <Eye className="h-3.5 w-3.5" />
            View
          </Button>
          {row.pdf_path && (
            <Button
              variant="outline"
              size="sm"
              className="gap-1"
              onClick={(e) => { e.stopPropagation(); downloadPdf(row); }}
            >
              <Download className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
      ),
    },
  ];

  return (
    <AppLayout title="Invoices" portalLabel="Administration">
      <div className="space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold text-foreground">Invoices</h2>
            <p className="mt-0.5 text-sm text-muted-foreground">
              Generate and manage billing invoices for subscriptions.
            </p>
          </div>
          <Button
            onClick={() => navigate("/admin/invoices/new")}
            className="shrink-0"
          >
            <Plus className="mr-2 h-4 w-4" />
            New Invoice
          </Button>
        </div>

        <Card>
          <CardContent className="p-0">
            <DataTable
              columns={columns}
              rows={data?.items ?? []}
              total={data?.total ?? 0}
              isLoading={isLoading}
              state={tableState}
              onStateChange={setTableState}
              rowKey={(row) => row.id}
              emptyMessage="No invoices found. Generate an invoice from an active subscription."
              filtersNode={
                <select
                  value={statusFilter}
                  onChange={(e) => {
                    setStatusFilter(e.target.value);
                    setTableState((s) => ({ ...s, page: 1 }));
                  }}
                  className="h-9 rounded-lg border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                >
                  {STATUS_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              }
              filterCount={statusFilter ? 1 : 0}
            />
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}
