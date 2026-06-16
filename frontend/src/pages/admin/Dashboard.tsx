import { useState } from "react";
import { Activity, Database, Server, Users } from "lucide-react";

import {
  DataTable,
  DEFAULT_PAGE_SIZE,
  type DataTableColumn,
  type DataTableState,
} from "@/components/DataTable";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { AppLayout } from "@/layouts/AppLayout";

const stats = [
  { label: "System Status", value: "Operational", icon: Activity },
  { label: "Database", value: "Connected", icon: Database },
  { label: "API Version", value: "v1", icon: Server },
  { label: "Roles", value: "2", icon: Users },
];

// Placeholder rows — NOT connected to any business module (Phase 1 scaffold).
interface PlaceholderRow {
  id: string;
  module: string;
  status: string;
}

const placeholderColumns: DataTableColumn<PlaceholderRow>[] = [
  { key: "module", header: "Module", sortable: true },
  {
    key: "status",
    header: "Status",
    render: (row) => (
      <span className="inline-flex items-center rounded-md bg-muted px-2 py-1 text-xs font-medium text-secondary">
        {row.status}
      </span>
    ),
  },
];

const placeholderRows: PlaceholderRow[] = [
  { id: "1", module: "Customers", status: "Coming soon" },
  { id: "2", module: "Plans", status: "Coming soon" },
  { id: "3", module: "Invoices", status: "Coming soon" },
];

export function AdminDashboard() {
  const [tableState, setTableState] = useState<DataTableState>({
    page: 1,
    pageSize: DEFAULT_PAGE_SIZE,
    search: "",
    sortBy: null,
    sortDir: "asc",
  });

  return (
    <AppLayout title="Admin Dashboard" portalLabel="Administration">
      <div className="space-y-8">
        <div>
          <h2 className="text-xl font-semibold text-foreground">
            Welcome back
          </h2>
          <p className="text-sm text-muted-foreground">
            Foundation is ready. Business modules will be added in later phases.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {stats.map((stat) => (
            <Card key={stat.label}>
              <CardContent className="flex items-center gap-4 p-5">
                <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <stat.icon className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">{stat.label}</p>
                  <p className="text-lg font-semibold text-foreground">
                    {stat.value}
                  </p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Modules</CardTitle>
            <CardDescription>
              Reusable DataTable scaffold (server-side pagination, search and
              sorting ready). Shown here with placeholder data only.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <DataTable
              columns={placeholderColumns}
              rows={placeholderRows}
              total={placeholderRows.length}
              state={tableState}
              onStateChange={setTableState}
              rowKey={(row) => row.id}
            />
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}
