import { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, ClipboardList, ExternalLink, Loader2, XCircle } from "lucide-react";
import { AppLayout } from "@/layouts/AppLayout";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/Dialog";
import { useToast } from "@/contexts/ToastContext";
import { api } from "@/services/api";
import { cn } from "@/lib/utils";

// ── Types ────────────────────────────────────────────────────────────────────

interface RenewalRequest {
  id: string;
  status: "PENDING" | "APPROVED" | "REJECTED" | "CANCELLED";
  subscription_id: string;
  subscription_code: string;
  connection_name: string | null;
  customer_id: string;
  customer_name: string;
  customer_code: string;
  requested_billing_cycle: string;
  remarks: string | null;
  review_notes: string | null;
  reviewed_at: string | null;
  created_at: string;
}

interface PlanChangeRequest {
  id: string;
  status: "PENDING" | "APPROVED" | "REJECTED" | "CANCELLED";
  subscription_id: string;
  subscription_code: string;
  connection_name: string | null;
  customer_id: string;
  customer_name: string;
  customer_code: string;
  current_plan_name: string;
  requested_plan_name: string;
  remarks: string | null;
  review_notes: string | null;
  reviewed_at: string | null;
  created_at: string;
}

const STATUS_BADGE: Record<string, string> = {
  PENDING: "bg-amber-100 text-amber-700",
  APPROVED: "bg-emerald-100 text-emerald-700",
  REJECTED: "bg-red-100 text-red-700",
  CANCELLED: "bg-gray-100 text-gray-500",
};

const BILLING_CYCLE_LABELS: Record<string, string> = {
  MONTHLY: "Monthly",
  QUARTERLY: "Quarterly",
  HALF_YEARLY: "Half-Yearly",
  ANNUALLY: "Annually",
};

function fmt(d: string) {
  return new Date(d).toLocaleDateString("en-IN", {
    day: "2-digit", month: "short", year: "numeric",
  });
}

// ── Review Dialog ─────────────────────────────────────────────────────────────

function ReviewDialog({
  open,
  onClose,
  action,
  onConfirm,
  isPending,
}: {
  open: boolean;
  onClose: () => void;
  action: "approve" | "reject";
  onConfirm: (notes: string) => void;
  isPending: boolean;
}) {
  const [notes, setNotes] = useState("");
  return (
    <Dialog open={open} onClose={onClose} title={action === "approve" ? "Approve Request" : "Reject Request"}>
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground">
          {action === "approve"
            ? "Approving this request will execute the action immediately."
            : "Please provide a reason for rejecting this request."}
        </p>
        <div>
          <label className="mb-1 block text-xs font-medium text-muted-foreground">
            Review Notes {action === "reject" && <span className="text-destructive">*</span>}
          </label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            placeholder={action === "approve" ? "Optional notes…" : "Reason for rejection…"}
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
          />
        </div>
        <div className="flex justify-end gap-2 border-t border-border pt-3">
          <Button variant="outline" size="sm" onClick={onClose} disabled={isPending}>Cancel</Button>
          <Button
            size="sm"
            variant={action === "reject" ? "destructive" : "default"}
            disabled={isPending || (action === "reject" && !notes.trim())}
            onClick={() => onConfirm(notes)}
          >
            {isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            {action === "approve" ? "Approve" : "Reject"}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}

// ── Renewal Tab ───────────────────────────────────────────────────────────────

function RenewalTab() {
  const { showToast } = useToast();
  const qc = useQueryClient();
  const [statusFilter, setStatusFilter] = useState("PENDING");
  const [dialog, setDialog] = useState<{ id: string; action: "approve" | "reject" } | null>(null);

  const { data = [], isLoading } = useQuery<RenewalRequest[]>({
    queryKey: ["admin-renewal-requests", statusFilter],
    queryFn: () =>
      api.get("/subscription-requests/renewal", { params: statusFilter ? { status: statusFilter } : {} })
        .then((r) => r.data),
  });

  const mutate = useMutation({
    mutationFn: ({ id, action, notes }: { id: string; action: string; notes: string }) =>
      api.post(`/subscription-requests/renewal/${id}/${action}`, { review_notes: notes || null }),
    onSuccess: (_, vars) => {
      showToast(vars.action === "approve" ? "Renewal approved and executed." : "Request rejected.", vars.action === "approve" ? "success" : "info");
      qc.invalidateQueries({ queryKey: ["admin-renewal-requests"] });
      setDialog(null);
    },
    onError: (err: unknown) => {
      const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ?? "Action failed.";
      showToast(msg, "error");
    },
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="rounded-lg border border-border bg-surface px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
        >
          <option value="">All Statuses</option>
          <option value="PENDING">Pending</option>
          <option value="APPROVED">Approved</option>
          <option value="REJECTED">Rejected</option>
          <option value="CANCELLED">Cancelled</option>
        </select>
      </div>

      {isLoading ? (
        <div className="flex h-32 items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      ) : data.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-xl border-2 border-dashed border-border/60 p-10 text-center">
          <ClipboardList className="h-8 w-8 text-muted-foreground/30" />
          <p className="text-sm text-muted-foreground">No renewal requests found.</p>
        </div>
      ) : (
        <div className="rounded-xl border border-border overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">Customer</th>
                <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">Subscription</th>
                <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">Billing Cycle</th>
                <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">Remarks</th>
                <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">Requested</th>
                <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">Status</th>
                <th className="px-4 py-2.5 text-right text-xs font-medium text-muted-foreground">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {data.map((req) => (
                <tr key={req.id} className="hover:bg-muted/20">
                  <td className="px-4 py-3">
                    <Link to={`/admin/customers/${req.customer_id}`} className="font-medium text-foreground hover:text-primary hover:underline">
                      {req.customer_name}
                    </Link>
                    <p className="text-xs text-muted-foreground">{req.customer_code}</p>
                  </td>
                  <td className="px-4 py-3">
                    <Link to={`/admin/subscriptions/${req.subscription_id}`} className="flex items-center gap-1 font-mono text-xs font-semibold text-primary hover:underline">
                      {req.subscription_code}
                      <ExternalLink className="h-3 w-3" />
                    </Link>
                    {req.connection_name && (
                      <p className="text-xs text-muted-foreground">{req.connection_name}</p>
                    )}
                  </td>
                  <td className="px-4 py-3 text-sm">
                    {BILLING_CYCLE_LABELS[req.requested_billing_cycle] ?? req.requested_billing_cycle}
                  </td>
                  <td className="px-4 py-3 max-w-[180px]">
                    <p className="truncate text-xs text-muted-foreground">{req.remarks || "—"}</p>
                    {req.review_notes && (
                      <p className="mt-0.5 truncate text-xs text-muted-foreground italic">Review: {req.review_notes}</p>
                    )}
                  </td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">{fmt(req.created_at)}</td>
                  <td className="px-4 py-3">
                    <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium", STATUS_BADGE[req.status] ?? "bg-gray-100 text-gray-600")}>
                      {req.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    {req.status === "PENDING" && (
                      <div className="flex items-center justify-end gap-1">
                        <Button size="sm" className="h-7 gap-1 text-xs" onClick={() => setDialog({ id: req.id, action: "approve" })}>
                          <CheckCircle2 className="h-3.5 w-3.5" />
                          Approve
                        </Button>
                        <Button size="sm" variant="outline" className="h-7 gap-1 text-xs text-destructive hover:text-destructive" onClick={() => setDialog({ id: req.id, action: "reject" })}>
                          <XCircle className="h-3.5 w-3.5" />
                          Reject
                        </Button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {dialog && (
        <ReviewDialog
          open
          onClose={() => setDialog(null)}
          action={dialog.action}
          isPending={mutate.isPending}
          onConfirm={(notes) => mutate.mutate({ id: dialog.id, action: dialog.action, notes })}
        />
      )}
    </div>
  );
}

// ── Plan Change Tab ───────────────────────────────────────────────────────────

function PlanChangeTab() {
  const { showToast } = useToast();
  const qc = useQueryClient();
  const [statusFilter, setStatusFilter] = useState("PENDING");
  const [dialog, setDialog] = useState<{ id: string; action: "approve" | "reject" } | null>(null);

  const { data = [], isLoading } = useQuery<PlanChangeRequest[]>({
    queryKey: ["admin-plan-change-requests", statusFilter],
    queryFn: () =>
      api.get("/subscription-requests/plan-change", { params: statusFilter ? { status: statusFilter } : {} })
        .then((r) => r.data),
  });

  const mutate = useMutation({
    mutationFn: ({ id, action, notes }: { id: string; action: string; notes: string }) =>
      api.post(`/subscription-requests/plan-change/${id}/${action}`, { review_notes: notes || null }),
    onSuccess: (_, vars) => {
      showToast(
        vars.action === "approve"
          ? "Plan change approved. Go to the subscription to execute it."
          : "Request rejected.",
        vars.action === "approve" ? "success" : "info",
      );
      qc.invalidateQueries({ queryKey: ["admin-plan-change-requests"] });
      setDialog(null);
    },
    onError: (err: unknown) => {
      const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ?? "Action failed.";
      showToast(msg, "error");
    },
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="rounded-lg border border-border bg-surface px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
        >
          <option value="">All Statuses</option>
          <option value="PENDING">Pending</option>
          <option value="APPROVED">Approved</option>
          <option value="REJECTED">Rejected</option>
          <option value="CANCELLED">Cancelled</option>
        </select>
      </div>

      {isLoading ? (
        <div className="flex h-32 items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      ) : data.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-xl border-2 border-dashed border-border/60 p-10 text-center">
          <ClipboardList className="h-8 w-8 text-muted-foreground/30" />
          <p className="text-sm text-muted-foreground">No plan change requests found.</p>
        </div>
      ) : (
        <div className="rounded-xl border border-border overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">Customer</th>
                <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">Subscription</th>
                <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">Plan Change</th>
                <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">Remarks</th>
                <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">Requested</th>
                <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">Status</th>
                <th className="px-4 py-2.5 text-right text-xs font-medium text-muted-foreground">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {data.map((req) => (
                <tr key={req.id} className="hover:bg-muted/20">
                  <td className="px-4 py-3">
                    <Link to={`/admin/customers/${req.customer_id}`} className="font-medium text-foreground hover:text-primary hover:underline">
                      {req.customer_name}
                    </Link>
                    <p className="text-xs text-muted-foreground">{req.customer_code}</p>
                  </td>
                  <td className="px-4 py-3">
                    <Link to={`/admin/subscriptions/${req.subscription_id}`} className="flex items-center gap-1 font-mono text-xs font-semibold text-primary hover:underline">
                      {req.subscription_code}
                      <ExternalLink className="h-3 w-3" />
                    </Link>
                    {req.connection_name && (
                      <p className="text-xs text-muted-foreground">{req.connection_name}</p>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1.5 text-xs">
                      <span className="rounded bg-muted px-1.5 py-0.5 text-muted-foreground line-through">{req.current_plan_name}</span>
                      <span className="text-muted-foreground">→</span>
                      <span className="rounded bg-primary/10 px-1.5 py-0.5 font-medium text-primary">{req.requested_plan_name}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 max-w-[180px]">
                    <p className="truncate text-xs text-muted-foreground">{req.remarks || "—"}</p>
                    {req.review_notes && (
                      <p className="mt-0.5 truncate text-xs text-muted-foreground italic">Review: {req.review_notes}</p>
                    )}
                  </td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">{fmt(req.created_at)}</td>
                  <td className="px-4 py-3">
                    <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium", STATUS_BADGE[req.status] ?? "bg-gray-100 text-gray-600")}>
                      {req.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    {req.status === "PENDING" && (
                      <div className="flex items-center justify-end gap-1">
                        <Button size="sm" className="h-7 gap-1 text-xs" onClick={() => setDialog({ id: req.id, action: "approve" })}>
                          <CheckCircle2 className="h-3.5 w-3.5" />
                          Approve
                        </Button>
                        <Button size="sm" variant="outline" className="h-7 gap-1 text-xs text-destructive hover:text-destructive" onClick={() => setDialog({ id: req.id, action: "reject" })}>
                          <XCircle className="h-3.5 w-3.5" />
                          Reject
                        </Button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {dialog && (
        <ReviewDialog
          open
          onClose={() => setDialog(null)}
          action={dialog.action}
          isPending={mutate.isPending}
          onConfirm={(notes) => mutate.mutate({ id: dialog.id, action: dialog.action, notes })}
        />
      )}
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

const TABS = [
  { key: "renewal", label: "Renewal Requests" },
  { key: "plan-change", label: "Plan Change Requests" },
];

export function SubscriptionRequestsPage() {
  const [activeTab, setActiveTab] = useState("renewal");

  return (
    <AppLayout title="Subscription Requests">
      <div className="space-y-5">
        <div className="flex items-center gap-2">
          <ClipboardList className="h-5 w-5 text-primary" />
          <h2 className="text-xl font-semibold">Subscription Requests</h2>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 rounded-xl border border-border bg-muted/30 p-1 w-fit">
          {TABS.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={cn(
                "rounded-lg px-4 py-2 text-sm font-medium transition-colors",
                activeTab === tab.key
                  ? "bg-primary text-white shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {activeTab === "renewal" ? <RenewalTab /> : <PlanChangeTab />}
      </div>
    </AppLayout>
  );
}
