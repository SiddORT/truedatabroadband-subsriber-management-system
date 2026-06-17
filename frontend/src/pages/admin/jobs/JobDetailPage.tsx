import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  CheckCircle2,
  Clock,
  Loader2,
  Play,
  Power,
  PowerOff,
  RefreshCw,
  Save,
  XCircle,
} from "lucide-react";
import { AppLayout } from "@/layouts/AppLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/contexts/ToastContext";
import { jobService } from "@/services/jobs";
import type { JobExecutionLogOut, ScheduledJobOut } from "@/types/jobs";

const STATUS_COLORS: Record<string, string> = {
  SUCCESS: "bg-green-100 text-green-700",
  FAILED: "bg-red-100 text-red-700",
  RUNNING: "bg-blue-100 text-blue-700",
};

function StatusBadge({ status }: { status: string | null }) {
  if (!status) return <span className="text-sm text-muted-foreground">—</span>;
  const color = STATUS_COLORS[status] ?? "bg-gray-100 text-gray-600";
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ${color}`}>
      {status === "RUNNING" && <Loader2 className="h-3 w-3 animate-spin" />}
      {status === "SUCCESS" && <CheckCircle2 className="h-3 w-3" />}
      {status === "FAILED" && <XCircle className="h-3 w-3" />}
      {status}
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
    second: "2-digit",
  });
}

function fmtMs(ms: number | null) {
  if (ms === null || ms === undefined) return "—";
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}

function LogRow({ log }: { log: JobExecutionLogOut }) {
  const statusColor = STATUS_COLORS[log.status] ?? "bg-gray-100 text-gray-600";
  const duration = log.execution_time_ms !== null ? fmtMs(log.execution_time_ms) : "—";
  const records =
    log.records_processed !== null ? log.records_processed.toLocaleString() : "—";

  return (
    <tr className="border-b hover:bg-muted/20 transition-colors">
      <td className="px-4 py-2.5 text-xs">{fmt(log.started_at)}</td>
      <td className="px-4 py-2.5 text-xs">{log.completed_at ? fmt(log.completed_at) : "—"}</td>
      <td className="px-4 py-2.5 text-xs">{duration}</td>
      <td className="px-4 py-2.5">
        <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${statusColor}`}>
          {log.status}
        </span>
      </td>
      <td className="px-4 py-2.5 text-xs text-right">{records}</td>
      <td className="px-4 py-2.5 text-xs text-destructive max-w-[200px] truncate">
        {log.error_message ?? "—"}
      </td>
    </tr>
  );
}

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 py-2.5 border-b last:border-0">
      <span className="text-sm text-muted-foreground whitespace-nowrap">{label}</span>
      <span className="text-sm font-medium text-right">{value}</span>
    </div>
  );
}

export function JobDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { showToast } = useToast();
  const qc = useQueryClient();

  const [editCron, setEditCron] = useState("");
  const [editMaxRetries, setEditMaxRetries] = useState("");
  const [editing, setEditing] = useState(false);
  const [logStatusFilter, setLogStatusFilter] = useState("");

  const { data: job, isLoading: jobLoading, refetch: refetchJob } = useQuery({
    queryKey: ["admin-job", id],
    queryFn: () => jobService.getJob(id!),
    enabled: !!id,
    refetchInterval: 10000,
  });

  const { data: logs, isLoading: logsLoading, refetch: refetchLogs } = useQuery({
    queryKey: ["admin-job-logs", id, logStatusFilter],
    queryFn: () => jobService.getJobLogs(id!, { limit: 50, status: logStatusFilter || undefined }),
    enabled: !!id,
    refetchInterval: 10000,
  });

  const updateMutation = useMutation({
    mutationFn: (payload: { cron_expression?: string; max_retries?: number }) =>
      jobService.updateJob(id!, payload),
    onSuccess: () => {
      showToast("Job configuration updated.", "success");
      setEditing(false);
      qc.invalidateQueries({ queryKey: ["admin-job", id] });
      qc.invalidateQueries({ queryKey: ["admin-jobs"] });
    },
    onError: (err: any) => {
      const msg = err?.response?.data?.detail ?? "Failed to update job.";
      showToast(typeof msg === "string" ? msg : JSON.stringify(msg), "error");
    },
  });

  const toggleMutation = useMutation({
    mutationFn: () => jobService.toggleJob(id!),
    onSuccess: (res) => {
      showToast(res.message, "success");
      qc.invalidateQueries({ queryKey: ["admin-job", id] });
      qc.invalidateQueries({ queryKey: ["admin-jobs"] });
    },
    onError: (err: any) => {
      showToast(err?.response?.data?.detail ?? "Failed to toggle job.", "error");
    },
  });

  const runMutation = useMutation({
    mutationFn: () => jobService.runJob(id!),
    onSuccess: (res) => {
      showToast(res.message, "success");
      setTimeout(() => {
        refetchJob();
        refetchLogs();
      }, 1500);
    },
    onError: (err: any) => {
      const msg = err?.response?.data?.detail ?? "Failed to run job.";
      showToast(msg, "error");
    },
  });

  function handleStartEdit(job: ScheduledJobOut) {
    setEditCron(job.cron_expression);
    setEditMaxRetries(String(job.max_retries));
    setEditing(true);
  }

  function handleSave() {
    const payload: { cron_expression?: string; max_retries?: number } = {};
    if (editCron && job && editCron !== job.cron_expression) {
      payload.cron_expression = editCron;
    }
    const retries = parseInt(editMaxRetries, 10);
    if (!isNaN(retries) && job && retries !== job.max_retries) {
      payload.max_retries = retries;
    }
    if (Object.keys(payload).length === 0) {
      setEditing(false);
      return;
    }
    updateMutation.mutate(payload);
  }

  if (jobLoading) {
    return (
      <AppLayout title="Job Details" portalLabel="Administration">
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      </AppLayout>
    );
  }

  if (!job) {
    return (
      <AppLayout title="Job Details" portalLabel="Administration">
        <div className="flex flex-col items-center gap-3 py-20 text-center">
          <p className="text-destructive font-medium">Job not found.</p>
          <Button variant="outline" onClick={() => navigate("/admin/jobs")}>
            <ArrowLeft className="h-4 w-4 mr-2" /> Back to Jobs
          </Button>
        </div>
      </AppLayout>
    );
  }

  const isRunning = job.last_status === "RUNNING";
  const successCount = (logs ?? []).filter((l) => l.status === "SUCCESS").length;
  const failedCount = (logs ?? []).filter((l) => l.status === "FAILED").length;

  return (
    <AppLayout title="Job Details" portalLabel="Administration">
      <div className="space-y-5">
        {/* Header */}
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="sm" onClick={() => navigate("/admin/jobs")}>
              <ArrowLeft className="h-4 w-4 mr-1" /> Back
            </Button>
            <div>
              <h2 className="text-xl font-bold">{job.job_name}</h2>
              <p className="text-xs text-muted-foreground font-mono">{job.job_key}</p>
            </div>
            <StatusBadge status={job.last_status} />
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => { refetchJob(); refetchLogs(); }}
            >
              <RefreshCw className="h-3.5 w-3.5 mr-1.5" /> Refresh
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => toggleMutation.mutate()}
              disabled={toggleMutation.isPending}
            >
              {toggleMutation.isPending ? (
                <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
              ) : job.is_enabled ? (
                <PowerOff className="h-3.5 w-3.5 mr-1.5 text-destructive" />
              ) : (
                <Power className="h-3.5 w-3.5 mr-1.5 text-green-600" />
              )}
              {job.is_enabled ? "Disable" : "Enable"}
            </Button>
            <Button
              size="sm"
              onClick={() => runMutation.mutate()}
              disabled={runMutation.isPending || isRunning}
            >
              {runMutation.isPending || isRunning ? (
                <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
              ) : (
                <Play className="h-3.5 w-3.5 mr-1.5" />
              )}
              Run Now
            </Button>
          </div>
        </div>

        <div className="grid gap-4 lg:grid-cols-3">
          {/* Left: Info + Config */}
          <div className="space-y-4">
            {/* General Info */}
            <div className="rounded-xl border bg-white p-4 shadow-sm">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-3">
                General Information
              </h3>
              <InfoRow label="Job Name" value={job.job_name} />
              {job.description && (
                <InfoRow
                  label="Description"
                  value={
                    <span className="text-right text-xs text-muted-foreground">
                      {job.description}
                    </span>
                  }
                />
              )}
              <InfoRow
                label="Status"
                value={
                  <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${job.is_enabled ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"}`}>
                    {job.is_enabled ? "Enabled" : "Disabled"}
                  </span>
                }
              />
              <InfoRow
                label="Last Status"
                value={<StatusBadge status={job.last_status} />}
              />
              <InfoRow label="Last Run" value={<span className="text-xs">{fmt(job.last_run_at)}</span>} />
              <InfoRow label="Next Run" value={<span className="text-xs">{fmt(job.next_run_at)}</span>} />
            </div>

            {/* Configuration */}
            <div className="rounded-xl border bg-white p-4 shadow-sm">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Configuration
                </h3>
                {!editing && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 text-xs"
                    onClick={() => handleStartEdit(job)}
                  >
                    Edit
                  </Button>
                )}
              </div>

              {editing ? (
                <div className="space-y-3">
                  <div>
                    <Label className="text-xs">Cron Expression</Label>
                    <Input
                      value={editCron}
                      onChange={(e) => setEditCron(e.target.value)}
                      className="h-8 text-sm font-mono mt-1"
                      placeholder="0 8 * * *"
                    />
                    <p className="text-[10px] text-muted-foreground mt-0.5">
                      5-field cron: min hr dom mon dow
                    </p>
                  </div>
                  <div>
                    <Label className="text-xs">Max Retries</Label>
                    <Input
                      type="number"
                      min={0}
                      max={10}
                      value={editMaxRetries}
                      onChange={(e) => setEditMaxRetries(e.target.value)}
                      className="h-8 text-sm mt-1"
                    />
                  </div>
                  <div className="flex gap-2 pt-1">
                    <Button
                      size="sm"
                      className="h-7 text-xs"
                      onClick={handleSave}
                      disabled={updateMutation.isPending}
                    >
                      {updateMutation.isPending ? (
                        <Loader2 className="h-3 w-3 animate-spin mr-1" />
                      ) : (
                        <Save className="h-3 w-3 mr-1" />
                      )}
                      Save
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 text-xs"
                      onClick={() => setEditing(false)}
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              ) : (
                <>
                  <InfoRow
                    label="Cron"
                    value={
                      <span className="font-mono text-xs bg-muted px-2 py-0.5 rounded">
                        {job.cron_expression}
                      </span>
                    }
                  />
                  <InfoRow label="Max Retries" value={job.max_retries} />
                </>
              )}
            </div>

            {/* Stats */}
            {logs && logs.length > 0 && (
              <div className="rounded-xl border bg-white p-4 shadow-sm">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-3">
                  Last 50 Executions
                </h3>
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-lg bg-green-50 border border-green-100 p-3 text-center">
                    <p className="text-2xl font-bold text-green-700">{successCount}</p>
                    <p className="text-xs text-green-600">Successful</p>
                  </div>
                  <div className="rounded-lg bg-red-50 border border-red-100 p-3 text-center">
                    <p className="text-2xl font-bold text-red-700">{failedCount}</p>
                    <p className="text-xs text-red-600">Failed</p>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Right: Execution History */}
          <div className="lg:col-span-2">
            <div className="rounded-xl border bg-white shadow-sm">
              <div className="flex items-center justify-between px-4 py-3 border-b">
                <h3 className="font-semibold text-sm">Execution History</h3>
                <div className="flex items-center gap-2">
                  <select
                    className="h-7 rounded-md border border-input bg-background px-2 text-xs"
                    value={logStatusFilter}
                    onChange={(e) => setLogStatusFilter(e.target.value)}
                  >
                    <option value="">All statuses</option>
                    <option value="SUCCESS">Success</option>
                    <option value="FAILED">Failed</option>
                    <option value="RUNNING">Running</option>
                  </select>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 w-7 p-0"
                    onClick={() => refetchLogs()}
                  >
                    <RefreshCw className="h-3 w-3" />
                  </Button>
                </div>
              </div>

              {logsLoading && (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                </div>
              )}

              {!logsLoading && (!logs || logs.length === 0) && (
                <div className="py-12 text-center text-sm text-muted-foreground">
                  <Clock className="h-8 w-8 mx-auto mb-2 text-muted-foreground/30" />
                  No execution records yet.
                </div>
              )}

              {!logsLoading && logs && logs.length > 0 && (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-muted/40">
                        <th className="px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                          Started At
                        </th>
                        <th className="px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                          Completed At
                        </th>
                        <th className="px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                          Duration
                        </th>
                        <th className="px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                          Status
                        </th>
                        <th className="px-4 py-2.5 text-right text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                          Records
                        </th>
                        <th className="px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                          Error
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {logs.map((log) => (
                        <LogRow key={log.id} log={log} />
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
