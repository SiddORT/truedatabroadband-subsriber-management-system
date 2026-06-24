import { useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  Ban,
  Download,
  Edit2,
  IndianRupee,
  Lock,
  Loader2,
  Mail,
  Plus,
  X,
} from "lucide-react";
import { Tooltip } from "@/components/ui/tooltip";

import { AppLayout } from "@/layouts/AppLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { usePermission } from "@/hooks/usePermission";
import { Dialog } from "@/components/ui/Dialog";
import { useToast } from "@/contexts/ToastContext";
import { invoicesService } from "@/services/invoices";
import { paymentsService } from "@/services/payments";
import { api, getApiErrorMessage } from "@/services/api";
import {
  type Invoice,
  INVOICE_STATUS_COLORS,
  INVOICE_STATUS_LABELS,
} from "@/types/invoice";
import { PAYMENT_METHOD_LABELS, type PaymentMethod } from "@/types/payment";

function fmtDate(d: string) {
  return new Date(d).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
}

function fmtDateShort(d: string) {
  return new Date(d).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function fmtMoney(n: string | number) {
  return `₹${Number(n).toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function fmtDateTime(dt: string) {
  return new Date(dt).toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-sm font-medium text-foreground">{value ?? "—"}</span>
    </div>
  );
}

const EDITABLE_STATUSES = ["DRAFT", "UNPAID"];

// ── Edit dialog: charge row helpers ────────────────────────────────────────────

type ItemDiscountType = "" | "percentage" | "fixed";
type DiscountType = "" | "percentage" | "fixed";

interface ChargeRow {
  id: number;
  description: string;
  locked: boolean;
  amount: string;
  discountType: ItemDiscountType;
  discountValue: string;
}

function rowGross(r: ChargeRow) { return Number(r.amount) || 0; }
function rowItemDisc(r: ChargeRow) {
  const g = rowGross(r);
  if (!r.discountType || !r.discountValue || Number(r.discountValue) <= 0 || g <= 0) return 0;
  if (r.discountType === "percentage") return Math.round(g * Number(r.discountValue) * 100) / 10000;
  return Math.min(Number(r.discountValue), g);
}
function rowNet(r: ChargeRow) { return Math.max(0, rowGross(r) - rowItemDisc(r)); }

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

interface ChargeRowUIProps {
  row: ChargeRow;
  onUpdate: (patch: Partial<ChargeRow>) => void;
  onRemove: () => void;
}

function EditChargeRowUI({ row, onUpdate, onRemove }: ChargeRowUIProps) {
  const gross = rowGross(row); const disc = rowItemDisc(row); const net = rowNet(row);
  const discBtn = (v: ItemDiscountType, label: string) => (
    <button key={v} type="button"
      onClick={() => onUpdate({ discountType: v, discountValue: "" })}
      className={`shrink-0 rounded border px-2 py-1 text-[11px] font-semibold transition-colors ${row.discountType === v ? "border-primary bg-primary text-white" : "border-border bg-muted/40 text-foreground hover:bg-muted"}`}
    >{label}</button>
  );
  return (
    <div className="rounded-lg border border-border bg-background p-3">
      <div className="flex flex-wrap items-center gap-2">
        <input
          value={row.description}
          onChange={(e) => onUpdate({ description: e.target.value })}
          placeholder="Description"
          className="min-w-[120px] flex-1 rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
        />
        <div className="relative w-28 shrink-0">
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">₹</span>
          <input type="number" min="0" step="0.01" value={row.amount}
            onChange={(e) => onUpdate({ amount: e.target.value })} placeholder="0.00"
            className="w-full rounded-lg border border-input bg-background py-2 pl-7 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
          />
        </div>
        <div className="flex shrink-0 gap-1">{discBtn("", "None")}{discBtn("percentage", "%")}{discBtn("fixed", "₹")}</div>
        {row.discountType && (
          <div className="relative w-20 shrink-0">
            <span className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
              {row.discountType === "percentage" ? "%" : "₹"}
            </span>
            <input type="number" min="0" max={row.discountType === "percentage" ? "100" : undefined} step="0.01"
              value={row.discountValue} onChange={(e) => onUpdate({ discountValue: e.target.value })}
              placeholder="0"
              className="w-full rounded-lg border border-input bg-background py-2 pl-5 pr-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
          </div>
        )}
        <Tooltip label="Remove Item">
          <button type="button" onClick={onRemove}
            className="shrink-0 rounded p-1 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive">
            <X className="h-4 w-4" />
          </button>
        </Tooltip>
      </div>
      {disc > 0 && gross > 0 && (
        <div className="mt-2 flex items-center gap-2 pl-1 text-xs">
          <span className="text-muted-foreground line-through">₹{gross.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</span>
          <span className="font-medium text-red-500">−₹{disc.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</span>
          <span className="font-semibold text-foreground">= ₹{net.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</span>
        </div>
      )}
    </div>
  );
}

export function InvoiceDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const canEditInvoice  = usePermission("invoices", "edit");
  const canAddPayment   = usePermission("payments", "add");
  const qc = useQueryClient();
  const { showToast } = useToast();

  const { data: inv, isLoading } = useQuery<Invoice>({
    queryKey: ["invoices", id],
    queryFn: () => invoicesService.get(id!),
    enabled: !!id,
  });

  // ── Edit dialog ──────────────────────────────────────────────────────────
  const [editDialog, setEditDialog] = useState(false);
  const [editBillingStart, setEditBillingStart] = useState("");
  const [editBillingEnd, setEditBillingEnd] = useState("");
  const [editInvoiceDate, setEditInvoiceDate] = useState("");
  const [editDueDate, setEditDueDate] = useState("");
  const [editRemarks, setEditRemarks] = useState("");
  const [editReason, setEditReason] = useState("");
  const [editChargeRows, setEditChargeRows] = useState<ChargeRow[]>([]);
  const editChargeIdRef = useRef(100);
  const [editDiscountType, setEditDiscountType] = useState<DiscountType>("");
  const [editDiscountScope, setEditDiscountScope] = useState<"base" | "overall">("base");
  const [editDiscountValue, setEditDiscountValue] = useState("");
  const [editDiscountLabel, setEditDiscountLabel] = useState("");

  function openEditDialog() {
    if (!inv) return;
    setEditBillingStart(inv.billing_period_start);
    setEditBillingEnd(inv.billing_period_end);
    setEditInvoiceDate(inv.invoice_date);
    setEditDueDate(inv.due_date);
    setEditRemarks(inv.remarks ?? "");
    setEditReason("");
    const rows: ChargeRow[] = (inv.line_items ?? []).map((li, idx) => ({
      id: idx + 1,
      description: li.description,
      locked: false,
      amount: li.original_amount ?? li.amount,
      discountType: (li.discount_type as ItemDiscountType) ?? "",
      discountValue: li.discount_value ?? "",
    }));
    setEditChargeRows(rows);
    editChargeIdRef.current = rows.length + 1;
    setEditDiscountType((inv.discount_type as DiscountType) ?? "");
    setEditDiscountScope(inv.discount_scope ?? "base");
    setEditDiscountValue(inv.discount_value ?? "");
    setEditDiscountLabel(inv.discount_label ?? "");
    setEditDialog(true);
  }

  function addEditChargeRow() {
    const id = editChargeIdRef.current++;
    setEditChargeRows((prev) => [...prev, { id, description: "", locked: false, amount: "", discountType: "", discountValue: "" }]);
  }
  function removeEditChargeRow(id: number) { setEditChargeRows((prev) => prev.filter((r) => r.id !== id)); }
  function updateEditChargeRow(id: number, patch: Partial<ChargeRow>) {
    setEditChargeRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  }

  const editMutation = useMutation({
    mutationFn: () =>
      invoicesService.update(id!, {
        billing_period_start: editBillingStart,
        billing_period_end: editBillingEnd,
        invoice_date: editInvoiceDate,
        due_date: editDueDate || undefined,
        remarks: editRemarks || undefined,
        change_reason: editReason,
        line_items: buildLineItems(editChargeRows),
        discount_type: editDiscountType || undefined,
        discount_value: editDiscountType && editDiscountValue ? editDiscountValue : undefined,
        discount_label: editDiscountLabel || undefined,
        discount_scope: editDiscountType ? editDiscountScope : undefined,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["invoices", id] });
      setEditDialog(false);
      showToast("Invoice updated", "success");
    },
    onError: (err) => showToast(getApiErrorMessage(err), "error"),
  });

  // ── Cancel dialog ────────────────────────────────────────────────────────
  const [cancelDialog, setCancelDialog] = useState(false);
  const [cancelReason, setCancelReason] = useState("");

  const cancelMutation = useMutation({
    mutationFn: () =>
      invoicesService.updateStatus(id!, "CANCELLED", cancelReason),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["invoices", id] });
      setCancelDialog(false);
      showToast("Invoice cancelled", "success");
    },
    onError: (err) => showToast(getApiErrorMessage(err), "error"),
  });

  // ── Record payment dialog ────────────────────────────────────────────────
  const [payDialog, setPayDialog] = useState(false);
  const [payAmount, setPayAmount] = useState("");
  const [payDate, setPayDate] = useState(
    new Date().toISOString().split("T")[0]
  );
  const [payMethod, setPayMethod] = useState<PaymentMethod>("CASH");
  const [payRef, setPayRef] = useState("");
  const [payNotes, setPayNotes] = useState("");

  function openPayDialog() {
    if (!inv) return;
    setPayAmount(String(Number(inv.balance_amount).toFixed(2)));
    setPayDate(new Date().toISOString().split("T")[0]);
    setPayMethod("CASH");
    setPayRef("");
    setPayNotes("");
    setPayDialog(true);
  }

  const payMutation = useMutation({
    mutationFn: () =>
      paymentsService.record({
        invoice_id: id!,
        amount: payAmount,
        payment_date: payDate,
        payment_method: payMethod,
        transaction_reference: payRef || undefined,
        notes: payNotes || undefined,
      }),
    onSuccess: (p) => {
      qc.invalidateQueries({ queryKey: ["invoices", id] });
      qc.invalidateQueries({ queryKey: ["payments"] });
      setPayDialog(false);
      showToast(`Payment ${p.payment_number} recorded`, "success");
    },
    onError: (err) => showToast(getApiErrorMessage(err), "error"),
  });

  // ── Send email ───────────────────────────────────────────────────────────
  const sendEmailMutation = useMutation({
    mutationFn: () => invoicesService.sendEmail(id!),
    onSuccess: (res) => showToast(res.message, "success"),
    onError: (err) => showToast(getApiErrorMessage(err), "error"),
  });

  // ── PDF preview ──────────────────────────────────────────────────────────
  const [pdfBlobUrl, setPdfBlobUrl] = useState<string | null>(null);
  const [pdfLoading, setPdfLoading] = useState(false);

  async function fetchPdfBlob(): Promise<string> {
    const resp = await api.get(`/invoices/${id}/pdf`, { responseType: "blob" });
    const blob = new Blob([resp.data], { type: "application/pdf" });
    return URL.createObjectURL(blob);
  }

  async function loadPdfPreview() {
    if (pdfBlobUrl) return;
    setPdfLoading(true);
    try {
      setPdfBlobUrl(await fetchPdfBlob());
    } catch {
      showToast("Failed to load PDF preview", "error");
    } finally {
      setPdfLoading(false);
    }
  }

  async function downloadPdf() {
    try {
      const url = await fetchPdfBlob();
      const a = document.createElement("a");
      a.href = url;
      a.download = `${inv?.invoice_number ?? "invoice"}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch {
      showToast("Failed to download PDF", "error");
    }
  }

  // ── Active tab ───────────────────────────────────────────────────────────
  const [tab, setTab] = useState<"payments" | "history" | "preview">("payments");

  if (isLoading || !inv) {
    return (
      <AppLayout title="Invoice" portalLabel="Administration">
        <div className="flex h-64 items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      </AppLayout>
    );
  }

  const isEditable =
    EDITABLE_STATUSES.includes(inv.status) &&
    !inv.is_locked &&
    Number(inv.paid_amount) === 0;
  const canPay =
    inv.status !== "CANCELLED" &&
    inv.status !== "PAID" &&
    Number(inv.balance_amount) > 0;
  const canCancel = inv.status !== "CANCELLED";

  return (
    <AppLayout title="Invoice Details" portalLabel="Administration">
      <div className="mx-auto max-w-5xl space-y-6">
        {/* ── Header ─────────────────────────────────────────────────────── */}
        <div className="flex flex-wrap items-start justify-between gap-4">
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
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="font-mono text-xl font-bold text-foreground">
                  {inv.invoice_number}
                </h2>
                <span
                  className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${INVOICE_STATUS_COLORS[inv.status]}`}
                >
                  {INVOICE_STATUS_LABELS[inv.status]}
                </span>
                {inv.is_locked && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-orange-100 px-2.5 py-0.5 text-xs font-medium text-orange-700">
                    <Lock className="h-3 w-3" />
                    Locked
                  </span>
                )}
              </div>
              <p className="mt-0.5 text-sm text-muted-foreground">
                {inv.customer_name_snapshot} · {inv.connection_name_snapshot}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {isEditable && canEditInvoice && (
              <Button variant="outline" size="sm" onClick={openEditDialog}>
                <Edit2 className="mr-1.5 h-4 w-4" />
                Edit
              </Button>
            )}
            <Button variant="outline" size="sm" onClick={downloadPdf}>
              <Download className="mr-1.5 h-4 w-4" />
              PDF
            </Button>
            {inv.customer_email_snapshot && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => sendEmailMutation.mutate()}
                disabled={sendEmailMutation.isPending}
              >
                {sendEmailMutation.isPending
                  ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                  : <Mail className="mr-1.5 h-4 w-4" />}
                Send Email
              </Button>
            )}
            {canPay && canAddPayment && (
              <Button size="sm" onClick={openPayDialog}>
                <IndianRupee className="mr-1.5 h-4 w-4" />
                Record Payment
              </Button>
            )}
            {canCancel && canEditInvoice && (
              <Button
                variant="outline"
                size="sm"
                className="text-red-600 hover:text-red-700"
                onClick={() => {
                  setCancelReason("");
                  setCancelDialog(true);
                }}
              >
                <Ban className="mr-1.5 h-4 w-4" />
                Cancel
              </Button>
            )}
          </div>
        </div>

        {/* ── Main grid ──────────────────────────────────────────────────── */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          {/* Left 2 cols */}
          <div className="space-y-6 lg:col-span-2">
            {/* Company + Customer */}
            <Card>
              <CardContent className="pt-6">
                <div className="grid grid-cols-2 gap-6">
                  <div className="space-y-3">
                    <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      Company
                    </p>
                    <div className="space-y-1">
                      <p className="font-semibold text-foreground">
                        {inv.company_name_snapshot}
                      </p>
                      {inv.gst_number_snapshot && (
                        <p className="text-xs text-muted-foreground">
                          GSTIN: {inv.gst_number_snapshot}
                        </p>
                      )}
                      {inv.pan_number_snapshot && (
                        <p className="text-xs text-muted-foreground">
                          PAN: {inv.pan_number_snapshot}
                        </p>
                      )}
                      {inv.company_address_snapshot && (
                        <p className="text-xs text-muted-foreground">
                          {inv.company_address_snapshot}
                        </p>
                      )}
                      {inv.support_email_snapshot && (
                        <p className="text-xs text-muted-foreground">
                          {inv.support_email_snapshot}
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="space-y-3">
                    <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      Billed To
                    </p>
                    <div className="space-y-1">
                      {inv.customer_type_snapshot === "BUSINESS" && inv.customer_company_snapshot ? (
                        <>
                          <p className="font-semibold text-foreground">
                            {inv.customer_company_snapshot}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            Contact: {inv.customer_name_snapshot}
                          </p>
                        </>
                      ) : (
                        <p className="font-semibold text-foreground">
                          {inv.customer_name_snapshot}
                        </p>
                      )}
                      <p className="font-mono text-xs text-muted-foreground">
                        {inv.customer_code_snapshot}
                      </p>
                      {inv.customer_gst_snapshot && (
                        <p className="text-xs font-medium text-foreground">
                          GSTIN: <span className="font-mono">{inv.customer_gst_snapshot}</span>
                        </p>
                      )}
                      {inv.installation_address_snapshot && (
                        <p className="text-xs text-muted-foreground">
                          {inv.installation_address_snapshot}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Plan info */}
            <Card>
              <CardContent className="pt-6">
                <p className="mb-4 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Service Details
                </p>
                <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
                  <InfoRow
                    label="Connection"
                    value={
                      <span className="font-mono">
                        {inv.connection_name_snapshot}
                      </span>
                    }
                  />
                  <InfoRow label="Plan" value={inv.plan_name_snapshot} />
                  <InfoRow
                    label="Speed"
                    value={`${inv.speed_mbps_snapshot} Mbps`}
                  />
                  <InfoRow
                    label="Data Policy"
                    value={inv.data_policy_snapshot}
                  />
                  <InfoRow
                    label="Billing Cycle"
                    value={inv.billing_cycle_snapshot.replace(/_/g, " ")}
                  />
                  <InfoRow
                    label="Billing Period"
                    value={`${fmtDateShort(inv.billing_period_start)} – ${fmtDateShort(inv.billing_period_end)}`}
                  />
                </div>
              </CardContent>
            </Card>

            {/* Pricing */}
            <Card>
              <CardContent className="pt-6">
                <p className="mb-4 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Pricing Breakdown
                </p>
                <table className="w-full text-sm">
                  <tbody className="divide-y divide-border">
                    <tr>
                      <td className="py-2 text-muted-foreground">Plan Base Amount</td>
                      <td className="py-2 text-right font-medium">
                        {fmtMoney(inv.base_amount)}
                      </td>
                    </tr>
                    {/* Base-scope discount shows before GST */}
                    {Number(inv.discount_amount) > 0 && inv.discount_scope !== "overall" && (
                      <>
                        <tr>
                          <td className="py-2 text-accent">
                            {inv.discount_type === "percentage"
                              ? `Discount (${inv.discount_value}%) — Base`
                              : "Discount — Base"}
                            {inv.discount_label ? ` · ${inv.discount_label}` : ""}
                          </td>
                          <td className="py-2 text-right font-medium text-accent">
                            −{fmtMoney(inv.discount_amount)}
                          </td>
                        </tr>
                        <tr className="text-xs text-muted-foreground">
                          <td className="py-1.5">Taxable Base</td>
                          <td className="py-1.5 text-right">
                            {fmtMoney(Number(inv.base_amount) - Number(inv.discount_amount))}
                          </td>
                        </tr>
                      </>
                    )}
                    <tr>
                      <td className="py-2 text-muted-foreground">
                        GST ({inv.gst_percentage}%)
                      </td>
                      <td className="py-2 text-right font-medium">
                        {fmtMoney(inv.gst_amount)}
                      </td>
                    </tr>
                    {inv.line_items && inv.line_items.map((item, i) => (
                      <tr key={i}>
                        <td className="py-2 text-muted-foreground">{item.description}</td>
                        <td className="py-2 text-right font-medium">{fmtMoney(item.amount)}</td>
                      </tr>
                    ))}
                    {/* Overall-scope discount shows after all items, before total */}
                    {Number(inv.discount_amount) > 0 && inv.discount_scope === "overall" && (
                      <tr>
                        <td className="py-2 text-accent">
                          {inv.discount_type === "percentage"
                            ? `Discount (${inv.discount_value}%) — Overall`
                            : "Discount — Overall"}
                          {inv.discount_label ? ` · ${inv.discount_label}` : ""}
                        </td>
                        <td className="py-2 text-right font-medium text-accent">
                          −{fmtMoney(inv.discount_amount)}
                        </td>
                      </tr>
                    )}
                    <tr className="font-semibold">
                      <td className="py-2 text-foreground">Total Amount</td>
                      <td className="py-2 text-right text-base font-bold text-primary">
                        {fmtMoney(inv.total_amount)}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </CardContent>
            </Card>
          </div>

          {/* Right sidebar */}
          <div className="space-y-4">
            {/* Invoice dates */}
            <Card>
              <CardContent className="space-y-3 pt-6">
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Invoice Info
                </p>
                <InfoRow label="Invoice Date" value={fmtDate(inv.invoice_date)} />
                <InfoRow label="Due Date" value={fmtDate(inv.due_date)} />
                <InfoRow label="Version" value={`v${inv.version_number}`} />
                {inv.edited_count > 0 && (
                  <InfoRow
                    label="Edited"
                    value={`${inv.edited_count} time${inv.edited_count !== 1 ? "s" : ""}`}
                  />
                )}
                {inv.remarks && (
                  <div>
                    <p className="text-xs text-muted-foreground">Remarks</p>
                    <p className="text-sm text-foreground">{inv.remarks}</p>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Payment summary */}
            <Card>
              <CardContent className="space-y-3 pt-6">
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Payment Summary
                </p>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Total</span>
                    <span className="font-medium">
                      {fmtMoney(inv.total_amount)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Paid</span>
                    <span className="font-medium text-green-600">
                      {fmtMoney(inv.paid_amount)}
                    </span>
                  </div>
                  <div className="flex justify-between border-t border-border pt-2">
                    <span className="font-semibold">Balance Due</span>
                    <span
                      className={`font-bold ${
                        Number(inv.balance_amount) > 0
                          ? "text-red-600"
                          : "text-green-600"
                      }`}
                    >
                      {fmtMoney(inv.balance_amount)}
                    </span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>

        {/* ── Tabs: Payments + History ─────────────────────────────────── */}
        <Card>
          <div className="flex border-b border-border">
            {(["payments", "history", "preview"] as const).map((t) => (
              <button
                key={t}
                onClick={() => {
                  setTab(t);
                  if (t === "preview") loadPdfPreview();
                }}
                className={`px-5 py-3 text-sm font-medium capitalize transition-colors ${
                  tab === t
                    ? "border-b-2 border-primary text-primary"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {t === "payments"
                  ? `Payments (${inv.payments.length})`
                  : t === "history"
                  ? `Change History (${inv.change_logs.length})`
                  : "PDF Preview"}
              </button>
            ))}
          </div>
          <CardContent className="p-0">
            {tab === "payments" ? (
              inv.payments.length === 0 ? (
                <div className="flex flex-col items-center gap-2 py-12 text-center">
                  <IndianRupee className="h-8 w-8 text-muted-foreground/40" />
                  <p className="text-sm text-muted-foreground">
                    No payments recorded yet.
                  </p>
                </div>
              ) : (
                <table className="w-full text-sm">
                  <thead className="border-b border-border bg-muted/30">
                    <tr>
                      <th className="px-4 py-3 text-left font-medium text-muted-foreground">
                        Payment No.
                      </th>
                      <th className="px-4 py-3 text-left font-medium text-muted-foreground">
                        Date
                      </th>
                      <th className="px-4 py-3 text-left font-medium text-muted-foreground">
                        Method
                      </th>
                      <th className="px-4 py-3 text-left font-medium text-muted-foreground">
                        Reference
                      </th>
                      <th className="px-4 py-3 text-right font-medium text-muted-foreground">
                        Amount
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {inv.payments.map((p) => (
                      <tr key={p.id} className="hover:bg-muted/20">
                        <td className="px-4 py-3 font-mono font-medium text-primary">
                          {p.payment_number}
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">
                          {fmtDateShort(p.payment_date)}
                        </td>
                        <td className="px-4 py-3">
                          <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700">
                            {PAYMENT_METHOD_LABELS[p.payment_method as PaymentMethod] ?? p.payment_method}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">
                          {p.transaction_reference ?? "—"}
                        </td>
                        <td className="px-4 py-3 text-right font-semibold text-green-600">
                          {fmtMoney(p.amount)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )
            ) : tab === "preview" ? (
              <div className="p-4">
                {pdfLoading ? (
                  <div className="flex h-64 items-center justify-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="h-5 w-5 animate-spin text-primary" />
                    Loading PDF preview…
                  </div>
                ) : pdfBlobUrl ? (
                  <iframe
                    src={pdfBlobUrl}
                    title="Invoice PDF Preview"
                    className="h-[820px] w-full rounded-lg border border-border"
                  />
                ) : (
                  <div className="flex h-64 items-center justify-center text-sm text-muted-foreground">
                    Click "PDF Preview" to load the document.
                  </div>
                )}
              </div>
            ) : inv.change_logs.length === 0 ? (
              <div className="py-12 text-center text-sm text-muted-foreground">
                No change history yet.
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead className="border-b border-border bg-muted/30">
                  <tr>
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground">
                      Type
                    </th>
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground">
                      Reason
                    </th>
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground">
                      Changed At
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {[...inv.change_logs]
                    .sort(
                      (a, b) =>
                        new Date(b.created_at).getTime() -
                        new Date(a.created_at).getTime()
                    )
                    .map((log) => (
                      <tr key={log.id} className="hover:bg-muted/20">
                        <td className="px-4 py-3">
                          <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium">
                            {log.change_type.replace(/_/g, " ")}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">
                          {log.change_reason ?? "—"}
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">
                          {fmtDateTime(log.created_at)}
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ── Edit Dialog ────────────────────────────────────────────────── */}
      <Dialog open={editDialog} onClose={() => setEditDialog(false)} title="Edit Invoice">
        <div className="max-h-[80vh] space-y-5 overflow-y-auto pr-1">

          {/* Dates */}
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Billing Period & Dates</p>
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium">Billing Period Start</label>
                <input type="date" value={editBillingStart}
                  onChange={(e) => setEditBillingStart(e.target.value)}
                  className="rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium">Billing Period End</label>
                <input type="date" value={editBillingEnd}
                  onChange={(e) => setEditBillingEnd(e.target.value)}
                  className="rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium">Invoice Date</label>
                <input type="date" value={editInvoiceDate}
                  onChange={(e) => setEditInvoiceDate(e.target.value)}
                  className="rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium">Due Date</label>
                <input type="date" value={editDueDate}
                  onChange={(e) => setEditDueDate(e.target.value)}
                  className="rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                />
              </div>
            </div>
          </div>

          {/* Additional charges */}
          <div>
            <div className="mb-2 flex items-center justify-between">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Additional Charges</p>
              <Button variant="outline" size="sm" type="button" onClick={addEditChargeRow}>
                <Plus className="mr-1.5 h-3.5 w-3.5" />Add Row
              </Button>
            </div>
            {editChargeRows.length === 0 ? (
              <p className="rounded-lg border border-dashed border-border py-4 text-center text-sm text-muted-foreground">
                No additional charges. Click "Add Row" to add one.
              </p>
            ) : (
              <div className="space-y-2">
                {editChargeRows.map((row) => (
                  <EditChargeRowUI key={row.id} row={row}
                    onUpdate={(patch) => updateEditChargeRow(row.id, patch)}
                    onRemove={() => removeEditChargeRow(row.id)}
                  />
                ))}
              </div>
            )}
          </div>

          {/* Invoice-level discount */}
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Invoice Discount</p>
            <div className="flex flex-wrap items-center gap-2">
              {(["", "percentage", "fixed"] as DiscountType[]).map((v) => (
                <button key={v} type="button"
                  onClick={() => { setEditDiscountType(v); setEditDiscountValue(""); }}
                  className={`rounded border px-3 py-1.5 text-xs font-semibold transition-colors ${editDiscountType === v ? "border-primary bg-primary text-white" : "border-border bg-muted/40 text-foreground hover:bg-muted"}`}
                >
                  {v === "" ? "None" : v === "percentage" ? "% Percentage" : "₹ Fixed"}
                </button>
              ))}
            </div>
            {editDiscountType && (
              <div className="mt-3 grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-medium">Discount Scope</label>
                  <select value={editDiscountScope} onChange={(e) => setEditDiscountScope(e.target.value as "base" | "overall")}
                    className="rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30">
                    <option value="base">On base plan price only</option>
                    <option value="overall">On overall total</option>
                  </select>
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-medium">Discount Value</label>
                  <div className="relative">
                    <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                      {editDiscountType === "percentage" ? "%" : "₹"}
                    </span>
                    <input type="number" min="0" max={editDiscountType === "percentage" ? "100" : undefined} step="0.01"
                      value={editDiscountValue} onChange={(e) => setEditDiscountValue(e.target.value)}
                      placeholder="0"
                      className="w-full rounded-lg border border-input bg-background py-2 pl-8 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                    />
                  </div>
                </div>
                <div className="col-span-2 flex flex-col gap-1">
                  <label className="text-xs font-medium">Discount Label (optional)</label>
                  <input type="text" value={editDiscountLabel} onChange={(e) => setEditDiscountLabel(e.target.value)}
                    placeholder="e.g. Loyalty discount, Promo"
                    className="rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                  />
                </div>
              </div>
            )}
          </div>

          {/* Remarks */}
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium">Remarks</label>
            <textarea value={editRemarks} onChange={(e) => setEditRemarks(e.target.value)}
              rows={2}
              className="w-full resize-none rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
          </div>

          {/* Reason */}
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium">
              Reason for Edit <span className="text-red-500">*</span>
            </label>
            <input type="text" value={editReason} onChange={(e) => setEditReason(e.target.value)}
              placeholder="e.g. Correcting billing period dates"
              className="rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
          </div>

          <div className="flex justify-end gap-3 border-t border-border pt-3">
            <Button variant="outline" onClick={() => setEditDialog(false)} disabled={editMutation.isPending}>
              Cancel
            </Button>
            <Button onClick={() => editMutation.mutate()} disabled={!editReason.trim() || editMutation.isPending}>
              {editMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Save Changes
            </Button>
          </div>
        </div>
      </Dialog>

      {/* ── Cancel Dialog ─────────────────────────────────────────────── */}
      <Dialog
        open={cancelDialog}
        onClose={() => setCancelDialog(false)}
        title="Cancel Invoice"
      >
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            This will cancel invoice{" "}
            <span className="font-mono font-semibold text-foreground">
              {inv.invoice_number}
            </span>
            . Cancelled invoices cannot accept further payments.
          </p>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium">
              Cancellation Reason <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
              placeholder="e.g. Wrong subscription, duplicate"
              className="rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
          </div>
          <div className="flex justify-end gap-3">
            <Button
              variant="outline"
              onClick={() => setCancelDialog(false)}
              disabled={cancelMutation.isPending}
            >
              Back
            </Button>
            <Button
              className="bg-red-600 hover:bg-red-700"
              onClick={() => cancelMutation.mutate()}
              disabled={!cancelReason.trim() || cancelMutation.isPending}
            >
              {cancelMutation.isPending && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              Cancel Invoice
            </Button>
          </div>
        </div>
      </Dialog>

      {/* ── Record Payment Dialog ─────────────────────────────────────── */}
      <Dialog
        open={payDialog}
        onClose={() => setPayDialog(false)}
        title="Record Payment"
        fullscreen
      >
        <div className="mx-auto w-full max-w-2xl space-y-6">
          {/* Invoice summary banner */}
          <div className="rounded-xl border border-border bg-muted/30 px-5 py-4">
            <div className="grid grid-cols-2 gap-4 text-sm sm:grid-cols-4">
              <div>
                <p className="text-xs text-muted-foreground">Invoice #</p>
                <p className="font-mono font-semibold">{inv.invoice_number}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Total</p>
                <p className="font-semibold">₹{fmtMoney(inv.total_amount)}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Paid</p>
                <p className="font-semibold text-green-600">₹{fmtMoney(inv.paid_amount)}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Balance Due</p>
                <p className="text-base font-bold text-red-600">₹{fmtMoney(inv.balance_amount)}</p>
              </div>
            </div>
          </div>

          {/* Form fields */}
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium">
                Amount <span className="text-red-500">*</span>
              </label>
              <input
                type="number"
                step="0.01"
                min="0.01"
                value={payAmount}
                onChange={(e) => setPayAmount(e.target.value)}
                className="rounded-lg border border-input bg-background px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium">
                Payment Date <span className="text-red-500">*</span>
              </label>
              <input
                type="date"
                value={payDate}
                onChange={(e) => setPayDate(e.target.value)}
                className="rounded-lg border border-input bg-background px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium">Payment Method</label>
              <select
                value={payMethod}
                onChange={(e) => setPayMethod(e.target.value as PaymentMethod)}
                className="w-full rounded-lg border border-input bg-background px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
              >
                <option value="CASH">Cash</option>
                <option value="UPI">UPI</option>
                <option value="BANK_TRANSFER">Bank Transfer</option>
                <option value="CHEQUE">Cheque</option>
              </select>
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium">Transaction Reference</label>
              <input
                type="text"
                value={payRef}
                onChange={(e) => setPayRef(e.target.value)}
                placeholder="UTR / Cheque No. / etc."
                className="rounded-lg border border-input bg-background px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium">Notes</label>
            <textarea
              value={payNotes}
              onChange={(e) => setPayNotes(e.target.value)}
              rows={4}
              placeholder="Optional notes about this payment…"
              className="w-full resize-none rounded-lg border border-input bg-background px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
          </div>

          <div className="flex items-center justify-end gap-3 border-t border-border pt-4">
            <Button
              variant="outline"
              onClick={() => setPayDialog(false)}
              disabled={payMutation.isPending}
            >
              Cancel
            </Button>
            <Button
              onClick={() => payMutation.mutate()}
              disabled={
                !payAmount || Number(payAmount) <= 0 || payMutation.isPending
              }
            >
              {payMutation.isPending && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              Record Payment
            </Button>
          </div>
        </div>
      </Dialog>
    </AppLayout>
  );
}
