import { CreditCard, FileText, Wifi } from "lucide-react";

import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { AppLayout } from "@/layouts/AppLayout";

const cards = [
  {
    title: "My Connection",
    description: "Plan details and connection status will appear here.",
    icon: Wifi,
  },
  {
    title: "Invoices",
    description: "Your billing history will appear here.",
    icon: FileText,
  },
  {
    title: "Payments",
    description: "Manage and review payments here.",
    icon: CreditCard,
  },
];

export function ClientDashboard() {
  return (
    <AppLayout title="Client Dashboard" portalLabel="Client Portal">
      <div className="space-y-8">
        <div>
          <h2 className="text-xl font-semibold text-foreground">
            Welcome to your portal
          </h2>
          <p className="text-sm text-muted-foreground">
            Your account is ready. Services will be available in upcoming
            phases.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          {cards.map((card) => (
            <Card key={card.title}>
              <CardHeader>
                <div className="mb-2 flex h-11 w-11 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <card.icon className="h-5 w-5" />
                </div>
                <CardTitle>{card.title}</CardTitle>
                <CardDescription>{card.description}</CardDescription>
              </CardHeader>
            </Card>
          ))}
        </div>
      </div>
    </AppLayout>
  );
}
