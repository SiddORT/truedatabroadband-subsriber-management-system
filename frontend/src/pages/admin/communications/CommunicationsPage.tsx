import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Filter, X, RefreshCw, Eye } from "lucide-react";

import { AppLayout } from "@/layouts/AppLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DataTable,
  type DataTableColumn,
  type DataTableState,
} from "@/components/DataTable";
import { listCommunicationLogs, refreshLogStatus } from "@/services/communication";
import type { CommunicationLog } from "@/types/communication";
import { COMM_CHANNEL_COLORS, COMM_STATUS_COLORS } from "@/types/communication";
import { useToast } from "@/contexts/ToastContext";

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

function Badge({ value, colorMap }: { value: string; colorMap: Record<string, string> }) {
  const cls = colorMap[value] ?? "bg-slate-100 text-slate-700";
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${cls}`}>
      {value}
    </span>
  );
}

// ── Payload Modal ─────────────────────────────────────────────────────────

function PayloadModal({
  title,
  payload,
  onClose,
}: {
  title: string;
  payload: Record<string, unknown> | null;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[80vh] flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h3 className="font-semibold text-[#1F4959]">{title}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X className="h-5 w-5" />
          </button>
        </div>
        <pre className="flex-1 overflow-auto p-5 text-xs text-gray-700 bg-gray-50 rounded-b-2xl whitespace-pre-wrap break-all">
          {payload ? JSON.stringify(payload, null, 2) : "No data"}
        </pre>
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────

const CHANNEL_OPTIONS = ["SMS", "EMAIL"];
const STATUS_OPTIONS = ["PENDING", "SENT", "DELIVERED", "FAILED"];

const TEMPLATE_KEY_LABELS: Record<string, string> = {
  WELCOME_CUSTOMER: "Welcome",
  OTP_LOGIN: "OTP Login",
  SUBSCRIPTION_EXPIRING: "Sub Expiring",
  SUBSCRIPTION_EXPIRED: "Sub Expired",
  INVOICE_GENERATED: "Invoice",
  PAYMENT_RECEIVED: "Payment",
  TEST: "Test",
};

export function CommunicationsPage() {
  const { showToast } = useToast();
  const qc = useQueryClient();

  const [tableState, setTableState] = useState<DataTableState>({ page: 1, pageSize: 25 });
  const [filterChannel, setFilterChannel] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [filterTemplate, setFilterTemplate] = useState("");
  const [filterDateFrom, setFilterDateFrom] = useState("");
  const [filterDateTo, setFilterDateTo] = useState("");
  const [showFilters, setShowFilters] = useState(false);
  const [modal, setModal] = useState<{ title: string; payload: Record<string, unknown> | null } | null>(null);

  const filterCount = [filterChannel, filterStatus, filterTemplate, filterDateFrom, filterDateTo].filter(Boolean).length;

  const { data, isLoading } = useQuery({
    queryKey: ["comm-logs", tableState, filterChannel, filterStatus, filterTemplate, filterDateFrom, filterDateTo],
    queryFn: () =>
      listCommunicationLogs({
        page: tableState.page,
        page_size: tableState.pageSize,
        channel: filterChannel || undefined,
        status: filterStatus || undefined,
        template_key: filterTemplate || undefined,
        date_from: filterDateFrom || undefined,
        date_to: filterDateTo || undefined,
      }),
  });

  const refreshMutation = useMutation({
    mutationFn: refreshLogStatus,
    onSuccess: (result) => {
      qc.invalidateQueries({ queryKey: ["comm-logs"] });
      showToast(`Status updated: ${result.status}`, "success");
    },
    onError: (err: any) => showToast(err?.response?.data?.detail ?? "Failed to refresh", "error"),
  });

  const clearFilters = () => {
    setFilterChannel("");
    setFilterStatus("");
    setFilterTemplate("");
    setFilterDateFrom("");
    setFilterDateTo("");
    setTableState((s) => ({ ...s, page: 1 }));
  };

  const columns: DataTableColumn<CommunicationLog>[] = [
    {
      key: "created_at",
      header: "Created At",
      render: (row) => <span className="text-xs text-gray-600 whitespace-nowrap">{fmtDateTime(row.created_at)}</span>,
    },
    {
      key: "channel",
      header: "Channel",
      render: (row) => <Badge value={row.channel} colorMap={COMM_CHANNEL_COLORS as Record<string, string>} />,
    },
    {
      key: "template_key",
      header: "Template",
      render: (row) => (
        <span className="text-xs font-medium text-gray-700">
          {row.template_key ? (TEMPLATE_KEY_LABELS[row.template_key] ?? row.template_key) : "—"}
        </span>
      ),
    },
    {
      key: "recipient",
      header: "Recipient",
      render: (row) => (
        <span className="text-xs text-gray-600">
          {row.recipient_mobile ?? row.recipient_email ?? "—"}
        </span>
      ),
    },
    {
      key: "provider_name",
      header: "Provider",
      render: (row) => <span className="text-xs text-gray-600">{row.provider_name ?? "—"}</span>,
    },
    {
      key: "provider_message_id",
      header: "Message ID",
      render: (row) => (
        <span className="text-xs font-mono text-gray-500 max-w-[100px] truncate block">
          {row.provider_message_id ?? "—"}
        </span>
      ),
    },
    {
      key: "status",
      header: "Status",
      render: (row) => <Badge value={row.status} colorMap={COMM_STATUS_COLORS as Record<string, string>} />,
    },
    {
      key: "actions",
      header: "",
      render: (row) => (
        <div className="flex items-center gap-1">
          {row.request_payload && (
            <button
              title="View Request"
              onClick={() => setModal({ title: "Request Payload", payload: row.request_payload })}
              className="p-1.5 rounded-lg text-gray-400 hover:text-[#1F4959] hover:bg-gray-100 transition"
            >
              <Eye className="h-3.5 w-3.5" />
            </button>
          )}
          {row.response_payload && (
            <button
              title="View Response"
              onClick={() => setModal({ title: "Response Payload", payload: row.response_payload })}
              className="p-1.5 rounded-lg text-gray-400 hover:text-[#1F4959] hover:bg-gray-100 transition"
            >
              <Eye className="h-3.5 w-3.5" />
            </button>
          )}
          {row.channel === "SMS" && row.provider_message_id && row.status === "PENDING" && (
            <button
              title="Refresh Status"
              onClick={() => refreshMutation.mutate(row.id)}
              disabled={refreshMutation.isPending}
              className="p-1.5 rounded-lg text-gray-400 hover:text-[#1F4959] hover:bg-gray-100 transition"
            >
              <RefreshCw className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      ),
    },
  ];

  const filtersNode = showFilters ? (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5 pt-3 border-t border-gray-100 mt-3">
      <div>
        <select
          value={filterChannel}
          onChange={(e) => { setFilterChannel(e.target.value); setTableState((s) => ({ ...s, page: 1 })); }}
          className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm"
        >
          <option value="">All Channels</option>
          {CHANNEL_OPTIONS.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>
      <div>
        <select
          value={filterStatus}
          onChange={(e) => { setFilterStatus(e.target.value); setTableState((s) => ({ ...s, page: 1 })); }}
          className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm"
        >
          <option value="">All Statuses</option>
          {STATUS_OPTIONS.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>
      <div>
        <Input
          value={filterTemplate}
          onChange={(e) => { setFilterTemplate(e.target.value); setTableState((s) => ({ ...s, page: 1 })); }}
          placeholder="Template key…"
          className="rounded-xl"
        />
      </div>
      <div>
        <Input
          type="date"
          value={filterDateFrom}
          onChange={(e) => { setFilterDateFrom(e.target.value); setTableState((s) => ({ ...s, page: 1 })); }}
          className="rounded-xl"
        />
      </div>
      <div>
        <Input
          type="date"
          value={filterDateTo}
          onChange={(e) => { setFilterDateTo(e.target.value); setTableState((s) => ({ ...s, page: 1 })); }}
          className="rounded-xl"
        />
      </div>
    </div>
  ) : null;

  return (
    <AppLayout title="Communication Logs" portalLabel="Administration">
      <div className="p-6 space-y-4">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold text-[#1F4959]">Communication Logs</h1>
          <p className="text-sm text-gray-500 mt-1">All SMS and email send attempts with delivery status.</p>
        </div>

        <DataTable
          columns={columns}
          data={data?.items ?? []}
          loading={isLoading}
          total={data?.total ?? 0}
          state={tableState}
          onStateChange={setTableState}
          filtersNode={filtersNode}
          filterCount={filterCount}
          onToggleFilters={() => setShowFilters((v) => !v)}
          onClearFilters={clearFilters}
        />

        {modal && (
          <PayloadModal
            title={modal.title}
            payload={modal.payload}
            onClose={() => setModal(null)}
          />
        )}
      </div>
    </AppLayout>
  );
}
