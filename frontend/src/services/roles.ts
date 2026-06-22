import { api as apiClient } from "./api";
import type {
  Role,
  RoleCreate,
  RoleListResponse,
  RoleUpdate,
  StaffUser,
  StaffUserInvite,
  StaffUserListResponse,
  StaffUserUpdate,
} from "@/types/roles";

// ── Roles ────────────────────────────────────────────────────────────────────

export const rolesService = {
  list: (includeInactive = false) =>
    apiClient
      .get<RoleListResponse>("/roles", { params: { include_inactive: includeInactive } })
      .then((r) => r.data),

  get: (id: string) =>
    apiClient.get<Role>(`/roles/${id}`).then((r) => r.data),

  create: (payload: RoleCreate) =>
    apiClient.post<Role>("/roles", payload).then((r) => r.data),

  update: (id: string, payload: RoleUpdate) =>
    apiClient.patch<Role>(`/roles/${id}`, payload).then((r) => r.data),

  delete: (id: string) =>
    apiClient.delete(`/roles/${id}`),
};

// ── Staff Users ───────────────────────────────────────────────────────────────

export const staffUsersService = {
  list: (params?: { skip?: number; limit?: number; search?: string; role_id?: string }) =>
    apiClient
      .get<StaffUserListResponse>("/staff-users", { params })
      .then((r) => r.data),

  get: (id: string) =>
    apiClient.get<StaffUser>(`/staff-users/${id}`).then((r) => r.data),

  invite: (payload: StaffUserInvite) =>
    apiClient.post<StaffUser>("/staff-users", payload).then((r) => r.data),

  update: (id: string, payload: StaffUserUpdate) =>
    apiClient.patch<StaffUser>(`/staff-users/${id}`, payload).then((r) => r.data),

  resendInvite: (id: string) =>
    apiClient.post<StaffUser>(`/staff-users/${id}/resend-invite`).then((r) => r.data),

  delete: (id: string) =>
    apiClient.delete(`/staff-users/${id}`),
};

// ── Accept Invite (public) ───────────────────────────────────────────────────

export const acceptInvite = (payload: {
  token: string;
  password: string;
  confirm_password: string;
}) =>
  apiClient
    .post<{ message: string }>("/auth/accept-invite", payload)
    .then((r) => r.data);
