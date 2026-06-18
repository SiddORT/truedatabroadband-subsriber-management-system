import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Calendar,
  CheckCircle2,
  Clock,
  Eye,
  Filter,
  Loader2,
  Play,
  Power,
  PowerOff,
  RefreshCw,
  XCircle,
} from "lucide-react";
import { AppLayout } from "@/layouts/AppLayout";
import { Button } from "@/components/ui/button";
import { useToast } from "@/contexts/ToastContext";
import { jobService } from "@/services/jobs";
import type { ScheduledJobOut } from "@/types/jobs";

const STATUS_CONFIG: Record<string, { color: string; icon: React.ElementType; label: string }> = {
  SUCCESS: { color: "bg-green-100 text-green-700", icon: CheckCircle2, label: "Success" },
  FAILED: { color: "bg-red-100 text-red-700", icon: XCircle, label: "Failed" },
  RUNNING: { color: "bg-blue-100 text-blue-700", icon: Loader2, label: "Running" },
};

function StatusBadge({ status }: { status: string | null }) {
  if (!status) return <span className="text-xs text-muted-foreground">—</span>;
  const cfg = STATUS_CONFIG[status];
  if (!cfg) return <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs">{status}</span>;
  const Icon = cfg.icon;
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${cfg.color}`}>
      <Icon className={`h-3 w-3 ${status === "RUNNING" ? "animate-spin" : ""}`} />
      {cfg.label}
    </span>
  );
}

function fmt(d: string | null) {
  if (!d) return "—";
  return new Date(d).toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function JobRow({
  job,
  srNo,
  onView,
  onRun,
  onToggle,
  isRunning,
  isToggling,
}: {
  job: ScheduledJobOut;
  srNo: number;
  onView: () => void;
  onRun: () => void;
  onToggle: () => void;
  isRunning: boolean;
  isToggling: boolean;
}) {
  return (
    <tr className="border-b hover:bg-muted/30 transition-colors">
      <td className="px-4 py-3 text-xs text-muted-foreground tabular-nums w-10">{srNo}</td>
      <td className="px-4 py-3">
        <div>
          <p className="font-medium text-sm">{job.job_name}</p>
          <p className="text-xs text-muted-foreground font-mono">{job.job_key}</p>
        </div>
      </td>
      <td className="px-4 py-3">
        <span className="rounded bg-muted px-2 py-0.5 text-xs font-mono">
          {job.cron_expression}
        </span>
      </td>
      <td className="px-4 py-3 text-xs text-muted-foreground">{fmt(job.last_run_at)}</td>
      <td className="px-4 py-3 text-xs text-muted-foreground">{fmt(job.next_run_at)}</td>
      <td className="px-4 py-3">
        <StatusBadge status={job.last_status} />
      </td>
      <td className="px-4 py-3">
        <span
          className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${
            job.is_enabled
              ? "bg-green-100 text-green-700"
              : "bg-gray-100 text-gray-500"
          }`}
        >
          {job.is_enabled ? <CheckCircle2 className="h-3 w-3" /> : <XCircle className="h-3 w-3" />}
          {job.is_enabled ? "Enabled" : "Disabled"}
        </span>
      </td>
      <td className="px-4 py-3">
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={onView} title="View details">
            <Eye className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 w-7 p-0"
            onClick={onRun}
            disabled={isRunning || job.last_status === "RUNNING"}
            title="Run now"
          >
            {isRunning ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Play className="h-3.5 w-3.5 text-primary" />
            )}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 w-7 p-0"
            onClick={onToggle}
            disabled={isToggling}
            title={job.is_enabled ? "Disable" : "Enable"}
          >
            {isToggling ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : job.is_enabled ? (
              <PowerOff className="h-3.5 w-3.5 text-destructive" />
            ) : (
              <Power className="h-3.5 w-3.5 text-green-600" />
            )}
          </Button>
        </div>
      </td>
    </tr>
  );
}

export function JobListPage() {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const qc = useQueryClient();
  const [runningIds, setRunningIds] = useState<Set<string>>(new Set());
  const [togglingIds, setTogglingIds] = useState<Set<string>>(new Set());
  const [statusFilter, setStatusFilter] = useState("");
  const [enabledFilter, setEnabledFilter] = useState("");
  const [showFilters, setShowFilters] = useState(false);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["admin-jobs"],
    queryFn: () => jobService.listJobs({ page: 1, page_size: 50 }),
    refetchInterval: 15000,
  });

  const runMutation = useMutation({
    mutationFn: (id: string) => jobService.runJob(id),
    onMutate: (id) => setRunningIds((s) => new Set([...s, id])),
    onSettled: (_, __, id) =>
      setRunningIds((s) => { const ns = new Set(s); ns.delete(id); return ns; }),
    onSuccess: (res) => {
      showToast(res.message, "success");
      setTimeout(() => {
        qc.invalidateQueries({ queryKey: ["admin-jobs"] });
      }, 1500);
    },
    onError: (err: any) => {
      const msg = err?.response?.data?.detail ?? "Failed to run job.";
      showToast(msg, "error");
    },
  });

  const toggleMutation = useMutation({
    mutationFn: (id: string) => jobService.toggleJob(id),
    onMutate: (id) => setTogglingIds((s) => new Set([...s, id])),
    onSettled: (_, __, id) =>
      setTogglingIds((s) => { const ns = new Set(s); ns.delete(id); return ns; }),
    onSuccess: (res) => {
      showToast(res.message, "success");
      qc.invalidateQueries({ queryKey: ["admin-jobs"] });
    },
    onError: (err: any) => {
      const msg = err?.response?.data?.detail ?? "Failed to toggle job.";
      showToast(msg, "error");
    },
  });

  // Apply client-side filters
  const filtered = (data?.items ?? []).filter((job) => {
    if (statusFilter && job.last_status !== statusFilter) return false;
    if (enabledFilter === "enabled" && !job.is_enabled) return false;
    if (enabledFilter === "disabled" && job.is_enabled) return false;
    return true;
  });

  const filterCount = (statusFilter ? 1 : 0) + (enabledFilter ? 1 : 0);

  return (
    <AppLayout title="Scheduled Jobs" portalLabel="Administration">
      <div className="space-y-5">
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold">Scheduled Jobs</h2>
            <p className="text-sm text-muted-foreground">
              {data ? `${data.total} job${data.total !== 1 ? "s" : ""} registered` : "Loading…"}
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => refetch()}>
              <RefreshCw className="h-3.5 w-3.5 mr-1.5" /> Refresh
            </Button>
            <Button variant="outline" size="sm" onClick={() => setShowFilters((v) => !v)}>
              <Filter className="h-3.5 w-3.5 mr-1.5" />
              Filters
              {filterCount > 0 && (
                <span className="ml-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-white">
                  {filterCount}
                </span>
              )}
            </Button>
          </div>
        </div>

        {/* Filters */}
        {showFilters && (
          <div className="rounded-xl border bg-white p-4 shadow-sm">
            <div className="flex flex-wrap gap-4">
              <div>
                <p className="mb-1 text-xs font-medium text-muted-foreground">Last Status</p>
                <select
                  className="h-8 rounded-md border border-input bg-background px-3 text-sm"
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                >
                  <option value="">All statuses</option>
                  <option value="SUCCESS">Success</option>
                  <option value="FAILED">Failed</option>
                  <option value="RUNNING">Running</option>
                </select>
              </div>
              <div>
                <p className="mb-1 text-xs font-medium text-muted-foreground">Enabled</p>
                <select
                  className="h-8 rounded-md border border-input bg-background px-3 text-sm"
                  value={enabledFilter}
                  onChange={(e) => setEnabledFilter(e.target.value)}
                >
                  <option value="">All</option>
                  <option value="enabled">Enabled only</option>
                  <option value="disabled">Disabled only</option>
                </select>
              </div>
              {filterCount > 0 && (
                <div className="flex items-end">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => { setStatusFilter(""); setEnabledFilter(""); }}
                    className="h-8 text-xs"
                  >
                    Clear
                  </Button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Table */}
        <div className="rounded-xl border bg-white shadow-sm overflow-hidden">
          {isLoading && (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          )}
          {isError && (
            <div className="flex flex-col items-center gap-2 py-20 text-center">
              <p className="font-medium text-destructive">Failed to load jobs.</p>
              <Button variant="outline" size="sm" onClick={() => refetch()}>Retry</Button>
            </div>
          )}
          {!isLoading && !isError && filtered.length === 0 && (
            <div className="py-20 text-center text-muted-foreground">
              No jobs found.
            </div>
          )}
          {!isLoading && !isError && filtered.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/50">
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground w-10">
                      #
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Job Name
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Cron
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      <span className="flex items-center gap-1"><Clock className="h-3 w-3" />Last Run</span>
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      <span className="flex items-center gap-1"><Calendar className="h-3 w-3" />Next Run</span>
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Status
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Enabled
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((job, i) => (
                    <JobRow
                      key={job.id}
                      job={job}
                      srNo={i + 1}
                      onView={() => navigate(`/admin/jobs/${job.id}`)}
                      onRun={() => runMutation.mutate(job.id)}
                      onToggle={() => toggleMutation.mutate(job.id)}
                      isRunning={runningIds.has(job.id)}
                      isToggling={togglingIds.has(job.id)}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <p className="text-xs text-muted-foreground text-center">
          Page auto-refreshes every 15 seconds.
        </p>
      </div>
    </AppLayout>
  );
}
