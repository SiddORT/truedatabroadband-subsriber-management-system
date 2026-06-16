import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useMutation, useQuery } from "@tanstack/react-query";
import { ArrowLeft, Calculator, Loader2 } from "lucide-react";

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

export function InvoiceCreatePage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { showToast } = useToast();

  const preselectedSubId = searchParams.get("subscription_id") ?? "";

  // Step 1: subscription selection
  const [subscriptionId, setSubscriptionId] = useState(preselectedSubId);

  // Step 2: billing period + dates
  const [billingStart, setBillingStart] = useState(firstOfMonth());
  const [billingEnd, setBillingEnd] = useState(lastOfMonth());
  const [invoiceDate, setInvoiceDate] = useState(today());
  const [dueDate, setDueDate] = useState("");
  const [remarks, setRemarks] = useState("");

  // Fetch subscriptions for dropdown
  const { data: subsData, isLoading: subsLoading } = useQuery({
    queryKey: ["subscriptions-active-all"],
    queryFn: () =>
      subscriptionsService.list({
        page: 1,
        page_size: 200,
        sort_by: "created_at",
        sort_order: "desc",
        status_filter: "ACTIVE",
      }),
  });

  const activeSubs = subsData?.items ?? [];
  const selectedSub: Subscription | undefined = activeSubs.find(
    (s) => s.id === subscriptionId
  );

  // Compute preview amounts from subscription snapshot
  const baseAmt = Number(selectedSub?.base_price_snapshot ?? 0);
  const gstPct = Number(selectedSub?.gst_percentage_snapshot ?? 0);
  const gstAmt = Math.round(baseAmt * gstPct) / 100;
  const totalAmt = baseAmt + gstAmt;

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

  const canSubmit =
    !!subscriptionId &&
    !!billingStart &&
    !!billingEnd &&
    !!invoiceDate &&
    !mutation.isPending;

  return (
    <AppLayout title="New Invoice" portalLabel="Administration">
      <div className="mx-auto max-w-2xl space-y-6">
        {/* Header */}
        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            size="sm"
            onClick={() => navigate("/admin/invoices")}
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

        {/* Step 1: Subscription */}
        <Card>
          <CardContent className="space-y-4 pt-6">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Step 1 — Select Subscription
            </p>
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium">
                Active Subscription{" "}
                <span className="text-red-500">*</span>
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
                      {s.subscription_code} · {s.customer_name} ·{" "}
                      {s.plan_name_snapshot}
                    </option>
                  ))}
                </select>
              )}
            </div>

            {selectedSub && (
              <div className="rounded-lg bg-muted/40 p-4 space-y-3">
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <p className="text-xs text-muted-foreground">Customer</p>
                    <p className="font-medium">{selectedSub.customer_name}</p>
                    <p className="font-mono text-xs text-muted-foreground">
                      {selectedSub.customer_code}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Connection</p>
                    <p className="font-mono font-medium">
                      {selectedSub.subscription_code}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Plan</p>
                    <p className="font-medium">{selectedSub.plan_name_snapshot}</p>
                    <p className="text-xs text-muted-foreground">
                      {selectedSub.speed_mbps_snapshot} Mbps ·{" "}
                      {selectedSub.billing_cycle_snapshot.replace("_", " ")}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Billing</p>
                    <p className="font-medium">
                      ₹{fmtMoney(selectedSub.base_price_snapshot)} +{" "}
                      {selectedSub.gst_percentage_snapshot}% GST
                    </p>
                    <p className="text-xs font-semibold text-primary">
                      Total: ₹{fmtMoney(selectedSub.total_price_snapshot)}
                    </p>
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Step 2: Billing Period */}
        <Card>
          <CardContent className="space-y-4 pt-6">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Step 2 — Billing Period
            </p>
            <div className="grid grid-cols-2 gap-4">
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

        {/* Step 3: Invoice Date */}
        <Card>
          <CardContent className="space-y-4 pt-6">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Step 3 — Invoice Date & Due Date
            </p>
            <div className="grid grid-cols-2 gap-4">
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
                  <span className="text-muted-foreground text-xs">
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
                rows={2}
                placeholder="Optional notes for this invoice"
                className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 resize-none"
              />
            </div>
          </CardContent>
        </Card>

        {/* Summary */}
        {selectedSub && (
          <Card>
            <CardContent className="pt-6">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-4">
                <Calculator className="mr-1.5 inline h-3.5 w-3.5" />
                Amount Preview
              </p>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Base Amount</span>
                  <span className="font-medium">₹{fmtMoney(baseAmt)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">
                    GST ({gstPct}%)
                  </span>
                  <span className="font-medium">₹{fmtMoney(gstAmt)}</span>
                </div>
                <div className="flex justify-between border-t border-border pt-2">
                  <span className="font-semibold text-foreground">
                    Total Amount
                  </span>
                  <span className="text-lg font-bold text-primary">
                    ₹{fmtMoney(totalAmt)}
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Actions */}
        <div className="flex justify-end gap-3">
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
    </AppLayout>
  );
}
