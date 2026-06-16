import { useState } from "react";
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
} from "lucide-react";

import { AppLayout } from "@/layouts/AppLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
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

export function InvoiceDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
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

  function openEditDialog() {
    if (!inv) return;
    setEditBillingStart(inv.billing_period_start);
    setEditBillingEnd(inv.billing_period_end);
    setEditInvoiceDate(inv.invoice_date);
    setEditDueDate(inv.due_date);
    setEditRemarks(inv.remarks ?? "");
    setEditReason("");
    setEditDialog(true);
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

  // ── PDF preview ──────────────────────────────────────────────────────────
  const [pdfBlobUrl, setPdfBlobUrl] = useState<string | null>(null);
  const [pdfLoading, setPdfLoading] = useState(false);

  async function loadPdfPreview() {
    if (pdfBlobUrl) return;
    setPdfLoading(true);
    try {
      const resp = await api.get(`/invoices/${id}/pdf`, { responseType: "blob" });
      const blob = new Blob([resp.data], { type: "application/pdf" });
      setPdfBlobUrl(URL.createObjectURL(blob));
    } catch {
      showToast("Failed to load PDF preview", "error");
    } finally {
      setPdfLoading(false);
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
            {isEditable && (
              <Button variant="outline" size="sm" onClick={openEditDialog}>
                <Edit2 className="mr-1.5 h-4 w-4" />
                Edit
              </Button>
            )}
            <a
              href={invoicesService.pdfUrl(inv.id)}
              target="_blank"
              rel="noopener noreferrer"
            >
              <Button variant="outline" size="sm">
                <Download className="mr-1.5 h-4 w-4" />
                PDF
              </Button>
            </a>
            {canPay && (
              <Button size="sm" onClick={openPayDialog}>
                <IndianRupee className="mr-1.5 h-4 w-4" />
                Record Payment
              </Button>
            )}
            {canCancel && (
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
                      <p className="font-semibold text-foreground">
                        {inv.customer_name_snapshot}
                      </p>
                      <p className="font-mono text-xs text-muted-foreground">
                        {inv.customer_code_snapshot}
                      </p>
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
                    {Number(inv.discount_amount) > 0 && (
                      <>
                        <tr>
                          <td className="py-2 text-accent">
                            {inv.discount_type === "percentage"
                              ? `Discount (${inv.discount_value}%)`
                              : "Discount"}
                            {inv.discount_label ? ` — ${inv.discount_label}` : ""}
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
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            You can only edit dates and remarks before any payment is recorded.
            A reason is required.
          </p>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium">Billing Period Start</label>
              <input
                type="date"
                value={editBillingStart}
                onChange={(e) => setEditBillingStart(e.target.value)}
                className="rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium">Billing Period End</label>
              <input
                type="date"
                value={editBillingEnd}
                onChange={(e) => setEditBillingEnd(e.target.value)}
                className="rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium">Invoice Date</label>
              <input
                type="date"
                value={editInvoiceDate}
                onChange={(e) => setEditInvoiceDate(e.target.value)}
                className="rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium">Due Date</label>
              <input
                type="date"
                value={editDueDate}
                onChange={(e) => setEditDueDate(e.target.value)}
                className="rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
            </div>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium">Remarks</label>
            <textarea
              value={editRemarks}
              onChange={(e) => setEditRemarks(e.target.value)}
              rows={2}
              className="w-full resize-none rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium">
              Reason for Edit <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={editReason}
              onChange={(e) => setEditReason(e.target.value)}
              placeholder="e.g. Correcting billing period dates"
              className="rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
          </div>
          <div className="flex justify-end gap-3">
            <Button
              variant="outline"
              onClick={() => setEditDialog(false)}
              disabled={editMutation.isPending}
            >
              Cancel
            </Button>
            <Button
              onClick={() => editMutation.mutate()}
              disabled={!editReason.trim() || editMutation.isPending}
            >
              {editMutation.isPending && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
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
      >
        <div className="space-y-4">
          <div className="rounded-lg bg-muted/40 px-4 py-3 text-sm">
            Balance due:{" "}
            <span className="font-bold text-red-600">
              {fmtMoney(inv.balance_amount)}
            </span>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium">
                Amount <span className="text-red-500">*</span>
              </label>
              <input
                type="number"
                step="0.01"
                min="0.01"
                value={payAmount}
                onChange={(e) => setPayAmount(e.target.value)}
                className="rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium">
                Payment Date <span className="text-red-500">*</span>
              </label>
              <input
                type="date"
                value={payDate}
                onChange={(e) => setPayDate(e.target.value)}
                className="rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
            </div>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium">Payment Method</label>
            <select
              value={payMethod}
              onChange={(e) => setPayMethod(e.target.value as PaymentMethod)}
              className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
            >
              <option value="CASH">Cash</option>
              <option value="UPI">UPI</option>
              <option value="BANK_TRANSFER">Bank Transfer</option>
              <option value="CHEQUE">Cheque</option>
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium">Transaction Reference</label>
            <input
              type="text"
              value={payRef}
              onChange={(e) => setPayRef(e.target.value)}
              placeholder="UTR / Cheque No. / etc."
              className="rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium">Notes</label>
            <textarea
              value={payNotes}
              onChange={(e) => setPayNotes(e.target.value)}
              rows={2}
              className="w-full resize-none rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
          </div>
          <div className="flex justify-end gap-3">
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
