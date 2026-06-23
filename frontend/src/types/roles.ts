export interface RolePermissions {
  view: boolean;
  add: boolean;
  edit: boolean;
  delete: boolean;
}

export type PermissionMap = Record<string, RolePermissions>;

export interface Role {
  id: string;
  name: string;
  description: string | null;
  data_scope: "ALL" | "ASSIGNED" | "REFERENCE";
  permissions: PermissionMap | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  user_count: number;
}

export interface RoleListResponse {
  items: Role[];
  total: number;
}

export interface RoleCreate {
  name: string;
  description?: string;
  data_scope: "ALL" | "ASSIGNED" | "REFERENCE";
  permissions: PermissionMap;
  is_active: boolean;
}

export interface RoleUpdate {
  name?: string;
  description?: string;
  data_scope?: "ALL" | "ASSIGNED" | "REFERENCE";
  permissions?: PermissionMap;
  is_active?: boolean;
}

export interface StaffUser {
  id: string;
  email: string;
  display_name: string | null;
  role_id: string | null;
  is_active: boolean;
  invite_status: "INVITED" | "ACTIVE" | "INACTIVE";
  invite_accepted_at: string | null;
  last_login_at: string | null;
  created_at: string;
  updated_at: string;
  staff_role: Role | null;
}

export interface StaffUserListResponse {
  items: StaffUser[];
  total: number;
}

export interface StaffUserInvite {
  email: string;
  display_name: string;
  role_id: string;
}

export interface StaffUserUpdate {
  display_name?: string;
  email?: string;
  role_id?: string;
  is_active?: boolean;
}

export const PERMISSION_MODULES = [
  { key: "customers", label: "Customers" },
  { key: "subscriptions", label: "Subscriptions" },
  { key: "invoices", label: "Invoices" },
  { key: "payments", label: "Payments" },
  { key: "plans", label: "Plans & Pricing" },
  { key: "reports", label: "Reports" },
  { key: "support_tickets", label: "Support Tickets" },
  { key: "users", label: "Users & Roles" },
  { key: "settings", label: "Settings" },
  { key: "logs", label: "Activity Logs" },
] as const;

export const PERMISSION_ACTIONS = ["view", "add", "edit", "delete"] as const;

export function emptyPermissions(): PermissionMap {
  const map: PermissionMap = {};
  for (const { key } of PERMISSION_MODULES) {
    map[key] = { view: false, add: false, edit: false, delete: false };
  }
  return map;
}
