import { Navigate, Route, Routes } from "react-router-dom";

import { useAuth } from "@/hooks/useAuth";
import { LoginPage } from "@/pages/LoginPage";
import { AdminDashboard } from "@/pages/admin/Dashboard";
import { ClientDashboard } from "@/pages/client/Dashboard";
import { ChangePasswordPage } from "@/pages/ChangePasswordPage";
import { UnauthorizedPage } from "@/pages/UnauthorizedPage";
import { ProtectedRoute } from "@/routes/ProtectedRoute";

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
            subtitle="Sign in to manage True Data Broadband Services."
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

      {/* Force-password-change wall (accessible while authenticated, any role) */}
      <Route path="/change-password" element={<ChangePasswordPage />} />

      {/* Unauthorized */}
      <Route path="/unauthorized" element={<UnauthorizedPage />} />

      {/* Protected dashboards */}
      <Route
        path="/admin/dashboard"
        element={
          <ProtectedRoute role="SUPERADMIN" loginPath="/admin/login">
            <AdminDashboard />
          </ProtectedRoute>
        }
      />
      <Route
        path="/client/dashboard"
        element={
          <ProtectedRoute role="CLIENT" loginPath="/client/login">
            <ClientDashboard />
          </ProtectedRoute>
        }
      />

      {/* Catch-all */}
      <Route path="*" element={<Navigate to="/admin/login" replace />} />
    </Routes>
  );
}
