import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { Plus, Eye, Edit, ShieldOff, Key, Trash2 } from "lucide-react";
import { Tooltip } from "@/components/ui/tooltip";

import {
  DataTable,
  DEFAULT_PAGE_SIZE,
  type DataTableColumn,
  type DataTableState,
} from "@/components/DataTable";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/Dialog";
import { AppLayout } from "@/layouts/AppLayout";
import { usePermission } from "@/hooks/usePermission";
import { useToast } from "@/contexts/ToastContext";
import { customersService } from "@/services/customers";
import { getApiErrorMessage } from "@/services/api";
import type { Customer, CustomerStatus } from "@/types/customer";

const STATUS_COLORS: Record<CustomerStatus, string> = {
  ACTIVE: "bg-green-100 text-green-800 border border-green-200",
  SUSPENDED: "bg-amber-100 text-amber-800 border border-amber-200",
  DISCONNECTED: "bg-red-100 text-red-800 border border-red-200",
};

const ALL_STATUSES: CustomerStatus[] = ["ACTIVE", "SUSPENDED", "DISCONNECTED"];

export function CustomerListPage() {
  const navigate = useNavigate();
  const canAddCustomer    = usePermission("customers", "add");
  const canEditCustomer   = usePermission("customers", "edit");
  const canDeleteCustomer = usePermission("customers", "delete");
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
  const [customerTypeFilter, setCustomerTypeFilter] = useState("");
  const [cityFilter, setCityFilter] = useState("");
  const [refSourceFilter, setRefSourceFilter] = useState("");
  const [salesPersonFilter, setSalesPersonFilter] = useState("");

  const [statusDialog, setStatusDialog] = useState<{
    open: boolean;
    customer: Customer | null;
    selectedStatus: CustomerStatus;
  }>({ open: false, customer: null, selectedStatus: "SUSPENDED" });

  const [resetDialog, setResetDialog] = useState<{
    open: boolean;
    customer: Customer | null;
    tempPassword: string | null;
  }>({ open: false, customer: null, tempPassword: null });

  const [deleteDialog, setDeleteDialog] = useState<{
    open: boolean;
    customer: Customer | null;
  }>({ open: false, customer: null });

  const activeFilterCount = [statusFilter, customerTypeFilter, cityFilter, refSourceFilter, salesPersonFilter].filter(Boolean).length;

  const { data, isLoading } = useQuery({
    queryKey: [
      "customers",
      tableState.page,
      tableState.pageSize,
      tableState.search,
      tableState.sortBy,
      tableState.sortDir,
      statusFilter,
      customerTypeFilter,
      cityFilter,
      refSourceFilter,
      salesPersonFilter,
    ],
    queryFn: () =>
      customersService.list({
        page: tableState.page,
        page_size: tableState.pageSize,
        search: tableState.search,
        sort_by: tableState.sortBy ?? "created_at",
        sort_order: tableState.sortDir,
        status: statusFilter || undefined,
        customer_type: customerTypeFilter || undefined,
        city: cityFilter || undefined,
        reference_source: refSourceFilter || undefined,
        sales_person: salesPersonFilter || undefined,
      }),
  });

  const statusMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: CustomerStatus }) =>
      customersService.updateStatus(id, status),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["customers"] });
      showToast("Status updated successfully", "success");
      setStatusDialog((d) => ({ ...d, open: false }));
    },
    onError: (err) => showToast(getApiErrorMessage(err), "error"),
  });

  const resetMutation = useMutation({
    mutationFn: (id: string) => customersService.resetPassword(id),
    onSuccess: (data) => {
      setResetDialog((d) => ({ ...d, tempPassword: data.temp_password }));
    },
    onError: (err) => showToast(getApiErrorMessage(err), "error"),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => customersService.delete(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["customers"] });
      showToast("Customer deleted successfully", "success");
      setDeleteDialog({ open: false, customer: null });
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
    {
      key: "company_name",
      header: "Organization",
      render: (row) =>
        row.customer_type !== "INDIVIDUAL" && row.company_name ? (
          <span className="text-sm text-foreground">{row.company_name}</span>
        ) : (
          <span className="text-sm text-muted-foreground">—</span>
        ),
    },
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
      render: (row) => (
        <span className="text-sm text-muted-foreground">
          {new Date(row.created_at).toLocaleDateString("en-IN")}
        </span>
      ),
    },
    {
      key: "actions",
      header: "",
      className: "text-right",
      render: (row) => (
        <div className="flex items-center justify-end gap-0.5">
          <Tooltip label="View">
            <button
              onClick={() => navigate(`/admin/customers/${row.id}`)}
              className="rounded p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <Eye className="h-4 w-4" />
            </button>
          </Tooltip>
          {canEditCustomer && (
            <Tooltip label="Edit">
              <button
                onClick={() => navigate(`/admin/customers/${row.id}/edit`)}
                className="rounded p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                <Edit className="h-4 w-4" />
              </button>
            </Tooltip>
          )}
          {canEditCustomer && (
            <Tooltip label="Change Status">
              <button
                onClick={() =>
                  setStatusDialog({
                    open: true,
                    customer: row,
                    selectedStatus: row.status === "ACTIVE" ? "SUSPENDED" : "ACTIVE",
                  })
                }
                className="rounded p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                <ShieldOff className="h-4 w-4" />
              </button>
            </Tooltip>
          )}
          {canEditCustomer && (
            <Tooltip label="Reset Password">
              <button
                onClick={() =>
                  setResetDialog({ open: true, customer: row, tempPassword: null })
                }
                className="rounded p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                <Key className="h-4 w-4" />
              </button>
            </Tooltip>
          )}
          {canDeleteCustomer && (
            <Tooltip label="Delete Customer">
              <button
                onClick={() => setDeleteDialog({ open: true, customer: row })}
                className="rounded p-1.5 text-muted-foreground transition-colors hover:bg-red-50 hover:text-red-600"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </Tooltip>
          )}
        </div>
      ),
    },
  ];

  return (
    <AppLayout title="Customers" portalLabel="Administration">
      <div className="space-y-5">
        {/* ── Page header ──────────────────────────────────────────────── */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold text-foreground">
              Customers
            </h2>
            <p className="mt-0.5 text-sm text-muted-foreground">
              Manage customer accounts and portal access.
            </p>
          </div>
          {canAddCustomer && (
            <Button
              onClick={() => navigate("/admin/customers/new")}
              className="shrink-0"
            >
              <Plus className="mr-2 h-4 w-4" />
              New Customer
            </Button>
          )}
        </div>

        {/* ── Table card ───────────────────────────────────────────────── */}
        <Card>
          <CardContent className="p-0">
            <DataTable
              columns={columns}
              rows={data?.items ?? []}
              total={data?.total ?? 0}
              state={tableState}
              onStateChange={setTableState}
              rowKey={(row) => row.id}
              isLoading={isLoading}
              emptyMessage="No customers found. Create your first customer."
              filtersNode={
                <div className="flex flex-wrap gap-2">
                  <select
                    value={statusFilter}
                    onChange={(e) => { setStatusFilter(e.target.value as CustomerStatus | ""); setTableState((s) => ({ ...s, page: 1 })); }}
                    className="h-9 rounded-lg border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                  >
                    <option value="">All Statuses</option>
                    {ALL_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                  <select
                    value={customerTypeFilter}
                    onChange={(e) => { setCustomerTypeFilter(e.target.value); setTableState((s) => ({ ...s, page: 1 })); }}
                    className="h-9 rounded-lg border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                  >
                    <option value="">All Types</option>
                    <option value="INDIVIDUAL">Individual</option>
                    <option value="BUSINESS">Business</option>
                  </select>
                  <input
                    type="text"
                    placeholder="City"
                    value={cityFilter}
                    onChange={(e) => { setCityFilter(e.target.value); setTableState((s) => ({ ...s, page: 1 })); }}
                    className="h-9 w-32 rounded-lg border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                  />
                  <input
                    type="text"
                    placeholder="Reference source"
                    value={refSourceFilter}
                    onChange={(e) => { setRefSourceFilter(e.target.value); setTableState((s) => ({ ...s, page: 1 })); }}
                    className="h-9 w-40 rounded-lg border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                  />
                  <input
                    type="text"
                    placeholder="Sales person"
                    value={salesPersonFilter}
                    onChange={(e) => { setSalesPersonFilter(e.target.value); setTableState((s) => ({ ...s, page: 1 })); }}
                    className="h-9 w-36 rounded-lg border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                  />
                  {activeFilterCount > 0 && (
                    <button
                      onClick={() => { setStatusFilter(""); setCustomerTypeFilter(""); setCityFilter(""); setRefSourceFilter(""); setSalesPersonFilter(""); setTableState((s) => ({ ...s, page: 1 })); }}
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

      {/* ── Status change dialog ─────────────────────────────────────── */}
      <Dialog
        open={statusDialog.open}
        onClose={() => setStatusDialog((d) => ({ ...d, open: false }))}
        title="Change Customer Status"
      >
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Select a new status for <strong>{statusDialog.customer?.full_name}</strong>:
          </p>
          <div className="space-y-2">
            {(["ACTIVE", "SUSPENDED", "DISCONNECTED"] as CustomerStatus[]).map((s) => (
              <label
                key={s}
                className={`flex cursor-pointer items-center gap-3 rounded-lg border p-3 transition-colors select-none
                  ${statusDialog.selectedStatus === s ? "border-primary bg-primary/5" : "border-border hover:bg-muted/40"}
                  ${s === statusDialog.customer?.status ? "opacity-50 cursor-not-allowed" : ""}`}
              >
                <input
                  type="radio"
                  name="new-status"
                  value={s}
                  checked={statusDialog.selectedStatus === s}
                  disabled={s === statusDialog.customer?.status}
                  onChange={() => setStatusDialog((d) => ({ ...d, selectedStatus: s }))}
                  className="sr-only"
                />
                <span className={`inline-flex h-2.5 w-2.5 shrink-0 rounded-full
                  ${s === "ACTIVE" ? "bg-green-500" : s === "SUSPENDED" ? "bg-amber-500" : "bg-red-500"}`} />
                <span className="text-sm font-medium">
                  {s.charAt(0) + s.slice(1).toLowerCase()}
                  {s === statusDialog.customer?.status && " (current)"}
                </span>
              </label>
            ))}
          </div>
          {statusDialog.selectedStatus === "DISCONNECTED" && statusDialog.customer?.status !== "DISCONNECTED" && (
            <p className="rounded border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-600">
              This will disable the customer's portal login access.
            </p>
          )}
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setStatusDialog((d) => ({ ...d, open: false }))}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                if (statusDialog.customer) {
                  statusMutation.mutate({ id: statusDialog.customer.id, status: statusDialog.selectedStatus });
                }
              }}
              disabled={statusMutation.isPending || statusDialog.selectedStatus === statusDialog.customer?.status}
            >
              Confirm
            </Button>
          </div>
        </div>
      </Dialog>

      {/* ── Password reset dialog ────────────────────────────────────── */}
      <Dialog
        open={resetDialog.open}
        onClose={() =>
          setResetDialog({ open: false, customer: null, tempPassword: null })
        }
        title={
          resetDialog.tempPassword
            ? "New Temporary Password"
            : "Reset Password"
        }
      >
        {resetDialog.tempPassword ? (
          <div className="space-y-4">
            <div className="space-y-2 rounded-lg bg-muted/50 p-4 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Customer</span>
                <span className="font-medium">
                  {resetDialog.customer?.full_name}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">New Password</span>
                <span className="font-mono font-semibold">
                  {resetDialog.tempPassword}
                </span>
              </div>
            </div>
            <p className="rounded border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
              Copy this password now — it will not be shown again.
            </p>
            <div className="flex justify-end">
              <Button
                onClick={() =>
                  setResetDialog({
                    open: false,
                    customer: null,
                    tempPassword: null,
                  })
                }
              >
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
                  setResetDialog({
                    open: false,
                    customer: null,
                    tempPassword: null,
                  })
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
      {/* ── Delete confirmation dialog ────────────────────────────────── */}
      <Dialog
        open={deleteDialog.open}
        onClose={() => setDeleteDialog({ open: false, customer: null })}
        title="Delete Customer"
      >
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Are you sure you want to delete{" "}
            <strong>{deleteDialog.customer?.full_name}</strong> (
            <span className="font-mono">{deleteDialog.customer?.customer_code}</span>)?
            This action cannot be undone.
          </p>
          <div className="flex justify-end gap-2">
            <Button
              variant="outline"
              onClick={() => setDeleteDialog({ open: false, customer: null })}
            >
              Cancel
            </Button>
            <Button
              className="bg-red-600 text-white hover:bg-red-700"
              onClick={() => {
                if (deleteDialog.customer) deleteMutation.mutate(deleteDialog.customer.id);
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
