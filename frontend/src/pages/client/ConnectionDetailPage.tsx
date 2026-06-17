import { useParams, useNavigate, Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowLeft,
  Wifi,
  RefreshCw,
  ArrowRightLeft,
  AlertTriangle,
  Calendar,
  Zap,
  ChevronRight,
  Clock,
  Receipt,
  CreditCard,
  Bell,
  History,
} from "lucide-react";
import { ClientLayout } from "@/layouts/ClientLayout";
import { Button } from "@/components/ui/button";
import { clientService } from "@/services/client";
import type { ClientRequestHistoryItem } from "@/types/client";

const STATUS_COLORS: Record<string, string> = {
  ACTIVE: "bg-green-100 text-green-700",
  EXPIRED: "bg-red-100 text-red-700",
  SUSPENDED: "bg-yellow-100 text-yellow-700",
  TERMINATED: "bg-gray-100 text-gray-500",
  PENDING: "bg-blue-100 text-blue-700",
};

const BILLING_CYCLE_LABELS: Record<string, string> = {
  MONTHLY: "Monthly",
  QUARTERLY: "Quarterly",
  HALF_YEARLY: "Half-Yearly",
  ANNUALLY: "Annual",
};

const DATA_POLICY_LABELS: Record<string, string> = {
  UNLIMITED: "Unlimited",
  FUP: "FUP Limited",
};

const REQUEST_STATUS_COLORS: Record<string, string> = {
  PENDING: "bg-yellow-100 text-yellow-700",
  APPROVED: "bg-green-100 text-green-700",
  REJECTED: "bg-red-100 text-red-700",
  CANCELLED: "bg-gray-100 text-gray-500",
};

const INVOICE_STATUS_COLORS: Record<string, string> = {
  PAID: "bg-green-100 text-green-700",
  UNPAID: "bg-red-100 text-red-700",
  PARTIALLY_PAID: "bg-yellow-100 text-yellow-700",
  OVERDUE: "bg-orange-100 text-orange-700",
  DRAFT: "bg-gray-100 text-gray-500",
  CANCELLED: "bg-gray-100 text-gray-400",
};

function SectionTitle({
  icon: Icon,
  children,
}: {
  icon: React.ElementType;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-2 mb-3">
      <Icon className="h-4 w-4 text-primary" />
      <h3 className="font-semibold text-sm uppercase tracking-wide text-muted-foreground">
        {children}
      </h3>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between py-2 border-b last:border-b-0">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="text-sm font-medium text-right">{value}</span>
    </div>
  );
}

function RequestHistoryItem({ item }: { item: ClientRequestHistoryItem }) {
  const isRenewal = item.request_type === "RENEWAL";
  const Icon = isRenewal ? RefreshCw : ArrowRightLeft;
  const statusColor =
    REQUEST_STATUS_COLORS[item.status] ?? "bg-gray-100 text-gray-500";
  const dt = new Date(item.created_at).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });

  return (
    <div className="flex items-start gap-3 py-3 border-b last:border-b-0">
      <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10">
        <Icon className="h-3.5 w-3.5 text-primary" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-medium">
            {isRenewal ? "Renewal Request" : "Plan Change Request"}
          </span>
          <span
            className={`rounded-full px-2 py-0.5 text-xs font-medium ${statusColor}`}
          >
            {item.status}
          </span>
        </div>
        {isRenewal && item.requested_billing_cycle && (
          <p className="text-xs text-muted-foreground mt-0.5">
            Requested:{" "}
            {BILLING_CYCLE_LABELS[item.requested_billing_cycle] ??
              item.requested_billing_cycle}
          </p>
        )}
        {!isRenewal && (
          <p className="text-xs text-muted-foreground mt-0.5">
            {item.current_plan_name} → {item.requested_plan_name}
          </p>
        )}
        {item.remarks && (
          <p className="text-xs text-muted-foreground mt-0.5 italic">
            "{item.remarks}"
          </p>
        )}
        {item.review_notes && (
          <p className="text-xs text-muted-foreground mt-0.5">
            Note: {item.review_notes}
          </p>
        )}
      </div>
      <span className="text-xs text-muted-foreground whitespace-nowrap">{dt}</span>
    </div>
  );
}

export function ConnectionDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const {
    data: sub,
    isLoading,
    isError,
  } = useQuery({
    queryKey: ["client-subscription", id],
    queryFn: () => clientService.getSubscriptionDetail(id!),
    enabled: !!id,
  });

  const { data: requests } = useQuery({
    queryKey: ["client-subscription-requests", id],
    queryFn: () => clientService.getSubscriptionRequests(id!),
    enabled: !!id,
  });

  if (isLoading) {
    return (
      <ClientLayout title="Connection Detail">
        <div className="space-y-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-32 animate-pulse rounded-xl border bg-gray-100" />
          ))}
        </div>
      </ClientLayout>
    );
  }

  if (isError || !sub) {
    return (
      <ClientLayout title="Connection Detail">
        <div className="flex flex-col items-center gap-3 py-20 text-center">
          <p className="font-medium text-destructive">Subscription not found.</p>
          <Button
            variant="outline"
            onClick={() => navigate("/client/connections")}
          >
            <ArrowLeft className="h-4 w-4 mr-2" /> Back to Connections
          </Button>
        </div>
      </ClientLayout>
    );
  }

  const isActive = sub.status === "ACTIVE";
  const isExpiringSoon = sub.days_remaining <= 7 && isActive;
  const fmt = (d: string) =>
    new Date(d).toLocaleDateString("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  const totalPrice = parseFloat(sub.total_price).toLocaleString("en-IN", {
    style: "currency",
    currency: "INR",
  });

  return (
    <ClientLayout title="Connection Detail">
      <div className="space-y-5">
        {/* Header */}
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => navigate("/client/connections")}
            >
              <ArrowLeft className="h-4 w-4 mr-1" /> Back
            </Button>
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10">
                <Wifi className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="font-bold text-lg leading-tight">
                  {sub.connection_name || sub.subscription_code}
                </p>
                <p className="text-xs text-muted-foreground">{sub.subscription_code}</p>
              </div>
            </div>
            <span
              className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                STATUS_COLORS[sub.status] ?? "bg-gray-100 text-gray-600"
              }`}
            >
              {sub.status}
            </span>
          </div>
          {isActive && (
            <div className="flex gap-2">
              {!sub.pending_renewal_request && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => navigate(`/client/connections/${id}/renew`)}
                >
                  <RefreshCw className="h-3.5 w-3.5 mr-1.5" /> Request Renewal
                </Button>
              )}
              {!sub.pending_plan_change_request && (
                <Button
                  size="sm"
                  onClick={() =>
                    navigate(`/client/connections/${id}/change-plan`)
                  }
                >
                  <ArrowRightLeft className="h-3.5 w-3.5 mr-1.5" /> Change Plan
                </Button>
              )}
            </div>
          )}
        </div>

        {/* Alerts */}
        {sub.pending_renewal_request && (
          <div className="flex items-center gap-2 rounded-lg border border-yellow-200 bg-yellow-50 px-4 py-3 text-sm text-yellow-700">
            <Clock className="h-4 w-4 shrink-0" />
            A renewal request is pending review.
          </div>
        )}
        {sub.pending_plan_change_request && (
          <div className="flex items-center gap-2 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-700">
            <Clock className="h-4 w-4 shrink-0" />
            A plan change request is pending review.
          </div>
        )}
        {isExpiringSoon && (
          <div className="flex items-center gap-2 rounded-lg border border-orange-200 bg-orange-50 px-4 py-3 text-sm text-orange-700">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            This connection expires in {sub.days_remaining} day
            {sub.days_remaining !== 1 ? "s" : ""}.
          </div>
        )}
        {sub.status === "EXPIRED" && (
          <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            This connection has expired.
          </div>
        )}

        {/* Main grid */}
        <div className="grid gap-4 lg:grid-cols-3">
          {/* Left: Connection + Plan + Invoices + Payments */}
          <div className="lg:col-span-2 space-y-4">
            {/* Connection Info */}
            <div className="rounded-xl border bg-white p-4 shadow-sm">
              <SectionTitle icon={Wifi}>Connection Information</SectionTitle>
              <InfoRow label="Subscription Code" value={sub.subscription_code} />
              <InfoRow
                label="Connection Name"
                value={sub.connection_name ?? "—"}
              />
              <InfoRow
                label="Status"
                value={
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                      STATUS_COLORS[sub.status] ?? ""
                    }`}
                  >
                    {sub.status}
                  </span>
                }
              />
              {sub.installation_address && (
                <InfoRow
                  label="Installation Address"
                  value={
                    <span className="text-right max-w-[200px] inline-block">
                      {sub.installation_address}
                    </span>
                  }
                />
              )}
            </div>

            {/* Plan Info */}
            <div className="rounded-xl border bg-white p-4 shadow-sm">
              <SectionTitle icon={Zap}>Plan Details</SectionTitle>
              <InfoRow label="Plan" value={sub.plan_name} />
              <InfoRow label="Plan Code" value={sub.plan_code} />
              <InfoRow label="Speed" value={`${sub.speed_mbps} Mbps`} />
              <InfoRow
                label="Data Policy"
                value={DATA_POLICY_LABELS[sub.data_policy] ?? sub.data_policy}
              />
              {sub.fup_limit_gb && (
                <InfoRow label="FUP Limit" value={`${sub.fup_limit_gb} GB`} />
              )}
              <InfoRow
                label="Billing Cycle"
                value={
                  BILLING_CYCLE_LABELS[sub.billing_cycle] ?? sub.billing_cycle
                }
              />
              <InfoRow
                label="Price"
                value={
                  <span className="font-semibold text-primary">
                    {totalPrice}
                  </span>
                }
              />
            </div>

            {/* Recent Invoices */}
            <div className="rounded-xl border bg-white p-4 shadow-sm">
              <div className="flex items-center justify-between mb-3">
                <SectionTitle icon={Receipt}>Recent Invoices</SectionTitle>
                <Link
                  to="/client/billing/invoices"
                  className="text-xs text-primary hover:underline"
                >
                  View all
                </Link>
              </div>
              {sub.recent_invoices.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">
                  No invoices yet.
                </p>
              ) : (
                <div>
                  {sub.recent_invoices.map((inv) => (
                    <div
                      key={inv.id}
                      className="flex items-center justify-between py-2.5 border-b last:border-b-0 cursor-pointer hover:bg-muted/30 -mx-1 px-1 rounded"
                      onClick={() =>
                        navigate(`/client/billing/invoices/${inv.id}`)
                      }
                    >
                      <div>
                        <p className="text-sm font-medium">{inv.invoice_number}</p>
                        <p className="text-xs text-muted-foreground">
                          {fmt(inv.invoice_date)}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <span
                          className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                            INVOICE_STATUS_COLORS[inv.status] ??
                            "bg-gray-100 text-gray-600"
                          }`}
                        >
                          {inv.status.replace(/_/g, " ")}
                        </span>
                        <span className="text-sm font-semibold">
                          ₹
                          {parseFloat(inv.total_amount).toLocaleString("en-IN")}
                        </span>
                        <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Recent Payments */}
            <div className="rounded-xl border bg-white p-4 shadow-sm">
              <div className="flex items-center justify-between mb-3">
                <SectionTitle icon={CreditCard}>Recent Payments</SectionTitle>
                <Link
                  to="/client/billing/payments"
                  className="text-xs text-primary hover:underline"
                >
                  View all
                </Link>
              </div>
              {sub.recent_payments.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">
                  No payments yet.
                </p>
              ) : (
                <div>
                  {sub.recent_payments.map((pay) => (
                    <div
                      key={pay.id}
                      className="flex items-center justify-between py-2.5 border-b last:border-b-0"
                    >
                      <div>
                        <p className="text-sm font-medium">{pay.payment_number}</p>
                        <p className="text-xs text-muted-foreground">
                          {fmt(pay.payment_date)} ·{" "}
                          {pay.payment_method.replace(/_/g, " ")}
                        </p>
                      </div>
                      <span className="text-sm font-semibold text-green-700">
                        ₹{parseFloat(pay.amount).toLocaleString("en-IN")}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Right: Days remaining + Dates + Notifications + Request History */}
          <div className="space-y-4">
            {/* Days remaining */}
            <div className="rounded-xl border bg-white p-4 shadow-sm text-center">
              <div
                className={`text-4xl font-bold mb-1 ${
                  sub.status === "EXPIRED"
                    ? "text-red-500"
                    : sub.days_remaining <= 7
                    ? "text-red-600"
                    : sub.days_remaining <= 30
                    ? "text-orange-500"
                    : "text-primary"
                }`}
              >
                {sub.status === "EXPIRED" ? "—" : sub.days_remaining}
              </div>
              <p className="text-xs text-muted-foreground">
                {sub.status === "EXPIRED" ? "Expired" : "days remaining"}
              </p>
            </div>

            {/* Dates */}
            <div className="rounded-xl border bg-white p-4 shadow-sm">
              <SectionTitle icon={Calendar}>Dates</SectionTitle>
              <InfoRow label="Start Date" value={fmt(sub.start_date)} />
              <InfoRow label="Renewal Date" value={fmt(sub.renewal_date)} />
              <InfoRow label="Expiry Date" value={fmt(sub.expiry_date)} />
            </div>

            {/* Recent Notifications */}
            <div className="rounded-xl border bg-white p-4 shadow-sm">
              <SectionTitle icon={Bell}>Notifications</SectionTitle>
              {sub.recent_notifications.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-3">
                  No notifications.
                </p>
              ) : (
                <div>
                  {sub.recent_notifications.map((n) => (
                    <div
                      key={n.id}
                      className="flex items-start gap-2 py-2 border-b last:border-b-0"
                    >
                      <Bell className="h-3.5 w-3.5 mt-0.5 shrink-0 text-muted-foreground" />
                      <div>
                        <p className="text-xs font-medium">
                          {n.template_key.replace(/_/g, " ")}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {n.channel} ·{" "}
                          {new Date(n.created_at).toLocaleDateString("en-IN", {
                            day: "2-digit",
                            month: "short",
                          })}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Request History */}
            <div className="rounded-xl border bg-white p-4 shadow-sm">
              <SectionTitle icon={History}>Request History</SectionTitle>
              {!requests || requests.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-3">
                  No requests found.
                </p>
              ) : (
                <div>
                  {requests.map((req) => (
                    <RequestHistoryItem key={req.id} item={req} />
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </ClientLayout>
  );
}
