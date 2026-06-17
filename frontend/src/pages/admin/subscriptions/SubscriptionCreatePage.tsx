import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  ArrowLeft,
  Calendar,
  CheckCircle2,
  ChevronDown,
  Loader2,
  Search,
  User,
  Wifi,
  Zap,
} from "lucide-react";

import { AppLayout } from "@/layouts/AppLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useToast } from "@/contexts/ToastContext";
import { subscriptionsService } from "@/services/subscriptions";
import type { Subscription } from "@/types/subscription";
import { customersService } from "@/services/customers";
import { plansService } from "@/services/plans";
import { getApiErrorMessage } from "@/services/api";
import type { Customer } from "@/types/customer";
import type { Plan, PlanPricing } from "@/types/plan";
import { BILLING_CYCLE_LABELS } from "@/types/plan";

// ── helpers ──────────────────────────────────────────────────────────────────

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

function fmtMoney(n: string | number) {
  return Number(n).toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function fmtDateDisplay(iso: string) {
  return new Date(iso).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

// ── Small components ─────────────────────────────────────────────────────────

function Field({
  label,
  required,
  error,
  children,
}: {
  label: string;
  required?: boolean;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-sm font-medium text-foreground">
        {label}
        {required && <span className="ml-0.5 text-destructive">*</span>}
      </label>
      {children}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}

function StepBadge({
  step,
  label,
  done,
}: {
  step: number;
  label: string;
  done: boolean;
}) {
  return (
    <div className="flex items-center gap-2.5">
      <div
        className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold transition-colors ${
          done
            ? "bg-green-500 text-white"
            : "bg-accent text-white"
        }`}
      >
        {done ? <CheckCircle2 className="h-4 w-4" /> : step}
      </div>
      <h3 className="text-sm font-semibold text-foreground">{label}</h3>
    </div>
  );
}

// ── Summary panel ─────────────────────────────────────────────────────────────

function SummaryRow({
  label,
  value,
  highlight,
}: {
  label: string;
  value: React.ReactNode;
  highlight?: boolean;
}) {
  return (
    <div className="flex items-start justify-between gap-2 py-2">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span
        className={`text-right text-xs font-medium ${highlight ? "text-base font-bold text-accent" : "text-foreground"}`}
      >
        {value}
      </span>
    </div>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────

export function SubscriptionCreatePage() {
  const navigate = useNavigate();
  const { showToast } = useToast();

  // ── Customer search ────────────────────────────────────────────────────────
  const [customerQuery, setCustomerQuery] = useState("");
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(
    null,
  );
  const [showCustomerList, setShowCustomerList] = useState(false);

  const { data: customerResults } = useQuery({
    queryKey: ["customers-search", customerQuery],
    queryFn: () =>
      customersService.list({
        page: 1,
        page_size: 10,
        search: customerQuery,
        sort_by: "created_at",
        sort_order: "desc",
      }),
    enabled: customerQuery.length >= 2,
  });

  // ── Plan selection ─────────────────────────────────────────────────────────
  const [selectedPlanId, setSelectedPlanId] = useState("");
  const [selectedPricingId, setSelectedPricingId] = useState("");

  const { data: plansData } = useQuery({
    queryKey: ["plans-all"],
    queryFn: () =>
      plansService.list({
        page: 1,
        page_size: 100,
        sort_by: "name",
        sort_order: "asc",
      }),
  });

  const activePlans = useMemo(
    () => (plansData?.items ?? []).filter((p) => p.is_active),
    [plansData],
  );

  const selectedPlan: Plan | undefined = useMemo(
    () => activePlans.find((p) => p.id === selectedPlanId),
    [activePlans, selectedPlanId],
  );

  const activePricing: PlanPricing[] = useMemo(
    () => (selectedPlan?.pricing ?? []).filter((pr) => pr.is_active),
    [selectedPlan],
  );

  const selectedPricing: PlanPricing | undefined = useMemo(
    () => activePricing.find((pr) => pr.id === selectedPricingId),
    [activePricing, selectedPricingId],
  );

  // ── Dates ──────────────────────────────────────────────────────────────────
  const [startDate, setStartDate] = useState(
    new Date().toISOString().split("T")[0],
  );

  const expiryDate = useMemo(
    () =>
      selectedPricing
        ? calcExpiry(startDate, selectedPricing.billing_cycle)
        : "",
    [startDate, selectedPricing],
  );

  // ── Connection details ────────────────────────────────────────────────────
  const [connectionName, setConnectionName] = useState("");
  const [installationAddress, setInstallationAddress] = useState("");

  // Pre-fill address from selected customer
  useEffect(() => {
    if (selectedCustomer) {
      setInstallationAddress(selectedCustomer.installation_address ?? "");
    }
  }, [selectedCustomer]);

  // ── Duplicate-address warning state ──────────────────────────────────────
  const [dupWarning, setDupWarning] = useState<{ message: string; existing_code: string } | null>(null);

  // ── Remarks ────────────────────────────────────────────────────────────────
  const [remarks, setRemarks] = useState("");

  // ── Validation ────────────────────────────────────────────────────────────
  const [errors, setErrors] = useState<Record<string, string>>({});

  function validate() {
    const e: Record<string, string> = {};
    if (!selectedCustomer) e.customer = "Please select a customer";
    if (!selectedPlanId) e.plan = "Please select a plan";
    if (!selectedPricingId) e.pricing = "Please select a billing cycle";
    if (!startDate) e.startDate = "Start date is required";
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  useEffect(() => {
    setSelectedPricingId("");
  }, [selectedPlanId]);

  // ── Submit ─────────────────────────────────────────────────────────────────
  const createMutation = useMutation<Subscription, unknown, boolean>({
    mutationFn: (force: boolean) =>
      subscriptionsService.create({
        customer_id: selectedCustomer!.id,
        plan_pricing_id: selectedPricingId,
        start_date: startDate,
        connection_name: connectionName.trim() || undefined,
        installation_address: installationAddress.trim() || undefined,
        remarks: remarks.trim() || undefined,
      }, force),
    onSuccess: (sub) => {
      showToast("Subscription created successfully", "success");
      navigate(`/admin/subscriptions/${sub.id}`);
    },
    onError: (err: unknown) => {
      const detail = (err as { response?: { data?: { detail?: { warning?: string; existing_code?: string } | string } } })?.response?.data?.detail;
      if (detail && typeof detail === "object" && detail.warning) {
        setDupWarning({ message: detail.warning, existing_code: detail.existing_code ?? "" });
      } else {
        showToast(getApiErrorMessage(err), "error");
      }
    },
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (validate()) createMutation.mutate(false);
  }

  const isBusy = createMutation.isPending;

  // ── Derived step done flags ────────────────────────────────────────────────
  const step1Done = !!selectedCustomer;
  const step2Done = !!selectedPlan && !!selectedPricing;
  const step3Done = !!startDate && !!expiryDate;
  const step4Done = !!installationAddress.trim();

  return (
    <AppLayout title="New Subscription" portalLabel="Administration">
      <form onSubmit={handleSubmit} noValidate>
        <div className="flex flex-col gap-5">
          {/* ── Top bar ────────────────────────────────────────────────── */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => navigate("/admin/subscriptions")}
              >
                <ArrowLeft className="mr-1.5 h-4 w-4" />
                Back
              </Button>
              <div>
                <h2 className="text-xl font-semibold text-foreground">
                  New Subscription
                </h2>
                <p className="text-sm text-muted-foreground">
                  Assign a broadband plan to a customer
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => navigate("/admin/subscriptions")}
                disabled={isBusy}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={isBusy}>
                {isBusy && (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                )}
                Create Subscription
              </Button>
            </div>
          </div>

          {/* ── Two-column body ────────────────────────────────────────── */}
          <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
            {/* ── Left: steps ─────────────────────────────────── */}
            <div className="space-y-5 lg:col-span-2">

              {/* Step 1 — Customer */}
              <Card>
                <CardContent className="space-y-4 pt-5">
                  <StepBadge step={1} label="Select Customer" done={step1Done} />

                  <Field label="Search customer" required error={errors.customer}>
                    <div className="relative">
                      <div className="pointer-events-none absolute inset-y-0 left-3 flex items-center">
                        <Search className="h-4 w-4 text-muted-foreground" />
                      </div>
                      <input
                        type="text"
                        placeholder="Name, customer code or mobile…"
                        value={
                          selectedCustomer
                            ? `${selectedCustomer.full_name} (${selectedCustomer.customer_code})`
                            : customerQuery
                        }
                        onFocus={() => {
                          if (selectedCustomer) {
                            setSelectedCustomer(null);
                            setCustomerQuery("");
                          }
                          setShowCustomerList(true);
                        }}
                        onChange={(e) => {
                          setCustomerQuery(e.target.value);
                          setSelectedCustomer(null);
                          setShowCustomerList(true);
                        }}
                        onBlur={() =>
                          setTimeout(() => setShowCustomerList(false), 150)
                        }
                        className={`w-full rounded-lg border bg-background py-2 pl-9 pr-4 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 ${errors.customer ? "border-destructive" : "border-input"}`}
                      />
                      {showCustomerList &&
                        customerQuery.length >= 2 &&
                        !selectedCustomer && (
                          <div className="absolute z-20 mt-1 w-full overflow-hidden rounded-lg border border-border bg-background shadow-lg">
                            {(customerResults?.items ?? []).length === 0 ? (
                              <p className="px-4 py-3 text-sm text-muted-foreground">
                                No customers found
                              </p>
                            ) : (
                              (customerResults?.items ?? []).map((c) => (
                                <button
                                  key={c.id}
                                  type="button"
                                  onMouseDown={() => {
                                    setSelectedCustomer(c);
                                    setShowCustomerList(false);
                                  }}
                                  className="flex w-full items-center justify-between px-4 py-2.5 text-left text-sm hover:bg-muted/50"
                                >
                                  <span>
                                    <span className="font-medium">
                                      {c.full_name}
                                    </span>
                                    <span className="ml-2 font-mono text-xs text-muted-foreground">
                                      {c.customer_code}
                                    </span>
                                  </span>
                                  <span
                                    className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                                      c.status === "ACTIVE"
                                        ? "bg-green-100 text-green-700"
                                        : "bg-amber-100 text-amber-700"
                                    }`}
                                  >
                                    {c.status}
                                  </span>
                                </button>
                              ))
                            )}
                          </div>
                        )}
                    </div>
                  </Field>

                  {selectedCustomer && (
                    <div className="grid grid-cols-2 gap-3 rounded-lg border border-border bg-muted/20 p-4 text-sm sm:grid-cols-4">
                      <div>
                        <p className="text-xs text-muted-foreground">Code</p>
                        <p className="font-mono font-semibold text-foreground">
                          {selectedCustomer.customer_code}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Mobile</p>
                        <p className="font-medium">
                          {selectedCustomer.mobile_number}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Email</p>
                        <p className="truncate">{selectedCustomer.email}</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Status</p>
                        <span
                          className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                            selectedCustomer.status === "ACTIVE"
                              ? "bg-green-100 text-green-700"
                              : "bg-amber-100 text-amber-700"
                          }`}
                        >
                          {selectedCustomer.status}
                        </span>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Step 2 — Plan */}
              <Card>
                <CardContent className="space-y-4 pt-5">
                  <StepBadge step={2} label="Select Plan & Billing Cycle" done={step2Done} />

                  <Field label="Plan" required error={errors.plan}>
                    <div className="relative">
                      <select
                        value={selectedPlanId}
                        onChange={(e) => setSelectedPlanId(e.target.value)}
                        className={`w-full appearance-none rounded-lg border bg-background py-2 pl-3 pr-9 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 ${errors.plan ? "border-destructive" : "border-input"}`}
                      >
                        <option value="">— Choose a plan —</option>
                        {activePlans.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name} — {p.speed_mbps} Mbps
                          </option>
                        ))}
                      </select>
                      <ChevronDown className="pointer-events-none absolute right-3 top-2.5 h-4 w-4 text-muted-foreground" />
                    </div>
                  </Field>

                  {selectedPlan && (
                    <>
                      {/* Plan details strip */}
                      <div className="flex flex-wrap items-center gap-4 rounded-lg border border-border bg-muted/20 px-4 py-3 text-sm">
                        <div className="flex items-center gap-1.5">
                          <Zap className="h-4 w-4 text-yellow-500" />
                          <span className="font-semibold">
                            {selectedPlan.speed_mbps} Mbps
                          </span>
                        </div>
                        <div className="flex items-center gap-1.5 text-muted-foreground">
                          <Wifi className="h-4 w-4" />
                          <span>
                            {selectedPlan.data_policy === "UNLIMITED"
                              ? "Unlimited data"
                              : `FUP: ${selectedPlan.fup_limit_gb} GB`}
                          </span>
                        </div>
                      </div>

                      <Field
                        label="Billing Cycle"
                        required
                        error={errors.pricing}
                      >
                        {activePricing.length === 0 ? (
                          <p className="text-sm text-muted-foreground">
                            No active pricing configured for this plan.
                          </p>
                        ) : (
                          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
                            {activePricing.map((pr) => (
                              <label
                                key={pr.id}
                                className={`flex cursor-pointer flex-col gap-1 rounded-xl border p-4 transition-all ${
                                  selectedPricingId === pr.id
                                    ? "border-primary bg-primary/5 shadow-sm"
                                    : "border-border hover:border-primary/40"
                                }`}
                              >
                                <div className="flex items-center gap-2">
                                  <input
                                    type="radio"
                                    name="pricing"
                                    value={pr.id}
                                    checked={selectedPricingId === pr.id}
                                    onChange={() =>
                                      setSelectedPricingId(pr.id)
                                    }
                                    className="accent-primary"
                                  />
                                  <span className="text-sm font-semibold">
                                    {BILLING_CYCLE_LABELS[pr.billing_cycle]}
                                  </span>
                                </div>
                                <p className="pl-5 text-xs text-muted-foreground">
                                  Base ₹{fmtMoney(pr.base_price)}
                                </p>
                                <p className="pl-5 text-sm font-bold text-primary">
                                  ₹{fmtMoney(pr.total_price)}
                                </p>
                              </label>
                            ))}
                          </div>
                        )}
                      </Field>
                    </>
                  )}
                </CardContent>
              </Card>

              {/* Step 3 — Dates */}
              <Card>
                <CardContent className="space-y-4 pt-5">
                  <StepBadge step={3} label="Subscription Dates" done={step3Done} />

                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                    <Field
                      label="Start Date"
                      required
                      error={errors.startDate}
                    >
                      <input
                        type="date"
                        value={startDate}
                        onChange={(e) => setStartDate(e.target.value)}
                        className={`rounded-lg border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 ${errors.startDate ? "border-destructive" : "border-input"}`}
                      />
                    </Field>
                    <Field label="Renewal Date">
                      <input
                        type="date"
                        value={expiryDate}
                        readOnly
                        className="rounded-lg border border-input bg-muted/40 px-3 py-2 text-sm text-muted-foreground"
                      />
                    </Field>
                    <Field label="Expiry Date">
                      <input
                        type="date"
                        value={expiryDate}
                        readOnly
                        className="rounded-lg border border-input bg-muted/40 px-3 py-2 text-sm text-muted-foreground"
                      />
                    </Field>
                  </div>
                  {!selectedPricing && (
                    <p className="text-xs text-muted-foreground">
                      Select a billing cycle above to calculate renewal and
                      expiry dates.
                    </p>
                  )}
                </CardContent>
              </Card>

              {/* Step 4 — Connection Details */}
              <Card>
                <CardContent className="space-y-4 pt-5">
                  <StepBadge step={4} label="Connection Details" done={step4Done} />
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <Field label="Connection Label">
                      <input
                        type="text"
                        value={connectionName}
                        onChange={(e) => setConnectionName(e.target.value)}
                        placeholder="e.g. Home, Office, Shop…"
                        className="rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                      />
                    </Field>
                    <div />
                  </div>
                  <Field label="Installation Address" required>
                    <textarea
                      value={installationAddress}
                      onChange={(e) => setInstallationAddress(e.target.value)}
                      rows={3}
                      placeholder="Full installation address…"
                      className="w-full resize-none rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                    />
                    <p className="text-xs text-muted-foreground">Pre-filled from customer record. Edit if this connection is at a different location.</p>
                  </Field>
                </CardContent>
              </Card>

              {/* Step 5 — Remarks */}
              <Card>
                <CardContent className="space-y-4 pt-5">
                  <StepBadge step={5} label="Additional Notes" done={false} />
                  <Field label="Remarks (optional)">
                    <textarea
                      value={remarks}
                      onChange={(e) => setRemarks(e.target.value)}
                      rows={3}
                      placeholder="Any additional notes about this subscription…"
                      className="w-full resize-none rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                    />
                  </Field>
                </CardContent>
              </Card>
            </div>

            {/* ── Right: sticky summary ──────────────────────────── */}
            <div className="lg:col-span-1">
              <div className="sticky top-6 space-y-4">
                <Card>
                  <CardContent className="pt-5">
                    <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      Subscription Summary
                    </p>

                    {/* Customer */}
                    <div className="mb-3 rounded-lg bg-muted/30 p-3">
                      <div className="flex items-center gap-2">
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10">
                          <User className="h-4 w-4 text-primary" />
                        </div>
                        {selectedCustomer ? (
                          <div className="min-w-0">
                            <p className="truncate text-sm font-semibold">
                              {selectedCustomer.full_name}
                            </p>
                            <p className="font-mono text-xs text-muted-foreground">
                              {selectedCustomer.customer_code}
                            </p>
                          </div>
                        ) : (
                          <p className="text-sm text-muted-foreground">
                            No customer selected
                          </p>
                        )}
                      </div>
                    </div>

                    {/* Plan */}
                    <div className="mb-3 rounded-lg bg-muted/30 p-3">
                      <div className="flex items-center gap-2">
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10">
                          <Wifi className="h-4 w-4 text-primary" />
                        </div>
                        {selectedPlan ? (
                          <div>
                            <p className="text-sm font-semibold">
                              {selectedPlan.name}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {selectedPlan.speed_mbps} Mbps
                              {selectedPricing
                                ? ` · ${BILLING_CYCLE_LABELS[selectedPricing.billing_cycle]}`
                                : ""}
                            </p>
                          </div>
                        ) : (
                          <p className="text-sm text-muted-foreground">
                            No plan selected
                          </p>
                        )}
                      </div>
                    </div>

                    {/* Pricing breakdown */}
                    {selectedPricing ? (
                      <div className="divide-y divide-border rounded-lg border border-border">
                        <div className="px-3 py-1">
                          <SummaryRow
                            label="Base Price"
                            value={`₹${fmtMoney(selectedPricing.base_price)}`}
                          />
                          <SummaryRow
                            label={`GST (${selectedPricing.gst_percentage}%)`}
                            value={`₹${fmtMoney(
                              (
                                (Number(selectedPricing.base_price) *
                                  Number(selectedPricing.gst_percentage)) /
                                100
                              ).toFixed(2),
                            )}`}
                          />
                        </div>
                        <div className="bg-primary/5 px-3 py-2">
                          <div className="flex items-center justify-between">
                            <span className="text-sm font-semibold text-foreground">
                              Total
                            </span>
                            <span className="text-lg font-bold text-primary">
                              ₹{fmtMoney(selectedPricing.total_price)}
                            </span>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="rounded-lg border border-dashed border-border p-3 text-center">
                        <p className="text-xs text-muted-foreground">
                          Select a plan & billing cycle to see pricing
                        </p>
                      </div>
                    )}

                    {/* Dates */}
                    {expiryDate && (
                      <div className="mt-3 space-y-1.5 rounded-lg border border-border p-3">
                        <div className="flex items-center gap-2 text-xs">
                          <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
                          <span className="text-muted-foreground">
                            Start:
                          </span>
                          <span className="font-medium">
                            {fmtDateDisplay(startDate)}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 text-xs">
                          <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
                          <span className="text-muted-foreground">
                            Expiry:
                          </span>
                          <span className="font-medium">
                            {fmtDateDisplay(expiryDate)}
                          </span>
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>

                {/* Completion checklist */}
                <Card>
                  <CardContent className="pt-4 pb-4">
                    <p className="mb-2.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      Checklist
                    </p>
                    {[
                      { label: "Customer selected", done: step1Done },
                      { label: "Plan & cycle chosen", done: step2Done },
                      { label: "Dates set", done: step3Done },
                      { label: "Address entered", done: step4Done },
                    ].map(({ label, done }) => (
                      <div
                        key={label}
                        className="flex items-center gap-2 py-1.5"
                      >
                        <div
                          className={`h-4 w-4 rounded-full border-2 transition-colors ${
                            done
                              ? "border-green-500 bg-green-500"
                              : "border-border bg-background"
                          }`}
                        >
                          {done && (
                            <svg
                              viewBox="0 0 10 10"
                              className="h-full w-full"
                              fill="none"
                            >
                              <path
                                d="M2 5l2.5 2.5L8 3"
                                stroke="white"
                                strokeWidth="1.5"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                              />
                            </svg>
                          )}
                        </div>
                        <span
                          className={`text-xs ${done ? "text-foreground" : "text-muted-foreground"}`}
                        >
                          {label}
                        </span>
                      </div>
                    ))}
                  </CardContent>
                </Card>

                <Button
                  type="submit"
                  className="w-full"
                  disabled={isBusy}
                >
                  {isBusy ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <CheckCircle2 className="mr-2 h-4 w-4" />
                  )}
                  Create Subscription
                </Button>
              </div>
            </div>
          </div>
        </div>
      </form>

      {/* ── Duplicate Address Warning Dialog ──────────────────────────── */}
      {dupWarning && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-xl border border-border bg-background p-6 shadow-xl">
            <h3 className="mb-2 text-base font-semibold text-foreground">Duplicate Address Warning</h3>
            <p className="mb-1 text-sm text-muted-foreground">{dupWarning.message}</p>
            <p className="mb-5 text-xs text-muted-foreground">
              Existing subscription:{" "}
              <span className="font-mono font-semibold text-foreground">{dupWarning.existing_code}</span>
            </p>
            <div className="flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setDupWarning(null)}
                className="rounded-lg border border-input px-4 py-2 text-sm font-medium hover:bg-muted/50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => { setDupWarning(null); createMutation.mutate(true); }}
                className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary/90"
              >
                Create Anyway
              </button>
            </div>
          </div>
        </div>
      )}
    </AppLayout>
  );
}
