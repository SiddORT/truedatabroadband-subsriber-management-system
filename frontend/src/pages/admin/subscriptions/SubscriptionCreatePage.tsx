import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQuery } from "@tanstack/react-query";
import { ArrowLeft, ChevronDown, Loader2, Search } from "lucide-react";

import { AppLayout } from "@/layouts/AppLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useToast } from "@/contexts/ToastContext";
import { subscriptionsService } from "@/services/subscriptions";
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
  const expiry = addMonths(new Date(startDate), months);
  return expiry.toISOString().split("T")[0];
}

function fmt(n: string | number) {
  return Number(n).toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

// ── Field ─────────────────────────────────────────────────────────────────────

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

// ── Section header ────────────────────────────────────────────────────────────

function SectionHeader({ title, step }: { title: string; step: number }) {
  return (
    <div className="flex items-center gap-3">
      <div className="flex h-7 w-7 items-center justify-center rounded-full bg-primary text-xs font-bold text-white">
        {step}
      </div>
      <h3 className="text-base font-semibold text-foreground">{title}</h3>
    </div>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────

export function SubscriptionCreatePage() {
  const navigate = useNavigate();
  const { showToast } = useToast();

  // ── Customer search ────────────────────────────────────────────────────────
  const [customerQuery, setCustomerQuery] = useState("");
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
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
      plansService.list({ page: 1, page_size: 100, sort_by: "name", sort_order: "asc" }),
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
    () =>
      (selectedPlan?.pricing ?? []).filter(
        (pr) => pr.is_active && !("deleted_at" in pr && pr.deleted_at),
      ),
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

  // ── Reset pricing when plan changes ───────────────────────────────────────
  useEffect(() => {
    setSelectedPricingId("");
  }, [selectedPlanId]);

  // ── Submit ─────────────────────────────────────────────────────────────────
  const createMutation = useMutation({
    mutationFn: () =>
      subscriptionsService.create({
        customer_id: selectedCustomer!.id,
        plan_pricing_id: selectedPricingId,
        start_date: startDate,
        remarks: remarks.trim() || undefined,
      }),
    onSuccess: (sub) => {
      showToast("Subscription created successfully", "success");
      navigate(`/admin/subscriptions/${sub.id}`);
    },
    onError: (err) => {
      showToast(getApiErrorMessage(err), "error");
    },
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (validate()) createMutation.mutate();
  }

  const isBusy = createMutation.isPending;

  return (
    <AppLayout title="New Subscription" portalLabel="Admin Portal">
      <div className="mx-auto max-w-3xl space-y-6">
        {/* Back + heading */}
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
            <h2 className="text-xl font-semibold text-foreground">
              New Subscription
            </h2>
            <p className="text-sm text-muted-foreground">
              Assign a plan to a customer
            </p>
          </div>
        </div>

        <form onSubmit={handleSubmit} noValidate>
          <div className="space-y-6">
            {/* ── Step 1: Customer ────────────────────────────────────── */}
            <Card>
              <CardContent className="space-y-5 pt-6">
                <SectionHeader step={1} title="Select Customer" />
                <Field label="Customer" required error={errors.customer}>
                  <div className="relative">
                    <div className="pointer-events-none absolute inset-y-0 left-3 flex items-center">
                      <Search className="h-4 w-4 text-muted-foreground" />
                    </div>
                    <input
                      type="text"
                      placeholder="Search by name, code or mobile…"
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
                        <div className="absolute z-20 mt-1 w-full rounded-lg border border-border bg-surface shadow-lg">
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
                  <div className="rounded-lg border border-border bg-muted/30 p-4">
                    <div className="grid grid-cols-2 gap-3 text-sm">
                      <div>
                        <p className="text-xs text-muted-foreground">
                          Customer Code
                        </p>
                        <p className="font-mono font-medium">
                          {selectedCustomer.customer_code}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Status</p>
                        <span
                          className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${selectedCustomer.status === "ACTIVE" ? "bg-green-100 text-green-700" : "bg-amber-100 text-amber-700"}`}
                        >
                          {selectedCustomer.status}
                        </span>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Mobile</p>
                        <p>{selectedCustomer.mobile_number}</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Email</p>
                        <p className="truncate">{selectedCustomer.email}</p>
                      </div>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* ── Step 2: Plan & Billing Cycle ────────────────────────── */}
            <Card>
              <CardContent className="space-y-5 pt-6">
                <SectionHeader step={2} title="Select Plan & Billing Cycle" />

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
                  <Field
                    label="Billing Cycle"
                    required
                    error={errors.pricing}
                  >
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      {activePricing.length === 0 ? (
                        <p className="text-sm text-muted-foreground">
                          No active pricing for this plan
                        </p>
                      ) : (
                        activePricing.map((pr) => (
                          <label
                            key={pr.id}
                            className={`flex cursor-pointer items-center justify-between rounded-lg border p-4 transition-colors ${
                              selectedPricingId === pr.id
                                ? "border-primary bg-primary/5"
                                : "border-border hover:border-primary/40"
                            }`}
                          >
                            <div className="flex items-center gap-3">
                              <input
                                type="radio"
                                name="pricing"
                                value={pr.id}
                                checked={selectedPricingId === pr.id}
                                onChange={() => setSelectedPricingId(pr.id)}
                                className="accent-primary"
                              />
                              <span className="text-sm font-medium">
                                {BILLING_CYCLE_LABELS[pr.billing_cycle]}
                              </span>
                            </div>
                            <span className="text-sm font-semibold text-primary">
                              ₹{fmt(pr.total_price)}
                            </span>
                          </label>
                        ))
                      )}
                    </div>
                  </Field>
                )}

                {selectedPricing && (
                  <div className="rounded-lg border border-border bg-muted/30 p-4">
                    <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      Pricing Summary
                    </p>
                    <div className="grid grid-cols-3 gap-4 text-sm">
                      <div>
                        <p className="text-xs text-muted-foreground">
                          Base Price
                        </p>
                        <p className="font-semibold">
                          ₹{fmt(selectedPricing.base_price)}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">
                          GST ({selectedPricing.gst_percentage}%)
                        </p>
                        <p className="font-semibold">
                          ₹
                          {fmt(
                            (
                              (Number(selectedPricing.base_price) *
                                Number(selectedPricing.gst_percentage)) /
                              100
                            ).toFixed(2),
                          )}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">
                          Total Amount
                        </p>
                        <p className="text-base font-bold text-primary">
                          ₹{fmt(selectedPricing.total_price)}
                        </p>
                      </div>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* ── Step 3: Dates ────────────────────────────────────────── */}
            <Card>
              <CardContent className="space-y-5 pt-6">
                <SectionHeader step={3} title="Subscription Dates" />
                <div className="grid grid-cols-1 gap-5 sm:grid-cols-3">
                  <Field label="Start Date" required error={errors.startDate}>
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
                    Select a billing cycle to see renewal and expiry dates.
                  </p>
                )}
              </CardContent>
            </Card>

            {/* ── Step 4: Remarks ──────────────────────────────────────── */}
            <Card>
              <CardContent className="space-y-5 pt-6">
                <SectionHeader step={4} title="Additional Notes" />
                <Field label="Remarks">
                  <textarea
                    value={remarks}
                    onChange={(e) => setRemarks(e.target.value)}
                    rows={3}
                    placeholder="Optional notes about this subscription…"
                    className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                  />
                </Field>
              </CardContent>
            </Card>

            {/* ── Actions ──────────────────────────────────────────────── */}
            <div className="flex justify-end gap-3">
              <Button
                type="button"
                variant="outline"
                onClick={() => navigate("/admin/subscriptions")}
                disabled={isBusy}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={isBusy}>
                {isBusy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Create Subscription
              </Button>
            </div>
          </div>
        </form>
      </div>
    </AppLayout>
  );
}
