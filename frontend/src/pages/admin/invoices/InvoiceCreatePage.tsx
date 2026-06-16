import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useMutation, useQuery } from "@tanstack/react-query";
import { ArrowLeft, Calendar, IndianRupee, Loader2, RefreshCw, User } from "lucide-react";

import { AppLayout } from "@/layouts/AppLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useToast } from "@/contexts/ToastContext";
import { invoicesService } from "@/services/invoices";
import { subscriptionsService } from "@/services/subscriptions";
import { getApiErrorMessage } from "@/services/api";
import type { Subscription } from "@/types/subscription";

function fmtMoney(n: string | number) {
  return Number(n).toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function today() {
  return new Date().toISOString().split("T")[0];
}

function firstOfMonth() {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().split("T")[0];
}

function lastOfMonth() {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth() + 1, 0)
    .toISOString()
    .split("T")[0];
}

interface StepBadgeProps {
  step: number;
  label: string;
  done: boolean;
}

function StepBadge({ step, label, done }: StepBadgeProps) {
  return (
    <div className="flex items-center gap-2.5">
      <span
        className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
          done
            ? "bg-green-500 text-white"
            : "bg-accent text-white"
        }`}
      >
        {done ? "✓" : step}
      </span>
      <span className="text-sm font-semibold text-foreground">
        {label}
      </span>
    </div>
  );
}

export function InvoiceCreatePage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { showToast } = useToast();

  const preselectedSubId = searchParams.get("subscription_id") ?? "";

  const [subscriptionId, setSubscriptionId] = useState(preselectedSubId);
  const [billingStart, setBillingStart] = useState(firstOfMonth());
  const [billingEnd, setBillingEnd] = useState(lastOfMonth());
  const [invoiceDate, setInvoiceDate] = useState(today());
  const [dueDate, setDueDate] = useState("");
  const [remarks, setRemarks] = useState("");

  const { data: subsData, isLoading: subsLoading } = useQuery({
    queryKey: ["subscriptions-active-all"],
    queryFn: () =>
      subscriptionsService.list({
        page: 1,
        page_size: 100,
        sort_by: "created_at",
        sort_order: "desc",
        status_filter: "ACTIVE",
      }),
  });

  const activeSubs = subsData?.items ?? [];
  const selectedSub: Subscription | undefined = activeSubs.find(
    (s) => s.id === subscriptionId
  );

  const baseAmt = Number(selectedSub?.base_price_snapshot ?? 0);
  const gstPct = Number(selectedSub?.gst_percentage_snapshot ?? 0);
  const gstAmt = Math.round(baseAmt * gstPct) / 100;
  const totalAmt = baseAmt + gstAmt;

  const step1Done = !!subscriptionId;
  const step2Done = !!billingStart && !!billingEnd;
  const step3Done = !!invoiceDate;

  const mutation = useMutation({
    mutationFn: () =>
      invoicesService.create({
        subscription_id: subscriptionId,
        billing_period_start: billingStart,
        billing_period_end: billingEnd,
        invoice_date: invoiceDate,
        due_date: dueDate || undefined,
        remarks: remarks || undefined,
      }),
    onSuccess: (inv) => {
      showToast(`Invoice ${inv.invoice_number} created`, "success");
      navigate(`/admin/invoices/${inv.id}`);
    },
    onError: (err) => showToast(getApiErrorMessage(err), "error"),
  });

  const canSubmit = step1Done && step2Done && step3Done && !mutation.isPending;

  return (
    <AppLayout title="New Invoice" portalLabel="Administration">
      <div className="flex flex-col gap-5">

        {/* ── Top bar ─────────────────────────────────────────────── */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Button
              variant="outline"
              size="sm"
              onClick={() => navigate("/admin/invoices")}
              disabled={mutation.isPending}
            >
              <ArrowLeft className="mr-1.5 h-4 w-4" />
              Back
            </Button>
            <div>
              <h2 className="text-xl font-semibold text-foreground">
                Generate Invoice
              </h2>
              <p className="text-sm text-muted-foreground">
                Create a billing invoice for an active subscription.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              onClick={() => navigate("/admin/invoices")}
              disabled={mutation.isPending}
            >
              Cancel
            </Button>
            <Button onClick={() => mutation.mutate()} disabled={!canSubmit}>
              {mutation.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : null}
              Generate Invoice
            </Button>
          </div>
        </div>

        {/* ── Two-column body ─────────────────────────────────────── */}
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">

          {/* ── Left: steps ──────────────────────────────────────── */}
          <div className="space-y-5 lg:col-span-2">

            {/* Step 1 — Subscription */}
            <Card>
              <CardContent className="space-y-4 pt-5">
                <StepBadge step={1} label="Select Subscription" done={step1Done} />

                <div className="flex flex-col gap-1.5">
                  <label className="text-sm font-medium">
                    Active Subscription <span className="text-red-500">*</span>
                  </label>
                  {subsLoading ? (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Loading subscriptions…
                    </div>
                  ) : (
                    <select
                      value={subscriptionId}
                      onChange={(e) => setSubscriptionId(e.target.value)}
                      className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                    >
                      <option value="">— Select a subscription —</option>
                      {activeSubs.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.subscription_code} · {s.customer_name} · {s.plan_name_snapshot}
                        </option>
                      ))}
                    </select>
                  )}
                </div>

                {selectedSub && (
                  <div className="grid grid-cols-2 gap-3 rounded-lg border border-border bg-muted/20 p-4 text-sm sm:grid-cols-4">
                    <div>
                      <p className="text-xs text-muted-foreground">Customer Code</p>
                      <p className="font-mono font-semibold text-foreground">
                        {selectedSub.customer_code}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Customer</p>
                      <p className="font-medium">{selectedSub.customer_name}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Plan</p>
                      <p className="font-medium">{selectedSub.plan_name_snapshot}</p>
                      <p className="text-xs text-muted-foreground">
                        {selectedSub.speed_mbps_snapshot} Mbps
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Cycle</p>
                      <p className="font-medium">
                        {selectedSub.billing_cycle_snapshot.replace(/_/g, " ")}
                      </p>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Step 2 — Billing Period */}
            <Card>
              <CardContent className="space-y-4 pt-5">
                <StepBadge step={2} label="Billing Period" done={step2Done} />

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div className="flex flex-col gap-1.5">
                    <label className="text-sm font-medium">
                      Period Start <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="date"
                      value={billingStart}
                      onChange={(e) => setBillingStart(e.target.value)}
                      className="rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                    />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <label className="text-sm font-medium">
                      Period End <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="date"
                      value={billingEnd}
                      onChange={(e) => setBillingEnd(e.target.value)}
                      className="rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                    />
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Step 3 — Dates & Remarks */}
            <Card>
              <CardContent className="space-y-4 pt-5">
                <StepBadge step={3} label="Invoice Date & Notes" done={step3Done} />

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div className="flex flex-col gap-1.5">
                    <label className="text-sm font-medium">
                      Invoice Date <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="date"
                      value={invoiceDate}
                      onChange={(e) => setInvoiceDate(e.target.value)}
                      className="rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                    />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <label className="text-sm font-medium">
                      Due Date{" "}
                      <span className="text-xs text-muted-foreground">
                        (auto if blank)
                      </span>
                    </label>
                    <input
                      type="date"
                      value={dueDate}
                      onChange={(e) => setDueDate(e.target.value)}
                      className="rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                    />
                  </div>
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="text-sm font-medium">Remarks</label>
                  <textarea
                    value={remarks}
                    onChange={(e) => setRemarks(e.target.value)}
                    rows={3}
                    placeholder="Optional notes for this invoice…"
                    className="w-full resize-none rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                  />
                </div>
              </CardContent>
            </Card>
          </div>

          {/* ── Right: sticky summary ────────────────────────────── */}
          <div className="lg:col-span-1">
            <div className="sticky top-6 space-y-4">

              {/* Subscription mini-card */}
              <Card>
                <CardContent className="pt-5">
                  <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Invoice Summary
                  </p>

                  {/* Subscription */}
                  <div className="mb-3 rounded-lg bg-muted/30 p-3">
                    <div className="flex items-center gap-2">
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10">
                        <User className="h-4 w-4 text-primary" />
                      </div>
                      {selectedSub ? (
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold">
                            {selectedSub.customer_name}
                          </p>
                          <p className="font-mono text-xs text-muted-foreground">
                            {selectedSub.customer_code}
                          </p>
                        </div>
                      ) : (
                        <p className="text-sm text-muted-foreground">
                          No subscription selected
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Plan */}
                  <div className="mb-3 rounded-lg bg-muted/30 p-3">
                    <div className="flex items-center gap-2">
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10">
                        <RefreshCw className="h-4 w-4 text-primary" />
                      </div>
                      {selectedSub ? (
                        <div>
                          <p className="text-sm font-semibold">
                            {selectedSub.plan_name_snapshot}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {selectedSub.speed_mbps_snapshot} Mbps ·{" "}
                            {selectedSub.billing_cycle_snapshot.replace(/_/g, " ")}
                          </p>
                        </div>
                      ) : (
                        <p className="text-sm text-muted-foreground">No plan</p>
                      )}
                    </div>
                  </div>

                  {/* Billing period */}
                  <div className="mb-4 rounded-lg bg-muted/30 p-3">
                    <div className="flex items-center gap-2">
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10">
                        <Calendar className="h-4 w-4 text-primary" />
                      </div>
                      {billingStart && billingEnd ? (
                        <div>
                          <p className="text-xs text-muted-foreground">
                            Billing Period
                          </p>
                          <p className="text-sm font-medium">
                            {new Date(billingStart).toLocaleDateString("en-IN", {
                              day: "2-digit",
                              month: "short",
                            })}{" "}
                            –{" "}
                            {new Date(billingEnd).toLocaleDateString("en-IN", {
                              day: "2-digit",
                              month: "short",
                              year: "numeric",
                            })}
                          </p>
                        </div>
                      ) : (
                        <p className="text-sm text-muted-foreground">
                          No period set
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Amount breakdown */}
                  <div className="space-y-2 border-t border-border pt-3 text-sm">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Base Amount</span>
                      <span className="font-medium">
                        ₹{fmtMoney(selectedSub ? baseAmt : 0)}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">
                        GST ({gstPct}%)
                      </span>
                      <span className="font-medium">
                        ₹{fmtMoney(selectedSub ? gstAmt : 0)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between border-t border-border pt-2">
                      <span className="font-semibold text-foreground">Total</span>
                      <span className="text-lg font-bold text-primary">
                        ₹{fmtMoney(selectedSub ? totalAmt : 0)}
                      </span>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Generate button (repeated for easy access) */}
              <Button
                className="w-full"
                onClick={() => mutation.mutate()}
                disabled={!canSubmit}
              >
                {mutation.isPending ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <IndianRupee className="mr-2 h-4 w-4" />
                )}
                Generate Invoice
              </Button>

              {!canSubmit && !mutation.isPending && (
                <p className="text-center text-xs text-muted-foreground">
                  Complete all required fields above
                </p>
              )}
            </div>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
