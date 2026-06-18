import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Headphones } from "lucide-react";
import { AppLayout } from "@/layouts/AppLayout";
import { DataTable, DataTableState } from "@/components/DataTable";
import type { DataTableColumn } from "@/components/DataTable";
import { adminSupportApi, AdminTicketListItem } from "@/services/support";
import { cn } from "@/lib/utils";

const CATEGORY_LABELS: Record<string, string> = {
  NO_INTERNET: "No Internet",
  SLOW_SPEED: "Slow Speed",
  BILLING_ISSUE: "Billing Issue",
  PLAN_CHANGE: "Plan Change",
  TECHNICAL_ISSUE: "Technical Issue",
  OTHER: "Other",
};

const PRIORITY_BADGE: Record<string, string> = {
  LOW: "bg-gray-100 text-gray-700",
  MEDIUM: "bg-blue-100 text-blue-700",
  HIGH: "bg-orange-100 text-orange-700",
  CRITICAL: "bg-red-100 text-red-700",
};

const STATUS_BADGE: Record<string, string> = {
  OPEN: "bg-blue-100 text-blue-700",
  IN_PROGRESS: "bg-orange-100 text-orange-700",
  WAITING_FOR_CUSTOMER: "bg-purple-100 text-purple-700",
  RESOLVED: "bg-green-100 text-green-700",
  CLOSED: "bg-gray-100 text-gray-600",
};

function fmt(d: string) {
  return new Date(d).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

export function AdminSupportListPage() {
  const navigate = useNavigate();
  const [tableState, setTableState] = useState<DataTableState>({
    page: 1,
    pageSize: 25,
    search: "",
    sortBy: null,
    sortDir: "desc",
  });
  const [statusFilter, setStatusFilter] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [priorityFilter, setPriorityFilter] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["admin-tickets", tableState, statusFilter, categoryFilter, priorityFilter],
    queryFn: () =>
      adminSupportApi.list({
        page: tableState.page,
        page_size: tableState.pageSize,
        search: tableState.search || undefined,
        status: statusFilter || undefined,
        category: categoryFilter || undefined,
        priority: priorityFilter || undefined,
      }),
  });

  const columns: DataTableColumn<AdminTicketListItem>[] = [
    {
      key: "sr_no",
      header: "#",
      render: (_, i) => (
        <span className="text-xs text-muted-foreground tabular-nums">
          {(tableState.page - 1) * tableState.pageSize + i + 1}
        </span>
      ),
    },
    {
      key: "ticket_number",
      header: "Ticket #",
      render: (row) => (
        <button
          onClick={() => navigate(`/admin/support/${row.id}`)}
          className="font-mono text-xs font-semibold text-primary hover:underline"
        >
          {row.ticket_number}
        </button>
      ),
    },
    {
      key: "customer_name",
      header: "Customer",
      render: (row) => (
        <div>
          <p className="text-sm font-medium">{row.customer_name}</p>
          <p className="text-xs text-muted-foreground">{row.customer_code}</p>
        </div>
      ),
    },
    {
      key: "connection_name",
      header: "Connection",
      render: (row) => (
        <span className="text-xs text-muted-foreground">{row.connection_name || "—"}</span>
      ),
    },
    {
      key: "subject",
      header: "Subject",
      render: (row) => <span className="font-medium text-sm">{row.subject}</span>,
    },
    {
      key: "category",
      header: "Category",
      render: (row) => (
        <span className="text-xs text-muted-foreground">
          {CATEGORY_LABELS[row.category] ?? row.category}
        </span>
      ),
    },
    {
      key: "priority",
      header: "Priority",
      render: (row) => (
        <span
          className={cn(
            "rounded-full px-2.5 py-0.5 text-xs font-medium",
            PRIORITY_BADGE[row.priority] ?? "bg-gray-100 text-gray-600"
          )}
        >
          {row.priority}
        </span>
      ),
    },
    {
      key: "status",
      header: "Status",
      render: (row) => (
        <span
          className={cn(
            "rounded-full px-2.5 py-0.5 text-xs font-medium",
            STATUS_BADGE[row.status] ?? "bg-gray-100 text-gray-600"
          )}
        >
          {row.status.replace(/_/g, " ")}
        </span>
      ),
    },
    {
      key: "assigned_to_name",
      header: "Assigned To",
      render: (row) => (
        <span className="text-xs text-muted-foreground">{row.assigned_to_name || "—"}</span>
      ),
    },
    {
      key: "updated_at",
      header: "Last Updated",
      render: (row) => <span className="text-xs text-muted-foreground">{fmt(row.updated_at)}</span>,
    },
  ];

  const filterCount = [statusFilter, categoryFilter, priorityFilter].filter(Boolean).length;

  return (
    <AppLayout title="Support Tickets" portalLabel="Administration">
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <Headphones className="h-5 w-5 text-primary" />
          <h2 className="text-lg font-semibold">Support Tickets</h2>
          {data?.total != null && (
            <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-medium text-primary">
              {data.total}
            </span>
          )}
        </div>

        <DataTable
          columns={columns}
          rows={data?.items ?? []}
          total={data?.total ?? 0}
          state={tableState}
          onStateChange={setTableState}
          rowKey={(r) => r.id}
          isLoading={isLoading}
          emptyMessage="No tickets found."
          filterCount={filterCount}
          filtersNode={
            <div className="flex flex-wrap gap-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-muted-foreground">Status</label>
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="rounded-lg border border-border bg-surface px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                >
                  <option value="">All statuses</option>
                  <option value="OPEN">Open</option>
                  <option value="IN_PROGRESS">In Progress</option>
                  <option value="WAITING_FOR_CUSTOMER">Waiting for Customer</option>
                  <option value="RESOLVED">Resolved</option>
                  <option value="CLOSED">Closed</option>
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-muted-foreground">Priority</label>
                <select
                  value={priorityFilter}
                  onChange={(e) => setPriorityFilter(e.target.value)}
                  className="rounded-lg border border-border bg-surface px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                >
                  <option value="">All priorities</option>
                  <option value="LOW">Low</option>
                  <option value="MEDIUM">Medium</option>
                  <option value="HIGH">High</option>
                  <option value="CRITICAL">Critical</option>
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-muted-foreground">Category</label>
                <select
                  value={categoryFilter}
                  onChange={(e) => setCategoryFilter(e.target.value)}
                  className="rounded-lg border border-border bg-surface px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                >
                  <option value="">All categories</option>
                  {Object.entries(CATEGORY_LABELS).map(([k, v]) => (
                    <option key={k} value={k}>{v}</option>
                  ))}
                </select>
              </div>
            </div>
          }
        />
      </div>
    </AppLayout>
  );
}
