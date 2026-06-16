import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Download, Eye, ReceiptText } from "lucide-react";

import { AppLayout } from "@/layouts/AppLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import {
  DataTable,
  type DataTableColumn,
  type DataTableState,
  DEFAULT_PAGE_SIZE,
} from "@/components/DataTable";
import { invoicesService } from "@/services/invoices";
import {
  type InvoiceListItem,
  INVOICE_STATUS_COLORS,
  INVOICE_STATUS_LABELS,
} from "@/types/invoice";

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

export function ClientInvoicePage() {
  const navigate = useNavigate();
  const [tableState, setTableState] = useState<DataTableState>({
    page: 1,
    pageSize: DEFAULT_PAGE_SIZE,
    search: "",
    sortBy: "invoice_date",
    sortDir: "desc",
  });

  const { data, isLoading } = useQuery({
    queryKey: ["client-invoices", tableState.page, tableState.pageSize],
    queryFn: () =>
      invoicesService.clientList({
        page: tableState.page,
        page_size: tableState.pageSize,
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
      render: (row) => (
        <span className="font-mono text-sm font-semibold text-primary">
          {row.invoice_number}
        </span>
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
      render: (row) => (
        <span className="text-sm">{fmtDate(row.invoice_date)}</span>
      ),
    },
    {
      key: "due_date",
      header: "Due Date",
      render: (row) => (
        <span className="text-sm">{fmtDate(row.due_date)}</span>
      ),
    },
    {
      key: "total_amount",
      header: "Total",
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
      className: "text-right",
      render: (row) => (
        <span
          className={`text-sm font-medium tabular-nums ${
            Number(row.balance_amount) > 0 ? "text-red-600" : "text-green-600"
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
          className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${INVOICE_STATUS_COLORS[row.status]}`}
        >
          {INVOICE_STATUS_LABELS[row.status]}
        </span>
      ),
    },
    {
      key: "actions",
      header: "",
      className: "w-24 text-right",
      render: (row) => (
        <div className="flex items-center justify-end gap-1">
          <Button
            variant="outline"
            size="sm"
            onClick={() => navigate(`/client/invoices/${row.id}`)}
            className="gap-1"
          >
            <Eye className="h-3.5 w-3.5" />
            View
          </Button>
          <a
            href={invoicesService.clientPdfUrl(row.id)}
            target="_blank"
            rel="noopener noreferrer"
          >
            <Button variant="outline" size="sm">
              <Download className="h-3.5 w-3.5" />
            </Button>
          </a>
        </div>
      ),
    },
  ];

  return (
    <AppLayout title="My Invoices" portalLabel="Client Portal">
      <div className="space-y-5">
        <div>
          <h2 className="text-xl font-semibold text-foreground">My Invoices</h2>
          <p className="mt-0.5 text-sm text-muted-foreground">
            View and download your billing invoices.
          </p>
        </div>

        <Card>
          <CardHeader className="border-b border-border px-5 py-3.5">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <ReceiptText className="h-4 w-4" />
              <span>
                <span className="font-semibold text-foreground">
                  {data?.total ?? 0}
                </span>{" "}
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
              emptyMessage="No invoices found for your account."
            />
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}
