import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Eye, Plus, Trash2 } from "lucide-react";

import { AppLayout } from "@/layouts/AppLayout";
import { usePermission } from "@/hooks/usePermission";
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
import { subscriptionsService } from "@/services/subscriptions";
import { getApiErrorMessage } from "@/services/api";
import { useToast } from "@/contexts/ToastContext";
import {
  type Subscription,
  SUBSCRIPTION_STATUS_COLORS,
  SUBSCRIPTION_STATUS_LABELS,
} from "@/types/subscription";
import { BILLING_CYCLE_LABELS } from "@/types/plan";

const STATUS_OPTIONS = [
  { label: "All Statuses", value: "" },
  { label: "Active", value: "ACTIVE" },
  { label: "Expired", value: "EXPIRED" },
  { label: "Suspended", value: "SUSPENDED" },
  { label: "Cancelled", value: "CANCELLED" },
];

function fmtDate(d: string) {
  return new Date(d).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export function SubscriptionListPage() {
  const navigate = useNavigate();
  const canAddSubscription    = usePermission("subscriptions", "add");
  const canDeleteSubscription = usePermission("subscriptions", "delete");
  const qc = useQueryClient();
  const { showToast } = useToast();

  const [tableState, setTableState] = useState<DataTableState>({
    page: 1,
    pageSize: DEFAULT_PAGE_SIZE,
    search: "",
    sortBy: "expiry_date",
    sortDir: "asc",
  });
  const [statusFilter, setStatusFilter] = useState("");
  const [expiryFrom, setExpiryFrom] = useState("");
  const [expiryTo, setExpiryTo] = useState("");
  const [startFrom, setStartFrom] = useState("");
  const [startTo, setStartTo] = useState("");
  const [quickFilter, setQuickFilter] = useState("");
  const [deleteDialog, setDeleteDialog] = useState<{
    open: boolean;
    sub: Subscription | null;
  }>({ open: false, sub: null });

  const activeFilterCount = [statusFilter, expiryFrom, expiryTo, startFrom, startTo, quickFilter].filter(Boolean).length;

  const { data, isLoading } = useQuery({
    queryKey: ["subscriptions", tableState, statusFilter, expiryFrom, expiryTo, startFrom, startTo, quickFilter],
    queryFn: () =>
      subscriptionsService.list({
        page: tableState.page,
        page_size: tableState.pageSize,
        search: tableState.search,
        sort_by: tableState.sortBy ?? undefined,
        sort_order: tableState.sortDir,
        status_filter: statusFilter || undefined,
        expiry_date_from: expiryFrom || undefined,
        expiry_date_to: expiryTo || undefined,
        start_date_from: startFrom || undefined,
        start_date_to: startTo || undefined,
        quick_filter: quickFilter || undefined,
      }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => subscriptionsService.delete(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["subscriptions"] });
      showToast("Subscription deleted successfully", "success");
      setDeleteDialog({ open: false, sub: null });
    },
    onError: (err) => showToast(getApiErrorMessage(err), "error"),
  });

  const columns: DataTableColumn<Subscription>[] = [
    {
      key: "_sr",
      header: "Sr. No.",
      className: "w-14 text-center",
      render: (_, index) => (
        <span className="text-sm text-muted-foreground tabular-nums">
          {(tableState.page - 1) * tableState.pageSize + index + 1}
        </span>
      ),
    },
    {
      key: "subscription_code",
      header: "Sub. Code",
      sortable: true,
      render: (row) => (
        <span className="font-mono text-sm font-medium text-primary">
          {row.subscription_code}
        </span>
      ),
    },
    {
      key: "customer",
      header: "Customer",
      render: (row) => (
        <div>
          <p className="text-sm font-medium text-foreground">
            {row.customer_name}
          </p>
          <p className="font-mono text-xs text-muted-foreground">
            {row.customer_code}
          </p>
        </div>
      ),
    },
    {
      key: "plan",
      header: "Plan",
      render: (row) => (
        <div>
          <p className="text-sm font-medium">{row.plan_name_snapshot}</p>
          <p className="text-xs text-muted-foreground">
            {row.speed_mbps_snapshot} Mbps
          </p>
        </div>
      ),
    },
    {
      key: "billing_cycle_snapshot",
      header: "Billing Cycle",
      render: (row) => (
        <span className="text-sm">
          {BILLING_CYCLE_LABELS[row.billing_cycle_snapshot] ??
            row.billing_cycle_snapshot}
        </span>
      ),
    },
    {
      key: "renewal_date",
      header: "Renewal Date",
      sortable: true,
      render: (row) => (
        <span className="text-sm">{fmtDate(row.renewal_date)}</span>
      ),
    },
    {
      key: "expiry_date",
      header: "Expiry Date",
      sortable: true,
      render: (row) => (
        <span className="text-sm">{fmtDate(row.expiry_date)}</span>
      ),
    },
    {
      key: "status",
      header: "Status",
      sortable: true,
      render: (row) => (
        <span
          className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${SUBSCRIPTION_STATUS_COLORS[row.status]}`}
        >
          {SUBSCRIPTION_STATUS_LABELS[row.status]}
        </span>
      ),
    },
    {
      key: "actions",
      header: "",
      className: "w-28 text-right",
      render: (row) => (
        <div className="flex items-center justify-end gap-0.5">
          <Tooltip label="View Subscription">
            <Button
              variant="outline"
              size="sm"
              onClick={() => navigate(`/admin/subscriptions/${row.id}`)}
              className="gap-1.5"
            >
              <Eye className="h-3.5 w-3.5" />
              View
            </Button>
          </Tooltip>
          {canDeleteSubscription && (
            <Tooltip label="Delete Subscription">
              <button
                onClick={() => setDeleteDialog({ open: true, sub: row })}
                className="ml-1 rounded p-1.5 text-muted-foreground transition-colors hover:bg-red-50 hover:text-red-600"
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
    <AppLayout title="Subscriptions" portalLabel="Administration">
      <div className="space-y-5">
        {/* ── Page header ──────────────────────────────────────────────── */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold text-foreground">
              Subscriptions
            </h2>
            <p className="mt-0.5 text-sm text-muted-foreground">
              Manage customer plan assignments and renewal cycles.
            </p>
          </div>
          {canAddSubscription && (
            <Button
              onClick={() => navigate("/admin/subscriptions/new")}
              className="shrink-0"
            >
              <Plus className="mr-2 h-4 w-4" />
              New Subscription
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
              isLoading={isLoading}
              state={tableState}
              onStateChange={setTableState}
              rowKey={(row) => row.id}
              emptyMessage="No subscriptions found. Assign a plan to a customer to get started."
              filtersNode={
                <div className="flex flex-wrap gap-2">
                  <select
                    value={statusFilter}
                    onChange={(e) => { setStatusFilter(e.target.value); setTableState((s) => ({ ...s, page: 1 })); }}
                    className="h-9 rounded-lg border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                  >
                    {STATUS_OPTIONS.map((opt) => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
                  </select>
                  <select
                    value={quickFilter}
                    onChange={(e) => { setQuickFilter(e.target.value); setTableState((s) => ({ ...s, page: 1 })); }}
                    className="h-9 rounded-lg border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                  >
                    <option value="">Quick Filter</option>
                    <option value="expiring_7">Expiring in 7 days</option>
                    <option value="expiring_15">Expiring in 15 days</option>
                    <option value="expiring_30">Expiring in 30 days</option>
                    <option value="expired">Already Expired</option>
                  </select>
                  <div className="flex items-center gap-1">
                    <span className="text-xs text-muted-foreground">Start:</span>
                    <input type="date" value={startFrom} onChange={(e) => { setStartFrom(e.target.value); setTableState((s) => ({ ...s, page: 1 })); }} className="h-9 rounded-lg border border-input bg-background px-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
                    <span className="text-xs text-muted-foreground">–</span>
                    <input type="date" value={startTo} onChange={(e) => { setStartTo(e.target.value); setTableState((s) => ({ ...s, page: 1 })); }} className="h-9 rounded-lg border border-input bg-background px-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
                  </div>
                  <div className="flex items-center gap-1">
                    <span className="text-xs text-muted-foreground">Expiry:</span>
                    <input type="date" value={expiryFrom} onChange={(e) => { setExpiryFrom(e.target.value); setTableState((s) => ({ ...s, page: 1 })); }} className="h-9 rounded-lg border border-input bg-background px-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
                    <span className="text-xs text-muted-foreground">–</span>
                    <input type="date" value={expiryTo} onChange={(e) => { setExpiryTo(e.target.value); setTableState((s) => ({ ...s, page: 1 })); }} className="h-9 rounded-lg border border-input bg-background px-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
                  </div>
                  {activeFilterCount > 0 && (
                    <button
                      onClick={() => { setStatusFilter(""); setExpiryFrom(""); setExpiryTo(""); setStartFrom(""); setStartTo(""); setQuickFilter(""); setTableState((s) => ({ ...s, page: 1 })); }}
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
        onClose={() => setDeleteDialog({ open: false, sub: null })}
        title="Delete Subscription"
      >
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Are you sure you want to delete subscription{" "}
            <strong className="font-mono">{deleteDialog.sub?.subscription_code}</strong>{" "}
            for <strong>{deleteDialog.sub?.customer_name}</strong>?
            This action cannot be undone.
          </p>
          <div className="flex justify-end gap-2">
            <Button
              variant="outline"
              onClick={() => setDeleteDialog({ open: false, sub: null })}
            >
              Cancel
            </Button>
            <Button
              className="bg-red-600 text-white hover:bg-red-700"
              onClick={() => {
                if (deleteDialog.sub) deleteMutation.mutate(deleteDialog.sub.id);
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
