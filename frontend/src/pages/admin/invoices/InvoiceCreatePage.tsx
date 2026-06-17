import { useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  ArrowLeft,
  Loader2,
  Plus,
  X,
} from "lucide-react";

import { AppLayout } from "@/layouts/AppLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useToast } from "@/contexts/ToastContext";
import { invoicesService } from "@/services/invoices";
import { subscriptionsService } from "@/services/subscriptions";
import { api } from "@/services/api";
import { getApiErrorMessage } from "@/services/api";
import type { Subscription } from "@/types/subscription";

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtMoney(n: number) {
  return n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function today() { return new Date().toISOString().split("T")[0]; }
function firstOfMonth() {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().split("T")[0];
}
function lastOfMonth() {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth() + 1, 0).toISOString().split("T")[0];
}

// ── Types ─────────────────────────────────────────────────────────────────────

type InvoiceType = "SINGLE" | "CONSOLIDATED";
type ItemDiscountType = "" | "percentage" | "fixed";
type DiscountType     = "" | "percentage" | "fixed";

interface ChargeRow {
  id: number;
  description: string;
  locked: boolean;
  amount: string;
  discountType: ItemDiscountType;
  discountValue: string;
}

interface SubBillingState {
  sub: Subscription;
  enabled: boolean;
  chargeRows: ChargeRow[];
  chargeIdCounter: number;
}

interface CustomerItem {
  id: string;
  customer_code: string;
  full_name: string;
  email: string;
  mobile_number: string;
}

// ── Style constants ───────────────────────────────────────────────────────────

const INPUT_CLS = "w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30";

// ── Sub-components ────────────────────────────────────────────────────────────

interface StepBadgeProps { step: number; label: string; done: boolean; }
function StepBadge({ step, label, done }: StepBadgeProps) {
  return (
    <div className="flex items-center gap-2.5">
      <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold ${done ? "bg-green-500 text-white" : "bg-accent text-white"}`}>
        {done ? "✓" : step}
      </span>
      <span className="text-sm font-semibold text-foreground">{label}</span>
    </div>
  );
}

// ── ChargeRow UI ──────────────────────────────────────────────────────────────

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
      className={`shrink-0 rounded border px-2 py-1 text-[11px] font-semibold transition-colors ${row.discountType === v ? "border-primary bg-primary text-white" : "border-border bg-muted/40 text-foreground hover:bg-muted"}`}
    >
      {label}
    </button>
  );
  return (
    <div className="rounded-lg border border-border bg-background p-3">
      <div className="flex flex-wrap items-center gap-2">
        {row.locked ? (
          <span className="min-w-[140px] flex-1 text-sm font-medium text-foreground">{row.description}</span>
        ) : (
          <input
            value={row.description}
            onChange={(e) => onUpdate({ description: e.target.value })}
            placeholder="Description (e.g. Router Fee)"
            className="min-w-[120px] flex-1 rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
          />
        )}
        <div className="relative w-28 shrink-0">
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">₹</span>
          <input
            type="number" min="0" step="0.01"
            value={row.amount}
            onChange={(e) => onUpdate({ amount: e.target.value })}
            placeholder="0.00"
            className="w-full rounded-lg border border-input bg-background py-2 pl-7 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
          />
        </div>
        <div className="flex shrink-0 gap-1">
          {discBtn("", "None")}
          {discBtn("percentage", "%")}
          {discBtn("fixed", "₹")}
        </div>
        {row.discountType && (
          <div className="relative w-20 shrink-0">
            <span className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
              {row.discountType === "percentage" ? "%" : "₹"}
            </span>
            <input
              type="number" min="0" max={row.discountType === "percentage" ? "100" : undefined} step="0.01"
              value={row.discountValue}
              onChange={(e) => onUpdate({ discountValue: e.target.value })}
              placeholder="0"
              className="w-full rounded-lg border border-input bg-background py-2 pl-5 pr-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
          </div>
        )}
        {!row.locked && (
          <button type="button" onClick={onRemove}
            className="shrink-0 rounded p-1 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive">
            <X className="h-4 w-4" />
          </button>
        )}
      </div>
      {disc > 0 && gross > 0 && (
        <div className="mt-2 flex items-center gap-2 pl-1 text-xs">
          <span className="text-muted-foreground line-through">₹{gross.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</span>
          <span className="font-medium text-accent">−₹{disc.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</span>
          <span className="font-semibold text-foreground">= ₹{net.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</span>
        </div>
      )}
    </div>
  );
}

// ── Row calculation helpers ───────────────────────────────────────────────────

function rowGross(r: ChargeRow) { return Number(r.amount) || 0; }
function rowItemDisc(r: ChargeRow) {
  const g = rowGross(r);
  if (!r.discountType || !r.discountValue || Number(r.discountValue) <= 0 || g <= 0) return 0;
  if (r.discountType === "percentage") return Math.round(g * Number(r.discountValue) * 100) / 10000;
  return Math.min(Number(r.discountValue), g);
}
function rowNet(r: ChargeRow) { return Math.max(0, rowGross(r) - rowItemDisc(r)); }
function lineItemsTotal(rows: ChargeRow[]) { return rows.reduce((s, r) => rowGross(r) > 0 ? s + rowNet(r) : s, 0); }

function buildLineItems(rows: ChargeRow[]) {
  return rows
    .filter((r) => rowGross(r) > 0 && r.description.trim())
    .map((r) => {
      const gross = rowGross(r); const disc = rowItemDisc(r); const net = rowNet(r);
      if (disc > 0) {
        return {
          description: r.description.trim(), amount: net.toFixed(2),
          original_amount: gross.toFixed(2), discount_type: r.discountType,
          discount_value: r.discountValue, discount_amount: disc.toFixed(2),
        };
      }
      return { description: r.description.trim(), amount: net.toFixed(2) };
    });
}

function makeDefaultRows(): ChargeRow[] {
  return [
    { id: 1, description: "Installation Charges", locked: true,  amount: "", discountType: "", discountValue: "" },
    { id: 2, description: "Service Charges",       locked: true,  amount: "", discountType: "", discountValue: "" },
  ];
}

// ── Subscription charge card (for CONSOLIDATED mode) ──────────────────────────

interface SubChargeCardProps {
  subState: SubBillingState;
  subIdx: number;
  onToggle: () => void;
  onAddRow: () => void;
  onRemoveRow: (rowId: number) => void;
  onUpdateRow: (rowId: number, patch: Partial<ChargeRow>) => void;
}

function SubChargeCard({ subState, subIdx: _subIdx, onToggle, onAddRow, onRemoveRow, onUpdateRow }: SubChargeCardProps) {
  const { sub, enabled, chargeRows } = subState;
  const baseAmt = Number(sub.base_price_snapshot ?? 0);
  const gstPct  = Number(sub.gst_percentage_snapshot ?? 0);
  const lit = lineItemsTotal(chargeRows);
  const gstAmt = Math.round(baseAmt * gstPct) / 100;
  const subTotal = baseAmt + gstAmt + lit;

  return (
    <div className={`rounded-xl border-2 transition-colors ${enabled ? "border-primary/30 bg-background" : "border-border bg-muted/20 opacity-60"}`}>
      {/* Header */}
      <div className="flex items-center justify-between gap-3 rounded-t-xl bg-primary/5 px-4 py-3">
        <div className="flex items-center gap-3">
          <input
            type="checkbox" checked={enabled} onChange={onToggle}
            className="h-4 w-4 accent-primary"
          />
          <div>
            <p className="text-sm font-semibold text-foreground">{sub.subscription_code}</p>
            <p className="text-xs text-muted-foreground">
              {sub.plan_name_snapshot} · {sub.speed_mbps_snapshot} Mbps
              {sub.billing_cycle_snapshot ? ` · ${sub.billing_cycle_snapshot.replace(/_/g, " ")}` : ""}
            </p>
          </div>
        </div>
        <div className="text-right">
          <p className="text-xs text-muted-foreground">Base plan</p>
          <p className="text-sm font-bold text-foreground">₹{fmtMoney(baseAmt)}</p>
        </div>
      </div>

      {/* Charges */}
      {enabled && (
        <div className="space-y-3 p-4">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Additional Charges
            </p>
            <Button variant="outline" size="sm" type="button" onClick={onAddRow}>
              <Plus className="mr-1.5 h-3.5 w-3.5" />
              Add Row
            </Button>
          </div>
          <div className="space-y-2">
            {chargeRows.map((row) => (
              <ChargeRowUI
                key={row.id} row={row}
                onUpdate={(patch) => onUpdateRow(row.id, patch)}
                onRemove={() => onRemoveRow(row.id)}
                gross={rowGross(row)} disc={rowItemDisc(row)} net={rowNet(row)}
              />
            ))}
          </div>
          {/* Sub-total preview */}
          <div className="flex items-center justify-between rounded-lg bg-primary/5 px-4 py-2.5 text-sm">
            <div className="space-y-0.5">
              <p className="text-xs text-muted-foreground">Plan ₹{fmtMoney(baseAmt)} + GST ({gstPct}%) ₹{fmtMoney(gstAmt)}{lit > 0 ? ` + Charges ₹${fmtMoney(lit)}` : ""}</p>
            </div>
            <div className="text-right">
              <p className="text-xs text-muted-foreground">Sub-total</p>
              <p className="font-bold text-foreground">₹{fmtMoney(subTotal)}</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export function InvoiceCreatePage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { showToast } = useToast();

  // Invoice type
  const [invoiceType, setInvoiceType] = useState<InvoiceType>("SINGLE");

  // ── SINGLE mode state ────────────────────────────────────────────────────
  const preselectedSubId = searchParams.get("subscription_id") ?? "";
  const [subscriptionId, setSubscriptionId] = useState(preselectedSubId);
  const chargeIdRef = useRef(3);
  const [chargeRows, setChargeRows] = useState<ChargeRow[]>(makeDefaultRows());
  const [discountType, setDiscountType] = useState<DiscountType>("");
  const [discountScope, setDiscountScope] = useState<"base" | "overall">("base");
  const [discountValue, setDiscountValue] = useState("");
  const [discountLabel, setDiscountLabel] = useState("");

  // ── CONSOLIDATED mode state ──────────────────────────────────────────────
  const [customerId, setCustomerId] = useState("");
  const [consolidatedSubs, setConsolidatedSubs] = useState<SubBillingState[]>([]);

  // ── Shared state ─────────────────────────────────────────────────────────
  const [billingStart, setBillingStart] = useState(firstOfMonth());
  const [billingEnd,   setBillingEnd]   = useState(lastOfMonth());
  const [invoiceDate,  setInvoiceDate]  = useState(today());
  const [dueDate,      setDueDate]      = useState("");
  const [remarks,      setRemarks]      = useState("");

  // ── Queries ───────────────────────────────────────────────────────────────

  const { data: subsData, isLoading: subsLoading } = useQuery({
    queryKey: ["subscriptions-active-all"],
    queryFn: () => subscriptionsService.list({ page: 1, page_size: 100, sort_by: "created_at", sort_order: "desc", status_filter: "ACTIVE" }),
    enabled: invoiceType === "SINGLE",
  });

  const { data: customersData, isLoading: customersLoading } = useQuery({
    queryKey: ["customers-all-for-invoice"],
    queryFn: async () => {
      const { data } = await api.get("/customers", { params: { page: 1, page_size: 200 } });
      return (data.items ?? []) as CustomerItem[];
    },
    enabled: invoiceType === "CONSOLIDATED",
  });

  const { data: customerSubsData, isLoading: customerSubsLoading } = useQuery({
    queryKey: ["customer-subs-for-invoice", customerId],
    queryFn: () => subscriptionsService.listByCustomer(customerId),
    enabled: invoiceType === "CONSOLIDATED" && !!customerId,
  });

  // When customer subs load, reset consolidated sub billing state
  useEffect(() => {
    if (customerSubsData) {
      const active = customerSubsData.filter((s) => s.status === "ACTIVE");
      setConsolidatedSubs(
        active.map((sub) => ({
          sub,
          enabled: true,
          chargeRows: makeDefaultRows(),
          chargeIdCounter: 3,
        }))
      );
    }
  }, [customerSubsData]);

  // Reset consolidated state when customer changes
  useEffect(() => {
    setConsolidatedSubs([]);
  }, [customerId]);

  // ── SINGLE: amount calculations ──────────────────────────────────────────

  const activeSubs = subsData?.items ?? [];
  const selectedSub = activeSubs.find((s) => s.id === subscriptionId);
  const baseAmt = Number(selectedSub?.base_price_snapshot ?? 0);
  const gstPct  = Number(selectedSub?.gst_percentage_snapshot ?? 0);

  const gstOnFullBase = Math.round(baseAmt * gstPct) / 100;
  const singleLit = lineItemsTotal(chargeRows);

  const singleDiscountAmt = (() => {
    if (!discountType || !discountValue || Number(discountValue) <= 0) return 0;
    if (discountScope === "overall") {
      const subtotal = baseAmt + gstOnFullBase + singleLit;
      if (discountType === "percentage") return Math.round(subtotal * Number(discountValue) * 100) / 10000;
      return Math.min(Number(discountValue), subtotal);
    }
    if (discountType === "percentage") return Math.round(baseAmt * Number(discountValue) * 100) / 10000;
    return Math.min(Number(discountValue), baseAmt);
  })();

  const effectiveBase  = discountScope === "base" ? Math.round((baseAmt - singleDiscountAmt) * 100) / 100 : baseAmt;
  const singleGstAmt   = discountScope === "base" ? Math.round(effectiveBase * gstPct) / 100 : gstOnFullBase;
  const singleTotalAmt = discountScope === "overall"
    ? baseAmt + singleGstAmt + singleLit - singleDiscountAmt
    : effectiveBase + singleGstAmt + singleLit;

  // ── CONSOLIDATED: amount calculations ────────────────────────────────────

  function computeSubTotal(subState: SubBillingState) {
    const b = Number(subState.sub.base_price_snapshot ?? 0);
    const g = Number(subState.sub.gst_percentage_snapshot ?? 0);
    const lit = lineItemsTotal(subState.chargeRows);
    const gst = Math.round(b * g) / 100;
    return { base: b, gst, lit, total: b + gst + lit };
  }

  const enabledSubs = consolidatedSubs.filter((s) => s.enabled);
  const consolidatedTotal = enabledSubs.reduce((acc, s) => {
    const { total } = computeSubTotal(s);
    return acc + total;
  }, 0);

  // ── Validation ────────────────────────────────────────────────────────────

  const step1Done = invoiceType === "SINGLE" ? !!subscriptionId : !!customerId;
  const step2Done = !!billingStart && !!billingEnd;
  const step3Done = !!invoiceDate;
  const step4Done = invoiceType === "CONSOLIDATED" ? enabledSubs.length >= 1 : false;

  // ── SINGLE charge row helpers ─────────────────────────────────────────────

  function addChargeRow() {
    const id = chargeIdRef.current++;
    setChargeRows((prev) => [...prev, { id, description: "", locked: false, amount: "", discountType: "", discountValue: "" }]);
  }
  function removeChargeRow(id: number) { setChargeRows((prev) => prev.filter((r) => r.id !== id)); }
  function updateChargeRow(id: number, patch: Partial<ChargeRow>) {
    setChargeRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  }

  // ── CONSOLIDATED sub state helpers ────────────────────────────────────────

  function toggleSub(idx: number) {
    setConsolidatedSubs((prev) => prev.map((s, i) => i === idx ? { ...s, enabled: !s.enabled } : s));
  }
  function addSubRow(idx: number) {
    setConsolidatedSubs((prev) => prev.map((s, i) => {
      if (i !== idx) return s;
      const id = s.chargeIdCounter;
      return { ...s, chargeIdCounter: id + 1, chargeRows: [...s.chargeRows, { id, description: "", locked: false, amount: "", discountType: "", discountValue: "" }] };
    }));
  }
  function removeSubRow(subIdx: number, rowId: number) {
    setConsolidatedSubs((prev) => prev.map((s, i) =>
      i === subIdx ? { ...s, chargeRows: s.chargeRows.filter((r) => r.id !== rowId) } : s));
  }
  function updateSubRow(subIdx: number, rowId: number, patch: Partial<ChargeRow>) {
    setConsolidatedSubs((prev) => prev.map((s, i) =>
      i === subIdx ? { ...s, chargeRows: s.chargeRows.map((r) => r.id === rowId ? { ...r, ...patch } : r) } : s));
  }

  // ── Mutations ─────────────────────────────────────────────────────────────

  const singleMutation = useMutation({
    mutationFn: () =>
      invoicesService.create({
        subscription_id: subscriptionId,
        billing_period_start: billingStart,
        billing_period_end: billingEnd,
        invoice_date: invoiceDate,
        due_date: dueDate || undefined,
        remarks: remarks || undefined,
        line_items: buildLineItems(chargeRows),
        discount_type: discountType || undefined,
        discount_value: discountType && discountValue ? discountValue : undefined,
        discount_label: discountLabel || undefined,
        discount_scope: discountType ? discountScope : undefined,
      }),
    onSuccess: (inv) => { showToast(`Invoice ${inv.invoice_number} created`, "success"); navigate(`/admin/invoices/${inv.id}`); },
    onError: (err) => showToast(getApiErrorMessage(err), "error"),
  });

  const consolidatedMutation = useMutation({
    mutationFn: () =>
      invoicesService.createConsolidated({
        customer_id: customerId,
        billing_period_start: billingStart,
        billing_period_end: billingEnd,
        invoice_date: invoiceDate,
        due_date: dueDate || undefined,
        remarks: remarks || undefined,
        subscriptions: enabledSubs.map((s) => ({
          subscription_id: s.sub.id,
          line_items: buildLineItems(s.chargeRows),
        })),
      }),
    onSuccess: (inv) => { showToast(`Consolidated invoice ${inv.invoice_number} created`, "success"); navigate(`/admin/invoices/${inv.id}`); },
    onError: (err) => showToast(getApiErrorMessage(err), "error"),
  });

  const isPending = singleMutation.isPending || consolidatedMutation.isPending;

  const isSubmitDisabled = isPending || !step1Done || !step2Done || !step3Done
    || (invoiceType === "CONSOLIDATED" && enabledSubs.length === 0);

  function handleSubmit() {
    if (invoiceType === "SINGLE") singleMutation.mutate();
    else consolidatedMutation.mutate();
  }

  // ── Discount toggle buttons (SINGLE) ─────────────────────────────────────

  const discBtn = (v: DiscountType, label: string) => (
    <button key={v} type="button"
      onClick={() => { setDiscountType(v); setDiscountValue(""); }}
      className={`shrink-0 rounded border px-2 py-1 text-[11px] font-semibold transition-colors ${discountType === v ? "border-primary bg-primary text-white" : "border-border bg-muted/40 text-foreground hover:bg-muted"}`}
    >{label}</button>
  );

  const selectedCustomer = customersData?.find((c) => c.id === customerId);

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <AppLayout title="New Invoice" portalLabel="Administration">
      <div className="flex flex-col gap-5">

        {/* Top bar */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Button variant="outline" size="sm" onClick={() => navigate("/admin/invoices")} disabled={isPending}>
              <ArrowLeft className="mr-1.5 h-4 w-4" />Back
            </Button>
            <div>
              <h2 className="text-xl font-semibold text-foreground">Generate Invoice</h2>
              <p className="text-sm text-muted-foreground">Create a billing invoice for one or multiple subscriptions.</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={() => navigate("/admin/invoices")} disabled={isPending}>Cancel</Button>
            <Button onClick={handleSubmit} disabled={isSubmitDisabled}>
              {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Generate Invoice
            </Button>
          </div>
        </div>

        {/* Invoice type toggle */}
        <div className="flex items-center gap-1 self-start rounded-lg border border-border bg-muted/30 p-1">
          {(["SINGLE", "CONSOLIDATED"] as InvoiceType[]).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => { setInvoiceType(t); setSubscriptionId(""); setCustomerId(""); setConsolidatedSubs([]); }}
              className={`rounded-md px-4 py-1.5 text-sm font-semibold transition-colors ${invoiceType === t ? "bg-primary text-white shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
            >
              {t === "SINGLE" ? "Single Subscription" : "Consolidated (Multi-Sub)"}
            </button>
          ))}
        </div>

        {/* Two-column body */}
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">

          {/* Left: form steps */}
          <div className="space-y-5 lg:col-span-2">

            {/* ── Step 1 ── */}
            <Card>
              <CardContent className="space-y-4 pt-5">
                <StepBadge step={1} label={invoiceType === "SINGLE" ? "Select Subscription" : "Select Customer"} done={step1Done} />

                {invoiceType === "SINGLE" ? (
                  <>
                    <div className="flex flex-col gap-1.5">
                      <label className="text-sm font-medium">Active Subscription <span className="text-red-500">*</span></label>
                      {subsLoading ? (
                        <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Loading…</div>
                      ) : (
                        <select value={subscriptionId} onChange={(e) => setSubscriptionId(e.target.value)} className={INPUT_CLS}>
                          <option value="">— Select a subscription —</option>
                          {activeSubs.map((s) => (
                            <option key={s.id} value={s.id}>{s.subscription_code} · {s.customer_name} · {s.plan_name_snapshot}</option>
                          ))}
                        </select>
                      )}
                    </div>
                    {selectedSub && (
                      <div className="grid grid-cols-2 gap-3 rounded-lg border border-border bg-muted/20 p-4 text-sm sm:grid-cols-4">
                        <div><p className="text-xs text-muted-foreground">Customer Code</p><p className="font-mono font-semibold">{selectedSub.customer_code}</p></div>
                        <div><p className="text-xs text-muted-foreground">Customer</p><p className="font-medium">{selectedSub.customer_name}</p></div>
                        <div><p className="text-xs text-muted-foreground">Plan</p><p className="font-medium">{selectedSub.plan_name_snapshot}</p><p className="text-xs text-muted-foreground">{selectedSub.speed_mbps_snapshot} Mbps</p></div>
                        <div><p className="text-xs text-muted-foreground">Cycle</p><p className="font-medium">{selectedSub.billing_cycle_snapshot?.replace(/_/g, " ")}</p></div>
                      </div>
                    )}
                  </>
                ) : (
                  <>
                    <div className="flex flex-col gap-1.5">
                      <label className="text-sm font-medium">Customer <span className="text-red-500">*</span></label>
                      {customersLoading ? (
                        <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Loading customers…</div>
                      ) : (
                        <select value={customerId} onChange={(e) => setCustomerId(e.target.value)} className={INPUT_CLS}>
                          <option value="">— Select a customer —</option>
                          {(customersData ?? []).map((c) => (
                            <option key={c.id} value={c.id}>{c.customer_code} · {c.full_name}</option>
                          ))}
                        </select>
                      )}
                    </div>
                    {selectedCustomer && (
                      <div className="grid grid-cols-2 gap-3 rounded-lg border border-border bg-muted/20 p-4 text-sm sm:grid-cols-3">
                        <div><p className="text-xs text-muted-foreground">Code</p><p className="font-mono font-semibold">{selectedCustomer.customer_code}</p></div>
                        <div><p className="text-xs text-muted-foreground">Name</p><p className="font-medium">{selectedCustomer.full_name}</p></div>
                        <div><p className="text-xs text-muted-foreground">Mobile</p><p className="font-medium">{selectedCustomer.mobile_number}</p></div>
                      </div>
                    )}
                  </>
                )}
              </CardContent>
            </Card>

            {/* ── Step 2: Billing Period (shared) ── */}
            <Card>
              <CardContent className="space-y-4 pt-5">
                <StepBadge step={2} label="Billing Period" done={step2Done} />
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div className="flex flex-col gap-1.5">
                    <label className="text-sm font-medium">Period Start <span className="text-red-500">*</span></label>
                    <input type="date" value={billingStart} onChange={(e) => setBillingStart(e.target.value)} className={INPUT_CLS} />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <label className="text-sm font-medium">Period End <span className="text-red-500">*</span></label>
                    <input type="date" value={billingEnd} onChange={(e) => setBillingEnd(e.target.value)} className={INPUT_CLS} />
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* ── Step 3: Invoice Date & Notes (shared) ── */}
            <Card>
              <CardContent className="space-y-4 pt-5">
                <StepBadge step={3} label="Invoice Date & Notes" done={step3Done} />
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div className="flex flex-col gap-1.5">
                    <label className="text-sm font-medium">Invoice Date <span className="text-red-500">*</span></label>
                    <input type="date" value={invoiceDate} onChange={(e) => setInvoiceDate(e.target.value)} className={INPUT_CLS} />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <label className="text-sm font-medium">Due Date <span className="text-xs text-muted-foreground">(auto if blank)</span></label>
                    <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className={INPUT_CLS} />
                  </div>
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-sm font-medium">Remarks</label>
                  <textarea
                    value={remarks} onChange={(e) => setRemarks(e.target.value)}
                    rows={3} placeholder="Optional notes…"
                    className="w-full resize-none rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                  />
                </div>
              </CardContent>
            </Card>

            {/* ── Step 4 ── */}
            {invoiceType === "SINGLE" ? (
              <Card>
                <CardContent className="space-y-5 pt-5">
                  <StepBadge step={4} label="Charges & Discount" done={false} />

                  {/* Unified charges grid */}
                  <div>
                    <div className="mb-3 flex items-center justify-between">
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Charges &amp; Items</p>
                        <p className="mt-0.5 text-[11px] text-muted-foreground">Each row: amount · then choose None / % / ₹ discount</p>
                      </div>
                      <Button variant="outline" size="sm" type="button" onClick={addChargeRow}>
                        <Plus className="mr-1.5 h-3.5 w-3.5" />Add Row
                      </Button>
                    </div>
                    <div className="space-y-2">
                      {chargeRows.map((row) => (
                        <ChargeRowUI
                          key={row.id} row={row}
                          onUpdate={(patch) => updateChargeRow(row.id, patch)}
                          onRemove={() => removeChargeRow(row.id)}
                          gross={rowGross(row)} disc={rowItemDisc(row)} net={rowNet(row)}
                        />
                      ))}
                    </div>
                  </div>

                  {/* Invoice-level discount */}
                  {selectedSub && (
                    <div className="rounded-xl border border-border bg-muted/10 p-4">
                      <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Invoice-Level Discount</p>
                      <div className="flex flex-wrap items-center gap-2">
                        <div className="flex gap-1">
                          {discBtn("", "None")}
                          {discBtn("percentage", "% Discount")}
                          {discBtn("fixed", "₹ Discount")}
                        </div>
                        {discountType && (
                          <>
                            <div className="flex gap-1">
                              <button type="button" onClick={() => setDiscountScope("base")}
                                className={`rounded border px-2 py-1 text-[11px] font-semibold transition-colors ${discountScope === "base" ? "border-primary bg-primary text-white" : "border-border bg-muted/40 text-foreground hover:bg-muted"}`}>
                                On Base
                              </button>
                              <button type="button" onClick={() => setDiscountScope("overall")}
                                className={`rounded border px-2 py-1 text-[11px] font-semibold transition-colors ${discountScope === "overall" ? "border-primary bg-primary text-white" : "border-border bg-muted/40 text-foreground hover:bg-muted"}`}>
                                On Total
                              </button>
                            </div>
                            <input
                              type="number" min="0" step="0.01" max={discountType === "percentage" ? "100" : undefined}
                              value={discountValue}
                              onChange={(e) => setDiscountValue(e.target.value)}
                              placeholder={discountType === "percentage" ? "%" : "₹"}
                              className="w-24 rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                            />
                            <input
                              type="text" value={discountLabel} onChange={(e) => setDiscountLabel(e.target.value)}
                              placeholder="Discount label (optional)"
                              className="min-w-[160px] flex-1 rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                            />
                          </>
                        )}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            ) : (
              <Card>
                <CardContent className="space-y-4 pt-5">
                  <div className="flex items-center justify-between">
                    <StepBadge step={4} label="Per-Subscription Charges" done={step4Done} />
                    {customerId && !customerSubsLoading && (
                      <span className="text-xs text-muted-foreground">
                        {enabledSubs.length} of {consolidatedSubs.length} subscriptions included
                      </span>
                    )}
                  </div>

                  {!customerId ? (
                    <p className="text-sm text-muted-foreground">Select a customer above to see their active subscriptions.</p>
                  ) : customerSubsLoading ? (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Loader2 className="h-4 w-4 animate-spin" />Loading subscriptions…
                    </div>
                  ) : consolidatedSubs.length === 0 ? (
                    <div className="rounded-lg border border-border bg-muted/20 p-4 text-center text-sm text-muted-foreground">
                      No active subscriptions found for this customer.
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {consolidatedSubs.map((subState, idx) => (
                        <SubChargeCard
                          key={subState.sub.id}
                          subState={subState}
                          subIdx={idx}
                          onToggle={() => toggleSub(idx)}
                          onAddRow={() => addSubRow(idx)}
                          onRemoveRow={(rowId) => removeSubRow(idx, rowId)}
                          onUpdateRow={(rowId, patch) => updateSubRow(idx, rowId, patch)}
                        />
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
          </div>

          {/* Right: summary panel */}
          <div className="space-y-4">
            <Card>
              <CardContent className="pt-5">
                <p className="mb-4 text-sm font-semibold text-foreground">Invoice Summary</p>

                {invoiceType === "SINGLE" && selectedSub ? (
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between text-muted-foreground">
                      <span>Plan Base</span>
                      <span>₹{fmtMoney(baseAmt)}</span>
                    </div>
                    {singleDiscountAmt > 0 && (
                      <div className="flex justify-between text-accent">
                        <span>Discount</span>
                        <span>−₹{fmtMoney(singleDiscountAmt)}</span>
                      </div>
                    )}
                    <div className="flex justify-between text-muted-foreground">
                      <span>GST ({gstPct}%)</span>
                      <span>₹{fmtMoney(singleGstAmt)}</span>
                    </div>
                    {singleLit > 0 && (
                      <div className="flex justify-between text-muted-foreground">
                        <span>Other Charges</span>
                        <span>₹{fmtMoney(singleLit)}</span>
                      </div>
                    )}
                    <div className="mt-3 flex justify-between rounded-lg bg-primary/5 px-3 py-2.5 font-bold text-foreground">
                      <span>Total</span>
                      <span>₹{fmtMoney(singleTotalAmt)}</span>
                    </div>
                  </div>
                ) : invoiceType === "CONSOLIDATED" && enabledSubs.length > 0 ? (
                  <div className="space-y-3 text-sm">
                    {enabledSubs.map((s) => {
                      const { base, gst, lit, total } = computeSubTotal(s);
                      return (
                        <div key={s.sub.id} className="rounded-lg border border-border p-3">
                          <p className="mb-1.5 font-semibold text-foreground text-xs">{s.sub.subscription_code}</p>
                          <div className="space-y-0.5 text-xs text-muted-foreground">
                            <div className="flex justify-between"><span>Plan</span><span>₹{fmtMoney(base)}</span></div>
                            <div className="flex justify-between"><span>GST</span><span>₹{fmtMoney(gst)}</span></div>
                            {lit > 0 && <div className="flex justify-between"><span>Charges</span><span>₹{fmtMoney(lit)}</span></div>}
                            <div className="flex justify-between font-semibold text-foreground pt-1 border-t border-border mt-1">
                              <span>Sub-total</span><span>₹{fmtMoney(total)}</span>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                    <div className="flex justify-between rounded-lg bg-primary/5 px-3 py-2.5 font-bold text-foreground">
                      <span>Grand Total</span>
                      <span>₹{fmtMoney(consolidatedTotal)}</span>
                    </div>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    {invoiceType === "SINGLE" ? "Select a subscription to see the summary." : "Select a customer and subscriptions to see the summary."}
                  </p>
                )}
              </CardContent>
            </Card>

            {/* Billing period preview */}
            {(billingStart || billingEnd) && (
              <Card>
                <CardContent className="pt-5">
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Billing Period</p>
                  <p className="text-sm font-medium text-foreground">{billingStart || "—"} → {billingEnd || "—"}</p>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
