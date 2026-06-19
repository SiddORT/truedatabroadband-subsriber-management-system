import { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  CheckCircle2,
  ClipboardList,
  ExternalLink,
  Loader2,
  XCircle,
  AlertCircle,
} from "lucide-react";
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
  new_subscription_code: string | null;
  renewal_start_date: string | null;
  renewal_end_date: string | null;
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

interface RenewalPreview {
  plan_name: string;
  billing_cycle: string;
  total_price: number;
  start_date: string;
  connection_name: string | null;
  installation_address: string | null;
  remarks: string | null;
  current_expiry_date: string;
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

// ── Renewal Approval Modal ────────────────────────────────────────────────────

function RenewalApprovalModal({
  open,
  requestId,
  customerName,
  subscriptionCode,
  requestedBillingCycle,
  onClose,
  onConfirm,
  isPending,
}: {
  open: boolean;
  requestId: string;
  customerName: string;
  subscriptionCode: string;
  requestedBillingCycle: string;
  onClose: () => void;
  onConfirm: (data: {
    start_date: string;
    connection_name: string;
    installation_address: string;
    remarks: string;
    review_notes: string;
  }) => void;
  isPending: boolean;
}) {
  const [form, setForm] = useState({
    start_date: "",
    connection_name: "",
    installation_address: "",
    remarks: "",
    review_notes: "",
  });
  const [initialised, setInitialised] = useState(false);

  const { data: preview, isLoading, isError } = useQuery<RenewalPreview>({
    queryKey: ["renewal-preview", requestId],
    queryFn: () =>
      api.get(`/subscription-requests/renewal/${requestId}/preview`).then((r) => r.data),
    enabled: open,
    staleTime: 0,
  });

  // Pre-fill form once preview loads (only once per open)
  if (preview && !initialised) {
    setForm({
      start_date: preview.start_date,
      connection_name: preview.connection_name ?? "",
      installation_address: preview.installation_address ?? "",
      remarks: preview.remarks ?? "",
      review_notes: "",
    });
    setInitialised(true);
  }

  // Reset when closed
  const handleClose = () => {
    setInitialised(false);
    setForm({ start_date: "", connection_name: "", installation_address: "", remarks: "", review_notes: "" });
    onClose();
  };

  const field = (label: string, key: keyof typeof form, type = "text", rows?: number) => (
    <div>
      <label className="mb-1 block text-xs font-medium text-muted-foreground">{label}</label>
      {rows ? (
        <textarea
          value={form[key]}
          onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
          rows={rows}
          className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
        />
      ) : (
        <input
          type={type}
          value={form[key]}
          onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
          className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
        />
      )}
    </div>
  );

  return (
    <Dialog open={open} onClose={handleClose} title="Approve Renewal Request">
      <div className="space-y-4 min-w-[480px]">
        {/* Header info */}
        <div className="rounded-lg bg-muted/40 px-4 py-3 text-sm space-y-1">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Customer</span>
            <span className="font-medium">{customerName}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Subscription</span>
            <span className="font-mono font-semibold text-primary">{subscriptionCode}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Billing Cycle</span>
            <span className="font-medium">{BILLING_CYCLE_LABELS[requestedBillingCycle] ?? requestedBillingCycle}</span>
          </div>
        </div>

        {isLoading && (
          <div className="flex items-center justify-center gap-2 py-6 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading subscription details…
          </div>
        )}

        {isError && (
          <div className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
            <AlertCircle className="h-4 w-4 shrink-0" />
            Could not load preview. No active pricing may exist for the requested billing cycle.
          </div>
        )}

        {preview && initialised && (
          <>
            {/* Plan/price summary */}
            <div className="rounded-lg border border-border bg-primary/5 px-4 py-3 text-sm space-y-1">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Plan</span>
                <span className="font-medium">{preview.plan_name}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Price</span>
                <span className="font-semibold text-primary">₹{Number(preview.total_price).toLocaleString("en-IN")}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Current expiry</span>
                <span>{fmt(preview.current_expiry_date)}</span>
              </div>
            </div>

            <p className="text-xs text-muted-foreground -mt-1">
              Review the new subscription details below and adjust if needed before confirming.
            </p>

            {/* Editable fields */}
            <div className="space-y-3">
              {field("New Start Date", "start_date", "date")}
              {field("Connection Name", "connection_name")}
              {field("Installation Address", "installation_address", "text", 2)}
              {field("Remarks", "remarks", "text", 2)}
              {field("Review Notes (optional)", "review_notes", "text", 2)}
            </div>
          </>
        )}

        <div className="flex justify-end gap-2 border-t border-border pt-3">
          <Button variant="outline" size="sm" onClick={handleClose} disabled={isPending}>
            Cancel
          </Button>
          <Button
            size="sm"
            disabled={isPending || isLoading || isError || !initialised}
            onClick={() => onConfirm(form)}
          >
            {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
            Confirm Approval
          </Button>
        </div>
      </div>
    </Dialog>
  );
}

// ── Review Dialog (reject / plan-change approve) ───────────────────────────────

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
  const [approvalModal, setApprovalModal] = useState<RenewalRequest | null>(null);
  const [rejectDialog, setRejectDialog] = useState<string | null>(null);

  const { data = [], isLoading } = useQuery<RenewalRequest[]>({
    queryKey: ["admin-renewal-requests", statusFilter],
    queryFn: () =>
      api.get("/subscription-requests/renewal", { params: statusFilter ? { status: statusFilter } : {} })
        .then((r) => r.data),
  });

  const approveMutate = useMutation({
    mutationFn: ({ id, data }: {
      id: string;
      data: {
        start_date: string;
        connection_name: string;
        installation_address: string;
        remarks: string;
        review_notes: string;
      };
    }) =>
      api.post(`/subscription-requests/renewal/${id}/approve`, {
        review_notes: data.review_notes || null,
        start_date: data.start_date || null,
        connection_name: data.connection_name || null,
        installation_address: data.installation_address || null,
        remarks: data.remarks || null,
      }),
    onSuccess: (res) => {
      const d = res.data as { new_subscription_code?: string; renewal_start_date?: string; renewal_end_date?: string };
      const code = d?.new_subscription_code;
      const msg = code
        ? `Renewal approved. New subscription ${code} scheduled from ${d.renewal_start_date} to ${d.renewal_end_date}.`
        : "Renewal approved. New subscription created.";
      showToast(msg, "success");
      qc.invalidateQueries({ queryKey: ["admin-renewal-requests"] });
      setApprovalModal(null);
    },
    onError: (err: unknown) => {
      const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ?? "Approval failed.";
      showToast(msg, "error");
    },
  });

  const rejectMutate = useMutation({
    mutationFn: ({ id, notes }: { id: string; notes: string }) =>
      api.post(`/subscription-requests/renewal/${id}/reject`, { review_notes: notes || null }),
    onSuccess: () => {
      showToast("Request rejected.", "info");
      qc.invalidateQueries({ queryKey: ["admin-renewal-requests"] });
      setRejectDialog(null);
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
                <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">Sr. No.</th>
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
              {data.map((req, idx) => (
                <tr key={req.id} className="hover:bg-muted/20">
                  <td className="px-4 py-3 text-xs text-muted-foreground">{idx + 1}</td>
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
                  <td className="px-4 py-3 max-w-[200px]">
                    <p className="truncate text-xs text-muted-foreground">{req.remarks || "—"}</p>
                    {req.review_notes && (
                      <p className="mt-0.5 truncate text-xs text-muted-foreground italic">Review: {req.review_notes}</p>
                    )}
                    {req.status === "APPROVED" && req.new_subscription_code && (
                      <p className="mt-1 text-xs font-medium text-green-700">
                        New: {req.new_subscription_code} ({req.renewal_start_date} → {req.renewal_end_date})
                      </p>
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
                        <Button
                          size="sm"
                          className="h-7 gap-1 text-xs"
                          onClick={() => setApprovalModal(req)}
                        >
                          <CheckCircle2 className="h-3.5 w-3.5" />
                          Approve
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 gap-1 text-xs text-destructive hover:text-destructive"
                          onClick={() => setRejectDialog(req.id)}
                        >
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

      {approvalModal && (
        <RenewalApprovalModal
          open
          requestId={approvalModal.id}
          customerName={approvalModal.customer_name}
          subscriptionCode={approvalModal.subscription_code}
          requestedBillingCycle={approvalModal.requested_billing_cycle}
          onClose={() => setApprovalModal(null)}
          isPending={approveMutate.isPending}
          onConfirm={(data) => approveMutate.mutate({ id: approvalModal.id, data })}
        />
      )}

      {rejectDialog && (
        <ReviewDialog
          open
          onClose={() => setRejectDialog(null)}
          action="reject"
          isPending={rejectMutate.isPending}
          onConfirm={(notes) => rejectMutate.mutate({ id: rejectDialog, notes })}
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
          ? "Plan change approved and applied. The subscription now reflects the new plan."
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
                <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">Sr. No.</th>
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
              {data.map((req, idx) => (
                <tr key={req.id} className="hover:bg-muted/20">
                  <td className="px-4 py-3 text-xs text-muted-foreground">{idx + 1}</td>
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
    <AppLayout title="Subscription Requests" portalLabel="Administration">
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
