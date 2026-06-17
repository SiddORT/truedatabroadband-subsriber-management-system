import { useQuery } from "@tanstack/react-query";
import { Calendar, Loader2, Wifi } from "lucide-react";

import { ClientLayout } from "@/layouts/ClientLayout";
import { Card, CardContent } from "@/components/ui/card";
import { subscriptionsService } from "@/services/subscriptions";
import {
  SUBSCRIPTION_STATUS_COLORS,
  SUBSCRIPTION_STATUS_LABELS,
} from "@/types/subscription";
import { BILLING_CYCLE_LABELS } from "@/types/plan";

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5 py-2">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-sm font-medium text-foreground">{value ?? "—"}</span>
    </div>
  );
}

function fmtDate(d: string) {
  return new Date(d).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
}

export function ClientSubscriptionPage() {
  const { data: sub, isLoading, isError } = useQuery({
    queryKey: ["my-subscription"],
    queryFn: () => subscriptionsService.getMine(),
    retry: false,
  });

  return (
    <ClientLayout title="My Connections">
      <div className="mx-auto max-w-2xl space-y-6">
        <div>
          <h2 className="text-xl font-semibold text-foreground">My Connections</h2>
          <p className="text-sm text-muted-foreground">Your current broadband plan details</p>
        </div>

        {isLoading && (
          <div className="flex h-48 items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
        )}

        {isError && (
          <div className="flex flex-col items-center gap-3 rounded-xl border-2 border-dashed border-border/60 p-16 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted/50">
              <Wifi className="h-6 w-6 text-muted-foreground/40" />
            </div>
            <div>
              <p className="text-sm font-medium text-muted-foreground">No Active Subscription</p>
              <p className="mt-1 text-xs text-muted-foreground/70">
                You don't have an active subscription yet. Please contact support to get started.
              </p>
            </div>
          </div>
        )}

        {sub && (
          <>
            <div className="flex items-center justify-between rounded-xl border bg-surface p-5 shadow-sm">
              <div className="flex items-center gap-4">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
                  <Wifi className="h-6 w-6 text-primary" />
                </div>
                <div>
                  <p className="text-base font-semibold text-foreground">
                    {sub.plan_name_snapshot}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {sub.speed_mbps_snapshot} Mbps ·{" "}
                    {BILLING_CYCLE_LABELS[sub.billing_cycle_snapshot] ?? sub.billing_cycle_snapshot}
                  </p>
                </div>
              </div>
              <span
                className={`inline-flex items-center rounded-full px-3 py-1 text-sm font-medium ${SUBSCRIPTION_STATUS_COLORS[sub.status]}`}
              >
                {SUBSCRIPTION_STATUS_LABELS[sub.status]}
              </span>
            </div>

            <Card>
              <CardContent className="pt-6">
                <p className="mb-4 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Plan Details
                </p>
                <div className="divide-y divide-border">
                  <InfoRow label="Plan Name" value={sub.plan_name_snapshot} />
                  <InfoRow label="Speed" value={`${sub.speed_mbps_snapshot} Mbps`} />
                  <InfoRow
                    label="Billing Cycle"
                    value={BILLING_CYCLE_LABELS[sub.billing_cycle_snapshot] ?? sub.billing_cycle_snapshot}
                  />
                  <InfoRow
                    label="Monthly Amount"
                    value={`₹${Number(sub.total_price_snapshot).toLocaleString("en-IN", { minimumFractionDigits: 2 })}`}
                  />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-6">
                <p className="mb-4 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Subscription Dates
                </p>
                <div className="space-y-3">
                  {[
                    { label: "Start Date", date: sub.start_date },
                    { label: "Renewal Date", date: sub.renewal_date },
                    { label: "Expiry Date", date: sub.expiry_date },
                  ].map(({ label, date }) => (
                    <div key={label} className="flex items-center gap-3">
                      <Calendar className="h-4 w-4 text-muted-foreground" />
                      <div>
                        <p className="text-xs text-muted-foreground">{label}</p>
                        <p className="text-sm font-medium">{fmtDate(date)}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            <p className="text-center text-xs text-muted-foreground">
              Subscription ID: <span className="font-mono">{sub.subscription_code}</span>
            </p>
          </>
        )}
      </div>
    </ClientLayout>
  );
}
