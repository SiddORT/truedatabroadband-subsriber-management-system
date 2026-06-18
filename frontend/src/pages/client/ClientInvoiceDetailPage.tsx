import { useNavigate, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  AlertCircle,
  ArrowLeft,
  Download,
  FileText,
} from "lucide-react";

import { ClientLayout } from "@/layouts/ClientLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { clientService } from "@/services/client";
import type { ClientInvoiceDetail } from "@/types/client";
import { PAYMENT_METHOD_LABELS, type PaymentMethod } from "@/types/payment";

const INVOICE_STATUS_COLORS: Record<string, string> = {
  DRAFT: "bg-gray-100 text-gray-600",
  UNPAID: "bg-amber-100 text-amber-700",
  PARTIALLY_PAID: "bg-blue-100 text-blue-700",
  PAID: "bg-emerald-100 text-emerald-700",
  OVERDUE: "bg-red-100 text-red-700",
  CANCELLED: "bg-gray-200 text-gray-500",
};
const INVOICE_STATUS_LABELS: Record<string, string> = {
  DRAFT: "Draft",
  UNPAID: "Unpaid",
  PARTIALLY_PAID: "Partially Paid",
  PAID: "Paid",
  OVERDUE: "Overdue",
  CANCELLED: "Cancelled",
};

function fmtMoney(n: string | number | null | undefined) {
  if (n === null || n === undefined) return "₹0.00";
  return `₹${Number(n).toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function fmtDate(d: string | null | undefined) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function RowSkeleton() {
  return (
    <div className="animate-pulse space-y-3">
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className="flex justify-between">
          <div className="h-4 w-32 rounded bg-muted" />
          <div className="h-4 w-24 rounded bg-muted" />
        </div>
      ))}
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between py-2 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium text-foreground">{value}</span>
    </div>
  );
}

export function ClientInvoiceDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data: invoice, isLoading, isError } = useQuery<ClientInvoiceDetail>({
    queryKey: ["client-invoice-detail", id],
    queryFn: () => clientService.getInvoiceDetail(id!),
    enabled: !!id,
  });

  if (isError) {
    return (
      <ClientLayout title="Invoice Detail">
        <div className="flex flex-col items-center justify-center gap-3 py-24 text-center">
          <AlertCircle className="h-10 w-10 text-red-500" />
          <p className="text-lg font-semibold text-foreground">Invoice not found</p>
          <p className="text-sm text-muted-foreground">
            This invoice doesn't exist or you don't have access to it.
          </p>
          <Button variant="outline" onClick={() => navigate("/client/billing/invoices")}>
            <ArrowLeft className="mr-1.5 h-4 w-4" />
            Back to Invoices
          </Button>
        </div>
      </ClientLayout>
    );
  }

  const isOverdue = invoice?.status === "OVERDUE";
  const isPaid = invoice?.status === "PAID";

  return (
    <ClientLayout title="Invoice Detail">
      <div className="space-y-5">
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={() => navigate("/client/billing/invoices")}>
              <ArrowLeft className="mr-1 h-4 w-4" />
              Back
            </Button>
            {invoice && (
              <span
                className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${INVOICE_STATUS_COLORS[invoice.status] ?? "bg-gray-100 text-gray-600"}`}
              >
                {INVOICE_STATUS_LABELS[invoice.status] ?? invoice.status}
              </span>
            )}
          </div>

          {/* Actions */}
          <div className="flex gap-2">
            <a
              href={clientService.invoicePdfUrl(id!)}
              target="_blank"
              rel="noopener noreferrer"
            >
              <Button variant="outline" size="sm">
                <Download className="mr-1.5 h-4 w-4" />
                Download PDF
              </Button>
            </a>
          </div>
        </div>

        {/* Invoice info card */}
        <Card>
          <CardHeader className="border-b border-border px-5 py-3.5">
            <div className="flex items-center gap-2">
              <FileText className="h-4 w-4 text-muted-foreground" />
              <CardTitle className="text-sm font-semibold">
                {isLoading ? "Loading…" : invoice?.invoice_number}
              </CardTitle>
            </div>
          </CardHeader>
          <CardContent className="divide-y divide-border px-5 py-0">
            {isLoading ? (
              <div className="py-4">
                <RowSkeleton />
              </div>
            ) : (
              <>
                <DetailRow label="Invoice Number" value={<span className="font-mono">{invoice!.invoice_number}</span>} />
                <DetailRow label="Invoice Date" value={fmtDate(invoice!.invoice_date)} />
                <DetailRow
                  label="Due Date"
                  value={
                    <span className={isOverdue ? "text-red-600" : ""}>
                      {fmtDate(invoice!.due_date)}
                    </span>
                  }
                />
                <DetailRow
                  label="Status"
                  value={
                    <span
                      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${INVOICE_STATUS_COLORS[invoice!.status] ?? ""}`}
                    >
                      {INVOICE_STATUS_LABELS[invoice!.status] ?? invoice!.status}
                    </span>
                  }
                />
              </>
            )}
          </CardContent>
        </Card>

        {/* Connection info card */}
        <Card>
          <CardHeader className="border-b border-border px-5 py-3.5">
            <CardTitle className="text-sm font-semibold">Connection Information</CardTitle>
          </CardHeader>
          <CardContent className="divide-y divide-border px-5 py-0">
            {isLoading ? (
              <div className="py-4">
                <RowSkeleton />
              </div>
            ) : (
              <>
                <DetailRow label="Connection Name" value={invoice!.connection_name ?? "—"} />
                <DetailRow label="Plan" value={invoice!.plan_name} />
                <DetailRow
                  label="Billing Period"
                  value={`${fmtDate(invoice!.billing_period_start)} – ${fmtDate(invoice!.billing_period_end)}`}
                />
              </>
            )}
          </CardContent>
        </Card>

        {/* Financial summary card */}
        <Card>
          <CardHeader className="border-b border-border px-5 py-3.5">
            <CardTitle className="text-sm font-semibold">Financial Summary</CardTitle>
          </CardHeader>
          <CardContent className="px-5 py-0">
            {isLoading ? (
              <div className="py-4">
                <RowSkeleton />
              </div>
            ) : (
              <>
                <div className="divide-y divide-border">
                  <DetailRow label="Subtotal (Base)" value={fmtMoney(invoice!.base_amount)} />
                  {Number(invoice!.discount_amount) > 0 && (
                    <DetailRow
                      label="Discount"
                      value={<span className="text-emerald-600">−{fmtMoney(invoice!.discount_amount)}</span>}
                    />
                  )}
                  <DetailRow
                    label={`GST (${Number(invoice!.gst_percentage).toFixed(0)}%)`}
                    value={fmtMoney(invoice!.gst_amount)}
                  />
                </div>
                <div className="mt-1 border-t-2 border-foreground/20 py-3">
                  <div className="flex items-baseline justify-between">
                    <span className="text-sm font-semibold text-foreground">Total</span>
                    <span className="text-lg font-bold text-foreground">{fmtMoney(invoice!.total_amount)}</span>
                  </div>
                  <div className="mt-1 flex items-baseline justify-between text-sm">
                    <span className="text-muted-foreground">Amount Paid</span>
                    <span className="font-medium text-emerald-600">{fmtMoney(invoice!.paid_amount)}</span>
                  </div>
                  <div className="mt-1 flex items-baseline justify-between text-sm">
                    <span className="font-semibold text-foreground">Balance Due</span>
                    <span className={`font-bold tabular-nums ${isPaid ? "text-emerald-600" : "text-red-600"}`}>
                      {fmtMoney(invoice!.balance_amount)}
                    </span>
                  </div>
                </div>
              </>
            )}
          </CardContent>
        </Card>

        {/* Payment history card */}
        <Card>
          <CardHeader className="border-b border-border px-5 py-3.5">
            <CardTitle className="text-sm font-semibold">Payment History</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="p-5">
                <RowSkeleton />
              </div>
            ) : (invoice?.payments ?? []).length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 text-center">
                <p className="text-sm text-muted-foreground">No payments recorded yet.</p>
              </div>
            ) : (
              <div className="divide-y divide-border">
                {invoice!.payments.map((pay) => (
                  <div key={pay.id} className="flex items-center justify-between gap-3 px-5 py-3">
                    <div>
                      <p className="font-mono text-sm font-semibold text-foreground">{pay.payment_number}</p>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {fmtDate(pay.payment_date)} ·{" "}
                        {PAYMENT_METHOD_LABELS[pay.payment_method as PaymentMethod] ?? pay.payment_method}
                        {pay.transaction_reference && ` · Ref: ${pay.transaction_reference}`}
                      </p>
                    </div>
                    <span className="text-sm font-bold text-emerald-600 tabular-nums">
                      {fmtMoney(pay.amount)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

    </ClientLayout>
  );
}
