import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, IndianRupee, X } from "lucide-react";

import { ClientLayout } from "@/layouts/ClientLayout";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  DataTable,
  type DataTableColumn,
  type DataTableState,
  DEFAULT_PAGE_SIZE,
} from "@/components/DataTable";
import { clientService } from "@/services/client";
import type { ClientPaymentListItem } from "@/types/client";
import {
  PAYMENT_METHOD_COLORS,
  PAYMENT_METHOD_LABELS,
  type PaymentMethod,
} from "@/types/payment";

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
  payment_date_start: string;
  payment_date_end: string;
}

const EMPTY_FILTERS: Filters = {
  payment_date_start: "",
  payment_date_end: "",
};

function countFilters(f: Filters) {
  return (f.payment_date_start ? 1 : 0) + (f.payment_date_end ? 1 : 0);
}

export function ClientPaymentPage() {
  const [tableState, setTableState] = useState<DataTableState>({
    page: 1,
    pageSize: DEFAULT_PAGE_SIZE,
    search: "",
    sortBy: "payment_date",
    sortDir: "desc",
  });
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);

  const { data, isLoading } = useQuery({
    queryKey: [
      "client-payments-list",
      tableState.page,
      tableState.pageSize,
      tableState.search,
      tableState.sortBy,
      tableState.sortDir,
      filters,
    ],
    queryFn: () =>
      clientService.listPayments({
        page: tableState.page,
        page_size: tableState.pageSize,
        search: tableState.search || undefined,
        sort_by: tableState.sortBy ?? undefined,
        sort_order: tableState.sortDir,
        payment_date_start: filters.payment_date_start || undefined,
        payment_date_end: filters.payment_date_end || undefined,
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
      <div>
        <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
          Payment Date From
        </label>
        <Input
          type="date"
          value={filters.payment_date_start}
          onChange={(e) => setFilter("payment_date_start", e.target.value)}
        />
      </div>
      <div>
        <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
          Payment Date To
        </label>
        <Input
          type="date"
          value={filters.payment_date_end}
          onChange={(e) => setFilter("payment_date_end", e.target.value)}
        />
      </div>
      {filterCount > 0 && (
        <div className="flex items-end">
          <Button variant="ghost" size="sm" onClick={resetFilters} className="text-xs text-muted-foreground">
            <X className="mr-1 h-3.5 w-3.5" />
            Clear filters
          </Button>
        </div>
      )}
    </div>
  );

  const columns: DataTableColumn<ClientPaymentListItem>[] = [
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
      key: "payment_number",
      header: "Payment No.",
      render: (row) => (
        <span className="font-mono text-sm font-semibold text-primary">{row.payment_number}</span>
      ),
    },
    {
      key: "payment_date",
      header: "Date",
      render: (row) => <span className="text-sm">{fmtDate(row.payment_date)}</span>,
    },
    {
      key: "invoice_number",
      header: "Invoice No.",
      render: (row) => (
        <span className="font-mono text-xs text-muted-foreground">{row.invoice_number}</span>
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
      key: "payment_method",
      header: "Method",
      render: (row) => (
        <span
          className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${PAYMENT_METHOD_COLORS[row.payment_method as PaymentMethod] ?? "bg-gray-100 text-gray-700"}`}
        >
          {PAYMENT_METHOD_LABELS[row.payment_method as PaymentMethod] ?? row.payment_method}
        </span>
      ),
    },
    {
      key: "transaction_reference",
      header: "Reference",
      render: (row) => (
        <span className="font-mono text-xs text-muted-foreground">
          {row.transaction_reference ?? "—"}
        </span>
      ),
    },
    {
      key: "amount",
      header: "Amount",
      className: "text-right",
      render: (row) => (
        <span className="text-sm font-semibold text-emerald-600 tabular-nums">
          {fmtMoney(row.amount)}
        </span>
      ),
    },
  ];

  const navigate = useNavigate();

  return (
    <ClientLayout title="Billing">
      <div className="space-y-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <Button variant="ghost" size="sm" className="-ml-2 mb-1" onClick={() => navigate("/client/billing")}>
              <ArrowLeft className="mr-1 h-4 w-4" />
              Billing
            </Button>
            <h2 className="text-xl font-semibold text-foreground">Payment History</h2>
            <p className="mt-0.5 text-sm text-muted-foreground">
              All payments recorded for your account.
            </p>
          </div>
        </div>

        <Card>
          <CardHeader className="border-b border-border px-5 py-3.5">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <IndianRupee className="h-4 w-4" />
              <span>
                <span className="font-semibold text-foreground">{data?.total ?? 0}</span>{" "}
                payment{data?.total !== 1 ? "s" : ""}
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
              emptyMessage="No payment history found."
              filtersNode={filtersNode}
              filterCount={filterCount}
            />
          </CardContent>
        </Card>
      </div>
    </ClientLayout>
  );
}
