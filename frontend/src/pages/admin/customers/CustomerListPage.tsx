import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { Plus, RefreshCw, Eye, Edit, ShieldOff, Key } from "lucide-react";

import {
  DataTable,
  DEFAULT_PAGE_SIZE,
  type DataTableColumn,
  type DataTableState,
} from "@/components/DataTable";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/Dialog";
import { AppLayout } from "@/layouts/AppLayout";
import { useToast } from "@/contexts/ToastContext";
import { customersService } from "@/services/customers";
import { getApiErrorMessage } from "@/services/api";
import type { Customer, CustomerStatus } from "@/types/customer";

const STATUS_COLORS: Record<CustomerStatus, string> = {
  ACTIVE: "bg-green-100 text-green-800",
  SUSPENDED: "bg-amber-100 text-amber-800",
  DISCONNECTED: "bg-red-100 text-red-800",
};

const ALL_STATUSES: CustomerStatus[] = ["ACTIVE", "SUSPENDED", "DISCONNECTED"];

export function CustomerListPage() {
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
  const [statusFilter, setStatusFilter] = useState<CustomerStatus | "">("");

  // Status change dialog
  const [statusDialog, setStatusDialog] = useState<{
    open: boolean;
    customer: Customer | null;
    newStatus: CustomerStatus | null;
  }>({ open: false, customer: null, newStatus: null });

  // Reset password dialog
  const [resetDialog, setResetDialog] = useState<{
    open: boolean;
    customer: Customer | null;
    tempPassword: string | null;
  }>({ open: false, customer: null, tempPassword: null });

  const { data, isLoading } = useQuery({
    queryKey: [
      "customers",
      tableState.page,
      tableState.pageSize,
      tableState.search,
      tableState.sortBy,
      tableState.sortDir,
      statusFilter,
    ],
    queryFn: () =>
      customersService.list({
        page: tableState.page,
        page_size: tableState.pageSize,
        search: tableState.search,
        sort_by: tableState.sortBy ?? "created_at",
        sort_order: tableState.sortDir,
        status: statusFilter || undefined,
      }),
  });

  const statusMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: CustomerStatus }) =>
      customersService.updateStatus(id, status),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["customers"] });
      showToast("Status updated successfully", "success");
      setStatusDialog({ open: false, customer: null, newStatus: null });
    },
    onError: (err) => showToast(getApiErrorMessage(err), "error"),
  });

  const resetMutation = useMutation({
    mutationFn: (id: string) => customersService.resetPassword(id),
    onSuccess: (data, id) => {
      const customer = resetDialog.customer;
      setResetDialog((d) => ({ ...d, tempPassword: data.temp_password }));
    },
    onError: (err) => showToast(getApiErrorMessage(err), "error"),
  });

  const columns: DataTableColumn<Customer>[] = [
    {
      key: "_sr",
      header: "Sr. No.",
      className: "w-14 text-center",
      render: (_row, index) => (
        <span className="text-sm text-muted-foreground tabular-nums">
          {(tableState.page - 1) * tableState.pageSize + index + 1}
        </span>
      ),
    },
    {
      key: "customer_code",
      header: "Code",
      sortable: true,
      render: (row) => (
        <span className="font-mono text-sm font-medium text-primary">
          {row.customer_code}
        </span>
      ),
    },
    { key: "full_name", header: "Full Name", sortable: true },
    { key: "mobile_number", header: "Mobile" },
    { key: "email", header: "Email" },
    {
      key: "status",
      header: "Status",
      sortable: true,
      render: (row) => (
        <span
          className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_COLORS[row.status]}`}
        >
          {row.status}
        </span>
      ),
    },
    {
      key: "created_at",
      header: "Created",
      sortable: true,
      render: (row) => new Date(row.created_at).toLocaleDateString("en-IN"),
    },
    {
      key: "actions",
      header: "Actions",
      className: "text-right",
      render: (row) => (
        <div className="flex items-center justify-end gap-1">
          <button
            onClick={() => navigate(`/admin/customers/${row.id}`)}
            className="rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
            title="View"
          >
            <Eye className="h-4 w-4" />
          </button>
          <button
            onClick={() => navigate(`/admin/customers/${row.id}/edit`)}
            className="rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
            title="Edit"
          >
            <Edit className="h-4 w-4" />
          </button>
          <button
            onClick={() =>
              setStatusDialog({
                open: true,
                customer: row,
                newStatus: row.status === "ACTIVE" ? "SUSPENDED" : "ACTIVE",
              })
            }
            className="rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
            title="Change status"
          >
            <ShieldOff className="h-4 w-4" />
          </button>
          <button
            onClick={() =>
              setResetDialog({ open: true, customer: row, tempPassword: null })
            }
            className="rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
            title="Reset password"
          >
            <Key className="h-4 w-4" />
          </button>
        </div>
      ),
    },
  ];

  return (
    <AppLayout title="Customers" portalLabel="Administration">
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold text-foreground">Customers</h2>
            <p className="text-sm text-muted-foreground">
              {data?.total ?? 0} total customers
            </p>
          </div>
          <Button onClick={() => navigate("/admin/customers/new")}>
            <Plus className="h-4 w-4" />
            New Customer
          </Button>
        </div>

        <Card>
          <CardHeader className="pb-3">
            <div className="flex flex-wrap items-center gap-3">
              <CardTitle className="text-base">All Customers</CardTitle>
              <div className="ml-auto flex items-center gap-2">
                <select
                  value={statusFilter}
                  onChange={(e) => {
                    setStatusFilter(e.target.value as CustomerStatus | "");
                    setTableState((s) => ({ ...s, page: 1 }));
                  }}
                  className="h-9 rounded-md border border-input bg-background px-3 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                >
                  <option value="">All Statuses</option>
                  {ALL_STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <DataTable
              columns={columns}
              rows={data?.items ?? []}
              total={data?.total ?? 0}
              state={tableState}
              onStateChange={setTableState}
              rowKey={(row) => row.id}
              isLoading={isLoading}
              emptyMessage="No customers found. Create your first customer."
            />
          </CardContent>
        </Card>
      </div>

      {/* Status change confirmation */}
      <Dialog
        open={statusDialog.open}
        onClose={() => setStatusDialog({ open: false, customer: null, newStatus: null })}
        title="Change Customer Status"
      >
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Change <strong>{statusDialog.customer?.full_name}</strong> status to{" "}
            <strong>{statusDialog.newStatus}</strong>?
            {statusDialog.newStatus === "DISCONNECTED" && (
              <span className="mt-1 block text-red-600">
                This will disable the customer's login access.
              </span>
            )}
          </p>
          <div className="flex justify-end gap-2">
            <Button
              variant="outline"
              onClick={() =>
                setStatusDialog({ open: false, customer: null, newStatus: null })
              }
            >
              Cancel
            </Button>
            <Button
              onClick={() => {
                if (statusDialog.customer && statusDialog.newStatus) {
                  statusMutation.mutate({
                    id: statusDialog.customer.id,
                    status: statusDialog.newStatus,
                  });
                }
              }}
              disabled={statusMutation.isPending}
            >
              Confirm
            </Button>
          </div>
        </div>
      </Dialog>

      {/* Password reset dialog */}
      <Dialog
        open={resetDialog.open}
        onClose={() => setResetDialog({ open: false, customer: null, tempPassword: null })}
        title={resetDialog.tempPassword ? "New Temporary Password" : "Reset Password"}
      >
        {resetDialog.tempPassword ? (
          <div className="space-y-4">
            <div className="rounded-lg bg-muted/50 p-4 text-sm space-y-2">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Customer</span>
                <span className="font-medium">{resetDialog.customer?.full_name}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">New Password</span>
                <span className="font-mono font-semibold">{resetDialog.tempPassword}</span>
              </div>
            </div>
            <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-3 py-2">
              Copy this password now — it will not be shown again.
            </p>
            <div className="flex justify-end">
              <Button onClick={() => setResetDialog({ open: false, customer: null, tempPassword: null })}>
                Done
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Generate a new temporary password for{" "}
              <strong>{resetDialog.customer?.full_name}</strong>? Their current
              session will be invalidated.
            </p>
            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                onClick={() =>
                  setResetDialog({ open: false, customer: null, tempPassword: null })
                }
              >
                Cancel
              </Button>
              <Button
                onClick={() => {
                  if (resetDialog.customer) {
                    resetMutation.mutate(resetDialog.customer.id);
                  }
                }}
                disabled={resetMutation.isPending}
              >
                Reset Password
              </Button>
            </div>
          </div>
        )}
      </Dialog>
    </AppLayout>
  );
}
