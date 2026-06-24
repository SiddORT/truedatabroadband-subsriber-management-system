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
import { getApiErrorMessage } from "@/services/api";
import { CustomerCombobox } from "@/components/CustomerCombobox";
import { SubscriptionCombobox } from "@/components/SubscriptionCombobox";
import { LineItemPicker } from "@/components/LineItemPicker";
import type { Customer } from "@/types/customer";
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
  gstPercentage: string;
}

interface SubBillingState {
  sub: Subscription;
  enabled: boolean;
  chargeRows: ChargeRow[];
  chargeIdCounter: number;
  billingStart: string;
  billingEnd: string;
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
          <>
            <input
              value={row.description}
              onChange={(e) => onUpdate({ description: e.target.value })}
              placeholder="Description (e.g. Router Fee)"
              className="min-w-[120px] flex-1 rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
            <LineItemPicker
              disabled={row.locked}
              onSelect={(item) =>
                onUpdate({
                  description: item.name,
                  amount: item.default_amount ? String(Number(item.default_amount)) : row.amount,
                  gstPercentage: String(Number(item.gst_percentage)),
                })
              }
            />
          </>
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
        <div className="relative w-16 shrink-0">
          <span className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">G%</span>
          <input
            type="number" min="0" max="100" step="0.01"
            value={row.gstPercentage}
            onChange={(e) => onUpdate({ gstPercentage: e.target.value })}
            placeholder="0"
            className="w-full rounded-lg border border-input bg-background py-2 pl-7 pr-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
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
      {(disc > 0 || (row.gstPercentage && Number(row.gstPercentage) > 0)) && gross > 0 && (
        <div className="mt-2 flex flex-wrap items-center gap-2 pl-1 text-xs">
          {row.gstPercentage && Number(row.gstPercentage) > 0 && (
            <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700">
              GST {row.gstPercentage}%
            </span>
          )}
          {disc > 0 && (
            <>
              <span className="text-muted-foreground line-through">₹{gross.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</span>
              <span className="font-medium text-accent">−₹{disc.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</span>
              <span className="font-semibold text-foreground">= ₹{net.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</span>
            </>
          )}
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
      const gstPct = r.gstPercentage && Number(r.gstPercentage) > 0 ? r.gstPercentage : undefined;
      if (disc > 0) {
        return {
          description: r.description.trim(), amount: net.toFixed(2),
          original_amount: gross.toFixed(2), discount_type: r.discountType,
          discount_value: r.discountValue, discount_amount: disc.toFixed(2),
          ...(gstPct ? { gst_percentage: gstPct } : {}),
        };
      }
      return {
        description: r.description.trim(), amount: net.toFixed(2),
        ...(gstPct ? { gst_percentage: gstPct } : {}),
      };
    });
}

function makeDefaultRows(): ChargeRow[] {
  return [];
}

// ── Subscription charge card (for CONSOLIDATED mode) ──────────────────────────

interface SubChargeCardProps {
  subState: SubBillingState;
  subIdx: number;
  onToggle: () => void;
  onAddRow: () => void;
  onRemoveRow: (rowId: number) => void;
  onUpdateRow: (rowId: number, patch: Partial<ChargeRow>) => void;
  onBillingChange: (start: string, end: string) => void;
}

function SubChargeCard({ subState, subIdx: _subIdx, onToggle, onAddRow, onRemoveRow, onUpdateRow, onBillingChange }: SubChargeCardProps) {
  const { sub, enabled, chargeRows, billingStart, billingEnd } = subState;
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
          {/* Per-subscription billing period */}
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-muted-foreground">Period Start <span className="text-red-500">*</span></label>
              <input type="date" value={billingStart}
                onChange={(e) => onBillingChange(e.target.value, billingEnd)}
                className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-muted-foreground">Period End <span className="text-red-500">*</span></label>
              <input type="date" value={billingEnd}
                onChange={(e) => onBillingChange(billingStart, e.target.value)}
                className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
            </div>
          </div>
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
          {/* Sub-total preview table */}
          <div className="overflow-x-auto rounded-lg border border-border text-xs">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border bg-muted/40">
                  <th className="px-2 py-1.5 text-left font-semibold uppercase tracking-wider text-muted-foreground">Description</th>
                  <th className="px-2 py-1.5 text-right font-semibold uppercase tracking-wider text-muted-foreground">Price</th>
                  <th className="px-2 py-1.5 text-right font-semibold uppercase tracking-wider text-muted-foreground">GST</th>
                  <th className="px-2 py-1.5 text-right font-semibold uppercase tracking-wider text-muted-foreground">Discount</th>
                  <th className="px-2 py-1.5 text-right font-semibold uppercase tracking-wider text-muted-foreground">Final Rate</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                <tr>
                  <td className="px-2 py-1.5 font-medium text-foreground">{sub.plan_name_snapshot}</td>
                  <td className="px-2 py-1.5 text-right">₹{fmtMoney(baseAmt)}</td>
                  <td className="px-2 py-1.5 text-right text-muted-foreground">
                    {gstPct > 0 ? `₹${fmtMoney(gstAmt)} (${gstPct}%)` : "—"}
                  </td>
                  <td className="px-2 py-1.5 text-right text-muted-foreground">—</td>
                  <td className="px-2 py-1.5 text-right font-semibold">₹{fmtMoney(baseAmt + gstAmt)}</td>
                </tr>
                {chargeRows.filter(r => rowGross(r) > 0 && r.description.trim()).map(row => {
                  const g = rowGross(row); const d = rowItemDisc(row); const n = rowNet(row);
                  const rp = Number(row.gstPercentage) || 0; const ra = Math.round(g * rp) / 100;
                  return (
                    <tr key={row.id}>
                      <td className="px-2 py-1.5 font-medium text-foreground">{row.description}</td>
                      <td className="px-2 py-1.5 text-right">₹{fmtMoney(g)}</td>
                      <td className="px-2 py-1.5 text-right text-muted-foreground">{rp > 0 ? `₹${fmtMoney(ra)} (${rp}%)` : "—"}</td>
                      <td className="px-2 py-1.5 text-right text-accent">{d > 0 ? `−₹${fmtMoney(d)}` : "—"}</td>
                      <td className="px-2 py-1.5 text-right font-semibold">₹{fmtMoney(n)}</td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot className="border-t-2 border-border bg-muted/20">
                <tr>
                  <td colSpan={4} className="px-2 py-1.5 text-right text-muted-foreground">Subtotal</td>
                  <td className="px-2 py-1.5 text-right font-medium">₹{fmtMoney(baseAmt + lit)}</td>
                </tr>
                <tr>
                  <td colSpan={4} className="px-2 py-1.5 text-right text-muted-foreground">Total GST</td>
                  <td className="px-2 py-1.5 text-right font-medium">₹{fmtMoney(gstAmt)}</td>
                </tr>
                <tr className="bg-primary/10 font-bold text-primary">
                  <td colSpan={4} className="px-2 py-1.5 text-right">Sub-total</td>
                  <td className="px-2 py-1.5 text-right">₹{fmtMoney(subTotal)}</td>
                </tr>
              </tfoot>
            </table>
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
  const [selectedSub, setSelectedSub] = useState<Subscription | null>(null);
  const chargeIdRef = useRef(3);
  const [chargeRows, setChargeRows] = useState<ChargeRow[]>(makeDefaultRows());
  const [discountType, setDiscountType] = useState<DiscountType>("");
  const [discountScope, setDiscountScope] = useState<"base" | "overall">("base");
  const [discountValue, setDiscountValue] = useState("");
  const [discountLabel, setDiscountLabel] = useState("");

  // ── CONSOLIDATED mode state ──────────────────────────────────────────────
  const [customerId, setCustomerId] = useState("");
  const [selectedConsolidatedCustomer, setSelectedConsolidatedCustomer] = useState<Customer | null>(null);
  const [consolidatedSubs, setConsolidatedSubs] = useState<SubBillingState[]>([]);

  // ── Shared state ─────────────────────────────────────────────────────────
  const [billingStart, setBillingStart] = useState(firstOfMonth());
  const [billingEnd,   setBillingEnd]   = useState(lastOfMonth());
  const [invoiceDate,  setInvoiceDate]  = useState(today());
  const [dueDate,      setDueDate]      = useState("");
  const [remarks,      setRemarks]      = useState("");

  // ── Queries ───────────────────────────────────────────────────────────────

  // Pre-load subscription when URL contains ?subscription_id=
  const { data: preselectedSubData } = useQuery({
    queryKey: ["sub-preselect", preselectedSubId],
    queryFn: () => subscriptionsService.get(preselectedSubId),
    enabled: !!preselectedSubId && !selectedSub,
    staleTime: Infinity,
  });
  useEffect(() => {
    if (preselectedSubData && !selectedSub) setSelectedSub(preselectedSubData);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preselectedSubData]);

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
          billingStart: sub.start_date ?? firstOfMonth(),
          billingEnd: sub.expiry_date ?? lastOfMonth(),
        }))
      );
    }
  }, [customerSubsData]);

  // Reset consolidated state when customer changes
  useEffect(() => {
    setConsolidatedSubs([]);
  }, [customerId]);

  // ── Auto-set billing period for SINGLE from subscription start/end dates ─
  useEffect(() => {
    if (invoiceType !== "SINGLE" || !selectedSub) return;
    if (selectedSub.start_date)  setBillingStart(selectedSub.start_date);
    if (selectedSub.expiry_date) setBillingEnd(selectedSub.expiry_date);
  }, [selectedSub, invoiceType]);

  // ── SINGLE: amount calculations ──────────────────────────────────────────

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

  const step1Done = invoiceType === "SINGLE" ? (!!selectedSub && !!billingStart && !!billingEnd) : !!customerId;
  const step2Done = !!invoiceDate;
  const step3Done = invoiceType === "CONSOLIDATED" ? enabledSubs.length >= 1 : true;

  // ── SINGLE charge row helpers ─────────────────────────────────────────────

  function addChargeRow() {
    const id = chargeIdRef.current++;
    setChargeRows((prev) => [...prev, { id, description: "", locked: false, amount: "", discountType: "", discountValue: "", gstPercentage: "" }]);
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
      return { ...s, chargeIdCounter: id + 1, chargeRows: [...s.chargeRows, { id, description: "", locked: false, amount: "", discountType: "", discountValue: "", gstPercentage: "" }] };
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
  function updateSubBillingDates(subIdx: number, start: string, end: string) {
    setConsolidatedSubs((prev) => prev.map((s, i) =>
      i === subIdx ? { ...s, billingStart: start, billingEnd: end } : s));
  }

  // ── Mutations ─────────────────────────────────────────────────────────────

  const singleMutation = useMutation({
    mutationFn: () =>
      invoicesService.create({
        subscription_id: selectedSub?.id ?? "",
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
    mutationFn: () => {
      const starts = enabledSubs.map((s) => s.billingStart).filter(Boolean).sort();
      const ends = enabledSubs.map((s) => s.billingEnd).filter(Boolean).sort();
      return invoicesService.createConsolidated({
        customer_id: customerId,
        billing_period_start: starts[0] ?? billingStart,
        billing_period_end: ends[ends.length - 1] ?? billingEnd,
        invoice_date: invoiceDate,
        due_date: dueDate || undefined,
        remarks: remarks || undefined,
        subscriptions: enabledSubs.map((s) => ({
          subscription_id: s.sub.id,
          billing_period_start: s.billingStart,
          billing_period_end: s.billingEnd,
          line_items: buildLineItems(s.chargeRows),
        })),
      });
    },
    onSuccess: (inv) => { showToast(`Consolidated invoice ${inv.invoice_number} created`, "success"); navigate(`/admin/invoices/${inv.id}`); },
    onError: (err) => showToast(getApiErrorMessage(err), "error"),
  });

  const isPending = singleMutation.isPending || consolidatedMutation.isPending;

  const isSubmitDisabled = isPending || !step1Done || !step2Done
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
              onClick={() => { setInvoiceType(t); setSelectedSub(null); setCustomerId(""); setSelectedConsolidatedCustomer(null); setConsolidatedSubs([]); }}
              className={`rounded-md px-4 py-1.5 text-sm font-semibold transition-colors ${invoiceType === t ? "bg-primary text-white shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
            >
              {t === "SINGLE" ? "Single Subscription" : "Consolidated (Multi-Sub)"}
            </button>
          ))}
        </div>

        {/* ── SINGLE mode ─────────────────────────────────────────────────────── */}
        {invoiceType === "SINGLE" && (
          <>
            {/* Row 1: Subscription & Billing Period | Invoice Date & Notes */}
            <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
              <Card>
                <CardContent className="space-y-4 pt-5">
                  <p className="text-sm font-semibold text-foreground">Subscription & Billing Period</p>
                  <div className="flex flex-col gap-1.5">
                    <label className="text-sm font-medium">Active Subscription <span className="text-red-500">*</span></label>
                    <SubscriptionCombobox
                      value={selectedSub}
                      onChange={(s) => setSelectedSub(s)}
                      placeholder="Search by subscription code, customer name or mobile…"
                    />
                  </div>
                  {selectedSub && (
                    <div className="grid grid-cols-2 gap-3 rounded-lg border border-border bg-muted/20 p-3 text-sm sm:grid-cols-4">
                      <div><p className="text-xs text-muted-foreground">Customer Code</p><p className="font-mono font-semibold">{selectedSub.customer_code}</p></div>
                      <div><p className="text-xs text-muted-foreground">Customer</p><p className="font-medium">{selectedSub.customer_name}</p></div>
                      <div><p className="text-xs text-muted-foreground">Plan</p><p className="font-medium">{selectedSub.plan_name_snapshot}</p><p className="text-xs text-muted-foreground">{selectedSub.speed_mbps_snapshot} Mbps</p></div>
                      <div><p className="text-xs text-muted-foreground">Cycle</p><p className="font-medium">{selectedSub.billing_cycle_snapshot?.replace(/_/g, " ")}</p></div>
                    </div>
                  )}
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
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

              <Card>
                <CardContent className="space-y-4 pt-5">
                  <p className="text-sm font-semibold text-foreground">Invoice Date & Notes</p>
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
                      rows={4} placeholder="Optional notes…"
                      className="w-full resize-none rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                    />
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Row 2: Charges & Discount (full width) */}
            <Card>
              <CardContent className="space-y-5 pt-5">
                <div>
                  <div className="mb-3 flex items-center justify-between">
                    <div>
                      <p className="text-sm font-semibold text-foreground">Charges & Items</p>
                      <p className="mt-0.5 text-[11px] text-muted-foreground">Each row: amount · then choose None / % / ₹ discount</p>
                    </div>
                    <Button variant="outline" size="sm" type="button" onClick={addChargeRow}>
                      <Plus className="mr-1.5 h-3.5 w-3.5" />Add Row
                    </Button>
                  </div>
                  {chargeRows.length === 0 ? (
                    <p className="rounded-lg border border-dashed border-border py-5 text-center text-sm text-muted-foreground">
                      No additional charges. Click "Add Row" to add one.
                    </p>
                  ) : (
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
                  )}
                </div>

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
                            value={discountValue} onChange={(e) => setDiscountValue(e.target.value)}
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

            {/* Row 3: Invoice Preview Table (full width) */}
            {selectedSub && (
              <Card>
                <CardContent className="pt-5">
                  <p className="mb-4 text-sm font-semibold text-foreground">Invoice Preview</p>
                  <div className="overflow-x-auto rounded-lg border border-border">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-border bg-muted/40">
                          <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">Description</th>
                          <th className="px-3 py-2 text-right text-xs font-semibold uppercase tracking-wider text-muted-foreground">Price</th>
                          <th className="px-3 py-2 text-right text-xs font-semibold uppercase tracking-wider text-muted-foreground">GST</th>
                          <th className="px-3 py-2 text-right text-xs font-semibold uppercase tracking-wider text-muted-foreground">Discount</th>
                          <th className="px-3 py-2 text-right text-xs font-semibold uppercase tracking-wider text-muted-foreground">Final Rate</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {/* Plan row */}
                        <tr className="bg-background">
                          <td className="px-3 py-2.5">
                            <p className="font-medium text-foreground">{selectedSub.plan_name_snapshot}</p>
                            {billingStart && billingEnd && (
                              <p className="text-xs text-muted-foreground">{billingStart} → {billingEnd}</p>
                            )}
                          </td>
                          <td className="px-3 py-2.5 text-right text-foreground">₹{fmtMoney(baseAmt)}</td>
                          <td className="px-3 py-2.5 text-right text-muted-foreground">
                            {gstPct > 0 ? (
                              <span>₹{fmtMoney(singleGstAmt)}<span className="ml-1 text-xs">({gstPct}%)</span></span>
                            ) : "—"}
                          </td>
                          <td className="px-3 py-2.5 text-right text-accent">
                            {singleDiscountAmt > 0 && discountScope === "base"
                              ? `−₹${fmtMoney(singleDiscountAmt)}`
                              : "—"}
                          </td>
                          <td className="px-3 py-2.5 text-right font-semibold text-foreground">
                            ₹{fmtMoney(effectiveBase + singleGstAmt)}
                          </td>
                        </tr>
                        {/* Charge rows */}
                        {chargeRows.filter(r => rowGross(r) > 0 && r.description.trim()).map(row => {
                          const gross = rowGross(row);
                          const disc  = rowItemDisc(row);
                          const net   = rowNet(row);
                          const rowGstPct = Number(row.gstPercentage) || 0;
                          const rowGstAmt = Math.round(gross * rowGstPct) / 100;
                          return (
                            <tr key={row.id} className="bg-background">
                              <td className="px-3 py-2.5 font-medium text-foreground">{row.description}</td>
                              <td className="px-3 py-2.5 text-right text-foreground">₹{fmtMoney(gross)}</td>
                              <td className="px-3 py-2.5 text-right text-muted-foreground">
                                {rowGstPct > 0 ? (
                                  <span>₹{fmtMoney(rowGstAmt)}<span className="ml-1 text-xs">({rowGstPct}%)</span></span>
                                ) : "—"}
                              </td>
                              <td className="px-3 py-2.5 text-right text-accent">
                                {disc > 0 ? `−₹${fmtMoney(disc)}` : "—"}
                              </td>
                              <td className="px-3 py-2.5 text-right font-semibold text-foreground">₹{fmtMoney(net)}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                      <tfoot className="border-t-2 border-border bg-muted/20">
                        <tr>
                          <td colSpan={4} className="px-3 py-2 text-right text-xs text-muted-foreground">Subtotal</td>
                          <td className="px-3 py-2 text-right text-sm font-medium text-foreground">₹{fmtMoney(baseAmt + singleLit)}</td>
                        </tr>
                        <tr>
                          <td colSpan={4} className="px-3 py-2 text-right text-xs text-muted-foreground">Total GST</td>
                          <td className="px-3 py-2 text-right text-sm font-medium text-foreground">₹{fmtMoney(singleGstAmt)}</td>
                        </tr>
                        {singleDiscountAmt > 0 && discountScope === "overall" && (
                          <tr>
                            <td colSpan={4} className="px-3 py-2 text-right text-xs text-accent">
                              {discountLabel ? discountLabel : "Discount"}
                            </td>
                            <td className="px-3 py-2 text-right text-sm font-medium text-accent">−₹{fmtMoney(singleDiscountAmt)}</td>
                          </tr>
                        )}
                        <tr className="bg-primary text-white">
                          <td colSpan={4} className="px-3 py-3 text-right text-sm font-bold">Grand Total</td>
                          <td className="px-3 py-3 text-right text-base font-bold">₹{fmtMoney(singleTotalAmt)}</td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                </CardContent>
              </Card>
            )}
          </>
        )}

        {/* ── CONSOLIDATED mode ───────────────────────────────────────────────── */}
        {invoiceType === "CONSOLIDATED" && (
          <>
            {/* Row 1: Customer | Invoice Date & Notes */}
            <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
              <Card>
                <CardContent className="space-y-4 pt-5">
                  <p className="text-sm font-semibold text-foreground">Select Customer</p>
                  <div className="flex flex-col gap-1.5">
                    <label className="text-sm font-medium">Customer <span className="text-red-500">*</span></label>
                    <CustomerCombobox
                      value={selectedConsolidatedCustomer}
                      onChange={(c) => {
                        setSelectedConsolidatedCustomer(c);
                        setCustomerId(c?.id ?? "");
                        setConsolidatedSubs([]);
                      }}
                      placeholder="Search customer by name, code or mobile…"
                    />
                  </div>
                  {selectedConsolidatedCustomer && (
                    <div className="grid grid-cols-2 gap-3 rounded-lg border border-border bg-muted/20 p-3 text-sm sm:grid-cols-3">
                      <div><p className="text-xs text-muted-foreground">Code</p><p className="font-mono font-semibold">{selectedConsolidatedCustomer.customer_code}</p></div>
                      <div><p className="text-xs text-muted-foreground">Name</p><p className="font-medium">{selectedConsolidatedCustomer.full_name}</p></div>
                      <div><p className="text-xs text-muted-foreground">Mobile</p><p className="font-medium">{selectedConsolidatedCustomer.mobile_number}</p></div>
                    </div>
                  )}
                  {customerId && !customerSubsLoading && consolidatedSubs.length > 0 && (
                    <p className="text-xs text-muted-foreground">
                      {enabledSubs.length} of {consolidatedSubs.length} subscription{consolidatedSubs.length > 1 ? "s" : ""} included
                    </p>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardContent className="space-y-4 pt-5">
                  <p className="text-sm font-semibold text-foreground">Invoice Date & Notes</p>
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
                      rows={4} placeholder="Optional notes…"
                      className="w-full resize-none rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                    />
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Per-subscription charge cards (full width each) */}
            {!customerId ? (
              <div className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
                Select a customer above to see their active subscriptions.
              </div>
            ) : customerSubsLoading ? (
              <div className="flex items-center gap-2 rounded-lg border border-border p-4 text-sm text-muted-foreground">
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
                    onBillingChange={(start, end) => updateSubBillingDates(idx, start, end)}
                  />
                ))}
              </div>
            )}

            {/* Invoice Preview Table (full width at bottom) */}
            {enabledSubs.length > 0 && (
              <Card>
                <CardContent className="pt-5">
                  <p className="mb-4 text-sm font-semibold text-foreground">Invoice Preview</p>
                  <div className="space-y-4">
                    {enabledSubs.map((s) => {
                      const subBase = Number(s.sub.base_price_snapshot ?? 0);
                      const subGstPct = Number(s.sub.gst_percentage_snapshot ?? 0);
                      const subGst = Math.round(subBase * subGstPct) / 100;
                      const subLit = lineItemsTotal(s.chargeRows);
                      const subTotal = subBase + subGst + subLit;
                      return (
                        <div key={s.sub.id} className="overflow-x-auto rounded-lg border border-border">
                          {/* Sub header */}
                          <div className="border-b border-border bg-primary/5 px-3 py-2">
                            <p className="text-xs font-semibold text-foreground">{s.sub.subscription_code} — {s.sub.plan_name_snapshot}</p>
                            <p className="text-xs text-muted-foreground">{s.billingStart || "—"} → {s.billingEnd || "—"}</p>
                          </div>
                          <table className="w-full text-sm">
                            <thead>
                              <tr className="border-b border-border bg-muted/40">
                                <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">Description</th>
                                <th className="px-3 py-2 text-right text-xs font-semibold uppercase tracking-wider text-muted-foreground">Price</th>
                                <th className="px-3 py-2 text-right text-xs font-semibold uppercase tracking-wider text-muted-foreground">GST</th>
                                <th className="px-3 py-2 text-right text-xs font-semibold uppercase tracking-wider text-muted-foreground">Discount</th>
                                <th className="px-3 py-2 text-right text-xs font-semibold uppercase tracking-wider text-muted-foreground">Final Rate</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-border">
                              <tr className="bg-background">
                                <td className="px-3 py-2.5 font-medium text-foreground">{s.sub.plan_name_snapshot}</td>
                                <td className="px-3 py-2.5 text-right text-foreground">₹{fmtMoney(subBase)}</td>
                                <td className="px-3 py-2.5 text-right text-muted-foreground">
                                  {subGstPct > 0 ? <span>₹{fmtMoney(subGst)}<span className="ml-1 text-xs">({subGstPct}%)</span></span> : "—"}
                                </td>
                                <td className="px-3 py-2.5 text-right text-muted-foreground">—</td>
                                <td className="px-3 py-2.5 text-right font-semibold text-foreground">₹{fmtMoney(subBase + subGst)}</td>
                              </tr>
                              {s.chargeRows.filter(r => rowGross(r) > 0 && r.description.trim()).map(row => {
                                const gross = rowGross(row);
                                const disc  = rowItemDisc(row);
                                const net   = rowNet(row);
                                const rgp   = Number(row.gstPercentage) || 0;
                                const rga   = Math.round(gross * rgp) / 100;
                                return (
                                  <tr key={row.id} className="bg-background">
                                    <td className="px-3 py-2.5 font-medium text-foreground">{row.description}</td>
                                    <td className="px-3 py-2.5 text-right text-foreground">₹{fmtMoney(gross)}</td>
                                    <td className="px-3 py-2.5 text-right text-muted-foreground">
                                      {rgp > 0 ? <span>₹{fmtMoney(rga)}<span className="ml-1 text-xs">({rgp}%)</span></span> : "—"}
                                    </td>
                                    <td className="px-3 py-2.5 text-right text-accent">{disc > 0 ? `−₹${fmtMoney(disc)}` : "—"}</td>
                                    <td className="px-3 py-2.5 text-right font-semibold text-foreground">₹{fmtMoney(net)}</td>
                                  </tr>
                                );
                              })}
                            </tbody>
                            <tfoot className="border-t-2 border-border bg-muted/20">
                              <tr>
                                <td colSpan={4} className="px-3 py-2 text-right text-xs text-muted-foreground">Subtotal</td>
                                <td className="px-3 py-2 text-right text-sm font-medium text-foreground">₹{fmtMoney(subBase + subLit)}</td>
                              </tr>
                              <tr>
                                <td colSpan={4} className="px-3 py-2 text-right text-xs text-muted-foreground">Total GST</td>
                                <td className="px-3 py-2 text-right text-sm font-medium text-foreground">₹{fmtMoney(subGst)}</td>
                              </tr>
                              <tr className="bg-primary/10">
                                <td colSpan={4} className="px-3 py-2 text-right text-xs font-bold text-primary">Sub-total</td>
                                <td className="px-3 py-2 text-right text-sm font-bold text-primary">₹{fmtMoney(subTotal)}</td>
                              </tr>
                            </tfoot>
                          </table>
                        </div>
                      );
                    })}
                    <div className="flex items-center justify-between rounded-lg bg-primary px-5 py-3 font-bold text-white">
                      <span>Grand Total ({enabledSubs.length} subscription{enabledSubs.length > 1 ? "s" : ""})</span>
                      <span className="text-base">₹{fmtMoney(consolidatedTotal)}</span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}
          </>
        )}

      </div>
    </AppLayout>
  );
}
