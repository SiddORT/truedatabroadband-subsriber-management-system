import { Navigate, Route, Routes } from "react-router-dom";

import { LoginPage } from "@/pages/LoginPage";
import { AdminDashboard } from "@/pages/admin/Dashboard";
import { ClientDashboard } from "@/pages/client/Dashboard";
import { ProtectedRoute } from "@/routes/ProtectedRoute";

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/admin/login" replace />} />

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

      <Route path="*" element={<Navigate to="/admin/login" replace />} />
    </Routes>
  );
}
