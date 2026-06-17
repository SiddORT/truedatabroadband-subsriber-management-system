import { useNavigate } from "react-router-dom";
import { AppLayout } from "@/layouts/AppLayout";
import { Card, CardContent } from "@/components/ui/card";
import {
  Users,
  RefreshCw,
  ReceiptText,
  IndianRupee,
  TrendingUp,
  AlertCircle,
  ArrowRight,
} from "lucide-react";

interface ReportCard {
  title: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  href: string;
  iconBg: string;
  iconColor: string;
}

const REPORT_CARDS: ReportCard[] = [
  {
    title: "Customer Report",
    description: "View all customers with subscription counts and outstanding balances. Filter by type, city, status.",
    icon: Users,
    href: "/admin/reports/customers",
    iconBg: "bg-primary/10",
    iconColor: "text-primary",
  },
  {
    title: "Subscription Report",
    description: "Track active, expired, and expiring subscriptions. Quick filters for upcoming renewals.",
    icon: RefreshCw,
    href: "/admin/reports/subscriptions",
    iconBg: "bg-secondary/20",
    iconColor: "text-secondary",
  },
  {
    title: "Invoice Report",
    description: "Full invoice history with payment status, amounts, and due dates. Filter by plan, status, date range.",
    icon: ReceiptText,
    href: "/admin/reports/invoices",
    iconBg: "bg-amber-100",
    iconColor: "text-amber-700",
  },
  {
    title: "Payment Report",
    description: "All collected payments with method breakdown. Filter by date range and payment method.",
    icon: IndianRupee,
    href: "/admin/reports/payments",
    iconBg: "bg-green-100",
    iconColor: "text-green-700",
  },
  {
    title: "Revenue Report",
    description: "Aggregated revenue analytics — by month, plan, customer, and city. Charts included.",
    icon: TrendingUp,
    href: "/admin/reports/revenue",
    iconBg: "bg-blue-100",
    iconColor: "text-blue-700",
  },
  {
    title: "Outstanding Report",
    description: "Overdue invoices with aging buckets: 0–30, 31–60, 61–90, and 90+ days overdue.",
    icon: AlertCircle,
    href: "/admin/reports/outstanding",
    iconBg: "bg-red-100",
    iconColor: "text-red-700",
  },
];

export function ReportsIndexPage() {
  const navigate = useNavigate();

  return (
    <AppLayout title="Reports & Exports" portalLabel="Admin Portal">
      <div className="space-y-6">
        <div>
          <h2 className="text-lg font-semibold text-foreground">Reports</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Operational and financial reports with server-side filtering, sorting, and CSV/Excel exports.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {REPORT_CARDS.map((card) => (
            <Card
              key={card.href}
              className="cursor-pointer transition-all hover:shadow-md hover:-translate-y-0.5"
              onClick={() => navigate(card.href)}
            >
              <CardContent className="p-5">
                <div className="flex items-start gap-4">
                  <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${card.iconBg}`}>
                    <card.icon className={`h-5 w-5 ${card.iconColor}`} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between">
                      <h3 className="text-sm font-semibold text-foreground">{card.title}</h3>
                      <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground leading-relaxed">{card.description}</p>
                  </div>
                </div>
                <div className="mt-3 flex gap-2">
                  <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">Filter</span>
                  <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">Sort</span>
                  <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">CSV</span>
                  <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">Excel</span>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </AppLayout>
  );
}
