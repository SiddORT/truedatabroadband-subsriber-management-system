import { Navigate } from "react-router-dom";

import { useAuth } from "@/hooks/useAuth";
import type { UserRole } from "@/types/auth";

interface ProtectedRouteProps {
  /**
   * Single required role OR an array of accepted roles.
   * If an array is provided, the user's role must be in that list.
   */
  role: UserRole | UserRole[];
  loginPath: string;
  children: React.ReactNode;
}

/**
 * Guards a route by authentication + role.
 *
 * - Unauthenticated              → redirect to loginPath
 * - Role not in accepted list    → redirect to /unauthorized
 * - must_change_password         → redirect to /change-password
 * - All checks pass              → render children
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

  const accepted = Array.isArray(role) ? role : [role];
  if (!accepted.includes(user.role)) return <Navigate to="/unauthorized" replace />;

  if (mustChangePassword) {
    return <Navigate to="/change-password" replace />;
  }

  return <>{children}</>;
}
