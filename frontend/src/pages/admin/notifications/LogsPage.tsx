import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Filter, X } from "lucide-react";

import { AppLayout } from "@/layouts/AppLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DataTable,
  type DataTableColumn,
  type DataTableState,
} from "@/components/DataTable";
import { listLogs } from "@/services/notification";
import type { NotificationLog } from "@/types/notification";
import {
  CHANNEL_COLORS,
  CHANNEL_OPTIONS,
  STATUS_COLORS,
  STATUS_OPTIONS,
  TEMPLATE_KEY_LABELS,
  TEMPLATE_KEY_OPTIONS,
} from "@/types/notification";

// ── Helpers ───────────────────────────────────────────────────────────────

function fmtDateTime(d: string) {
  return new Date(d).toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

function ChannelBadge({ channel }: { channel: string }) {
  const cls = CHANNEL_COLORS[channel as keyof typeof CHANNEL_COLORS] ?? "bg-slate-100 text-slate-700";
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${cls}`}>
      {channel}
    </span>
  );
}

function StatusBadge({ status }: { status: string }) {
  const cls = STATUS_COLORS[status as keyof typeof STATUS_COLORS] ?? "bg-slate-100 text-slate-700";
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${cls}`}>
      {status}
    </span>
  );
}

// ── Filters ───────────────────────────────────────────────────────────────

interface Filters {
  template_key: string;
  channel: string;
  status: string;
  date_from: string;
  date_to: string;
}

const EMPTY: Filters = { template_key: "", channel: "", status: "", date_from: "", date_to: "" };

// ── Columns ───────────────────────────────────────────────────────────────

const COLUMNS: DataTableColumn<NotificationLog>[] = [
  {
    key: "created_at",
    header: "Sent At",
    sortable: true,
    render: (row) => (
      <span className="text-xs text-muted-foreground">{fmtDateTime(row.created_at)}</span>
    ),
  },
  {
    key: "template_key",
    header: "Template",
    render: (row) => (
      <span className="text-sm font-medium">
        {TEMPLATE_KEY_LABELS[row.template_key] ?? row.template_key}
      </span>
    ),
  },
  {
    key: "channel",
    header: "Channel",
    render: (row) => <ChannelBadge channel={row.channel} />,
  },
  {
    key: "recipient_email",
    header: "Recipient",
    render: (row) => (
      <span className="text-xs text-muted-foreground">
        {row.channel === "EMAIL" ? (row.recipient_email ?? "—") : (row.recipient_mobile ?? "—")}
      </span>
    ),
  },
  {
    key: "status",
    header: "Status",
    render: (row) => <StatusBadge status={row.status} />,
  },
  {
    key: "entity_type",
    header: "Entity",
    render: (row) =>
      row.entity_type ? (
        <span className="text-xs capitalize text-muted-foreground">{row.entity_type}</span>
      ) : (
        <span className="text-muted-foreground">—</span>
      ),
  },
  {
    key: "error_message",
    header: "Error",
    render: (row) =>
      row.error_message ? (
        <span className="max-w-[200px] truncate text-xs text-red-500" title={row.error_message}>
          {row.error_message}
        </span>
      ) : (
        <span className="text-muted-foreground">—</span>
      ),
  },
];

// ── Page ──────────────────────────────────────────────────────────────────

export function NotificationLogsPage() {
  const [tableState, setTableState] = useState<DataTableState>({
    page: 1,
    pageSize: 25,
    sortBy: "created_at",
    sortOrder: "desc",
  });
  const [filters, setFilters] = useState<Filters>(EMPTY);
  const [applied, setApplied] = useState<Filters>(EMPTY);
  const [filtersOpen, setFiltersOpen] = useState(false);

  const filterCount = Object.values(applied).filter(Boolean).length;

  const { data, isLoading } = useQuery({
    queryKey: ["notification-logs", tableState, applied],
    queryFn: () =>
      listLogs({
        page: tableState.page,
        page_size: tableState.pageSize,
        template_key: applied.template_key || undefined,
        channel: applied.channel || undefined,
        status: applied.status || undefined,
        date_from: applied.date_from || undefined,
        date_to: applied.date_to || undefined,
      }),
  });

  function applyFilters() {
    setApplied({ ...filters });
    setTableState((s) => ({ ...s, page: 1 }));
    setFiltersOpen(false);
  }

  function clearFilters() {
    setFilters(EMPTY);
    setApplied(EMPTY);
    setTableState((s) => ({ ...s, page: 1 }));
  }

  const filtersNode = (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      <div>
        <label className="mb-1 block text-xs font-medium text-muted-foreground">Template</label>
        <select
          className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
          value={filters.template_key}
          onChange={(e) => setFilters((f) => ({ ...f, template_key: e.target.value }))}
        >
          {TEMPLATE_KEY_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      </div>
      <div>
        <label className="mb-1 block text-xs font-medium text-muted-foreground">Channel</label>
        <select
          className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
          value={filters.channel}
          onChange={(e) => setFilters((f) => ({ ...f, channel: e.target.value }))}
        >
          {CHANNEL_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      </div>
      <div>
        <label className="mb-1 block text-xs font-medium text-muted-foreground">Status</label>
        <select
          className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
          value={filters.status}
          onChange={(e) => setFilters((f) => ({ ...f, status: e.target.value }))}
        >
          {STATUS_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      </div>
      <div>
        <label className="mb-1 block text-xs font-medium text-muted-foreground">Date From</label>
        <Input
          type="date"
          value={filters.date_from}
          onChange={(e) => setFilters((f) => ({ ...f, date_from: e.target.value }))}
        />
      </div>
      <div>
        <label className="mb-1 block text-xs font-medium text-muted-foreground">Date To</label>
        <Input
          type="date"
          value={filters.date_to}
          onChange={(e) => setFilters((f) => ({ ...f, date_to: e.target.value }))}
        />
      </div>
      <div className="flex items-end gap-2">
        <Button size="sm" onClick={applyFilters} className="flex-1">Apply</Button>
        {filterCount > 0 && (
          <Button size="sm" variant="outline" onClick={clearFilters}>
            <X className="h-4 w-4" />
          </Button>
        )}
      </div>
    </div>
  );

  return (
    <AppLayout title="Notification Logs" portalLabel="Admin Portal">
      <DataTable
        title="Notification Logs"
        description="All outbound notification attempts — SMS and Email"
        columns={COLUMNS}
        data={data?.items ?? []}
        total={data?.total ?? 0}
        isLoading={isLoading}
        state={tableState}
        onStateChange={setTableState}
        filtersNode={filtersNode}
        filterCount={filterCount}
      />
    </AppLayout>
  );
}
