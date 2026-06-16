import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Eye, PlusCircle } from "lucide-react";

import { AppLayout } from "@/layouts/AppLayout";
import { Button } from "@/components/ui/button";
import {
  DataTable,
  DataTableColumn,
  DataTableState,
  DEFAULT_PAGE_SIZE,
} from "@/components/DataTable";
import { subscriptionsService } from "@/services/subscriptions";
import {
  Subscription,
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
        sort_by: tableState.sortBy,
        sort_order: tableState.sortDir,
        status_filter: statusFilter || undefined,
      }),
  });

  const columns: DataTableColumn<Subscription>[] = [
    {
      key: "_sr",
      header: "Sr. No.",
      render: (_, __, i) =>
        (tableState.page - 1) * tableState.pageSize + i + 1,
    },
    {
      key: "subscription_code",
      header: "Sub. Code",
      sortable: true,
      render: (row) => (
        <span className="font-mono text-xs font-semibold text-primary">
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
      render: (row) => (
        <Button
          variant="outline"
          size="sm"
          onClick={() => navigate(`/admin/subscriptions/${row.id}`)}
        >
          <Eye className="mr-1 h-3.5 w-3.5" />
          View
        </Button>
      ),
    },
  ];

  return (
    <AppLayout title="Subscriptions" portalLabel="Admin Portal">
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-semibold text-foreground">
              Subscriptions
            </h2>
            <p className="text-sm text-muted-foreground">
              Manage customer plan assignments
            </p>
          </div>
          <Button onClick={() => navigate("/admin/subscriptions/new")}>
            <PlusCircle className="mr-2 h-4 w-4" />
            New Subscription
          </Button>
        </div>

        <div className="flex items-center gap-3">
          <select
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value);
              setTableState((s) => ({ ...s, page: 1 }));
            }}
            className="rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
          >
            {STATUS_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>

        <DataTable
          columns={columns}
          rows={data?.items ?? []}
          total={data?.total ?? 0}
          isLoading={isLoading}
          state={tableState}
          onStateChange={setTableState}
        />
      </div>
    </AppLayout>
  );
}
