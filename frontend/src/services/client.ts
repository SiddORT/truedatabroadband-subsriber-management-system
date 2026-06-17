import { api } from "@/services/api";
import type {
  ClientProfile,
  ClientProfileUpdate,
  ClientSession,
  DashboardConnection,
  DashboardInvoicesResponse,
  DashboardNotification,
  DashboardPayment,
  DashboardSummary,
} from "@/types/client";

export const clientService = {
  async getProfile(): Promise<ClientProfile> {
    const { data } = await api.get<ClientProfile>("/client/profile");
    return data;
  },

  async updateProfile(payload: ClientProfileUpdate): Promise<ClientProfile> {
    const { data } = await api.put<ClientProfile>("/client/profile", payload);
    return data;
  },

  async getSessions(): Promise<ClientSession[]> {
    const { data } = await api.get<ClientSession[]>("/client/sessions");
    return data;
  },

  async revokeSession(jti: string): Promise<void> {
    await api.post("/client/sessions/revoke", { jti });
  },

  async logoutAll(): Promise<void> {
    await api.post("/client/logout-all");
  },

  // Dashboard
  async getDashboardSummary(): Promise<DashboardSummary> {
    const { data } = await api.get<DashboardSummary>("/client/dashboard/summary");
    return data;
  },

  async getDashboardConnections(): Promise<DashboardConnection[]> {
    const { data } = await api.get<DashboardConnection[]>("/client/dashboard/connections");
    return data;
  },

  async getDashboardInvoices(): Promise<DashboardInvoicesResponse> {
    const { data } = await api.get<DashboardInvoicesResponse>("/client/dashboard/invoices");
    return data;
  },

  async getDashboardPayments(): Promise<DashboardPayment[]> {
    const { data } = await api.get<DashboardPayment[]>("/client/dashboard/payments");
    return data;
  },

  async getDashboardNotifications(): Promise<DashboardNotification[]> {
    const { data } = await api.get<DashboardNotification[]>("/client/dashboard/notifications");
    return data;
  },
};
