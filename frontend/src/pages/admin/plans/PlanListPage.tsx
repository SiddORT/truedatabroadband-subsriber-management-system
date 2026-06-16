import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Plus, Eye, Zap, Infinity, AlertCircle } from "lucide-react";

import { AppLayout } from "@/layouts/AppLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  DataTable,
  type DataTableColumn,
  type DataTableState,
} from "@/components/DataTable";
import { plansService } from "@/services/plans";
import type { Plan } from "@/types/plan";
import { BILLING_CYCLE_LABELS } from "@/types/plan";

// ── Helpers ───────────────────────────────────────────────────────────────────

function SpeedBadge({ speed }: { speed: number }) {
  return (
    <span className="inline-flex items-center gap-1 font-medium">
      <Zap className="h-3.5 w-3.5 text-yellow-500" />
      {speed >= 1000 ? `${speed / 1000} Gbps` : `${speed} Mbps`}
    </span>
  );
}

function PolicyBadge({ policy, fup }: { policy: string; fup: number | null }) {
  if (policy === "UNLIMITED") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-semibold text-blue-800">
        <Infinity className="h-3 w-3" />Unlimited
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-orange-100 px-2.5 py-0.5 text-xs font-semibold text-orange-800">
      <AlertCircle className="h-3 w-3" />FUP {fup ? `${fup} GB` : ""}
    </span>
  );
}

function StatusBadge({ active }: { active: boolean }) {
  return active ? (
    <span className="inline-flex items-center rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-semibold text-green-800 border border-green-200">
      Active
    </span>
  ) : (
    <span className="inline-flex items-center rounded-full bg-muted px-2.5 py-0.5 text-xs font-semibold text-muted-foreground border border-border">
      Inactive
    </span>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────

export function PlanListPage() {
  const navigate = useNavigate();
  const [tableState, setTableState] = useState<DataTableState>({
    page: 1,
    pageSize: 10,
    search: "",
    sortBy: "created_at",
    sortDir: "desc",
  });

  const { data, isLoading } = useQuery({
    queryKey: ["plans", tableState],
    queryFn: () =>
      plansService.list({
        page: tableState.page,
        page_size: tableState.pageSize,
        search: tableState.search,
        sort_by: tableState.sortBy ?? "created_at",
        sort_order: tableState.sortDir,
      }),
  });

  const columns: DataTableColumn<Plan>[] = [
    {
      key: "_sr",
      header: "Sr. No.",
      className: "w-14 text-center",
      render: (_row, index) => (
        <span className="text-sm text-muted-foreground tabular-nums">
          {(tableState.page - 1) * tableState.pageSize + index + 1}
        </span>
      ),
    },
    {
      key: "plan_code",
      header: "Plan Code",
      sortable: true,
      render: (row) => (
        <span className="font-mono text-sm font-medium text-primary">
          {row.plan_code}
        </span>
      ),
    },
    {
      key: "name",
      header: "Name",
      sortable: true,
      render: (row) => (
        <div>
          <p className="font-medium">{row.name}</p>
          {row.description && (
            <p className="text-xs text-muted-foreground line-clamp-1 mt-0.5">
              {row.description}
            </p>
          )}
        </div>
      ),
    },
    {
      key: "speed_mbps",
      header: "Speed",
      sortable: true,
      render: (row) => <SpeedBadge speed={row.speed_mbps} />,
    },
    {
      key: "data_policy",
      header: "Data Policy",
      render: (row) => <PolicyBadge policy={row.data_policy} fup={row.fup_limit_gb} />,
    },
    {
      key: "active_pricing_count",
      header: "Pricing",
      render: (row) => (
        <span className="text-sm">
          {row.active_pricing_count === 0 ? (
            <span className="text-muted-foreground italic">None</span>
          ) : (
            <span className="font-medium">
              {row.active_pricing_count}{" "}
              <span className="text-muted-foreground font-normal">
                {row.active_pricing_count === 1 ? "cycle" : "cycles"}
              </span>
            </span>
          )}
          {row.pricing.length > 0 && (
            <span className="ml-1.5 text-[11px] text-muted-foreground">
              ({row.pricing.map((p) => BILLING_CYCLE_LABELS[p.billing_cycle][0]).join(", ")})
            </span>
          )}
        </span>
      ),
    },
    {
      key: "is_active",
      header: "Status",
      render: (row) => <StatusBadge active={row.is_active} />,
    },
    {
      key: "actions",
      header: "",
      className: "w-20 text-right",
      render: (row) => (
        <Button
          variant="outline"
          size="sm"
          onClick={() => navigate(`/admin/plans/${row.id}`)}
          className="gap-1.5"
        >
          <Eye className="h-3.5 w-3.5" />View
        </Button>
      ),
    },
  ];

  return (
    <AppLayout title="Plans" portalLabel="Administration">
      <div className="space-y-5">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h2 className="text-xl font-semibold">Broadband Plans</h2>
            <p className="text-sm text-muted-foreground mt-0.5">
              Manage plans and configure billing cycle pricing.
            </p>
          </div>
          <Button onClick={() => navigate("/admin/plans/new")} className="shrink-0">
            <Plus className="h-4 w-4" />New Plan
          </Button>
        </div>

        <Card>
          <CardContent className="pt-5">
            <DataTable
              columns={columns}
              rows={data?.items ?? []}
              total={data?.total ?? 0}
              state={tableState}
              onStateChange={setTableState}
              rowKey={(row) => row.id}
              isLoading={isLoading}
              emptyMessage="No plans found. Create your first broadband plan."
            />
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}
