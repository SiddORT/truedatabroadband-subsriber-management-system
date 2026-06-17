import { Navigate, Route, Routes } from "react-router-dom";

import { useAuth } from "@/hooks/useAuth";
import { LoginPage } from "@/pages/LoginPage";
import { AdminDashboard } from "@/pages/admin/Dashboard";
import { ClientDashboard } from "@/pages/client/Dashboard";
import { ChangePasswordPage } from "@/pages/ChangePasswordPage";
import { UnauthorizedPage } from "@/pages/UnauthorizedPage";
import { ProtectedRoute } from "@/routes/ProtectedRoute";
import { CustomerListPage } from "@/pages/admin/customers/CustomerListPage";
import { CustomerCreatePage } from "@/pages/admin/customers/CustomerCreatePage";
import { CustomerDetailPage } from "@/pages/admin/customers/CustomerDetailPage";
import { CustomerEditPage } from "@/pages/admin/customers/CustomerEditPage";
import { PlanListPage } from "@/pages/admin/plans/PlanListPage";
import { PlanCreatePage } from "@/pages/admin/plans/PlanCreatePage";
import { PlanDetailPage } from "@/pages/admin/plans/PlanDetailPage";
import { SubscriptionListPage } from "@/pages/admin/subscriptions/SubscriptionListPage";
import { SubscriptionCreatePage } from "@/pages/admin/subscriptions/SubscriptionCreatePage";
import { SubscriptionDetailPage } from "@/pages/admin/subscriptions/SubscriptionDetailPage";
import { ClientSubscriptionPage } from "@/pages/client/ClientSubscriptionPage";
import { ConnectionsPage } from "@/pages/client/ConnectionsPage";
import { ConnectionDetailPage } from "@/pages/client/ConnectionDetailPage";
import { RenewalRequestPage } from "@/pages/client/RenewalRequestPage";
import { PlanChangeRequestPage } from "@/pages/client/PlanChangeRequestPage";
import { SettingsPage } from "@/pages/admin/settings/SettingsPage";
import { InvoiceListPage } from "@/pages/admin/invoices/InvoiceListPage";
import { InvoiceCreatePage } from "@/pages/admin/invoices/InvoiceCreatePage";
import { InvoiceDetailPage } from "@/pages/admin/invoices/InvoiceDetailPage";
import { PaymentListPage } from "@/pages/admin/payments/PaymentListPage";
import { PaymentCreatePage } from "@/pages/admin/payments/PaymentCreatePage";
import { BillingOverviewPage } from "@/pages/client/BillingOverviewPage";
import { ClientInvoicePage } from "@/pages/client/ClientInvoicePage";
import { ClientInvoiceDetailPage } from "@/pages/client/ClientInvoiceDetailPage";
import { ClientPaymentPage } from "@/pages/client/ClientPaymentPage";
import { ProfilePage } from "@/pages/client/ProfilePage";
import { SessionsPage } from "@/pages/client/SessionsPage";
import { ReportsIndexPage } from "@/pages/admin/reports/ReportsIndexPage";
import { CustomerReportPage } from "@/pages/admin/reports/CustomerReportPage";
import { SubscriptionReportPage } from "@/pages/admin/reports/SubscriptionReportPage";
import { InvoiceReportPage } from "@/pages/admin/reports/InvoiceReportPage";
import { PaymentReportPage } from "@/pages/admin/reports/PaymentReportPage";
import { RevenueReportPage } from "@/pages/admin/reports/RevenueReportPage";
import { OutstandingReportPage } from "@/pages/admin/reports/OutstandingReportPage";
import { ActivityPage } from "@/pages/admin/activity/ActivityPage";
import { JobListPage } from "@/pages/admin/jobs/JobListPage";
import { JobDetailPage } from "@/pages/admin/jobs/JobDetailPage";
import { NotificationTemplatesPage } from "@/pages/admin/notifications/TemplatesPage";
import { NotificationLogsPage } from "@/pages/admin/notifications/LogsPage";
import { CommunicationsPage } from "@/pages/admin/communications/CommunicationsPage";
import { CommunicationSettingsPage } from "@/pages/admin/settings/CommunicationSettingsPage";
import { AdminSupportListPage } from "@/pages/admin/support/SupportListPage";
import { AdminSupportDetailPage } from "@/pages/admin/support/SupportDetailPage";
import { ClientSupportListPage } from "@/pages/client/support/SupportListPage";
import { ClientSupportNewPage } from "@/pages/client/support/SupportNewPage";
import { ClientSupportDetailPage } from "@/pages/client/support/SupportDetailPage";

/** Redirect to /change-password if logged in and forced, else to login. */
function RootRedirect() {
  const { user, mustChangePassword } = useAuth();
  if (user && mustChangePassword) return <Navigate to="/change-password" replace />;
  return <Navigate to="/admin/login" replace />;
}

function ClientRoute({ children }: { children: React.ReactNode }) {
  return (
    <ProtectedRoute role="CLIENT" loginPath="/client/login">
      {children}
    </ProtectedRoute>
  );
}

function AdminRoute({ children }: { children: React.ReactNode }) {
  return (
    <ProtectedRoute role="SUPERADMIN" loginPath="/admin/login">
      {children}
    </ProtectedRoute>
  );
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<RootRedirect />} />

      {/* Login portals */}
      <Route
        path="/admin/login"
        element={
          <LoginPage
            role="SUPERADMIN"
            title="Admin Portal"
            subtitle="Sign in to manage True Data Broadband."
            redirectTo="/admin/dashboard"
          />
        }
      />
      <Route
        path="/client/login"
        element={
          <LoginPage
            role="CLIENT"
            title="Client Portal"
            subtitle="Sign in to access your broadband account."
            redirectTo="/client/dashboard"
          />
        }
      />

      {/* Legacy /login → admin login */}
      <Route path="/login" element={<Navigate to="/admin/login" replace />} />

      {/* Force-password-change wall */}
      <Route path="/change-password" element={<ChangePasswordPage />} />

      {/* Unauthorized */}
      <Route path="/unauthorized" element={<UnauthorizedPage />} />

      {/* /admin → /admin/dashboard shortcut */}
      <Route path="/admin" element={<Navigate to="/admin/dashboard" replace />} />

      {/* ------------------------------------------------------------------ */}
      {/* Admin routes                                                        */}
      {/* ------------------------------------------------------------------ */}

      <Route path="/admin/dashboard" element={<AdminRoute><AdminDashboard /></AdminRoute>} />

      {/* Customer management */}
      <Route path="/admin/customers" element={<AdminRoute><CustomerListPage /></AdminRoute>} />
      <Route path="/admin/customers/new" element={<AdminRoute><CustomerCreatePage /></AdminRoute>} />
      <Route path="/admin/customers/:id" element={<AdminRoute><CustomerDetailPage /></AdminRoute>} />
      <Route path="/admin/customers/:id/edit" element={<AdminRoute><CustomerEditPage /></AdminRoute>} />

      {/* Plans & Pricing */}
      <Route path="/admin/plans" element={<AdminRoute><PlanListPage /></AdminRoute>} />
      <Route path="/admin/plans/new" element={<AdminRoute><PlanCreatePage /></AdminRoute>} />
      <Route path="/admin/plans/:id" element={<AdminRoute><PlanDetailPage /></AdminRoute>} />

      {/* Subscriptions */}
      <Route path="/admin/subscriptions" element={<AdminRoute><SubscriptionListPage /></AdminRoute>} />
      <Route path="/admin/subscriptions/new" element={<AdminRoute><SubscriptionCreatePage /></AdminRoute>} />
      <Route path="/admin/subscriptions/:id" element={<AdminRoute><SubscriptionDetailPage /></AdminRoute>} />

      {/* Invoices */}
      <Route path="/admin/invoices" element={<AdminRoute><InvoiceListPage /></AdminRoute>} />
      <Route path="/admin/invoices/new" element={<AdminRoute><InvoiceCreatePage /></AdminRoute>} />
      <Route path="/admin/invoices/:id" element={<AdminRoute><InvoiceDetailPage /></AdminRoute>} />

      {/* Payments */}
      <Route path="/admin/payments" element={<AdminRoute><PaymentListPage /></AdminRoute>} />
      <Route path="/admin/payments/new" element={<AdminRoute><PaymentCreatePage /></AdminRoute>} />

      {/* Reports */}
      <Route path="/admin/reports" element={<AdminRoute><ReportsIndexPage /></AdminRoute>} />
      <Route path="/admin/reports/customers" element={<AdminRoute><CustomerReportPage /></AdminRoute>} />
      <Route path="/admin/reports/subscriptions" element={<AdminRoute><SubscriptionReportPage /></AdminRoute>} />
      <Route path="/admin/reports/invoices" element={<AdminRoute><InvoiceReportPage /></AdminRoute>} />
      <Route path="/admin/reports/payments" element={<AdminRoute><PaymentReportPage /></AdminRoute>} />
      <Route path="/admin/reports/revenue" element={<AdminRoute><RevenueReportPage /></AdminRoute>} />
      <Route path="/admin/reports/outstanding" element={<AdminRoute><OutstandingReportPage /></AdminRoute>} />

      {/* Notifications */}
      <Route path="/admin/notifications/templates" element={<AdminRoute><NotificationTemplatesPage /></AdminRoute>} />
      <Route path="/admin/notifications/logs" element={<AdminRoute><NotificationLogsPage /></AdminRoute>} />

      {/* Communications */}
      <Route path="/admin/communications" element={<AdminRoute><CommunicationsPage /></AdminRoute>} />

      {/* Activity */}
      <Route path="/admin/activity" element={<AdminRoute><ActivityPage /></AdminRoute>} />
      <Route path="/admin/jobs" element={<AdminRoute><JobListPage /></AdminRoute>} />
      <Route path="/admin/jobs/:id" element={<AdminRoute><JobDetailPage /></AdminRoute>} />

      {/* Support */}
      <Route path="/admin/support" element={<AdminRoute><AdminSupportListPage /></AdminRoute>} />
      <Route path="/admin/support/:id" element={<AdminRoute><AdminSupportDetailPage /></AdminRoute>} />

      {/* Settings */}
      <Route path="/admin/settings" element={<AdminRoute><SettingsPage /></AdminRoute>} />
      <Route path="/admin/settings/communication" element={<AdminRoute><CommunicationSettingsPage /></AdminRoute>} />

      {/* ------------------------------------------------------------------ */}
      {/* Client routes                                                       */}
      {/* ------------------------------------------------------------------ */}

      {/* /client → /client/dashboard shortcut */}
      <Route path="/client" element={<Navigate to="/client/dashboard" replace />} />

      <Route path="/client/dashboard" element={<ClientRoute><ClientDashboard /></ClientRoute>} />

      {/* My Connections */}
      <Route path="/client/connections" element={<ClientRoute><ConnectionsPage /></ClientRoute>} />
      <Route path="/client/connections/:id" element={<ClientRoute><ConnectionDetailPage /></ClientRoute>} />
      <Route path="/client/connections/:id/renew" element={<ClientRoute><RenewalRequestPage /></ClientRoute>} />
      <Route path="/client/connections/:id/change-plan" element={<ClientRoute><PlanChangeRequestPage /></ClientRoute>} />
      {/* Legacy path kept for compatibility */}
      <Route path="/client/subscription" element={<Navigate to="/client/connections" replace />} />

      {/* Billing */}
      <Route path="/client/billing" element={<ClientRoute><BillingOverviewPage /></ClientRoute>} />
      <Route path="/client/billing/invoices" element={<ClientRoute><ClientInvoicePage /></ClientRoute>} />
      <Route path="/client/billing/invoices/:id" element={<ClientRoute><ClientInvoiceDetailPage /></ClientRoute>} />
      <Route path="/client/billing/payments" element={<ClientRoute><ClientPaymentPage /></ClientRoute>} />
      {/* Legacy paths */}
      <Route path="/client/invoices" element={<Navigate to="/client/billing/invoices" replace />} />
      <Route path="/client/payments" element={<Navigate to="/client/billing/payments" replace />} />

      {/* Support */}
      <Route path="/client/support" element={<ClientRoute><ClientSupportListPage /></ClientRoute>} />
      <Route path="/client/support/new" element={<ClientRoute><ClientSupportNewPage /></ClientRoute>} />
      <Route path="/client/support/:id" element={<ClientRoute><ClientSupportDetailPage /></ClientRoute>} />

      {/* Profile */}
      <Route path="/client/profile" element={<ClientRoute><ProfilePage /></ClientRoute>} />

      {/* Sessions */}
      <Route path="/client/sessions" element={<ClientRoute><SessionsPage /></ClientRoute>} />

      {/* Catch-all */}
      <Route path="*" element={<Navigate to="/admin/login" replace />} />
    </Routes>
  );
}
