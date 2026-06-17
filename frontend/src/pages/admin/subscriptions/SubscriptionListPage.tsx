import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Eye, Plus } from "lucide-react";

import { AppLayout } from "@/layouts/AppLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  DataTable,
  type DataTableColumn,
  type DataTableState,
  DEFAULT_PAGE_SIZE,
} from "@/components/DataTable";
import { subscriptionsService } from "@/services/subscriptions";
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
  const [tableState, setTableState] = useState<DataTableState>({
    page: 1,
    pageSize: DEFAULT_PAGE_SIZE,
    search: "",
    sortBy: "created_at",
    sortDir: "desc",
  });
  const [statusFilter, setStatusFilter] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["subscriptions", tableState, statusFilter],
    queryFn: () =>
      subscriptionsService.list({
        page: tableState.page,
        page_size: tableState.pageSize,
        search: tableState.search,
        sort_by: tableState.sortBy ?? undefined,
        sort_order: tableState.sortDir,
        status_filter: statusFilter || undefined,
      }),
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
      className: "w-20 text-right",
      render: (row) => (
        <Button
          variant="outline"
          size="sm"
          onClick={() => navigate(`/admin/subscriptions/${row.id}`)}
          className="gap-1.5"
        >
          <Eye className="h-3.5 w-3.5" />
          View
        </Button>
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
          <Button
            onClick={() => navigate("/admin/subscriptions/new")}
            className="shrink-0"
          >
            <Plus className="mr-2 h-4 w-4" />
            New Subscription
          </Button>
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
