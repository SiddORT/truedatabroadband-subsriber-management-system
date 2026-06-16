import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  Calendar,
  ChevronDown,
  Loader2,
  RefreshCw,
  ShieldOff,
  Zap,
} from "lucide-react";

import { AppLayout } from "@/layouts/AppLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog } from "@/components/ui/Dialog";
import { useToast } from "@/contexts/ToastContext";
import { subscriptionsService } from "@/services/subscriptions";
import { plansService } from "@/services/plans";
import { getApiErrorMessage } from "@/services/api";
import {
  Subscription,
  SubscriptionStatus,
  SUBSCRIPTION_STATUS_COLORS,
  SUBSCRIPTION_STATUS_LABELS,
} from "@/types/subscription";
import { BILLING_CYCLE_LABELS, Plan, PlanPricing } from "@/types/plan";
import { useMemo } from "react";

// ── helpers ──────────────────────────────────────────────────────────────────

function fmtDate(d: string) {
  return new Date(d).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
}

function fmtMoney(n: string | number) {
  return Number(n).toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function addMonths(d: Date, months: number): Date {
  const result = new Date(d);
  result.setMonth(result.getMonth() + months);
  return result;
}

const CYCLE_MONTHS: Record<string, number> = {
  MONTHLY: 1,
  QUARTERLY: 3,
  HALF_YEARLY: 6,
  ANNUALLY: 12,
};

function calcExpiry(startDate: string, billingCycle: string): string {
  if (!startDate || !billingCycle) return "";
  const months = CYCLE_MONTHS[billingCycle] ?? 1;
  return addMonths(new Date(startDate), months).toISOString().split("T")[0];
}

// ── InfoRow ───────────────────────────────────────────────────────────────────

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-sm font-medium text-foreground">{value ?? "—"}</span>
    </div>
  );
}

// ── Status options ────────────────────────────────────────────────────────────

const STATUS_OPTIONS: SubscriptionStatus[] = [
  "ACTIVE",
  "EXPIRED",
  "SUSPENDED",
  "CANCELLED",
];

// ── Page ─────────────────────────────────────────────────────────────────────

export function SubscriptionDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { showToast } = useToast();

  const { data: sub, isLoading } = useQuery<Subscription>({
    queryKey: ["subscriptions", id],
    queryFn: () => subscriptionsService.get(id!),
    enabled: !!id,
  });

  const { data: plansData } = useQuery({
    queryKey: ["plans-all"],
    queryFn: () =>
      plansService.list({ page: 1, page_size: 100, sort_by: "name", sort_order: "asc" }),
  });

  const activePlans = useMemo(
    () => (plansData?.items ?? []).filter((p) => p.is_active),
    [plansData],
  );

  // ── Status change dialog ───────────────────────────────────────────────────
  const [statusDialog, setStatusDialog] = useState(false);
  const [newStatus, setNewStatus] = useState<SubscriptionStatus>("ACTIVE");

  const statusMutation = useMutation({
    mutationFn: (s: SubscriptionStatus) =>
      subscriptionsService.setStatus(id!, s),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["subscriptions", id] });
      qc.invalidateQueries({ queryKey: ["subscriptions"] });
      setStatusDialog(false);
      showToast("Status updated", "success");
    },
    onError: (err) => showToast(getApiErrorMessage(err), "error"),
  });

  // ── Renew ──────────────────────────────────────────────────────────────────
  const renewMutation = useMutation({
    mutationFn: () => subscriptionsService.renew(id!),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["subscriptions", id] });
      qc.invalidateQueries({ queryKey: ["subscriptions"] });
      showToast("Subscription renewed successfully", "success");
    },
    onError: (err) => showToast(getApiErrorMessage(err), "error"),
  });

  // ── Change plan dialog ─────────────────────────────────────────────────────
  const [planDialog, setPlanDialog] = useState(false);
  const [newPlanId, setNewPlanId] = useState("");
  const [newPricingId, setNewPricingId] = useState("");
  const [newStartDate, setNewStartDate] = useState(
    new Date().toISOString().split("T")[0],
  );

  const selectedNewPlan: Plan | undefined = useMemo(
    () => activePlans.find((p) => p.id === newPlanId),
    [activePlans, newPlanId],
  );

  const newActivePricing: PlanPricing[] = useMemo(
    () => (selectedNewPlan?.pricing ?? []).filter((pr) => pr.is_active),
    [selectedNewPlan],
  );

  const newExpiry = useMemo(() => {
    const pr = newActivePricing.find((p) => p.id === newPricingId);
    return pr ? calcExpiry(newStartDate, pr.billing_cycle) : "";
  }, [newActivePricing, newPricingId, newStartDate]);

  const changePlanMutation = useMutation({
    mutationFn: () =>
      subscriptionsService.changePlan(id!, {
        plan_pricing_id: newPricingId,
        start_date: newStartDate,
      }),
    onSuccess: (newSub) => {
      qc.invalidateQueries({ queryKey: ["subscriptions"] });
      setPlanDialog(false);
      showToast("Plan changed — new subscription created", "success");
      navigate(`/admin/subscriptions/${newSub.id}`);
    },
    onError: (err) => showToast(getApiErrorMessage(err), "error"),
  });

  if (isLoading || !sub) {
    return (
      <AppLayout title="Subscription" portalLabel="Admin Portal">
        <div className="flex h-64 items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout title="Subscription Details" portalLabel="Admin Portal">
      <div className="mx-auto max-w-4xl space-y-6">
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Button
              variant="outline"
              size="sm"
              onClick={() => navigate("/admin/subscriptions")}
            >
              <ArrowLeft className="mr-1.5 h-4 w-4" />
              Back
            </Button>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-xl font-semibold text-foreground">
                  {sub.subscription_code}
                </h2>
                <span
                  className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${SUBSCRIPTION_STATUS_COLORS[sub.status]}`}
                >
                  {SUBSCRIPTION_STATUS_LABELS[sub.status]}
                </span>
              </div>
              <p className="text-sm text-muted-foreground">
                {sub.plan_name_snapshot} · {sub.speed_mbps_snapshot} Mbps
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {sub.status === "ACTIVE" && (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => renewMutation.mutate()}
                  disabled={renewMutation.isPending}
                >
                  {renewMutation.isPending ? (
                    <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                  ) : (
                    <RefreshCw className="mr-1.5 h-4 w-4" />
                  )}
                  Renew
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setNewPlanId("");
                    setNewPricingId("");
                    setNewStartDate(new Date().toISOString().split("T")[0]);
                    setPlanDialog(true);
                  }}
                >
                  <Zap className="mr-1.5 h-4 w-4" />
                  Change Plan
                </Button>
              </>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setNewStatus(sub.status);
                setStatusDialog(true);
              }}
            >
              <ShieldOff className="mr-1.5 h-4 w-4" />
              Change Status
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          {/* Customer Information */}
          <Card>
            <CardContent className="space-y-4 pt-6">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Customer Information
              </p>
              <div className="grid grid-cols-2 gap-4">
                <InfoRow label="Full Name" value={sub.customer_name} />
                <InfoRow
                  label="Customer Code"
                  value={
                    <span className="font-mono">{sub.customer_code}</span>
                  }
                />
                <InfoRow label="Mobile" value={sub.customer_mobile} />
                <InfoRow label="Email" value={sub.customer_email} />
                <InfoRow
                  label="Customer Status"
                  value={
                    <span
                      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${sub.customer_status === "ACTIVE" ? "bg-green-100 text-green-700" : "bg-amber-100 text-amber-700"}`}
                    >
                      {sub.customer_status}
                    </span>
                  }
                />
              </div>
            </CardContent>
          </Card>

          {/* Subscription Information */}
          <Card>
            <CardContent className="space-y-4 pt-6">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Subscription Information
              </p>
              <div className="grid grid-cols-2 gap-4">
                <InfoRow label="Subscription Code" value={
                  <span className="font-mono">{sub.subscription_code}</span>
                } />
                <InfoRow label="Plan Code" value={
                  <span className="font-mono">{sub.plan_code_snapshot}</span>
                } />
                <InfoRow label="Plan Name" value={sub.plan_name_snapshot} />
                <InfoRow
                  label="Speed"
                  value={`${sub.speed_mbps_snapshot} Mbps`}
                />
                <InfoRow
                  label="Billing Cycle"
                  value={
                    BILLING_CYCLE_LABELS[sub.billing_cycle_snapshot] ??
                    sub.billing_cycle_snapshot
                  }
                />
              </div>
              {sub.remarks && (
                <div className="rounded-lg bg-muted/40 p-3 text-sm text-muted-foreground">
                  <span className="font-medium text-foreground">Remarks: </span>
                  {sub.remarks}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Pricing Snapshot */}
          <Card>
            <CardContent className="space-y-4 pt-6">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Pricing Snapshot
              </p>
              <div className="grid grid-cols-3 gap-4">
                <InfoRow
                  label="Base Price"
                  value={`₹${fmtMoney(sub.base_price_snapshot)}`}
                />
                <InfoRow
                  label={`GST (${sub.gst_percentage_snapshot}%)`}
                  value={`₹${fmtMoney(
                    (
                      (Number(sub.base_price_snapshot) *
                        Number(sub.gst_percentage_snapshot)) /
                      100
                    ).toFixed(2),
                  )}`}
                />
                <InfoRow
                  label="Total Amount"
                  value={
                    <span className="text-base font-bold text-primary">
                      ₹{fmtMoney(sub.total_price_snapshot)}
                    </span>
                  }
                />
              </div>
            </CardContent>
          </Card>

          {/* Dates */}
          <Card>
            <CardContent className="space-y-4 pt-6">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Dates
              </p>
              <div className="grid grid-cols-1 gap-4">
                <div className="flex items-center gap-3">
                  <Calendar className="h-4 w-4 text-muted-foreground" />
                  <div className="flex-1">
                    <p className="text-xs text-muted-foreground">Start Date</p>
                    <p className="text-sm font-medium">
                      {fmtDate(sub.start_date)}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <Calendar className="h-4 w-4 text-muted-foreground" />
                  <div className="flex-1">
                    <p className="text-xs text-muted-foreground">
                      Renewal Date
                    </p>
                    <p className="text-sm font-medium">
                      {fmtDate(sub.renewal_date)}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <Calendar className="h-4 w-4 text-muted-foreground" />
                  <div className="flex-1">
                    <p className="text-xs text-muted-foreground">Expiry Date</p>
                    <p className="text-sm font-medium">
                      {fmtDate(sub.expiry_date)}
                    </p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Placeholder sections */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {[
            { title: "Invoices", text: "Invoice history will appear here in a future phase." },
            { title: "Payment History", text: "Payment history will appear here in a future phase." },
          ].map(({ title, text }) => (
            <div
              key={title}
              className="flex flex-col items-center gap-3 rounded-xl border-2 border-dashed border-border/60 p-10 text-center"
            >
              <p className="text-sm font-medium text-muted-foreground">
                {title}
              </p>
              <p className="text-xs text-muted-foreground/70">{text}</p>
            </div>
          ))}
        </div>
      </div>

      {/* ── Change Status Dialog ─────────────────────────────────────────── */}
      <Dialog
        open={statusDialog}
        onClose={() => setStatusDialog(false)}
        title="Change Subscription Status"
      >
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Select the new status for subscription{" "}
            <span className="font-mono font-semibold text-foreground">
              {sub.subscription_code}
            </span>
            .
          </p>
          <div className="relative">
            <select
              value={newStatus}
              onChange={(e) => setNewStatus(e.target.value as SubscriptionStatus)}
              className="w-full appearance-none rounded-lg border border-input bg-background py-2 pl-3 pr-9 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
            >
              {STATUS_OPTIONS.map((s) => (
                <option key={s} value={s}>
                  {SUBSCRIPTION_STATUS_LABELS[s]}
                </option>
              ))}
            </select>
            <ChevronDown className="pointer-events-none absolute right-3 top-2.5 h-4 w-4 text-muted-foreground" />
          </div>
          <div className="flex justify-end gap-3">
            <Button
              variant="outline"
              onClick={() => setStatusDialog(false)}
              disabled={statusMutation.isPending}
            >
              Cancel
            </Button>
            <Button
              onClick={() => statusMutation.mutate(newStatus)}
              disabled={statusMutation.isPending}
            >
              {statusMutation.isPending && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              Confirm
            </Button>
          </div>
        </div>
      </Dialog>

      {/* ── Change Plan Dialog ───────────────────────────────────────────── */}
      <Dialog
        open={planDialog}
        onClose={() => setPlanDialog(false)}
        title="Change Plan"
      >
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            The current subscription will be cancelled and a new one created.
          </p>

          <div className="space-y-3">
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium">New Plan</label>
              <div className="relative">
                <select
                  value={newPlanId}
                  onChange={(e) => {
                    setNewPlanId(e.target.value);
                    setNewPricingId("");
                  }}
                  className="w-full appearance-none rounded-lg border border-input bg-background py-2 pl-3 pr-9 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                >
                  <option value="">— Select a plan —</option>
                  {activePlans.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} — {p.speed_mbps} Mbps
                    </option>
                  ))}
                </select>
                <ChevronDown className="pointer-events-none absolute right-3 top-2.5 h-4 w-4 text-muted-foreground" />
              </div>
            </div>

            {selectedNewPlan && (
              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-medium">Billing Cycle</label>
                <div className="relative">
                  <select
                    value={newPricingId}
                    onChange={(e) => setNewPricingId(e.target.value)}
                    className="w-full appearance-none rounded-lg border border-input bg-background py-2 pl-3 pr-9 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                  >
                    <option value="">— Select billing cycle —</option>
                    {newActivePricing.map((pr) => (
                      <option key={pr.id} value={pr.id}>
                        {BILLING_CYCLE_LABELS[pr.billing_cycle]} — ₹
                        {fmtMoney(pr.total_price)}
                      </option>
                    ))}
                  </select>
                  <ChevronDown className="pointer-events-none absolute right-3 top-2.5 h-4 w-4 text-muted-foreground" />
                </div>
              </div>
            )}

            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium">New Start Date</label>
              <input
                type="date"
                value={newStartDate}
                onChange={(e) => setNewStartDate(e.target.value)}
                className="rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
            </div>

            {newExpiry && (
              <p className="text-xs text-muted-foreground">
                Expiry date:{" "}
                <span className="font-medium text-foreground">
                  {fmtDate(newExpiry)}
                </span>
              </p>
            )}
          </div>

          <div className="flex justify-end gap-3">
            <Button
              variant="outline"
              onClick={() => setPlanDialog(false)}
              disabled={changePlanMutation.isPending}
            >
              Cancel
            </Button>
            <Button
              onClick={() => changePlanMutation.mutate()}
              disabled={
                !newPricingId ||
                !newStartDate ||
                changePlanMutation.isPending
              }
            >
              {changePlanMutation.isPending && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              Confirm Change
            </Button>
          </div>
        </div>
      </Dialog>
    </AppLayout>
  );
}
