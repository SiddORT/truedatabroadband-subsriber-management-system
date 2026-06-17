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
import { SettingsPage } from "@/pages/admin/settings/SettingsPage";
import { InvoiceListPage } from "@/pages/admin/invoices/InvoiceListPage";
import { InvoiceCreatePage } from "@/pages/admin/invoices/InvoiceCreatePage";
import { InvoiceDetailPage } from "@/pages/admin/invoices/InvoiceDetailPage";
import { PaymentListPage } from "@/pages/admin/payments/PaymentListPage";
import { PaymentCreatePage } from "@/pages/admin/payments/PaymentCreatePage";
import { ClientInvoicePage } from "@/pages/client/ClientInvoicePage";
import { ClientPaymentPage } from "@/pages/client/ClientPaymentPage";

/** Redirect to /change-password if logged in and forced, else to login. */
function RootRedirect() {
  const { user, mustChangePassword } = useAuth();
  if (user && mustChangePassword) return <Navigate to="/change-password" replace />;
  return <Navigate to="/admin/login" replace />;
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

      {/* Force-password-change wall */}
      <Route path="/change-password" element={<ChangePasswordPage />} />

      {/* Unauthorized */}
      <Route path="/unauthorized" element={<UnauthorizedPage />} />

      {/* /admin → /admin/dashboard shortcut */}
      <Route path="/admin" element={<Navigate to="/admin/dashboard" replace />} />

      {/* Protected dashboards */}
      <Route
        path="/admin/dashboard"
        element={
          <ProtectedRoute role="SUPERADMIN" loginPath="/admin/login">
            <AdminDashboard />
          </ProtectedRoute>
        }
      />

      {/* Customer management */}
      <Route
        path="/admin/customers"
        element={
          <ProtectedRoute role="SUPERADMIN" loginPath="/admin/login">
            <CustomerListPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/admin/customers/new"
        element={
          <ProtectedRoute role="SUPERADMIN" loginPath="/admin/login">
            <CustomerCreatePage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/admin/customers/:id"
        element={
          <ProtectedRoute role="SUPERADMIN" loginPath="/admin/login">
            <CustomerDetailPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/admin/customers/:id/edit"
        element={
          <ProtectedRoute role="SUPERADMIN" loginPath="/admin/login">
            <CustomerEditPage />
          </ProtectedRoute>
        }
      />

      {/* Plans & Pricing */}
      <Route
        path="/admin/plans"
        element={
          <ProtectedRoute role="SUPERADMIN" loginPath="/admin/login">
            <PlanListPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/admin/plans/new"
        element={
          <ProtectedRoute role="SUPERADMIN" loginPath="/admin/login">
            <PlanCreatePage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/admin/plans/:id"
        element={
          <ProtectedRoute role="SUPERADMIN" loginPath="/admin/login">
            <PlanDetailPage />
          </ProtectedRoute>
        }
      />

      {/* Subscriptions */}
      <Route
        path="/admin/subscriptions"
        element={
          <ProtectedRoute role="SUPERADMIN" loginPath="/admin/login">
            <SubscriptionListPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/admin/subscriptions/new"
        element={
          <ProtectedRoute role="SUPERADMIN" loginPath="/admin/login">
            <SubscriptionCreatePage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/admin/subscriptions/:id"
        element={
          <ProtectedRoute role="SUPERADMIN" loginPath="/admin/login">
            <SubscriptionDetailPage />
          </ProtectedRoute>
        }
      />

      {/* Invoices */}
      <Route
        path="/admin/invoices"
        element={
          <ProtectedRoute role="SUPERADMIN" loginPath="/admin/login">
            <InvoiceListPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/admin/invoices/new"
        element={
          <ProtectedRoute role="SUPERADMIN" loginPath="/admin/login">
            <InvoiceCreatePage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/admin/invoices/:id"
        element={
          <ProtectedRoute role="SUPERADMIN" loginPath="/admin/login">
            <InvoiceDetailPage />
          </ProtectedRoute>
        }
      />

      {/* Payments */}
      <Route
        path="/admin/payments"
        element={
          <ProtectedRoute role="SUPERADMIN" loginPath="/admin/login">
            <PaymentListPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/admin/payments/new"
        element={
          <ProtectedRoute role="SUPERADMIN" loginPath="/admin/login">
            <PaymentCreatePage />
          </ProtectedRoute>
        }
      />

      {/* Settings */}
      <Route
        path="/admin/settings"
        element={
          <ProtectedRoute role="SUPERADMIN" loginPath="/admin/login">
            <SettingsPage />
          </ProtectedRoute>
        }
      />

      {/* Client */}
      <Route
        path="/client/dashboard"
        element={
          <ProtectedRoute role="CLIENT" loginPath="/client/login">
            <ClientDashboard />
          </ProtectedRoute>
        }
      />
      <Route
        path="/client/subscription"
        element={
          <ProtectedRoute role="CLIENT" loginPath="/client/login">
            <ClientSubscriptionPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/client/invoices"
        element={
          <ProtectedRoute role="CLIENT" loginPath="/client/login">
            <ClientInvoicePage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/client/payments"
        element={
          <ProtectedRoute role="CLIENT" loginPath="/client/login">
            <ClientPaymentPage />
          </ProtectedRoute>
        }
      />

      {/* Catch-all */}
      <Route path="*" element={<Navigate to="/admin/login" replace />} />
    </Routes>
  );
}
