import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  Download,
  Eye,
  Loader2,
  ReceiptText,
  X,
} from "lucide-react";

import { ClientLayout } from "@/layouts/ClientLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  DataTable,
  type DataTableColumn,
  type DataTableState,
  DEFAULT_PAGE_SIZE,
} from "@/components/DataTable";
import { clientService } from "@/services/client";
import { tokenService } from "@/services/api";
import { useToast } from "@/contexts/ToastContext";
import type { ClientInvoiceListItem } from "@/types/client";
const INVOICE_STATUS_COLORS: Record<string, string> = {
  DRAFT: "bg-gray-100 text-gray-600",
  UNPAID: "bg-amber-100 text-amber-700",
  PARTIALLY_PAID: "bg-blue-100 text-blue-700",
  PAID: "bg-emerald-100 text-emerald-700",
  OVERDUE: "bg-red-100 text-red-700",
  CANCELLED: "bg-gray-200 text-gray-500",
};
const INVOICE_STATUS_LABELS: Record<string, string> = {
  DRAFT: "Draft",
  UNPAID: "Unpaid",
  PARTIALLY_PAID: "Partial",
  PAID: "Paid",
  OVERDUE: "Overdue",
  CANCELLED: "Cancelled",
};

const STATUS_OPTIONS = [
  { value: "", label: "All Statuses" },
  { value: "UNPAID", label: "Unpaid" },
  { value: "PARTIALLY_PAID", label: "Partially Paid" },
  { value: "PAID", label: "Paid" },
  { value: "OVERDUE", label: "Overdue" },
  { value: "CANCELLED", label: "Cancelled" },
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

interface Filters {
  status: string;
  invoice_date_start: string;
  invoice_date_end: string;
  due_date_start: string;
  due_date_end: string;
  due_today: boolean;
  due_in_7_days: boolean;
  overdue: boolean;
}

const EMPTY_FILTERS: Filters = {
  status: "",
  invoice_date_start: "",
  invoice_date_end: "",
  due_date_start: "",
  due_date_end: "",
  due_today: false,
  due_in_7_days: false,
  overdue: false,
};

function countFilters(f: Filters) {
  return (
    (f.status ? 1 : 0) +
    (f.invoice_date_start ? 1 : 0) +
    (f.invoice_date_end ? 1 : 0) +
    (f.due_date_start ? 1 : 0) +
    (f.due_date_end ? 1 : 0) +
    (f.due_today ? 1 : 0) +
    (f.due_in_7_days ? 1 : 0) +
    (f.overdue ? 1 : 0)
  );
}

export function ClientInvoicePage() {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  async function handleDownloadPdf(id: string, invoiceNumber?: string) {
    setDownloadingId(id);
    try {
      const token = tokenService.getAccess();
      const resp = await fetch(clientService.invoicePdfUrl(id), {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const blob = await resp.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = invoiceNumber ? `${invoiceNumber}.pdf` : `invoice-${id}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch {
      showToast("Failed to download PDF. Please try again.", "error");
    } finally {
      setDownloadingId(null);
    }
  }

  const [tableState, setTableState] = useState<DataTableState>({
    page: 1,
    pageSize: DEFAULT_PAGE_SIZE,
    search: "",
    sortBy: "invoice_date",
    sortDir: "desc",
  });
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const { data, isLoading } = useQuery({
    queryKey: [
      "client-invoices-list",
      tableState.page,
      tableState.pageSize,
      tableState.search,
      tableState.sortBy,
      tableState.sortDir,
      filters,
    ],
    queryFn: () =>
      clientService.listInvoices({
        page: tableState.page,
        page_size: tableState.pageSize,
        search: tableState.search || undefined,
        sort_by: tableState.sortBy ?? undefined,
        sort_order: tableState.sortDir,
        status: filters.status || undefined,
        invoice_date_start: filters.invoice_date_start || undefined,
        invoice_date_end: filters.invoice_date_end || undefined,
        due_date_start: filters.due_date_start || undefined,
        due_date_end: filters.due_date_end || undefined,
        due_today: filters.due_today || undefined,
        due_in_7_days: filters.due_in_7_days || undefined,
        overdue: filters.overdue || undefined,
      }),
  });

  function setFilter<K extends keyof Filters>(key: K, value: Filters[K]) {
    setFilters((prev) => ({ ...prev, [key]: value }));
    setTableState((prev) => ({ ...prev, page: 1 }));
  }

  function resetFilters() {
    setFilters(EMPTY_FILTERS);
    setTableState((prev) => ({ ...prev, page: 1 }));
  }

  const filterCount = countFilters(filters);

  const filtersNode = (
    <div className="grid grid-cols-1 gap-4 p-4 sm:grid-cols-2 lg:grid-cols-3">
      {/* Status */}
      <div>
        <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Status</label>
        <select
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring"
          value={filters.status}
          onChange={(e) => setFilter("status", e.target.value)}
        >
          {STATUS_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </div>

      {/* Invoice date range */}
      <div>
        <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
          Invoice Date From
        </label>
        <Input
          type="date"
          value={filters.invoice_date_start}
          onChange={(e) => setFilter("invoice_date_start", e.target.value)}
        />
      </div>
      <div>
        <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
          Invoice Date To
        </label>
        <Input
          type="date"
          value={filters.invoice_date_end}
          onChange={(e) => setFilter("invoice_date_end", e.target.value)}
        />
      </div>

      {/* Due date range */}
      <div>
        <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
          Due Date From
        </label>
        <Input
          type="date"
          value={filters.due_date_start}
          onChange={(e) => setFilter("due_date_start", e.target.value)}
        />
      </div>
      <div>
        <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
          Due Date To
        </label>
        <Input
          type="date"
          value={filters.due_date_end}
          onChange={(e) => setFilter("due_date_end", e.target.value)}
        />
      </div>

      {/* Quick filters */}
      <div>
        <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
          Quick Filters
        </label>
        <div className="flex flex-wrap gap-2">
          <button
            className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
              filters.due_today
                ? "border-primary bg-primary text-white"
                : "border-border bg-background text-foreground hover:bg-muted"
            }`}
            onClick={() => setFilter("due_today", !filters.due_today)}
          >
            Due Today
          </button>
          <button
            className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
              filters.due_in_7_days
                ? "border-primary bg-primary text-white"
                : "border-border bg-background text-foreground hover:bg-muted"
            }`}
            onClick={() => setFilter("due_in_7_days", !filters.due_in_7_days)}
          >
            Due in 7 Days
          </button>
          <button
            className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
              filters.overdue
                ? "border-red-500 bg-red-500 text-white"
                : "border-border bg-background text-foreground hover:bg-muted"
            }`}
            onClick={() => setFilter("overdue", !filters.overdue)}
          >
            Overdue
          </button>
        </div>
      </div>

      {/* Reset */}
      {filterCount > 0 && (
        <div className="flex items-end sm:col-span-2 lg:col-span-3">
          <Button variant="ghost" size="sm" onClick={resetFilters} className="text-xs text-muted-foreground">
            <X className="mr-1 h-3.5 w-3.5" />
            Clear all filters
          </Button>
        </div>
      )}
    </div>
  );

  const columns: DataTableColumn<ClientInvoiceListItem>[] = [
    {
      key: "_sr",
      header: "#",
      className: "w-10 text-center",
      render: (_, index) => (
        <span className="text-xs text-muted-foreground tabular-nums">
          {(tableState.page - 1) * tableState.pageSize + index + 1}
        </span>
      ),
    },
    {
      key: "invoice_number",
      header: "Invoice No.",
      render: (row) => (
        <span className="font-mono text-sm font-semibold text-primary">{row.invoice_number}</span>
      ),
    },
    {
      key: "connection_name",
      header: "Connection",
      render: (row) => (
        <span className="text-xs text-muted-foreground">{row.connection_name ?? "—"}</span>
      ),
    },
    {
      key: "invoice_date",
      header: "Invoice Date",
      render: (row) => <span className="text-sm">{fmtDate(row.invoice_date)}</span>,
    },
    {
      key: "due_date",
      header: "Due Date",
      render: (row) => {
        const isOverdue = row.status === "OVERDUE";
        return (
          <span className={`text-sm ${isOverdue ? "font-medium text-red-600" : ""}`}>
            {fmtDate(row.due_date)}
          </span>
        );
      },
    },
    {
      key: "total_amount",
      header: "Total",
      className: "text-right",
      render: (row) => (
        <span className="text-sm tabular-nums">{fmtMoney(row.total_amount)}</span>
      ),
    },
    {
      key: "paid_amount",
      header: "Paid",
      className: "text-right",
      render: (row) => (
        <span className="text-sm text-emerald-600 tabular-nums">{fmtMoney(row.paid_amount)}</span>
      ),
    },
    {
      key: "balance_amount",
      header: "Balance",
      className: "text-right",
      render: (row) => (
        <span
          className={`text-sm font-medium tabular-nums ${
            Number(row.balance_amount) > 0 ? "text-red-600" : "text-emerald-600"
          }`}
        >
          {fmtMoney(row.balance_amount)}
        </span>
      ),
    },
    {
      key: "status",
      header: "Status",
      render: (row) => (
        <span
          className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${INVOICE_STATUS_COLORS[row.status] ?? "bg-gray-100 text-gray-600"}`}
        >
          {INVOICE_STATUS_LABELS[row.status] ?? row.status}
        </span>
      ),
    },
    {
      key: "actions",
      header: "",
      className: "w-32 text-right",
      render: (row) => (
        <div className="flex items-center justify-end gap-1">
          <Button
            variant="outline"
            size="sm"
            onClick={() => navigate(`/client/billing/invoices/${row.id}`)}
            className="gap-1"
          >
            <Eye className="h-3.5 w-3.5" />
            View
          </Button>
          <Button
            variant="outline"
            size="sm"
            title="Download PDF"
            disabled={downloadingId === row.id}
            onClick={() => handleDownloadPdf(row.id, row.invoice_number)}
          >
            {downloadingId === row.id
              ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
              : <Download className="h-3.5 w-3.5" />}
          </Button>
        </div>
      ),
    },
  ];

  return (
    <ClientLayout title="Billing">
      <div className="space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold text-foreground">My Invoices</h2>
            <p className="mt-0.5 text-sm text-muted-foreground">
              View, download, and email your billing invoices.
            </p>
          </div>
        </div>

        <Card>
          <CardHeader className="border-b border-border px-5 py-3.5">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <ReceiptText className="h-4 w-4" />
              <span>
                <span className="font-semibold text-foreground">{data?.total ?? 0}</span>{" "}
                invoice{data?.total !== 1 ? "s" : ""}
              </span>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <DataTable
              columns={columns}
              rows={data?.items ?? []}
              total={data?.total ?? 0}
              isLoading={isLoading}
              state={tableState}
              onStateChange={setTableState}
              rowKey={(row) => row.id}
              emptyMessage="No invoices found."
              filtersNode={filtersNode}
              filterCount={filterCount}
            />
          </CardContent>
        </Card>
      </div>

    </ClientLayout>
  );
}
