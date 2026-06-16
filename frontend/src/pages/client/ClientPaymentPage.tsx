import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { IndianRupee } from "lucide-react";

import { AppLayout } from "@/layouts/AppLayout";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import {
  DataTable,
  type DataTableColumn,
  type DataTableState,
  DEFAULT_PAGE_SIZE,
} from "@/components/DataTable";
import { paymentsService } from "@/services/payments";
import {
  type PaymentListItem,
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

export function ClientPaymentPage() {
  const [tableState, setTableState] = useState<DataTableState>({
    page: 1,
    pageSize: DEFAULT_PAGE_SIZE,
    search: "",
    sortBy: "payment_date",
    sortDir: "desc",
  });

  const { data, isLoading } = useQuery({
    queryKey: ["client-payments", tableState.page, tableState.pageSize],
    queryFn: () =>
      paymentsService.clientList({
        page: tableState.page,
        page_size: tableState.pageSize,
      }),
  });

  const columns: DataTableColumn<PaymentListItem>[] = [
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
      key: "payment_number",
      header: "Payment No.",
      render: (row) => (
        <span className="font-mono text-sm font-semibold text-primary">
          {row.payment_number}
        </span>
      ),
    },
    {
      key: "payment_date",
      header: "Date",
      render: (row) => (
        <span className="text-sm">{fmtDate(row.payment_date)}</span>
      ),
    },
    {
      key: "payment_method",
      header: "Method",
      render: (row) => (
        <span
          className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${PAYMENT_METHOD_COLORS[row.payment_method as PaymentMethod] ?? "bg-gray-100 text-gray-700"}`}
        >
          {PAYMENT_METHOD_LABELS[row.payment_method as PaymentMethod] ??
            row.payment_method}
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
        <span className="text-sm font-semibold text-green-600 tabular-nums">
          {fmtMoney(row.amount)}
        </span>
      ),
    },
  ];

  return (
    <AppLayout title="Payment History" portalLabel="Client Portal">
      <div className="space-y-5">
        <div>
          <h2 className="text-xl font-semibold text-foreground">
            Payment History
          </h2>
          <p className="mt-0.5 text-sm text-muted-foreground">
            All payments recorded for your account.
          </p>
        </div>

        <Card>
          <CardHeader className="border-b border-border px-5 py-3.5">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <IndianRupee className="h-4 w-4" />
              <span>
                <span className="font-semibold text-foreground">
                  {data?.total ?? 0}
                </span>{" "}
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
              emptyMessage="No payments found for your account."
            />
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}
