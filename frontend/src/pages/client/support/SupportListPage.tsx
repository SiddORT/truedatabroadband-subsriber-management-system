import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Eye, Headphones, Plus } from "lucide-react";
import { ClientLayout } from "@/layouts/ClientLayout";
import { Button } from "@/components/ui/button";
import { DataTable, DataTableState } from "@/components/DataTable";
import type { DataTableColumn } from "@/components/DataTable";
import { clientSupportApi, ClientTicketListItem } from "@/services/support";
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
  return new Date(d).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export function ClientSupportListPage() {
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

  const { data, isLoading } = useQuery({
    queryKey: ["client-tickets", tableState, statusFilter, categoryFilter],
    queryFn: () =>
      clientSupportApi.list({
        page: tableState.page,
        page_size: tableState.pageSize,
        search: tableState.search || undefined,
        status: statusFilter || undefined,
        category: categoryFilter || undefined,
      }),
  });

  const columns: DataTableColumn<ClientTicketListItem>[] = [
    {
      key: "sr_no",
      header: "Sr.",
      className: "w-12 text-center",
      render: (_row, index) => (
        <span className="text-xs text-muted-foreground">
          {(tableState.page - 1) * tableState.pageSize + index + 1}
        </span>
      ),
    },
    {
      key: "ticket_number",
      header: "Ticket #",
      render: (row) => (
        <span className="font-mono text-xs font-semibold text-primary">
          {row.ticket_number}
        </span>
      ),
    },
    { key: "subject", header: "Subject", render: (row) => <span className="font-medium">{row.subject}</span> },
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
      key: "updated_at",
      header: "Last Updated",
      render: (row) => <span className="text-xs text-muted-foreground">{fmt(row.updated_at)}</span>,
    },
    {
      key: "actions",
      header: "",
      className: "w-20 text-right",
      render: (row) => (
        <Button
          variant="outline"
          size="sm"
          className="gap-1"
          onClick={() => navigate(`/client/support/${row.id}`)}
        >
          <Eye className="h-3.5 w-3.5" />
          View
        </Button>
      ),
    },
  ];

  const filterCount = [statusFilter, categoryFilter].filter(Boolean).length;

  return (
    <ClientLayout title="Support">
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Headphones className="h-5 w-5 text-primary" />
            <h2 className="text-lg font-semibold">Support Tickets</h2>
          </div>
          <Button onClick={() => navigate("/client/support/new")} size="sm">
            <Plus className="h-4 w-4" />
            New Ticket
          </Button>
        </div>

        <DataTable
          columns={columns}
          rows={data?.items ?? []}
          total={data?.total ?? 0}
          state={tableState}
          onStateChange={setTableState}
          rowKey={(r) => r.id}
          isLoading={isLoading}
          emptyMessage="No support tickets found."
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
    </ClientLayout>
  );
}
