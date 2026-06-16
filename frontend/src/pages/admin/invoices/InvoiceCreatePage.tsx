import { useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  ArrowLeft,
  Calendar,
  IndianRupee,
  Loader2,
  Plus,
  RefreshCw,
  User,
  X,
} from "lucide-react";

import { AppLayout } from "@/layouts/AppLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useToast } from "@/contexts/ToastContext";
import { invoicesService } from "@/services/invoices";
import { subscriptionsService } from "@/services/subscriptions";
import { getApiErrorMessage } from "@/services/api";
import type { Subscription } from "@/types/subscription";

function fmtMoney(n: number) {
  return n.toLocaleString("en-IN", {
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
          done ? "bg-green-500 text-white" : "bg-accent text-white"
        }`}
      >
        {done ? "✓" : step}
      </span>
      <span className="text-sm font-semibold text-foreground">{label}</span>
    </div>
  );
}

const INPUT_CLS =
  "w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30";
const RUPEE_INPUT_CLS =
  "w-full rounded-lg border border-input bg-background py-2 pl-7 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30";

type ItemDiscountType = "" | "percentage" | "fixed";
type DiscountType     = "" | "percentage" | "fixed";

interface ChargeRow {
  id: number;
  description: string;
  locked: boolean;          // true = fixed label (Installation / Service)
  amount: string;
  discountType: ItemDiscountType;
  discountValue: string;
}

// ── Per-row charge card ────────────────────────────────────────────────────
interface ChargeRowUIProps {
  row: ChargeRow;
  onUpdate: (patch: Partial<ChargeRow>) => void;
  onRemove: () => void;
  gross: number;
  disc: number;
  net: number;
}

function ChargeRowUI({ row, onUpdate, onRemove, gross, disc, net }: ChargeRowUIProps) {
  const discBtn = (v: ItemDiscountType, label: string) => (
    <button
      key={v}
      type="button"
      onClick={() => onUpdate({ discountType: v, discountValue: "" })}
      className={`shrink-0 rounded border px-2 py-1 text-[11px] font-semibold transition-colors ${
        row.discountType === v
          ? "border-primary bg-primary text-white"
          : "border-border bg-muted/40 text-foreground hover:bg-muted"
      }`}
    >
      {label}
    </button>
  );

  return (
    <div className="rounded-lg border border-border bg-background p-3">
      <div className="flex flex-wrap items-center gap-2">
        {/* Description */}
        {row.locked ? (
          <span className="min-w-[140px] flex-1 text-sm font-medium text-foreground">
            {row.description}
          </span>
        ) : (
          <input
            value={row.description}
            onChange={(e) => onUpdate({ description: e.target.value })}
            placeholder="Description (e.g. Router Fee)"
            className="min-w-[120px] flex-1 rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
          />
        )}

        {/* Amount */}
        <div className="relative w-28 shrink-0">
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
            ₹
          </span>
          <input
            type="number"
            min="0"
            step="0.01"
            value={row.amount}
            onChange={(e) => onUpdate({ amount: e.target.value })}
            placeholder="0.00"
            className="w-full rounded-lg border border-input bg-background py-2 pl-7 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
          />
        </div>

        {/* Discount type toggle */}
        <div className="flex shrink-0 gap-1">
          {discBtn("",          "None")}
          {discBtn("percentage","%")}
          {discBtn("fixed",     "₹")}
        </div>

        {/* Discount value — only when type is set */}
        {row.discountType && (
          <div className="relative w-20 shrink-0">
            <span className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
              {row.discountType === "percentage" ? "%" : "₹"}
            </span>
            <input
              type="number"
              min="0"
              max={row.discountType === "percentage" ? "100" : undefined}
              step="0.01"
              value={row.discountValue}
              onChange={(e) => onUpdate({ discountValue: e.target.value })}
              placeholder="0"
              className="w-full rounded-lg border border-input bg-background py-2 pl-5 pr-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
          </div>
        )}

        {/* Delete button — only for unlocked rows */}
        {!row.locked && (
          <button
            type="button"
            onClick={onRemove}
            className="shrink-0 rounded p-1 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* Discount preview: strikethrough gross → discount → net */}
      {disc > 0 && gross > 0 && (
        <div className="mt-2 flex items-center gap-2 pl-1 text-xs">
          <span className="text-muted-foreground line-through">
            ₹{gross.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
          </span>
          <span className="font-medium text-accent">
            −₹{disc.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
          </span>
          <span className="font-semibold text-foreground">
            = ₹{net.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
          </span>
        </div>
      )}
    </div>
  );
}

export function InvoiceCreatePage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { showToast } = useToast();

  const preselectedSubId = searchParams.get("subscription_id") ?? "";

  // Step 1
  const [subscriptionId, setSubscriptionId] = useState(preselectedSubId);
  // Step 2
  const [billingStart, setBillingStart] = useState(firstOfMonth());
  const [billingEnd, setBillingEnd] = useState(lastOfMonth());
  // Step 3
  const [invoiceDate, setInvoiceDate] = useState(today());
  const [dueDate, setDueDate] = useState("");
  const [remarks, setRemarks] = useState("");
  // Step 4 — unified charge rows (installation & service are locked pre-populated rows)
  const chargeIdRef = useRef(3);
  const [chargeRows, setChargeRows] = useState<ChargeRow[]>([
    { id: 1, description: "Installation Charges", locked: true,  amount: "", discountType: "", discountValue: "" },
    { id: 2, description: "Service Charges",       locked: true,  amount: "", discountType: "", discountValue: "" },
  ]);
  // Step 4 — invoice-level discount (applies to base plan or overall total)
  const [discountType, setDiscountType] = useState<DiscountType>("");
  const [discountScope, setDiscountScope] = useState<"base" | "overall">("base");
  const [discountValue, setDiscountValue] = useState("");
  const [discountLabel, setDiscountLabel] = useState("");

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

  // ── Amount calculations ─────────────────────────────────────────────────
  function rowGross(r: ChargeRow) { return Number(r.amount) || 0; }
  function rowItemDisc(r: ChargeRow) {
    const g = rowGross(r);
    if (!r.discountType || !r.discountValue || Number(r.discountValue) <= 0 || g <= 0) return 0;
    if (r.discountType === "percentage") return Math.round(g * Number(r.discountValue) * 100) / 10000;
    return Math.min(Number(r.discountValue), g);
  }
  function rowNet(r: ChargeRow) { return Math.max(0, rowGross(r) - rowItemDisc(r)); }

  const lineItemsTotal = chargeRows.reduce((s, r) => rowGross(r) > 0 ? s + rowNet(r) : s, 0);

  const gstOnFullBase = Math.round(baseAmt * gstPct) / 100;

  const discountAmt = (() => {
    if (!discountType || !discountValue || Number(discountValue) <= 0) return 0;
    if (discountScope === "overall") {
      const subtotal = baseAmt + gstOnFullBase + lineItemsTotal;
      if (discountType === "percentage") {
        return Math.round(subtotal * Number(discountValue) * 100) / 10000;
      }
      return Math.min(Number(discountValue), subtotal);
    }
    // "base" scope
    if (discountType === "percentage") {
      return Math.round(baseAmt * Number(discountValue) * 100) / 10000;
    }
    return Math.min(Number(discountValue), baseAmt);
  })();

  // For "base" scope, GST is on (base - discount); for "overall", GST is on full base
  const effectiveBase = discountScope === "base"
    ? Math.round((baseAmt - discountAmt) * 100) / 100
    : baseAmt;
  const gstAmt = discountScope === "base"
    ? Math.round(effectiveBase * gstPct) / 100
    : gstOnFullBase;
  const totalAmt = discountScope === "overall"
    ? baseAmt + gstAmt + lineItemsTotal - discountAmt
    : effectiveBase + gstAmt + lineItemsTotal;

  const step1Done = !!subscriptionId;
  const step2Done = !!billingStart && !!billingEnd;
  const step3Done = !!invoiceDate;

  // ── Charge row helpers ──────────────────────────────────────────────────
  function addChargeRow() {
    const id = chargeIdRef.current++;
    setChargeRows((prev) => [
      ...prev,
      { id, description: "", locked: false, amount: "", discountType: "", discountValue: "" },
    ]);
  }

  function removeChargeRow(id: number) {
    setChargeRows((prev) => prev.filter((r) => r.id !== id));
  }

  function updateChargeRow(id: number, patch: Partial<ChargeRow>) {
    setChargeRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  }

  // ── Build payload ───────────────────────────────────────────────────────
  function buildLineItems() {
    return chargeRows
      .filter((r) => rowGross(r) > 0 && r.description.trim())
      .map((r) => {
        const gross = rowGross(r);
        const disc  = rowItemDisc(r);
        const net   = rowNet(r);
        if (disc > 0) {
          return {
            description:     r.description.trim(),
            amount:          net.toFixed(2),
            original_amount: gross.toFixed(2),
            discount_type:   r.discountType,
            discount_value:  r.discountValue,
            discount_amount: disc.toFixed(2),
          };
        }
        return {
          description: r.description.trim(),
          amount:      net.toFixed(2),
        };
      });
  }

  const mutation = useMutation({
    mutationFn: () =>
      invoicesService.create({
        subscription_id: subscriptionId,
        billing_period_start: billingStart,
        billing_period_end: billingEnd,
        invoice_date: invoiceDate,
        due_date: dueDate || undefined,
        remarks: remarks || undefined,
        line_items: buildLineItems(),
        discount_type: discountType || undefined,
        discount_value: discountType && discountValue ? discountValue : undefined,
        discount_label: discountLabel || undefined,
        discount_scope: discountType ? discountScope : undefined,
      }),
    onSuccess: (inv) => {
      showToast(`Invoice ${inv.invoice_number} created`, "success");
      navigate(`/admin/invoices/${inv.id}`);
    },
    onError: (err) => showToast(getApiErrorMessage(err), "error"),
  });

  // canSubmit can't reference mutation.isPending before mutation is declared,
  // so we compute it after:
  const isSubmitDisabled = !step1Done || !step2Done || !step3Done || mutation.isPending;

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
            <Button
              onClick={() => mutation.mutate()}
              disabled={isSubmitDisabled}
            >
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
                      className={INPUT_CLS}
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
                      className={INPUT_CLS}
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
                      className={INPUT_CLS}
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
                      className={INPUT_CLS}
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
                      className={INPUT_CLS}
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

            {/* Step 4 — Charges & Discount */}
            <Card>
              <CardContent className="space-y-5 pt-5">
                <StepBadge step={4} label="Charges & Discount" done={false} />

                {/* ── Unified charges grid ──────────────────────────── */}
                <div>
                  <div className="mb-3 flex items-center justify-between">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                        Charges &amp; Items
                      </p>
                      <p className="mt-0.5 text-[11px] text-muted-foreground">
                        Each row: amount · then choose None / % / ₹ discount
                      </p>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      type="button"
                      onClick={addChargeRow}
                    >
                      <Plus className="mr-1.5 h-3.5 w-3.5" />
                      Add Row
                    </Button>
                  </div>

                  <div className="space-y-2">
                    {chargeRows.map((row) => (
                      <ChargeRowUI
                        key={row.id}
                        row={row}
                        onUpdate={(patch) => updateChargeRow(row.id, patch)}
                        onRemove={() => removeChargeRow(row.id)}
                        gross={rowGross(row)}
                        disc={rowItemDisc(row)}
                        net={rowNet(row)}
                      />
                    ))}
                  </div>
                </div>

                {/* ── Invoice-level discount ────────────────────────── */}
                <div className="border-t border-border pt-5">
                  <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Invoice Discount
                  </p>
                  <p className="mb-3 text-[11px] text-muted-foreground">
                    Applied to the base plan price or the entire bill total — separate from per-item discounts above.
                  </p>

                  {/* Type toggle */}
                  <div className="mb-3 flex gap-2">
                    {(
                      [
                        { value: "" as DiscountType, label: "None" },
                        { value: "percentage" as DiscountType, label: "% Percentage" },
                        { value: "fixed" as DiscountType, label: "₹ Fixed" },
                      ] as const
                    ).map(({ value, label }) => (
                      <button
                        key={value}
                        type="button"
                        onClick={() => {
                          setDiscountType(value);
                          setDiscountValue("");
                          if (!value) setDiscountScope("base");
                        }}
                        className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
                          discountType === value
                            ? "border-accent bg-accent text-white"
                            : "border-border bg-background text-foreground hover:bg-muted"
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>

                  {discountType && (
                    <>
                      {/* Applies-to scope */}
                      <div className="mb-4">
                        <p className="mb-2 text-xs font-medium text-muted-foreground">
                          Applies to
                        </p>
                        <div className="flex gap-2">
                          {[
                            { value: "base" as const,    label: "Base Plan",    desc: "Reduces plan price — GST is recalculated on discounted base" },
                            { value: "overall" as const, label: "Overall Total", desc: "Flat reduction from the full bill after GST + all charges" },
                          ].map(({ value, label, desc }) => (
                            <button
                              key={value}
                              type="button"
                              onClick={() => setDiscountScope(value)}
                              title={desc}
                              className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
                                discountScope === value
                                  ? "border-primary bg-primary text-white"
                                  : "border-border bg-background text-foreground hover:bg-muted"
                              }`}
                            >
                              {label}
                            </button>
                          ))}
                        </div>
                        <p className="mt-1.5 text-[11px] text-muted-foreground">
                          {discountScope === "base"
                            ? "Discount reduces the plan base charge; GST is calculated on the discounted base."
                            : "Discount is applied after GST and all charges are summed (final bill reduction)."}
                        </p>
                      </div>

                      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                        <div className="flex flex-col gap-1.5">
                          <label className="text-sm font-medium">
                            {discountType === "percentage" ? "Percentage (%)" : "Amount (₹)"}
                            <span className="text-red-500"> *</span>
                          </label>
                          <div className="relative">
                            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                              {discountType === "percentage" ? "%" : "₹"}
                            </span>
                            <input
                              type="number"
                              min="0"
                              max={discountType === "percentage" ? "100" : undefined}
                              step="0.01"
                              value={discountValue}
                              onChange={(e) => setDiscountValue(e.target.value)}
                              placeholder={discountType === "percentage" ? "e.g. 10" : "0.00"}
                              className={RUPEE_INPUT_CLS}
                            />
                          </div>
                        </div>
                        <div className="flex flex-col gap-1.5">
                          <label className="text-sm font-medium">
                            Label{" "}
                            <span className="text-xs text-muted-foreground">(optional)</span>
                          </label>
                          <input
                            value={discountLabel}
                            onChange={(e) => setDiscountLabel(e.target.value)}
                            placeholder="e.g. Festival Offer"
                            className={INPUT_CLS}
                          />
                        </div>
                      </div>
                    </>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* ── Right: sticky summary ────────────────────────────── */}
          <div className="lg:col-span-1">
            <div className="sticky top-6 space-y-4">

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
                      <span className="text-muted-foreground">Plan Base</span>
                      <span className="font-medium">
                        ₹{fmtMoney(selectedSub ? baseAmt : 0)}
                      </span>
                    </div>

                    {/* Base-scope discount: appears before GST */}
                    {discountAmt > 0 && discountScope === "base" && (
                      <>
                        <div className="flex justify-between text-accent">
                          <span className="truncate pr-2">
                            {discountType === "percentage"
                              ? `Discount (${discountValue}%) — Base`
                              : "Discount — Base"}
                            {discountLabel ? ` · ${discountLabel}` : ""}
                          </span>
                          <span className="shrink-0 font-medium">
                            −₹{fmtMoney(discountAmt)}
                          </span>
                        </div>
                        <div className="flex justify-between border-t border-dashed border-border pt-1 text-xs text-muted-foreground">
                          <span>Taxable Base</span>
                          <span>₹{fmtMoney(effectiveBase)}</span>
                        </div>
                      </>
                    )}

                    <div className="flex justify-between">
                      <span className="text-muted-foreground">
                        GST ({gstPct}%)
                      </span>
                      <span className="font-medium">
                        ₹{fmtMoney(selectedSub ? gstAmt : 0)}
                      </span>
                    </div>

                    {chargeRows
                      .filter((r) => rowGross(r) > 0)
                      .map((r, i) => {
                        const g = rowGross(r);
                        const d = rowItemDisc(r);
                        const n = rowNet(r);
                        return (
                          <div key={r.id}>
                            <div className="flex justify-between">
                              <span className="max-w-[60%] truncate text-muted-foreground">
                                {r.description || `Charge ${i + 1}`}
                              </span>
                              <span className="font-medium">
                                {d > 0 ? (
                                  <span className="line-through text-muted-foreground/60 mr-1">
                                    ₹{fmtMoney(g)}
                                  </span>
                                ) : null}
                                ₹{fmtMoney(n)}
                              </span>
                            </div>
                            {d > 0 && (
                              <div className="flex justify-between text-xs text-accent pl-1">
                                <span>
                                  {r.discountType === "percentage"
                                    ? `Item discount (${r.discountValue}%)`
                                    : "Item discount"}
                                </span>
                                <span>−₹{fmtMoney(d)}</span>
                              </div>
                            )}
                          </div>
                        );
                      })}

                    {/* Overall-scope discount: appears after all charges, before total */}
                    {discountAmt > 0 && discountScope === "overall" && (
                      <div className="flex justify-between text-accent">
                        <span className="truncate pr-2">
                          {discountType === "percentage"
                            ? `Discount (${discountValue}%) — Overall`
                            : "Discount — Overall"}
                          {discountLabel ? ` · ${discountLabel}` : ""}
                        </span>
                        <span className="shrink-0 font-medium">
                          −₹{fmtMoney(discountAmt)}
                        </span>
                      </div>
                    )}

                    <div className="flex items-center justify-between border-t border-border pt-2">
                      <span className="font-semibold text-foreground">Total</span>
                      <span className="text-lg font-bold text-accent">
                        ₹{fmtMoney(selectedSub ? totalAmt : 0)}
                      </span>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Generate button */}
              <Button
                className="w-full"
                onClick={() => mutation.mutate()}
                disabled={isSubmitDisabled}
              >
                {mutation.isPending ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <IndianRupee className="mr-2 h-4 w-4" />
                )}
                Generate Invoice
              </Button>

              {isSubmitDisabled && !mutation.isPending && (
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
