import { Navigate } from "react-router-dom";

import { useAuth } from "@/hooks/useAuth";
import type { UserRole } from "@/types/auth";

interface ProtectedRouteProps {
  role: UserRole;
  loginPath: string;
  children: React.ReactNode;
}

export function ProtectedRoute({
  role,
  loginPath,
  children,
}: ProtectedRouteProps) {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-border border-t-primary" />
      </div>
    );
  }

  if (!user) {
    return <Navigate to={loginPath} replace />;
  }

  if (user.role !== role) {
    // Logged in but wrong portal — send to their own dashboard.
    const target =
      user.role === "SUPERADMIN" ? "/admin/dashboard" : "/client/dashboard";
    return <Navigate to={target} replace />;
  }

  return <>{children}</>;
}
