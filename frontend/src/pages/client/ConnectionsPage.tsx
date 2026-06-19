import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import {
  Wifi,
  RefreshCw,
  ArrowRightLeft,
  Eye,
  AlertTriangle,
  Clock,
  XCircle,
  Filter,
} from "lucide-react";
import { ClientLayout } from "@/layouts/ClientLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { clientService } from "@/services/client";
import type { ClientSubscriptionListItem } from "@/types/client";
import { cn } from "@/lib/utils";

const STATUS_COLORS: Record<string, string> = {
  ACTIVE: "bg-green-100 text-green-700",
  EXPIRED: "bg-red-100 text-red-700",
  SUSPENDED: "bg-yellow-100 text-yellow-700",
  TERMINATED: "bg-gray-100 text-gray-500",
  PENDING: "bg-blue-100 text-blue-700",
};

const STATUS_LABELS: Record<string, string> = {
  ACTIVE: "Active",
  EXPIRED: "Expired",
  SUSPENDED: "Suspended",
  TERMINATED: "Terminated",
  PENDING: "Pending",
};

const BILLING_CYCLE_LABELS: Record<string, string> = {
  MONTHLY: "Monthly",
  QUARTERLY: "Quarterly",
  HALF_YEARLY: "Half-Yearly",
  ANNUALLY: "Annual",
};

function DaysChip({ days, status }: { days: number; status: string }) {
  if (status === "EXPIRED") {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-medium text-red-600">
        <XCircle className="h-3 w-3" /> Expired
      </span>
    );
  }
  if (days === 0) {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-medium text-red-600">
        <AlertTriangle className="h-3 w-3" /> Due today
      </span>
    );
  }
  if (days <= 7) {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-medium text-orange-600">
        <AlertTriangle className="h-3 w-3" /> {days}d left
      </span>
    );
  }
  if (days <= 30) {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-medium text-yellow-600">
        <Clock className="h-3 w-3" /> {days}d left
      </span>
    );
  }
  return <span className="text-xs text-muted-foreground">{days} days</span>;
}

function ConnectionCard({
  sub,
  onView,
  onRenew,
  onChangePlan,
}: {
  sub: ClientSubscriptionListItem;
  onView: () => void;
  onRenew: () => void;
  onChangePlan: () => void;
}) {
  const isActive = sub.status === "ACTIVE";

  return (
    <div className="rounded-xl border bg-white shadow-sm hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between p-4 pb-3">
        <div className="flex items-center gap-3">
          <div className={cn(
            "flex h-10 w-10 shrink-0 items-center justify-center rounded-lg",
            isActive ? "bg-emerald-50" : "bg-gray-100",
          )}>
            <Wifi className={cn("h-5 w-5", isActive ? "text-emerald-500" : "text-gray-400")} />
          </div>
          <div>
            <p className="font-semibold text-foreground">
              {sub.connection_name || sub.subscription_code}
            </p>
            <p className="text-xs text-muted-foreground">{sub.subscription_code}</p>
          </div>
        </div>
        <span
          className={`rounded-full px-2 py-0.5 text-xs font-medium ${
            STATUS_COLORS[sub.status] ?? "bg-gray-100 text-gray-600"
          }`}
        >
          {STATUS_LABELS[sub.status] ?? sub.status}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-x-4 gap-y-2 px-4 pb-3 text-sm">
        <div>
          <p className="text-xs text-muted-foreground">Plan</p>
          <p className="font-medium">{sub.plan_name}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Speed</p>
          <p className="font-medium">{sub.speed_mbps} Mbps</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Billing</p>
          <p className="font-medium">
            {BILLING_CYCLE_LABELS[sub.billing_cycle] ?? sub.billing_cycle}
          </p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Expires</p>
          <p className="font-medium">
            {new Date(sub.expiry_date).toLocaleDateString("en-IN", {
              day: "2-digit",
              month: "short",
              year: "numeric",
            })}
          </p>
        </div>
      </div>

      <div className="flex items-center justify-between border-t px-4 py-2.5">
        <DaysChip days={sub.days_remaining} status={sub.status} />
        <div className="flex items-center gap-1">
          {isActive && (
            <>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-xs"
                onClick={onRenew}
              >
                <RefreshCw className="h-3 w-3 mr-1" /> Renew
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-xs"
                onClick={onChangePlan}
              >
                <ArrowRightLeft className="h-3 w-3 mr-1" /> Change Plan
              </Button>
            </>
          )}
          <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={onView}>
            <Eye className="h-3 w-3 mr-1" /> View
          </Button>
        </div>
      </div>
    </div>
  );
}

type QuickFilter = "" | "expiring_7" | "expiring_15" | "expiring_30" | "expired";

export function ConnectionsPage() {
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [quickFilter, setQuickFilter] = useState<QuickFilter>("");
  const [page, setPage] = useState(1);
  const [showFilters, setShowFilters] = useState(false);

  const { data, isLoading, isError } = useQuery({
    queryKey: ["client-subscriptions", { search, statusFilter, quickFilter, page }],
    queryFn: () =>
      clientService.listSubscriptions({
        page,
        page_size: 12,
        search: search || undefined,
        status: statusFilter || undefined,
        expiring_7: quickFilter === "expiring_7",
        expiring_15: quickFilter === "expiring_15",
        expiring_30: quickFilter === "expiring_30",
        expired: quickFilter === "expired",
        sort_by: "expiry_date",
        sort_order: "asc",
      }),
  });

  const filterCount =
    (search ? 1 : 0) + (statusFilter ? 1 : 0) + (quickFilter ? 1 : 0);

  function handleReset() {
    setSearch("");
    setStatusFilter("");
    setQuickFilter("");
    setPage(1);
  }

  return (
    <ClientLayout title="My Connections">
      <div className="space-y-5">
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold text-foreground">My Connections</h2>
            <p className="text-sm text-muted-foreground">
              {data
                ? `${data.total} subscription${data.total !== 1 ? "s" : ""}`
                : "Loading…"}
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowFilters((v) => !v)}
          >
            <Filter className="h-3.5 w-3.5 mr-1.5" />
            Filters
            {filterCount > 0 && (
              <span className="ml-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-white">
                {filterCount}
              </span>
            )}
          </Button>
        </div>

        {/* Filters panel */}
        {showFilters && (
          <div className="rounded-xl border bg-white p-4 shadow-sm space-y-3">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div>
                <p className="mb-1 text-xs font-medium text-muted-foreground">Search</p>
                <Input
                  placeholder="Connection name, plan…"
                  value={search}
                  onChange={(e) => {
                    setSearch(e.target.value);
                    setPage(1);
                  }}
                  className="h-8 text-sm"
                />
              </div>
              <div>
                <p className="mb-1 text-xs font-medium text-muted-foreground">Status</p>
                <select
                  className="h-8 w-full rounded-md border border-input bg-background px-3 text-sm"
                  value={statusFilter}
                  onChange={(e) => {
                    setStatusFilter(e.target.value);
                    setPage(1);
                  }}
                >
                  <option value="">All statuses</option>
                  <option value="ACTIVE">Active</option>
                  <option value="EXPIRED">Expired</option>
                  <option value="SUSPENDED">Suspended</option>
                  <option value="TERMINATED">Terminated</option>
                </select>
              </div>
              <div>
                <p className="mb-1 text-xs font-medium text-muted-foreground">Quick filter</p>
                <select
                  className="h-8 w-full rounded-md border border-input bg-background px-3 text-sm"
                  value={quickFilter}
                  onChange={(e) => {
                    setQuickFilter(e.target.value as QuickFilter);
                    setPage(1);
                  }}
                >
                  <option value="">None</option>
                  <option value="expiring_7">Expiring in 7 days</option>
                  <option value="expiring_15">Expiring in 15 days</option>
                  <option value="expiring_30">Expiring in 30 days</option>
                  <option value="expired">Expired</option>
                </select>
              </div>
            </div>
            {filterCount > 0 && (
              <div className="flex justify-end">
                <Button variant="ghost" size="sm" onClick={handleReset} className="h-7 text-xs">
                  Clear filters
                </Button>
              </div>
            )}
          </div>
        )}

        {/* Content */}
        {isLoading && (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-52 animate-pulse rounded-xl border bg-gray-100" />
            ))}
          </div>
        )}

        {isError && (
          <div className="flex flex-col items-center gap-2 py-16 text-center">
            <p className="font-medium text-destructive">Failed to load connections.</p>
            <p className="text-sm text-muted-foreground">Please try refreshing the page.</p>
          </div>
        )}

        {data && data.items.length === 0 && (
          <div className="flex flex-col items-center gap-3 py-20 text-center">
            <Wifi className="h-12 w-12 text-muted-foreground/30" />
            <p className="font-medium text-muted-foreground">No connections found.</p>
            {filterCount > 0 && (
              <Button variant="outline" size="sm" onClick={handleReset}>
                Clear filters
              </Button>
            )}
          </div>
        )}

        {data && data.items.length > 0 && (
          <>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {data.items.map((sub) => (
                <ConnectionCard
                  key={sub.id}
                  sub={sub}
                  onView={() => navigate(`/client/connections/${sub.id}`)}
                  onRenew={() => navigate(`/client/connections/${sub.id}/renew`)}
                  onChangePlan={() => navigate(`/client/connections/${sub.id}/change-plan`)}
                />
              ))}
            </div>

            {data.pages > 1 && (
              <div className="flex items-center justify-between text-sm">
                <p className="text-muted-foreground">
                  Page {data.page} of {data.pages} · {data.total} total
                </p>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={data.page <= 1}
                    onClick={() => setPage((p) => p - 1)}
                  >
                    Previous
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={data.page >= data.pages}
                    onClick={() => setPage((p) => p + 1)}
                  >
                    Next
                  </Button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </ClientLayout>
  );
}
