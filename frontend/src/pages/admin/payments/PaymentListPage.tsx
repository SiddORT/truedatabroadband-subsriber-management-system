import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { usePermission } from "@/hooks/usePermission";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Eye, Plus, Trash2 } from "lucide-react";

import { AppLayout } from "@/layouts/AppLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog } from "@/components/ui/Dialog";
import { Tooltip } from "@/components/ui/tooltip";
import {
  DataTable,
  type DataTableColumn,
  type DataTableState,
  DEFAULT_PAGE_SIZE,
} from "@/components/DataTable";
import { paymentsService } from "@/services/payments";
import { getApiErrorMessage } from "@/services/api";
import { useToast } from "@/contexts/ToastContext";
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

export function PaymentListPage() {
  const navigate = useNavigate();
  const canAddPayment = usePermission("payments", "add");
  const qc = useQueryClient();
  const { showToast } = useToast();

  const [tableState, setTableState] = useState<DataTableState>({
    page: 1,
    pageSize: DEFAULT_PAGE_SIZE,
    search: "",
    sortBy: "payment_date",
    sortDir: "desc",
  });
  const [deleteDialog, setDeleteDialog] = useState<{
    open: boolean;
    payment: PaymentListItem | null;
  }>({ open: false, payment: null });

  const { data, isLoading } = useQuery({
    queryKey: ["payments", tableState],
    queryFn: () =>
      paymentsService.list({
        page: tableState.page,
        page_size: tableState.pageSize,
        search: tableState.search,
        sort_by: tableState.sortBy ?? undefined,
        sort_order: tableState.sortDir,
      }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => paymentsService.delete(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["payments"] });
      showToast("Payment deleted successfully", "success");
      setDeleteDialog({ open: false, payment: null });
    },
    onError: (err) => showToast(getApiErrorMessage(err), "error"),
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
      sortable: true,
      render: (row) => (
        <span className="font-mono text-sm font-semibold text-primary">
          {row.payment_number}
        </span>
      ),
    },
    {
      key: "invoice_id",
      header: "Invoice",
      render: (row) => (
        <Button
          variant="outline"
          size="sm"
          className="gap-1 font-mono text-xs"
          onClick={() => navigate(`/admin/invoices/${row.invoice_id}`)}
        >
          <Eye className="h-3 w-3" />
          View Invoice
        </Button>
      ),
    },
    {
      key: "payment_date",
      header: "Date",
      sortable: true,
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
      sortable: true,
      className: "text-right",
      render: (row) => (
        <span className="text-sm font-semibold text-green-600 tabular-nums">
          {fmtMoney(row.amount)}
        </span>
      ),
    },
    {
      key: "actions",
      header: "",
      className: "w-14 text-right",
      render: (row) => (
        <Tooltip label="Delete Payment">
          <button
            onClick={() => setDeleteDialog({ open: true, payment: row })}
            className="rounded p-1.5 text-muted-foreground transition-colors hover:bg-red-50 hover:text-red-600"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </Tooltip>
      ),
    },
  ];

  return (
    <AppLayout title="Payments" portalLabel="Administration">
      <div className="space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold text-foreground">Payments</h2>
            <p className="mt-0.5 text-sm text-muted-foreground">
              All recorded payments across invoices.
            </p>
          </div>
          {canAddPayment && (
            <Button
              onClick={() => navigate("/admin/payments/new")}
              className="shrink-0"
            >
              <Plus className="mr-2 h-4 w-4" />
              Record Payment
            </Button>
          )}
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
              emptyMessage="No payments recorded yet."
            />
          </CardContent>
        </Card>
      </div>

      {/* ── Delete confirmation dialog ────────────────────────────────── */}
      <Dialog
        open={deleteDialog.open}
        onClose={() => setDeleteDialog({ open: false, payment: null })}
        title="Delete Payment"
      >
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Are you sure you want to delete payment{" "}
            <strong className="font-mono">{deleteDialog.payment?.payment_number}</strong>?
            This action cannot be undone.
          </p>
          <div className="flex justify-end gap-2">
            <Button
              variant="outline"
              onClick={() => setDeleteDialog({ open: false, payment: null })}
            >
              Cancel
            </Button>
            <Button
              className="bg-red-600 text-white hover:bg-red-700"
              onClick={() => {
                if (deleteDialog.payment) deleteMutation.mutate(deleteDialog.payment.id);
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
