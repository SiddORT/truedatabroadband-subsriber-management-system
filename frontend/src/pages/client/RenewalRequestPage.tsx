import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, RefreshCw, CheckCircle2 } from "lucide-react";
import { ClientLayout } from "@/layouts/ClientLayout";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { useToast } from "@/contexts/ToastContext";
import { clientService } from "@/services/client";

const BILLING_CYCLE_OPTIONS = [
  { value: "MONTHLY", label: "Monthly" },
  { value: "QUARTERLY", label: "Quarterly (3 months)" },
  { value: "HALF_YEARLY", label: "Half-Yearly (6 months)" },
  { value: "ANNUALLY", label: "Annually (12 months)" },
];

export function RenewalRequestPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { showToast } = useToast();
  const qc = useQueryClient();

  const [billingCycle, setBillingCycle] = useState("");
  const [remarks, setRemarks] = useState("");
  const [submitted, setSubmitted] = useState(false);

  const { data: sub, isLoading } = useQuery({
    queryKey: ["client-subscription", id],
    queryFn: () => clientService.getSubscriptionDetail(id!),
    enabled: !!id,
  });

  const mutation = useMutation({
    mutationFn: () =>
      clientService.createRenewalRequest(id!, {
        requested_billing_cycle: billingCycle,
        remarks: remarks.trim() || null,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["client-subscription", id] });
      qc.invalidateQueries({ queryKey: ["client-subscription-requests", id] });
      setSubmitted(true);
    },
    onError: (err: any) => {
      const msg =
        err?.response?.data?.detail ?? "Failed to submit renewal request.";
      showToast(msg, "error");
    },
  });

  if (isLoading) {
    return (
      <ClientLayout title="Request Renewal">
        <div className="space-y-4">
          <div className="h-10 w-48 animate-pulse rounded-lg bg-gray-100" />
          <div className="h-64 animate-pulse rounded-xl border bg-gray-100" />
        </div>
      </ClientLayout>
    );
  }

  if (!sub) {
    return (
      <ClientLayout title="Request Renewal">
        <div className="flex flex-col items-center gap-3 py-20 text-center">
          <p className="font-medium text-destructive">Subscription not found.</p>
          <Button variant="outline" onClick={() => navigate("/client/connections")}>
            <ArrowLeft className="h-4 w-4 mr-2" /> Back
          </Button>
        </div>
      </ClientLayout>
    );
  }

  if (sub.status !== "ACTIVE") {
    return (
      <ClientLayout title="Request Renewal">
        <div className="flex flex-col items-center gap-3 py-20 text-center">
          <p className="font-medium text-destructive">
            Renewal requests can only be submitted for active subscriptions.
          </p>
          <Button
            variant="outline"
            onClick={() => navigate(`/client/connections/${id}`)}
          >
            <ArrowLeft className="h-4 w-4 mr-2" /> Back
          </Button>
        </div>
      </ClientLayout>
    );
  }

  if (sub.pending_renewal_request) {
    return (
      <ClientLayout title="Request Renewal">
        <div className="flex flex-col items-center gap-3 py-20 text-center">
          <p className="font-medium text-yellow-700">
            A renewal request is already pending review.
          </p>
          <Button
            variant="outline"
            onClick={() => navigate(`/client/connections/${id}`)}
          >
            <ArrowLeft className="h-4 w-4 mr-2" /> Back to Connection
          </Button>
        </div>
      </ClientLayout>
    );
  }

  if (submitted) {
    return (
      <ClientLayout title="Request Renewal">
        <div className="flex flex-col items-center gap-4 py-24 text-center">
          <CheckCircle2 className="h-14 w-14 text-green-500" />
          <div>
            <h3 className="text-lg font-bold">Renewal Request Submitted!</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Our team will review your request and get back to you shortly.
            </p>
          </div>
          <div className="flex gap-3 mt-2">
            <Button
              variant="outline"
              onClick={() => navigate(`/client/connections/${id}`)}
            >
              View Connection
            </Button>
            <Button onClick={() => navigate("/client/connections")}>
              All Connections
            </Button>
          </div>
        </div>
      </ClientLayout>
    );
  }

  const expiryDate = new Date(sub.expiry_date).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });

  return (
    <ClientLayout title="Request Renewal">
      <div className="space-y-5">
        {/* Header */}
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate(`/client/connections/${id}`)}
          >
            <ArrowLeft className="h-4 w-4 mr-1" /> Back
          </Button>
          <div className="flex items-center gap-2">
            <RefreshCw className="h-5 w-5 text-primary" />
            <div>
              <h2 className="text-lg font-bold">Request Renewal</h2>
              <p className="text-xs text-muted-foreground">
                {sub.connection_name || sub.subscription_code}
              </p>
            </div>
          </div>
        </div>

        {/* Current subscription info */}
        <div className="rounded-xl border bg-white p-4 shadow-sm">
          <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">
            Current Connection
          </h3>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 text-sm">
            <div>
              <p className="text-xs text-muted-foreground">Plan</p>
              <p className="font-medium">{sub.plan_name}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Speed</p>
              <p className="font-medium">{sub.speed_mbps} Mbps</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Current Billing</p>
              <p className="font-medium">{sub.billing_cycle}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Expires On</p>
              <p className="font-medium">{expiryDate}</p>
            </div>
          </div>
        </div>

        {/* Renewal form */}
        <div className="rounded-xl border bg-white p-6 shadow-sm space-y-5">
          <h3 className="font-semibold">Renewal Details</h3>

          <div className="space-y-2">
            <Label htmlFor="billing_cycle" className="text-sm">
              Requested Billing Cycle{" "}
              <span className="text-destructive">*</span>
            </Label>
            <select
              id="billing_cycle"
              className="h-9 w-full max-w-xs rounded-md border border-input bg-background px-3 text-sm"
              value={billingCycle}
              onChange={(e) => setBillingCycle(e.target.value)}
            >
              <option value="">Select billing cycle…</option>
              {BILLING_CYCLE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
            <p className="text-xs text-muted-foreground">
              Select the billing period for your renewal. Final pricing will be
              confirmed by our team.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="remarks" className="text-sm">
              Remarks{" "}
              <span className="text-muted-foreground">(optional)</span>
            </Label>
            <textarea
              id="remarks"
              placeholder="Any special instructions or notes…"
              value={remarks}
              onChange={(e) => setRemarks(e.target.value)}
              maxLength={1000}
              rows={3}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-ring"
            />
            <p className="text-xs text-muted-foreground text-right">
              {remarks.length}/1000
            </p>
          </div>

          <div className="flex justify-end gap-3 pt-2 border-t">
            <Button
              variant="outline"
              onClick={() => navigate(`/client/connections/${id}`)}
            >
              Cancel
            </Button>
            <Button
              disabled={!billingCycle || mutation.isPending}
              onClick={() => mutation.mutate()}
            >
              <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
              {mutation.isPending ? "Submitting…" : "Submit Request"}
            </Button>
          </div>
        </div>
      </div>
    </ClientLayout>
  );
}
