import { Navigate } from "react-router-dom";

import { useAuth } from "@/hooks/useAuth";
import type { UserRole } from "@/types/auth";

interface ProtectedRouteProps {
  role: UserRole;
  loginPath: string;
  children: React.ReactNode;
}

/**
 * Guards a route by authentication + role.
 *
 * - Unauthenticated  → redirect to loginPath
 * - Wrong role       → redirect to /unauthorized
 * - must_change_password → redirect to /change-password (except on that page itself)
 * - Correct role     → render children
 */
export function ProtectedRoute({
  role,
  loginPath,
  children,
}: ProtectedRouteProps) {
  const { user, isLoading, mustChangePassword } = useAuth();

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-border border-t-primary" />
      </div>
    );
  }

  if (!user) return <Navigate to={loginPath} replace />;

  if (user.role !== role) return <Navigate to="/unauthorized" replace />;

  // Force password-change wall — cannot bypass any protected route.
  if (mustChangePassword) {
    return <Navigate to="/change-password" replace />;
  }

  return <>{children}</>;
}
