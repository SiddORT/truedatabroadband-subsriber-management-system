import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, ArrowRightLeft, CheckCircle2, Zap, Check } from "lucide-react";
import { ClientLayout } from "@/layouts/ClientLayout";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { useToast } from "@/contexts/ToastContext";
import { clientService } from "@/services/client";
import type { ClientPlanListItem } from "@/types/client";

const DATA_POLICY_LABELS: Record<string, string> = {
  UNLIMITED: "Unlimited Data",
  FUP: "FUP Limited",
};

const BILLING_CYCLE_LABELS: Record<string, string> = {
  MONTHLY: "Monthly",
  QUARTERLY: "Quarterly",
  HALF_YEARLY: "Half-Yearly",
  ANNUALLY: "Annual",
};

function PlanCard({
  plan,
  selected,
  isCurrent,
  onSelect,
}: {
  plan: ClientPlanListItem;
  selected: boolean;
  isCurrent: boolean;
  onSelect: () => void;
}) {
  const minPrice = plan.pricing.reduce((min, p) => {
    const price = parseFloat(p.total_price);
    return price < min ? price : min;
  }, Infinity);

  return (
    <button
      type="button"
      disabled={isCurrent}
      onClick={onSelect}
      className={[
        "relative w-full rounded-xl border p-4 text-left transition-all focus:outline-none",
        isCurrent
          ? "cursor-not-allowed border-muted bg-muted/40 opacity-60"
          : selected
          ? "border-primary bg-primary/5 shadow-md ring-2 ring-primary"
          : "border-border bg-white hover:border-primary/40 hover:shadow-sm",
      ].join(" ")}
    >
      {selected && !isCurrent && (
        <div className="absolute right-3 top-3 flex h-5 w-5 items-center justify-center rounded-full bg-primary text-white">
          <Check className="h-3 w-3" />
        </div>
      )}
      {isCurrent && (
        <span className="absolute right-3 top-3 rounded-full bg-gray-200 px-2 py-0.5 text-[10px] font-semibold text-gray-500 uppercase tracking-wide">
          Current
        </span>
      )}

      <div className="flex items-center gap-2 mb-2">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10">
          <Zap className="h-4 w-4 text-primary" />
        </div>
        <div>
          <p className="font-semibold text-sm">{plan.name}</p>
          <p className="text-[11px] text-muted-foreground">{plan.plan_code}</p>
        </div>
      </div>

      <div className="space-y-1 text-sm">
        <div className="flex justify-between">
          <span className="text-muted-foreground text-xs">Speed</span>
          <span className="font-medium">{plan.speed_mbps} Mbps</span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground text-xs">Data</span>
          <span className="font-medium text-xs">
            {DATA_POLICY_LABELS[plan.data_policy] ?? plan.data_policy}
            {plan.fup_limit_gb ? ` (${plan.fup_limit_gb} GB)` : ""}
          </span>
        </div>
        {plan.pricing.length > 0 && minPrice !== Infinity && (
          <div className="flex justify-between mt-2 pt-2 border-t">
            <span className="text-muted-foreground text-xs">Starting from</span>
            <span className="font-bold text-primary">
              ₹{minPrice.toLocaleString("en-IN")}/mo
            </span>
          </div>
        )}
      </div>

      {selected && !isCurrent && plan.pricing.length > 0 && (
        <div className="mt-3 pt-3 border-t space-y-1">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mb-1">
            Pricing
          </p>
          {plan.pricing.map((p) => (
            <div key={p.id} className="flex justify-between text-xs">
              <span className="text-muted-foreground">
                {BILLING_CYCLE_LABELS[p.billing_cycle] ?? p.billing_cycle}
              </span>
              <span className="font-medium">
                ₹{parseFloat(p.total_price).toLocaleString("en-IN")}
              </span>
            </div>
          ))}
        </div>
      )}
    </button>
  );
}

export function PlanChangeRequestPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { showToast } = useToast();
  const qc = useQueryClient();

  const [selectedPlanId, setSelectedPlanId] = useState<string>("");
  const [remarks, setRemarks] = useState("");
  const [submitted, setSubmitted] = useState(false);

  const { data: sub, isLoading: subLoading } = useQuery({
    queryKey: ["client-subscription", id],
    queryFn: () => clientService.getSubscriptionDetail(id!),
    enabled: !!id,
  });

  const { data: plans, isLoading: plansLoading } = useQuery({
    queryKey: ["client-plans"],
    queryFn: () => clientService.listPlans(),
    enabled: !!id,
  });

  const mutation = useMutation({
    mutationFn: () =>
      clientService.createPlanChangeRequest(id!, {
        requested_plan_id: selectedPlanId,
        remarks: remarks.trim() || null,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["client-subscription", id] });
      qc.invalidateQueries({ queryKey: ["client-subscription-requests", id] });
      setSubmitted(true);
    },
    onError: (err: any) => {
      const msg =
        err?.response?.data?.detail ?? "Failed to submit plan change request.";
      showToast(msg, "error");
    },
  });

  const isLoading = subLoading || plansLoading;
  const selectedPlan = plans?.find((p) => p.id === selectedPlanId) ?? null;

  if (isLoading) {
    return (
      <ClientLayout title="Request Plan Change">
        <div className="space-y-4">
          <div className="h-10 w-48 animate-pulse rounded-lg bg-gray-100" />
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <div
                key={i}
                className="h-44 animate-pulse rounded-xl border bg-gray-100"
              />
            ))}
          </div>
        </div>
      </ClientLayout>
    );
  }

  if (!sub) {
    return (
      <ClientLayout title="Request Plan Change">
        <div className="flex flex-col items-center gap-3 py-20 text-center">
          <p className="font-medium text-destructive">Subscription not found.</p>
          <Button
            variant="outline"
            onClick={() => navigate("/client/connections")}
          >
            <ArrowLeft className="h-4 w-4 mr-2" /> Back
          </Button>
        </div>
      </ClientLayout>
    );
  }

  if (sub.status !== "ACTIVE") {
    return (
      <ClientLayout title="Request Plan Change">
        <div className="flex flex-col items-center gap-3 py-20 text-center">
          <p className="font-medium text-destructive">
            Plan change requests can only be submitted for active subscriptions.
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

  if (sub.pending_plan_change_request) {
    return (
      <ClientLayout title="Request Plan Change">
        <div className="flex flex-col items-center gap-3 py-20 text-center">
          <p className="font-medium text-yellow-700">
            A plan change request is already pending review.
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
      <ClientLayout title="Request Plan Change">
        <div className="flex flex-col items-center gap-4 py-24 text-center">
          <CheckCircle2 className="h-14 w-14 text-green-500" />
          <div>
            <h3 className="text-lg font-bold">Plan Change Request Submitted!</h3>
            {selectedPlan && (
              <p className="mt-1 text-sm text-muted-foreground">
                Requested: <strong>{selectedPlan.name}</strong>
              </p>
            )}
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

  return (
    <ClientLayout title="Request Plan Change">
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
            <ArrowRightLeft className="h-5 w-5 text-primary" />
            <div>
              <h2 className="text-lg font-bold">Request Plan Change</h2>
              <p className="text-xs text-muted-foreground">
                {sub.connection_name || sub.subscription_code} · Current:{" "}
                {sub.plan_name}
              </p>
            </div>
          </div>
        </div>

        {/* Plan selection */}
        <div className="rounded-xl border bg-white p-4 shadow-sm">
          <h3 className="font-semibold mb-1">Select New Plan</h3>
          <p className="text-sm text-muted-foreground mb-4">
            Choose the plan you'd like to switch to. Your current plan is
            highlighted below.
          </p>
          {!plans || plans.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">
              No plans available at the moment.
            </p>
          ) : (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {plans.map((plan) => (
                <PlanCard
                  key={plan.id}
                  plan={plan}
                  selected={selectedPlanId === plan.id}
                  isCurrent={plan.id === sub.plan_id}
                  onSelect={() => setSelectedPlanId(plan.id)}
                />
              ))}
            </div>
          )}
        </div>

        {/* Remarks & Submit */}
        <div className="rounded-xl border bg-white p-6 shadow-sm space-y-5">
          <div className="space-y-2">
            <Label htmlFor="remarks" className="text-sm">
              Remarks{" "}
              <span className="text-muted-foreground">(optional)</span>
            </Label>
            <textarea
              id="remarks"
              placeholder="Any special instructions or notes about this plan change…"
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

          {selectedPlan && (
            <div className="rounded-lg border border-primary/20 bg-primary/5 px-4 py-3 text-sm">
              <p className="font-medium text-primary">
                Selected: {selectedPlan.name}
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {selectedPlan.speed_mbps} Mbps ·{" "}
                {DATA_POLICY_LABELS[selectedPlan.data_policy] ??
                  selectedPlan.data_policy}
              </p>
            </div>
          )}

          <div className="flex justify-end gap-3 pt-2 border-t">
            <Button
              variant="outline"
              onClick={() => navigate(`/client/connections/${id}`)}
            >
              Cancel
            </Button>
            <Button
              disabled={!selectedPlanId || mutation.isPending}
              onClick={() => mutation.mutate()}
            >
              <ArrowRightLeft className="h-3.5 w-3.5 mr-1.5" />
              {mutation.isPending ? "Submitting…" : "Submit Request"}
            </Button>
          </div>
        </div>
      </div>
    </ClientLayout>
  );
}
