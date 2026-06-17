import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  CreditCard,
  FileText,
  IndianRupee,
  TrendingUp,
} from "lucide-react";

import { ClientLayout } from "@/layouts/ClientLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { clientService } from "@/services/client";
import type { BillingSummary, ClientInvoiceListItem, ClientPaymentListItem } from "@/types/client";
import { PAYMENT_METHOD_LABELS, type PaymentMethod } from "@/types/payment";

const STATUS_COLORS: Record<string, string> = {
  DRAFT: "bg-gray-100 text-gray-600",
  UNPAID: "bg-amber-100 text-amber-700",
  PARTIALLY_PAID: "bg-blue-100 text-blue-700",
  PAID: "bg-emerald-100 text-emerald-700",
  OVERDUE: "bg-red-100 text-red-700",
  CANCELLED: "bg-gray-200 text-gray-500",
};
const STATUS_LABELS: Record<string, string> = {
  DRAFT: "Draft",
  UNPAID: "Unpaid",
  PARTIALLY_PAID: "Partial",
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

function KpiSkeleton() {
  return (
    <div className="animate-pulse">
      <div className="mb-2 h-3 w-24 rounded bg-muted" />
      <div className="h-7 w-32 rounded bg-muted" />
    </div>
  );
}

interface KpiCardProps {
  label: string;
  value: string;
  icon: React.ComponentType<{ className?: string }>;
  iconColor?: string;
  isLoading?: boolean;
  highlight?: "red" | "green" | "amber" | "none";
}

function KpiCard({ label, value, icon: Icon, iconColor = "text-primary", isLoading, highlight = "none" }: KpiCardProps) {
  const highlightCls =
    highlight === "red"
      ? "border-l-4 border-l-red-500"
      : highlight === "amber"
        ? "border-l-4 border-l-amber-500"
        : highlight === "green"
          ? "border-l-4 border-l-emerald-500"
          : "";

  return (
    <Card className={highlightCls}>
      <CardContent className="pt-5">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{label}</p>
            {isLoading ? (
              <KpiSkeleton />
            ) : (
              <p className="mt-1 text-2xl font-bold text-foreground">{value}</p>
            )}
          </div>
          <div className={`flex h-10 w-10 items-center justify-center rounded-xl bg-muted/50 ${iconColor}`}>
            <Icon className="h-5 w-5" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export function BillingOverviewPage() {
  const navigate = useNavigate();

  const { data: summary, isLoading: summaryLoading } = useQuery<BillingSummary>({
    queryKey: ["client-billing-summary"],
    queryFn: () => clientService.getBillingSummary(),
  });

  const { data: invoicesPage, isLoading: invLoading } = useQuery<{ items: ClientInvoiceListItem[]; total: number }>({
    queryKey: ["client-billing-outstanding"],
    queryFn: () =>
      clientService.listInvoices({ page: 1, page_size: 10, sort_by: "due_date", sort_order: "asc", overdue: false }),
  });

  const { data: paymentsPage, isLoading: payLoading } = useQuery<{ items: ClientPaymentListItem[]; total: number }>({
    queryKey: ["client-billing-recent-payments"],
    queryFn: () => clientService.listPayments({ page: 1, page_size: 5 }),
  });

  const outstanding = (invoicesPage?.items ?? []).filter((i) => Number(i.balance_amount) > 0);

  return (
    <ClientLayout title="Billing">
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold text-foreground">Billing Overview</h2>
            <p className="mt-0.5 text-sm text-muted-foreground">
              Your financial summary and outstanding balances.
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => navigate("/client/billing/invoices")}>
              <FileText className="mr-1.5 h-4 w-4" />
              Invoices
            </Button>
            <Button variant="outline" onClick={() => navigate("/client/billing/payments")}>
              <IndianRupee className="mr-1.5 h-4 w-4" />
              Payments
            </Button>
          </div>
        </div>

        {/* KPI grid */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
          <KpiCard
            label="Total Invoiced"
            value={fmtMoney(summary?.total_invoiced)}
            icon={TrendingUp}
            iconColor="text-primary"
            isLoading={summaryLoading}
          />
          <KpiCard
            label="Total Paid"
            value={fmtMoney(summary?.total_paid)}
            icon={CheckCircle2}
            iconColor="text-emerald-600"
            highlight="green"
            isLoading={summaryLoading}
          />
          <KpiCard
            label="Outstanding"
            value={fmtMoney(summary?.outstanding_amount)}
            icon={CreditCard}
            iconColor="text-amber-600"
            highlight={Number(summary?.outstanding_amount ?? 0) > 0 ? "amber" : "none"}
            isLoading={summaryLoading}
          />
          <KpiCard
            label="Overdue"
            value={fmtMoney(summary?.overdue_amount)}
            icon={AlertCircle}
            iconColor="text-red-600"
            highlight={Number(summary?.overdue_amount ?? 0) > 0 ? "red" : "none"}
            isLoading={summaryLoading}
          />
          <KpiCard
            label="Last Payment"
            value={fmtMoney(summary?.last_payment_amount)}
            icon={IndianRupee}
            iconColor="text-secondary"
            isLoading={summaryLoading}
          />
          <Card>
            <CardContent className="pt-5">
              <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Last Payment Date</p>
              {summaryLoading ? (
                <KpiSkeleton />
              ) : (
                <p className="mt-1 text-lg font-bold text-foreground">
                  {summary?.last_payment_date ? fmtDate(summary.last_payment_date) : "—"}
                </p>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Two-column lower section */}
        <div className="grid grid-cols-1 gap-6 xl:grid-cols-5">
          {/* Outstanding invoices */}
          <div className="xl:col-span-3">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between border-b border-border px-5 py-3.5">
                <CardTitle className="text-sm font-semibold">Outstanding Invoices</CardTitle>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-xs text-muted-foreground"
                  onClick={() => navigate("/client/billing/invoices?overdue=true")}
                >
                  View all <ArrowRight className="ml-1 h-3.5 w-3.5" />
                </Button>
              </CardHeader>
              <CardContent className="p-0">
                {invLoading ? (
                  <div className="space-y-3 p-5">
                    {[0, 1, 2].map((i) => (
                      <div key={i} className="animate-pulse">
                        <div className="h-4 w-full rounded bg-muted" />
                      </div>
                    ))}
                  </div>
                ) : outstanding.length === 0 ? (
                  <div className="flex flex-col items-center justify-center gap-2 py-12 text-center">
                    <CheckCircle2 className="h-8 w-8 text-emerald-500" />
                    <p className="text-sm font-medium text-foreground">No outstanding invoices</p>
                    <p className="text-xs text-muted-foreground">You're all caught up!</p>
                  </div>
                ) : (
                  <div className="divide-y divide-border">
                    {outstanding.map((inv) => {
                      const isOverdue = inv.status === "OVERDUE";
                      const dueDate = new Date(inv.due_date);
                      const today = new Date();
                      today.setHours(0, 0, 0, 0);
                      dueDate.setHours(0, 0, 0, 0);
                      const diffDays = Math.floor((today.getTime() - dueDate.getTime()) / 86400000);
                      const dueSoon =
                        !isOverdue && diffDays >= -7 && diffDays < 0;

                      return (
                        <div key={inv.id} className="flex items-center justify-between gap-3 px-5 py-3">
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <span className="font-mono text-sm font-semibold text-primary">
                                {inv.invoice_number}
                              </span>
                              <span
                                className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_COLORS[inv.status] ?? "bg-gray-100 text-gray-600"}`}
                              >
                                {STATUS_LABELS[inv.status] ?? inv.status}
                              </span>
                            </div>
                            <p className="mt-0.5 truncate text-xs text-muted-foreground">
                              Due {fmtDate(inv.due_date)}
                              {isOverdue && diffDays > 0 && (
                                <span className="ml-1 text-red-600">({diffDays}d overdue)</span>
                              )}
                              {dueSoon && (
                                <span className="ml-1 text-amber-600">(due soon)</span>
                              )}
                            </p>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-semibold text-red-600 tabular-nums">
                              {fmtMoney(inv.balance_amount)}
                            </span>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => navigate(`/client/billing/invoices/${inv.id}`)}
                            >
                              View
                            </Button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Recent payments */}
          <div className="xl:col-span-2">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between border-b border-border px-5 py-3.5">
                <CardTitle className="text-sm font-semibold">Recent Payments</CardTitle>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-xs text-muted-foreground"
                  onClick={() => navigate("/client/billing/payments")}
                >
                  View all <ArrowRight className="ml-1 h-3.5 w-3.5" />
                </Button>
              </CardHeader>
              <CardContent className="p-0">
                {payLoading ? (
                  <div className="space-y-3 p-5">
                    {[0, 1, 2].map((i) => (
                      <div key={i} className="animate-pulse">
                        <div className="h-4 w-full rounded bg-muted" />
                      </div>
                    ))}
                  </div>
                ) : (paymentsPage?.items ?? []).length === 0 ? (
                  <div className="flex flex-col items-center justify-center gap-2 py-12 text-center">
                    <IndianRupee className="h-8 w-8 text-muted-foreground" />
                    <p className="text-sm text-muted-foreground">No payment history found.</p>
                  </div>
                ) : (
                  <div className="divide-y divide-border">
                    {(paymentsPage?.items ?? []).map((pay) => (
                      <div key={pay.id} className="flex items-center justify-between gap-2 px-5 py-3">
                        <div className="min-w-0 flex-1">
                          <p className="font-mono text-sm font-semibold text-foreground">{pay.payment_number}</p>
                          <p className="mt-0.5 text-xs text-muted-foreground">
                            {fmtDate(pay.payment_date)} ·{" "}
                            {PAYMENT_METHOD_LABELS[pay.payment_method as PaymentMethod] ?? pay.payment_method}
                          </p>
                        </div>
                        <span className="text-sm font-semibold text-emerald-600 tabular-nums">
                          {fmtMoney(pay.amount)}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>

      </div>
    </ClientLayout>
  );
}
