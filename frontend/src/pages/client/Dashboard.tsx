import { useQuery } from "@tanstack/react-query";
import {
  AlertCircle,
  Bell,
  CheckCircle2,
  Clock,
  CreditCard,
  Download,
  Eye,
  FileText,
  IndianRupee,
  Loader2,
  User,
  Wifi,
  WifiOff,
  Zap,
} from "lucide-react";
import { Link, useNavigate } from "react-router-dom";

import { ClientLayout } from "@/layouts/ClientLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { clientService } from "@/services/client";
import { invoicesService } from "@/services/invoices";
import {
  INVOICE_STATUS_COLORS,
  INVOICE_STATUS_LABELS,
  type InvoiceStatus,
} from "@/types/invoice";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fmtDate(d: string) {
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

function fmtBillingCycle(cycle: string) {
  return cycle.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

const NOTIF_TITLES: Record<string, string> = {
  WELCOME_CUSTOMER: "Welcome",
  INVOICE_GENERATED: "Invoice Generated",
  PAYMENT_RECEIVED: "Payment Received",
  SUBSCRIPTION_EXPIRING: "Subscription Expiring",
  SUBSCRIPTION_EXPIRED: "Subscription Expired",
  PLAN_CHANGED: "Plan Changed",
  OTP_LOGIN: "OTP Login",
  PASSWORD_RESET: "Password Reset",
  SUPPORT_TICKET_CREATED: "Support Ticket",
};

const PAYMENT_METHOD_LABELS: Record<string, string> = {
  CASH: "Cash",
  UPI: "UPI",
  BANK_TRANSFER: "Bank Transfer",
  CHEQUE: "Cheque",
};

// ---------------------------------------------------------------------------
// Skeleton
// ---------------------------------------------------------------------------

function CardSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div className="animate-pulse space-y-3 p-4">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="h-4 rounded bg-muted" style={{ width: `${75 + (i % 3) * 10}%` }} />
      ))}
    </div>
  );
}

function KpiSkeleton() {
  return (
    <div className="animate-pulse space-y-2 rounded-xl border bg-card p-5">
      <div className="h-3 w-24 rounded bg-muted" />
      <div className="h-7 w-20 rounded bg-muted" />
      <div className="h-3 w-32 rounded bg-muted" />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Status helpers
// ---------------------------------------------------------------------------

function connectionStatusBadge(status: string, daysRemaining: number) {
  if (status === "EXPIRED") {
    return <Badge variant="destructive">Expired</Badge>;
  }
  if (daysRemaining <= 7) {
    return (
      <Badge className="bg-orange-100 text-orange-700 hover:bg-orange-100">
        Expires in {daysRemaining}d
      </Badge>
    );
  }
  if (status === "ACTIVE") {
    return <Badge className="bg-green-100 text-green-700 hover:bg-green-100">Active</Badge>;
  }
  return <Badge variant="secondary">{status}</Badge>;
}

function notifStatusIcon(status: string) {
  if (status === "SENT") return <CheckCircle2 className="h-3.5 w-3.5 text-green-600" />;
  if (status === "FAILED") return <AlertCircle className="h-3.5 w-3.5 text-red-500" />;
  return <Clock className="h-3.5 w-3.5 text-amber-500" />;
}

// ---------------------------------------------------------------------------
// Empty state
// ---------------------------------------------------------------------------

function EmptyState({ icon: Icon, message }: { icon: React.ElementType; message: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-8 text-muted-foreground">
      <Icon className="h-8 w-8 opacity-30" />
      <p className="text-sm">{message}</p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Error state
// ---------------------------------------------------------------------------

function ErrorState({ message = "Failed to load data." }: { message?: string }) {
  return (
    <div className="flex items-center gap-2 p-4 text-sm text-red-600">
      <AlertCircle className="h-4 w-4 shrink-0" />
      {message}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Widget wrapper
// ---------------------------------------------------------------------------

function Widget({
  title,
  icon: Icon,
  children,
  action,
}: {
  title: string;
  icon: React.ElementType;
  children: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between border-b border-border py-3 px-5">
        <div className="flex items-center gap-2">
          <Icon className="h-4 w-4 text-primary" />
          <CardTitle className="text-sm font-semibold">{title}</CardTitle>
        </div>
        {action}
      </CardHeader>
      <CardContent className="p-0">{children}</CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export function ClientDashboard() {
  const navigate = useNavigate();

  const summaryQ = useQuery({
    queryKey: ["client-dashboard-summary"],
    queryFn: () => clientService.getDashboardSummary(),
    staleTime: 30_000,
  });

  const connectionsQ = useQuery({
    queryKey: ["client-dashboard-connections"],
    queryFn: () => clientService.getDashboardConnections(),
    staleTime: 30_000,
  });

  const invoicesQ = useQuery({
    queryKey: ["client-dashboard-invoices"],
    queryFn: () => clientService.getDashboardInvoices(),
    staleTime: 30_000,
  });

  const paymentsQ = useQuery({
    queryKey: ["client-dashboard-payments"],
    queryFn: () => clientService.getDashboardPayments(),
    staleTime: 30_000,
  });

  const notificationsQ = useQuery({
    queryKey: ["client-dashboard-notifications"],
    queryFn: () => clientService.getDashboardNotifications(),
    staleTime: 30_000,
  });

  const profileQ = useQuery({
    queryKey: ["client-profile"],
    queryFn: () => clientService.getProfile(),
    staleTime: 60_000,
  });

  const summary = summaryQ.data;
  const connections = connectionsQ.data ?? [];
  const invoicesData = invoicesQ.data;
  const payments = paymentsQ.data ?? [];
  const notifications = notificationsQ.data ?? [];
  const profile = profileQ.data;

  const latestInvoiceId = invoicesData?.recent?.[0]?.id;
  const greeting = profile?.full_name
    ? `Welcome back, ${profile.full_name.split(" ")[0]}!`
    : "Welcome to your portal";

  // ---------------------------------------------------------------------------
  // KPI Cards
  // ---------------------------------------------------------------------------
  const kpiCards = [
    {
      label: "Active Connections",
      value: summary ? String(summary.active_connections) : null,
      sub: "Broadband subscriptions",
      icon: Wifi,
      color: "text-blue-600",
      bg: "bg-blue-50",
    },
    {
      label: "Expiring Soon",
      value: summary ? String(summary.expiring_soon) : null,
      sub: "Within 30 days",
      icon: Clock,
      color: "text-orange-600",
      bg: "bg-orange-50",
    },
    {
      label: "Outstanding",
      value: summary ? fmtMoney(summary.outstanding_amount) : null,
      sub: "Unpaid / overdue invoices",
      icon: IndianRupee,
      color: "text-red-600",
      bg: "bg-red-50",
    },
    {
      label: "Last Payment",
      value:
        summary && summary.last_payment_amount ? fmtMoney(summary.last_payment_amount) : null,
      sub:
        summary?.last_payment_date ? fmtDate(summary.last_payment_date) : "No payments yet",
      icon: CreditCard,
      color: "text-green-600",
      bg: "bg-green-50",
    },
  ];

  return (
    <ClientLayout title="Dashboard">
      <div className="space-y-6">
        {/* ── Welcome ── */}
        <div>
          {profileQ.isLoading ? (
            <div className="flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin text-primary" />
              <span className="text-sm text-muted-foreground">Loading…</span>
            </div>
          ) : (
            <>
              <h2 className="text-xl font-semibold text-foreground">{greeting}</h2>
              {profile && (
                <p className="mt-0.5 text-sm text-muted-foreground">
                  Customer ID:{" "}
                  <span className="font-mono text-primary">{profile.customer_code}</span>
                  {" · "}
                  <span
                    className={
                      profile.status === "ACTIVE"
                        ? "font-medium text-green-600"
                        : profile.status === "SUSPENDED"
                          ? "font-medium text-yellow-600"
                          : "font-medium text-red-600"
                    }
                  >
                    {profile.status}
                  </span>
                </p>
              )}
            </>
          )}
        </div>

        {/* ── KPI Cards ── */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {kpiCards.map((card) =>
            summaryQ.isLoading ? (
              <KpiSkeleton key={card.label} />
            ) : (
              <Card key={card.label} className="rounded-xl">
                <CardContent className="p-5">
                  <div className="flex items-start justify-between">
                    <div className="space-y-1">
                      <p className="text-xs font-medium text-muted-foreground">{card.label}</p>
                      <p className="text-2xl font-bold tabular-nums text-foreground">
                        {card.value ?? "—"}
                      </p>
                      <p className="text-xs text-muted-foreground">{card.sub}</p>
                    </div>
                    <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${card.bg}`}>
                      <card.icon className={`h-5 w-5 ${card.color}`} />
                    </div>
                  </div>
                </CardContent>
              </Card>
            )
          )}
        </div>

        {/* ── Quick Actions ── */}
        <div>
          <h3 className="mb-3 text-sm font-semibold text-muted-foreground uppercase tracking-wide">
            Quick Actions
          </h3>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            <Link to="/client/connections">
              <Button variant="outline" className="h-auto w-full flex-col gap-1.5 py-4">
                <Wifi className="h-5 w-5 text-primary" />
                <span className="text-xs">View Connections</span>
              </Button>
            </Link>
            <Link to="/client/billing">
              <Button variant="outline" className="h-auto w-full flex-col gap-1.5 py-4">
                <FileText className="h-5 w-5 text-primary" />
                <span className="text-xs">View Billing</span>
              </Button>
            </Link>
            {latestInvoiceId ? (
              <a
                href={invoicesService.clientPdfUrl(latestInvoiceId)}
                target="_blank"
                rel="noopener noreferrer"
              >
                <Button variant="outline" className="h-auto w-full flex-col gap-1.5 py-4">
                  <Download className="h-5 w-5 text-primary" />
                  <span className="text-xs">Download Invoice</span>
                </Button>
              </a>
            ) : (
              <Button variant="outline" className="h-auto w-full flex-col gap-1.5 py-4" disabled>
                <Download className="h-5 w-5" />
                <span className="text-xs">Download Invoice</span>
              </Button>
            )}
            <Link to="/client/profile">
              <Button variant="outline" className="h-auto w-full flex-col gap-1.5 py-4">
                <User className="h-5 w-5 text-primary" />
                <span className="text-xs">Update Profile</span>
              </Button>
            </Link>
            <Button
              variant="outline"
              className="h-auto w-full flex-col gap-1.5 py-4 opacity-40 cursor-not-allowed"
              disabled
            >
              <Zap className="h-5 w-5" />
              <span className="text-xs">Renew Plan</span>
            </Button>
            <Button
              variant="outline"
              className="h-auto w-full flex-col gap-1.5 py-4 opacity-40 cursor-not-allowed"
              disabled
            >
              <Zap className="h-5 w-5" />
              <span className="text-xs">Upgrade Plan</span>
            </Button>
          </div>
        </div>

        {/* ── My Connections ── */}
        <Widget
          title="My Connections"
          icon={Wifi}
          action={
            <Link to="/client/connections">
              <Button variant="ghost" size="sm" className="text-xs">
                View All
              </Button>
            </Link>
          }
        >
          {connectionsQ.isLoading ? (
            <CardSkeleton rows={4} />
          ) : connectionsQ.isError ? (
            <ErrorState />
          ) : connections.length === 0 ? (
            <EmptyState icon={WifiOff} message="No active connections found." />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/30 text-left">
                    <th className="px-4 py-2.5 text-xs font-medium text-muted-foreground">
                      Connection
                    </th>
                    <th className="px-4 py-2.5 text-xs font-medium text-muted-foreground">
                      Plan
                    </th>
                    <th className="px-4 py-2.5 text-xs font-medium text-muted-foreground hidden sm:table-cell">
                      Speed
                    </th>
                    <th className="px-4 py-2.5 text-xs font-medium text-muted-foreground hidden md:table-cell">
                      Cycle
                    </th>
                    <th className="px-4 py-2.5 text-xs font-medium text-muted-foreground">
                      Expires
                    </th>
                    <th className="px-4 py-2.5 text-xs font-medium text-muted-foreground">
                      Status
                    </th>
                    <th className="px-4 py-2.5 text-xs font-medium text-muted-foreground w-20" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {connections.map((conn) => {
                    const isExpired = conn.status === "EXPIRED";
                    const isUrgent = conn.days_remaining <= 7 && !isExpired;
                    return (
                      <tr
                        key={conn.id}
                        className={
                          isExpired
                            ? "bg-red-50/40"
                            : isUrgent
                              ? "bg-orange-50/40"
                              : "hover:bg-muted/20"
                        }
                      >
                        <td className="px-4 py-3">
                          <span className="font-medium text-foreground">
                            {conn.connection_name ?? "—"}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">{conn.plan_name}</td>
                        <td className="px-4 py-3 text-muted-foreground hidden sm:table-cell">
                          {conn.speed_mbps} Mbps
                        </td>
                        <td className="px-4 py-3 text-muted-foreground hidden md:table-cell">
                          {fmtBillingCycle(conn.billing_cycle)}
                        </td>
                        <td className="px-4 py-3">
                          <div className="text-sm">{fmtDate(conn.expiry_date)}</div>
                          <div className="text-xs text-muted-foreground">
                            {conn.days_remaining >= 0
                              ? `${conn.days_remaining}d left`
                              : `${Math.abs(conn.days_remaining)}d ago`}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          {connectionStatusBadge(conn.status, conn.days_remaining)}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => navigate("/client/connections")}
                            className="gap-1 text-xs"
                          >
                            <Eye className="h-3 w-3" />
                            View
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Widget>

        {/* ── 2-column: Recent Invoices + Outstanding Invoices ── */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          {/* Recent Invoices (spans 2 cols) */}
          <div className="lg:col-span-2">
            <Widget
              title="Recent Invoices"
              icon={FileText}
              action={
                <Link to="/client/billing">
                  <Button variant="ghost" size="sm" className="text-xs">
                    View All
                  </Button>
                </Link>
              }
            >
              {invoicesQ.isLoading ? (
                <CardSkeleton rows={5} />
              ) : invoicesQ.isError ? (
                <ErrorState />
              ) : !invoicesData?.recent.length ? (
                <EmptyState icon={FileText} message="No invoices available." />
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border bg-muted/30 text-left">
                        <th className="px-4 py-2.5 text-xs font-medium text-muted-foreground">
                          Invoice
                        </th>
                        <th className="px-4 py-2.5 text-xs font-medium text-muted-foreground hidden sm:table-cell">
                          Connection
                        </th>
                        <th className="px-4 py-2.5 text-xs font-medium text-muted-foreground hidden md:table-cell">
                          Due
                        </th>
                        <th className="px-4 py-2.5 text-xs font-medium text-muted-foreground text-right">
                          Amount
                        </th>
                        <th className="px-4 py-2.5 text-xs font-medium text-muted-foreground">
                          Status
                        </th>
                        <th className="px-4 py-2.5 w-20" />
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {invoicesData.recent.map((inv) => {
                        const isOverdue = inv.status === "OVERDUE";
                        return (
                          <tr
                            key={inv.id}
                            className={isOverdue ? "bg-red-50/40" : "hover:bg-muted/20"}
                          >
                            <td className="px-4 py-3">
                              <div className="font-mono text-xs font-semibold text-primary">
                                {inv.invoice_number}
                              </div>
                              <div className="text-xs text-muted-foreground">
                                {fmtDate(inv.invoice_date)}
                              </div>
                            </td>
                            <td className="px-4 py-3 text-xs text-muted-foreground hidden sm:table-cell">
                              {inv.connection_name}
                            </td>
                            <td className="px-4 py-3 text-xs text-muted-foreground hidden md:table-cell">
                              {fmtDate(inv.due_date)}
                            </td>
                            <td className="px-4 py-3 text-right font-medium tabular-nums">
                              {fmtMoney(inv.total_amount)}
                            </td>
                            <td className="px-4 py-3">
                              <span
                                className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${INVOICE_STATUS_COLORS[inv.status as InvoiceStatus]}`}
                              >
                                {INVOICE_STATUS_LABELS[inv.status as InvoiceStatus]}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-right">
                              <div className="flex items-center justify-end gap-1">
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => navigate(`/client/billing`)}
                                >
                                  <Eye className="h-3 w-3" />
                                </Button>
                                <a
                                  href={invoicesService.clientPdfUrl(inv.id)}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                >
                                  <Button variant="outline" size="sm">
                                    <Download className="h-3 w-3" />
                                  </Button>
                                </a>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </Widget>
          </div>

          {/* Outstanding Invoices */}
          <div className="lg:col-span-1">
            <Widget title="Outstanding" icon={AlertCircle}>
              {invoicesQ.isLoading ? (
                <CardSkeleton rows={4} />
              ) : invoicesQ.isError ? (
                <ErrorState />
              ) : !invoicesData?.outstanding.length ? (
                <EmptyState icon={CheckCircle2} message="No outstanding invoices. You're all clear!" />
              ) : (
                <div className="divide-y divide-border">
                  {invoicesData.outstanding.map((inv) => {
                    const isOverdue = inv.days_overdue > 0;
                    const isDueSoon =
                      !isOverdue &&
                      new Date(inv.due_date) <=
                        new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
                    return (
                      <div
                        key={inv.id}
                        className={`flex items-start justify-between gap-3 px-4 py-3 ${
                          isOverdue ? "bg-red-50/40" : isDueSoon ? "bg-orange-50/30" : ""
                        }`}
                      >
                        <div className="min-w-0 flex-1">
                          <div className="font-mono text-xs font-semibold text-primary truncate">
                            {inv.invoice_number}
                          </div>
                          <div className="mt-0.5 text-xs text-muted-foreground">
                            Due {fmtDate(inv.due_date)}
                          </div>
                          {isOverdue && (
                            <div className="mt-0.5 text-xs font-medium text-red-600">
                              {inv.days_overdue}d overdue
                            </div>
                          )}
                          {isDueSoon && !isOverdue && (
                            <div className="mt-0.5 text-xs font-medium text-orange-600">
                              Due soon
                            </div>
                          )}
                        </div>
                        <div className="text-right shrink-0">
                          <div className="text-sm font-bold tabular-nums text-red-600">
                            {fmtMoney(inv.outstanding_amount)}
                          </div>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="mt-1 h-6 px-2 text-xs"
                            onClick={() => navigate("/client/billing")}
                          >
                            View
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </Widget>
          </div>
        </div>

        {/* ── 2-column: Recent Payments + Notifications ── */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          {/* Recent Payments */}
          <Widget
            title="Recent Payments"
            icon={CreditCard}
            action={
              <Link to="/client/billing/payments">
                <Button variant="ghost" size="sm" className="text-xs">
                  View All
                </Button>
              </Link>
            }
          >
            {paymentsQ.isLoading ? (
              <CardSkeleton rows={4} />
            ) : paymentsQ.isError ? (
              <ErrorState />
            ) : payments.length === 0 ? (
              <EmptyState icon={CreditCard} message="No payment history available." />
            ) : (
              <div className="divide-y divide-border">
                {payments.map((p) => (
                  <div key={p.id} className="flex items-center justify-between gap-3 px-4 py-3">
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium text-foreground tabular-nums">
                        {fmtMoney(p.amount)}
                      </div>
                      <div className="mt-0.5 text-xs text-muted-foreground truncate">
                        {p.invoice_number} · {p.connection_name}
                      </div>
                    </div>
                    <div className="shrink-0 text-right">
                      <div className="text-xs text-muted-foreground">{fmtDate(p.payment_date)}</div>
                      <Badge variant="outline" className="mt-1 text-xs">
                        {PAYMENT_METHOD_LABELS[p.payment_method] ?? p.payment_method}
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Widget>

          {/* Notifications */}
          <Widget title="Notifications" icon={Bell}>
            {notificationsQ.isLoading ? (
              <CardSkeleton rows={4} />
            ) : notificationsQ.isError ? (
              <ErrorState />
            ) : notifications.length === 0 ? (
              <EmptyState icon={Bell} message="No notifications available." />
            ) : (
              <div className="divide-y divide-border">
                {notifications.map((n) => (
                  <div key={n.id} className="flex items-start gap-3 px-4 py-3">
                    <div className="mt-0.5 shrink-0">{notifStatusIcon(n.status)}</div>
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium text-foreground">
                        {NOTIF_TITLES[n.template_key] ?? n.template_key}
                      </div>
                      <div className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground">
                        <Badge variant="outline" className="text-xs px-1.5 py-0">
                          {n.channel}
                        </Badge>
                        <span>{fmtDate(n.created_at)}</span>
                      </div>
                    </div>
                    <div className="shrink-0">
                      <span
                        className={`text-xs font-medium ${
                          n.status === "SENT"
                            ? "text-green-600"
                            : n.status === "FAILED"
                              ? "text-red-500"
                              : "text-amber-500"
                        }`}
                      >
                        {n.status}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Widget>
        </div>
      </div>
    </ClientLayout>
  );
}
