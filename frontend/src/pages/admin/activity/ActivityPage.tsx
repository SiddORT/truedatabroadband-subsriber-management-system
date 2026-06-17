import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import {
  Download,
  Eye,
  FileSpreadsheet,
  FileText,
  X,
} from "lucide-react";

import { AppLayout } from "@/layouts/AppLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DataTable,
  type DataTableColumn,
  type DataTableState,
} from "@/components/DataTable";
import { useToast } from "@/contexts/ToastContext";
import { getApiErrorMessage } from "@/services/api";
import { activityService } from "@/services/activity";
import {
  type ActivityDetail,
  type ActivityListItem,
  ACTION_LABELS,
  MODULE_COLORS,
  MODULE_OPTIONS,
} from "@/types/activity";

// ── Helpers ──────────────────────────────────────────────────────────────────

function fmtDateTime(d: string) {
  return new Date(d).toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}

function ModuleBadge({ module }: { module: string | null }) {
  if (!module) return <span className="text-muted-foreground text-xs">—</span>;
  const cls = MODULE_COLORS[module] ?? "bg-slate-100 text-slate-700";
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${cls}`}>
      {module}
    </span>
  );
}

function ActionLabel({ action }: { action: string }) {
  return (
    <span className="text-sm font-medium text-foreground">
      {ACTION_LABELS[action] ?? action}
    </span>
  );
}

// ── Filter state ─────────────────────────────────────────────────────────────

interface Filters {
  module: string;
  action: string;
  entity_type: string;
  date_from: string;
  date_to: string;
}

const EMPTY_FILTERS: Filters = {
  module: "",
  action: "",
  entity_type: "",
  date_from: "",
  date_to: "",
};

// ── Detail Drawer ─────────────────────────────────────────────────────────────

function JsonBlock({ label, data }: { label: string; data: Record<string, unknown> }) {
  return (
    <div>
      <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
      <pre className="overflow-auto rounded-lg bg-muted/60 p-3 text-[11px] leading-relaxed text-foreground">
        {JSON.stringify(data, null, 2)}
      </pre>
    </div>
  );
}

function DetailDrawer({
  id,
  onClose,
}: {
  id: string;
  onClose: () => void;
}) {
  const { data, isLoading } = useQuery({
    queryKey: ["activity", id],
    queryFn: () => activityService.get(id),
  });

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/40"
        onClick={onClose}
      />
      {/* Panel */}
      <aside className="relative z-10 flex h-full w-full max-w-xl flex-col bg-surface shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-6 py-4">
          <div>
            <h2 className="text-base font-semibold text-foreground">Activity Detail</h2>
            <p className="text-xs text-muted-foreground">Immutable audit record</p>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-2 text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5">
          {isLoading ? (
            <div className="space-y-4">
              {[...Array(6)].map((_, i) => (
                <div key={i} className="h-10 animate-pulse rounded-lg bg-muted" />
              ))}
            </div>
          ) : data ? (
            <DetailContent detail={data} />
          ) : (
            <p className="text-sm text-muted-foreground">Record not found.</p>
          )}
        </div>
      </aside>
    </div>
  );
}

function DetailField({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </span>
      <span className="text-sm text-foreground">{value ?? "—"}</span>
    </div>
  );
}

function DetailContent({ detail }: { detail: ActivityDetail }) {
  return (
    <div className="space-y-6">
      {/* Module + Timestamp */}
      <div className="rounded-xl border border-border bg-muted/30 p-4 space-y-3">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Event Information
        </h3>
        <div className="grid grid-cols-2 gap-3">
          <DetailField label="Module" value={<ModuleBadge module={detail.module} />} />
          <DetailField label="Action" value={ACTION_LABELS[detail.action] ?? detail.action} />
          <DetailField label="Entity Type" value={detail.entity_type} />
          <DetailField label="Entity Name" value={detail.entity_name} />
          {detail.entity_id && (
            <DetailField label="Entity ID" value={
              <span className="break-all font-mono text-[11px]">{detail.entity_id}</span>
            } />
          )}
          <DetailField label="Timestamp" value={fmtDateTime(detail.created_at)} />
        </div>
      </div>

      {/* User info */}
      <div className="rounded-xl border border-border bg-muted/30 p-4 space-y-3">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          User Information
        </h3>
        <div className="grid grid-cols-1 gap-3">
          <DetailField label="Performed By" value={detail.performed_by_name ?? "System"} />
          <DetailField label="IP Address" value={detail.ip_address} />
          {detail.user_agent && (
            <div>
              <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                User Agent
              </span>
              <p className="mt-0.5 break-words text-xs text-muted-foreground leading-relaxed">
                {detail.user_agent}
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Change tracking */}
      {(detail.old_values || detail.new_values) && (
        <div className="rounded-xl border border-border bg-muted/30 p-4 space-y-3">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Changes
          </h3>
          <div className="space-y-3">
            {detail.old_values && (
              <JsonBlock label="Previous Values" data={detail.old_values} />
            )}
            {detail.new_values && (
              <JsonBlock label="New Values" data={detail.new_values} />
            )}
          </div>
        </div>
      )}

      {/* Remarks */}
      {detail.remarks && (
        <div className="rounded-xl border border-border bg-muted/30 p-4">
          <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Remarks
          </h3>
          <p className="text-sm text-foreground">{detail.remarks}</p>
        </div>
      )}
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export function ActivityPage() {
  const { showToast } = useToast();

  const [tableState, setTableState] = useState<DataTableState>({
    page: 1,
    pageSize: 25,
    search: "",
    sortBy: "created_at",
    sortDir: "desc",
  });
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [detailId, setDetailId] = useState<string | null>(null);

  const activeFilterCount = Object.values(filters).filter(Boolean).length;

  const { data, isLoading } = useQuery({
    queryKey: ["activity", tableState, filters],
    queryFn: () =>
      activityService.list({
        page: tableState.page,
        page_size: tableState.pageSize,
        search: tableState.search || undefined,
        sort_by: tableState.sortBy ?? undefined,
        sort_order: tableState.sortDir,
        module: filters.module || undefined,
        action: filters.action || undefined,
        entity_type: filters.entity_type || undefined,
        date_from: filters.date_from || undefined,
        date_to: filters.date_to || undefined,
      }),
  });

  const exportMutation = useMutation({
    mutationFn: async (fmt: "csv" | "xlsx") => {
      const resp = await activityService.export({
        format: fmt,
        filters: {
          search: tableState.search || undefined,
          module: filters.module || undefined,
          action: filters.action || undefined,
          entity_type: filters.entity_type || undefined,
          date_from: filters.date_from || undefined,
          date_to: filters.date_to || undefined,
        },
      });
      const blob = await activityService.download(resp.filename);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = resp.filename;
      a.click();
      URL.revokeObjectURL(url);
    },
    onError: (err) => showToast(getApiErrorMessage(err), "error"),
  });

  const columns: DataTableColumn<ActivityListItem>[] = [
    {
      key: "created_at",
      header: "Timestamp",
      sortable: true,
      render: (row) => (
        <span className="whitespace-nowrap text-xs text-muted-foreground">
          {fmtDateTime(row.created_at)}
        </span>
      ),
    },
    {
      key: "module",
      header: "Module",
      sortable: true,
      render: (row) => <ModuleBadge module={row.module} />,
    },
    {
      key: "action",
      header: "Action",
      sortable: true,
      render: (row) => <ActionLabel action={row.action} />,
    },
    {
      key: "entity_name",
      header: "Entity",
      render: (row) => (
        <div className="flex flex-col">
          {row.entity_name && (
            <span className="text-sm text-foreground">{row.entity_name}</span>
          )}
          {row.entity_type && (
            <span className="text-[10px] text-muted-foreground capitalize">{row.entity_type}</span>
          )}
          {!row.entity_name && !row.entity_type && (
            <span className="text-muted-foreground">—</span>
          )}
        </div>
      ),
    },
    {
      key: "performed_by_name",
      header: "User",
      sortable: true,
      render: (row) => (
        <span className="text-sm">{row.performed_by_name ?? "System"}</span>
      ),
    },
    {
      key: "ip_address",
      header: "IP Address",
      render: (row) => (
        <span className="font-mono text-xs text-muted-foreground">
          {row.ip_address ?? "—"}
        </span>
      ),
    },
    {
      key: "actions",
      header: "",
      render: (row) => (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setDetailId(row.id)}
          className="h-7 gap-1 text-xs"
        >
          <Eye className="h-3.5 w-3.5" />
          View
        </Button>
      ),
    },
  ];

  // Filter panel
  const filtersNode = (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {/* Module */}
      <div>
        <label className="mb-1 block text-xs font-medium text-muted-foreground">Module</label>
        <select
          value={filters.module}
          onChange={(e) =>
            setFilters((f) => ({ ...f, module: e.target.value }))
          }
          className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
        >
          <option value="">All Modules</option>
          {MODULE_OPTIONS.map((m) => (
            <option key={m} value={m}>{m}</option>
          ))}
        </select>
      </div>

      {/* Entity Type */}
      <div>
        <label className="mb-1 block text-xs font-medium text-muted-foreground">Entity Type</label>
        <select
          value={filters.entity_type}
          onChange={(e) =>
            setFilters((f) => ({ ...f, entity_type: e.target.value }))
          }
          className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
        >
          <option value="">All Entity Types</option>
          {["customer", "plan", "pricing", "subscription", "invoice", "payment"].map((t) => (
            <option key={t} value={t} className="capitalize">{t}</option>
          ))}
        </select>
      </div>

      {/* Action filter */}
      <div>
        <label className="mb-1 block text-xs font-medium text-muted-foreground">Action</label>
        <Input
          placeholder="e.g. customer_created"
          value={filters.action}
          onChange={(e) => setFilters((f) => ({ ...f, action: e.target.value }))}
          className="text-sm"
        />
      </div>

      {/* Date from */}
      <div>
        <label className="mb-1 block text-xs font-medium text-muted-foreground">Date From</label>
        <Input
          type="date"
          value={filters.date_from}
          onChange={(e) => setFilters((f) => ({ ...f, date_from: e.target.value }))}
          className="text-sm"
        />
      </div>

      {/* Date to */}
      <div>
        <label className="mb-1 block text-xs font-medium text-muted-foreground">Date To</label>
        <Input
          type="date"
          value={filters.date_to}
          onChange={(e) => setFilters((f) => ({ ...f, date_to: e.target.value }))}
          className="text-sm"
        />
      </div>

      {/* Clear */}
      {activeFilterCount > 0 && (
        <div className="flex items-end">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setFilters(EMPTY_FILTERS)}
            className="w-full"
          >
            Clear Filters
          </Button>
        </div>
      )}
    </div>
  );

  return (
    <AppLayout title="Activity Logs" portalLabel="Admin Portal">
      <div className="space-y-4">
        {/* Page header */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-foreground">Activity &amp; Audit Center</h2>
            <p className="mt-0.5 text-sm text-muted-foreground">
              Immutable, append-only system activity logs. SuperAdmin view only.
            </p>
          </div>
          <div className="flex shrink-0 gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => exportMutation.mutate("csv")}
              disabled={exportMutation.isPending}
              className="gap-1.5"
            >
              <FileText className="h-4 w-4" />
              CSV
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => exportMutation.mutate("xlsx")}
              disabled={exportMutation.isPending}
              className="gap-1.5"
            >
              <FileSpreadsheet className="h-4 w-4" />
              Excel
            </Button>
            {exportMutation.isPending && (
              <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Download className="h-3.5 w-3.5 animate-bounce" />
                Preparing…
              </span>
            )}
          </div>
        </div>

        {/* Table */}
        <DataTable
          columns={columns}
          rows={data?.items ?? []}
          total={data?.total ?? 0}
          state={tableState}
          onStateChange={(next) => {
            setTableState(next);
          }}
          rowKey={(row) => row.id}
          isLoading={isLoading}
          emptyMessage="No activity logs found"
          filtersNode={filtersNode}
          filterCount={activeFilterCount}
        />
      </div>

      {/* Detail Drawer */}
      {detailId && (
        <DetailDrawer id={detailId} onClose={() => setDetailId(null)} />
      )}
    </AppLayout>
  );
}
