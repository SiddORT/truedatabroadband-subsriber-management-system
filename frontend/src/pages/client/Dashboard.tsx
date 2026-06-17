import { useQuery } from "@tanstack/react-query";
import { CreditCard, FileText, Loader2, Wifi } from "lucide-react";

import { ClientLayout } from "@/layouts/ClientLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { clientService } from "@/services/client";

export function ClientDashboard() {
  const { data: profile, isLoading } = useQuery({
    queryKey: ["client-profile"],
    queryFn: () => clientService.getProfile(),
  });

  const greeting = profile?.full_name
    ? `Welcome, ${profile.full_name.split(" ")[0]}!`
    : "Welcome to your portal";

  const quickLinks = [
    {
      title: "My Connections",
      description: "View your broadband plan and connection status.",
      icon: Wifi,
      href: "/client/connections",
    },
    {
      title: "Billing",
      description: "View invoices and payment history.",
      icon: CreditCard,
      href: "/client/billing",
    },
    {
      title: "Documents",
      description: "Download invoices and statements.",
      icon: FileText,
      href: "/client/billing",
    },
  ];

  return (
    <ClientLayout title="Dashboard">
      <div className="space-y-8">
        {/* Welcome */}
        <div>
          {isLoading ? (
            <div className="flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin text-primary" />
              <span className="text-sm text-muted-foreground">Loading account…</span>
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
                    className={`font-medium ${
                      profile.status === "ACTIVE"
                        ? "text-green-600"
                        : profile.status === "SUSPENDED"
                          ? "text-yellow-600"
                          : "text-red-600"
                    }`}
                  >
                    {profile.status}
                  </span>
                </p>
              )}
            </>
          )}
        </div>

        {/* Quick links */}
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          {quickLinks.map((card) => (
            <a key={card.title} href={card.href} className="block group">
              <Card className="h-full transition-shadow group-hover:shadow-md">
                <CardHeader>
                  <div className="mb-2 flex h-11 w-11 items-center justify-center rounded-lg bg-primary/10 text-primary transition-colors group-hover:bg-primary/20">
                    <card.icon className="h-5 w-5" />
                  </div>
                  <CardTitle className="text-base">{card.title}</CardTitle>
                  <CardDescription>{card.description}</CardDescription>
                </CardHeader>
              </Card>
            </a>
          ))}
        </div>

        {/* Account summary */}
        {profile && (
          <Card>
            <CardHeader className="border-b border-border pb-3">
              <CardTitle className="text-sm font-semibold">Account Summary</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-1 gap-y-3 pt-4 sm:grid-cols-2">
              {[
                { label: "Name", value: profile.full_name },
                { label: "Mobile", value: profile.mobile_number },
                { label: "Email", value: profile.email },
                { label: "City", value: profile.city },
              ].map(({ label, value }) => (
                <div key={label} className="flex flex-col gap-0.5">
                  <span className="text-xs text-muted-foreground">{label}</span>
                  <span className="text-sm font-medium text-foreground">{value}</span>
                </div>
              ))}
            </CardContent>
          </Card>
        )}
      </div>
    </ClientLayout>
  );
}
