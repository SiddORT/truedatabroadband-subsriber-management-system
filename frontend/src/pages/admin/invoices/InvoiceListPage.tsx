import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Download, Eye, Plus, Trash2 } from "lucide-react";

import { AppLayout } from "@/layouts/AppLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog } from "@/components/ui/Dialog";
import {
  DataTable,
  type DataTableColumn,
  type DataTableState,
  DEFAULT_PAGE_SIZE,
} from "@/components/DataTable";
import { invoicesService } from "@/services/invoices";
import { api, getApiErrorMessage } from "@/services/api";
import { useToast } from "@/contexts/ToastContext";
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
  const qc = useQueryClient();
  const { showToast } = useToast();

  const [tableState, setTableState] = useState<DataTableState>({
    page: 1,
    pageSize: DEFAULT_PAGE_SIZE,
    search: "",
    sortBy: "created_at",
    sortDir: "desc",
  });
  const [statusFilter, setStatusFilter] = useState("");
  const [customerFilter, setCustomerFilter] = useState("");
  const [planFilter, setPlanFilter] = useState("");
  const [invoiceDateFrom, setInvoiceDateFrom] = useState("");
  const [invoiceDateTo, setInvoiceDateTo] = useState("");
  const [dueDateFrom, setDueDateFrom] = useState("");
  const [dueDateTo, setDueDateTo] = useState("");
  const [quickFilter, setQuickFilter] = useState("");
  const [deleteDialog, setDeleteDialog] = useState<{
    open: boolean;
    invoice: InvoiceListItem | null;
  }>({ open: false, invoice: null });

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

  const activeFilterCount = [statusFilter, customerFilter, planFilter, invoiceDateFrom, invoiceDateTo, dueDateFrom, dueDateTo, quickFilter].filter(Boolean).length;

  const { data, isLoading } = useQuery({
    queryKey: ["invoices", tableState, statusFilter, customerFilter, planFilter, invoiceDateFrom, invoiceDateTo, dueDateFrom, dueDateTo, quickFilter],
    queryFn: () =>
      invoicesService.list({
        page: tableState.page,
        page_size: tableState.pageSize,
        search: tableState.search,
        sort_by: tableState.sortBy ?? undefined,
        sort_order: tableState.sortDir,
        status: statusFilter || undefined,
        customer_filter: customerFilter || undefined,
        plan_filter: planFilter || undefined,
        invoice_date_from: invoiceDateFrom || undefined,
        invoice_date_to: invoiceDateTo || undefined,
        due_date_from: dueDateFrom || undefined,
        due_date_to: dueDateTo || undefined,
        quick_filter: quickFilter || undefined,
      }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => invoicesService.delete(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["invoices"] });
      showToast("Invoice deleted successfully", "success");
      setDeleteDialog({ open: false, invoice: null });
    },
    onError: (err) => showToast(getApiErrorMessage(err), "error"),
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
      className: "w-36 text-right",
      render: (row) => (
        <div className="flex items-center justify-end gap-1">
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
          <button
            onClick={() => setDeleteDialog({ open: true, invoice: row })}
            className="rounded p-1.5 text-muted-foreground transition-colors hover:bg-red-50 hover:text-red-600"
            title="Delete invoice"
          >
            <Trash2 className="h-4 w-4" />
          </button>
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
                <div className="flex flex-wrap gap-2">
                  <select
                    value={statusFilter}
                    onChange={(e) => { setStatusFilter(e.target.value); setTableState((s) => ({ ...s, page: 1 })); }}
                    className="h-9 rounded-lg border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                  >
                    {STATUS_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>
                  <select
                    value={quickFilter}
                    onChange={(e) => { setQuickFilter(e.target.value); setTableState((s) => ({ ...s, page: 1 })); }}
                    className="h-9 rounded-lg border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                  >
                    <option value="">All Due Dates</option>
                    <option value="due_today">Due Today</option>
                    <option value="due_7d">Due in 7 days</option>
                    <option value="due_15d">Due in 15 days</option>
                    <option value="due_30d">Due in 30 days</option>
                    <option value="overdue">Overdue</option>
                  </select>
                  <input
                    type="text"
                    placeholder="Customer name / code"
                    value={customerFilter}
                    onChange={(e) => { setCustomerFilter(e.target.value); setTableState((s) => ({ ...s, page: 1 })); }}
                    className="h-9 w-44 rounded-lg border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                  />
                  <input
                    type="text"
                    placeholder="Plan name / code"
                    value={planFilter}
                    onChange={(e) => { setPlanFilter(e.target.value); setTableState((s) => ({ ...s, page: 1 })); }}
                    className="h-9 w-40 rounded-lg border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                  />
                  <div className="flex items-center gap-1">
                    <span className="text-xs text-muted-foreground">Invoice:</span>
                    <input type="date" value={invoiceDateFrom} onChange={(e) => { setInvoiceDateFrom(e.target.value); setTableState((s) => ({ ...s, page: 1 })); }} className="h-9 rounded-lg border border-input bg-background px-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
                    <span className="text-xs text-muted-foreground">–</span>
                    <input type="date" value={invoiceDateTo} onChange={(e) => { setInvoiceDateTo(e.target.value); setTableState((s) => ({ ...s, page: 1 })); }} className="h-9 rounded-lg border border-input bg-background px-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
                  </div>
                  <div className="flex items-center gap-1">
                    <span className="text-xs text-muted-foreground">Due:</span>
                    <input type="date" value={dueDateFrom} onChange={(e) => { setDueDateFrom(e.target.value); setTableState((s) => ({ ...s, page: 1 })); }} className="h-9 rounded-lg border border-input bg-background px-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
                    <span className="text-xs text-muted-foreground">–</span>
                    <input type="date" value={dueDateTo} onChange={(e) => { setDueDateTo(e.target.value); setTableState((s) => ({ ...s, page: 1 })); }} className="h-9 rounded-lg border border-input bg-background px-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
                  </div>
                  {activeFilterCount > 0 && (
                    <button
                      onClick={() => { setStatusFilter(""); setCustomerFilter(""); setPlanFilter(""); setInvoiceDateFrom(""); setInvoiceDateTo(""); setDueDateFrom(""); setDueDateTo(""); setQuickFilter(""); setTableState((s) => ({ ...s, page: 1 })); }}
                      className="h-9 rounded-lg border border-border px-3 text-sm text-muted-foreground hover:border-destructive hover:text-destructive"
                    >
                      Clear all
                    </button>
                  )}
                </div>
              }
              filterCount={activeFilterCount}
            />
          </CardContent>
        </Card>
      </div>

      {/* ── Delete confirmation dialog ────────────────────────────────── */}
      <Dialog
        open={deleteDialog.open}
        onClose={() => setDeleteDialog({ open: false, invoice: null })}
        title="Delete Invoice"
      >
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Are you sure you want to delete invoice{" "}
            <strong className="font-mono">{deleteDialog.invoice?.invoice_number}</strong>{" "}
            for <strong>{deleteDialog.invoice?.customer_name_snapshot}</strong>?
            This action cannot be undone.
          </p>
          <div className="flex justify-end gap-2">
            <Button
              variant="outline"
              onClick={() => setDeleteDialog({ open: false, invoice: null })}
            >
              Cancel
            </Button>
            <Button
              className="bg-red-600 text-white hover:bg-red-700"
              onClick={() => {
                if (deleteDialog.invoice) deleteMutation.mutate(deleteDialog.invoice.id);
              }}
              disabled={deleteMutation.isPending}
            >
              Delete
            </Button>
          </div>
        </div>
      </Dialog>
    </AppLayout>
  );
}
