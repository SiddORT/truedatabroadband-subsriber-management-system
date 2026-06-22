import { useAuth } from "./useAuth";

/**
 * Returns true if the current user has the given module/action permission.
 * SUPERADMIN always returns true. CLIENT always returns false.
 * STAFF checks their role's permission matrix.
 */
export function usePermission(module: string, action: string): boolean {
  const { user } = useAuth();
  if (!user) return false;
  if (user.role === "SUPERADMIN") return true;
  if (user.role !== "STAFF") return false;
  return user.staff_permissions?.[module]?.[action] === true;
}
