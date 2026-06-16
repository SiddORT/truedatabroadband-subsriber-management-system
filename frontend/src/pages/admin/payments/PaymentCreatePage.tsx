import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useMutation, useQuery } from "@tanstack/react-query";
import { ArrowLeft, Loader2 } from "lucide-react";

import { AppLayout } from "@/layouts/AppLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useToast } from "@/contexts/ToastContext";
import { paymentsService } from "@/services/payments";
import { invoicesService } from "@/services/invoices";
import { getApiErrorMessage } from "@/services/api";
import { INVOICE_STATUS_LABELS } from "@/types/invoice";
import type { PaymentMethod } from "@/types/payment";

function fmtMoney(n: string | number) {
  return `₹${Number(n).toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export function PaymentCreatePage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { showToast } = useToast();

  const preselectedInvoiceId = searchParams.get("invoice_id") ?? "";

  const [invoiceId, setInvoiceId] = useState(preselectedInvoiceId);
  const [amount, setAmount] = useState("");
  const [payDate, setPayDate] = useState(
    new Date().toISOString().split("T")[0]
  );
  const [payMethod, setPayMethod] = useState<PaymentMethod>("CASH");
  const [txRef, setTxRef] = useState("");
  const [notes, setNotes] = useState("");

  // Fetch unpaid/partial invoices for dropdown
  const { data: invoicesData, isLoading: invLoading } = useQuery({
    queryKey: ["invoices-for-payment"],
    queryFn: () =>
      invoicesService.list({
        page: 1,
        page_size: 100,
        sort_by: "invoice_date",
        sort_order: "desc",
      }),
  });

  const payableInvoices = (invoicesData?.items ?? []).filter(
    (inv) =>
      inv.status !== "CANCELLED" &&
      inv.status !== "PAID" &&
      Number(inv.balance_amount) > 0
  );

  const selectedInvoice = payableInvoices.find((i) => i.id === invoiceId);

  // Auto-fill amount with balance
  function handleInvoiceSelect(id: string) {
    setInvoiceId(id);
    const inv = payableInvoices.find((i) => i.id === id);
    if (inv) setAmount(Number(inv.balance_amount).toFixed(2));
    else setAmount("");
  }

  const mutation = useMutation({
    mutationFn: () =>
      paymentsService.record({
        invoice_id: invoiceId,
        amount,
        payment_date: payDate,
        payment_method: payMethod,
        transaction_reference: txRef || undefined,
        notes: notes || undefined,
      }),
    onSuccess: (p) => {
      showToast(`Payment ${p.payment_number} recorded`, "success");
      navigate(`/admin/invoices/${invoiceId}`);
    },
    onError: (err) => showToast(getApiErrorMessage(err), "error"),
  });

  const canSubmit =
    !!invoiceId && !!amount && Number(amount) > 0 && !!payDate && !mutation.isPending;

  return (
    <AppLayout title="Record Payment" portalLabel="Administration">
      <div className="mx-auto max-w-xl space-y-6">
        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            size="sm"
            onClick={() => navigate("/admin/payments")}
          >
            <ArrowLeft className="mr-1.5 h-4 w-4" />
            Back
          </Button>
          <div>
            <h2 className="text-xl font-semibold text-foreground">
              Record Payment
            </h2>
            <p className="text-sm text-muted-foreground">
              Apply a cash receipt to an outstanding invoice.
            </p>
          </div>
        </div>

        <Card>
          <CardContent className="space-y-5 pt-6">
            {/* Invoice selection */}
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium">
                Invoice <span className="text-red-500">*</span>
              </label>
              {invLoading ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Loading…
                </div>
              ) : (
                <select
                  value={invoiceId}
                  onChange={(e) => handleInvoiceSelect(e.target.value)}
                  className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                >
                  <option value="">— Select an invoice —</option>
                  {payableInvoices.map((inv) => (
                    <option key={inv.id} value={inv.id}>
                      {inv.invoice_number} · {inv.customer_name_snapshot} ·
                      Balance {fmtMoney(inv.balance_amount)}
                    </option>
                  ))}
                </select>
              )}
              {selectedInvoice && (
                <div className="mt-1 rounded-lg bg-muted/40 px-4 py-3 text-sm space-y-1">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Status</span>
                    <span className="font-medium">
                      {INVOICE_STATUS_LABELS[selectedInvoice.status]}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Total</span>
                    <span>{fmtMoney(selectedInvoice.total_amount)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Paid</span>
                    <span className="text-green-600">
                      {fmtMoney(selectedInvoice.paid_amount)}
                    </span>
                  </div>
                  <div className="flex justify-between font-medium">
                    <span>Balance Due</span>
                    <span className="text-red-600">
                      {fmtMoney(selectedInvoice.balance_amount)}
                    </span>
                  </div>
                </div>
              )}
            </div>

            {/* Amount + date */}
            <div className="grid grid-cols-2 gap-4">
              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-medium">
                  Amount (₹) <span className="text-red-500">*</span>
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className="rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
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
                  className="rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                />
              </div>
            </div>

            {/* Method */}
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium">Payment Method</label>
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

            {/* Reference */}
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium">
                Transaction Reference
              </label>
              <input
                type="text"
                value={txRef}
                onChange={(e) => setTxRef(e.target.value)}
                placeholder="UTR / Cheque No. / UPI ID"
                className="rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
            </div>

            {/* Notes */}
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium">Notes</label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={2}
                placeholder="Optional notes"
                className="w-full resize-none rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
            </div>

            {/* Actions */}
            <div className="flex justify-end gap-3 pt-2">
              <Button
                variant="outline"
                onClick={() => navigate("/admin/payments")}
                disabled={mutation.isPending}
              >
                Cancel
              </Button>
              <Button onClick={() => mutation.mutate()} disabled={!canSubmit}>
                {mutation.isPending && (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                )}
                Record Payment
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}
