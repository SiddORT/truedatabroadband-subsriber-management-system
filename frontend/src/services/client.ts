import { api } from "@/services/api";
import type {
  BillingSummary,
  ClientInvoiceDetail,
  ClientInvoicesPage,
  ClientPaymentListItem,
  ClientPaymentsPage,
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

  // Billing summary
  async getBillingSummary(): Promise<BillingSummary> {
    const { data } = await api.get<BillingSummary>("/client/billing/summary");
    return data;
  },

  // Invoice list (with filters)
  async listInvoices(params: {
    page?: number;
    page_size?: number;
    search?: string;
    status?: string;
    connection_id?: string;
    invoice_date_start?: string;
    invoice_date_end?: string;
    due_date_start?: string;
    due_date_end?: string;
    due_today?: boolean;
    due_in_7_days?: boolean;
    overdue?: boolean;
    sort_by?: string;
    sort_order?: string;
  }): Promise<ClientInvoicesPage> {
    const { data } = await api.get<ClientInvoicesPage>("/client/invoices", { params });
    return data;
  },

  // Invoice detail
  async getInvoiceDetail(id: string): Promise<ClientInvoiceDetail> {
    const { data } = await api.get<ClientInvoiceDetail>(`/client/invoices/${id}`);
    return data;
  },

  // Invoice PDF URL
  invoicePdfUrl(id: string): string {
    return `/api/v1/client/invoices/${id}/pdf`;
  },

  // Email invoice
  async emailInvoice(id: string): Promise<{ message: string }> {
    const { data } = await api.post<{ message: string }>(`/client/invoices/${id}/email`);
    return data;
  },

  // Payment list (with filters)
  async listPayments(params: {
    page?: number;
    page_size?: number;
    search?: string;
    connection_id?: string;
    payment_date_start?: string;
    payment_date_end?: string;
    sort_by?: string;
    sort_order?: string;
  }): Promise<ClientPaymentsPage> {
    const { data } = await api.get<ClientPaymentsPage>("/client/payments", { params });
    return data;
  },

  // Payment detail
  async getPaymentDetail(id: string): Promise<ClientPaymentListItem> {
    const { data } = await api.get<ClientPaymentListItem>(`/client/payments/${id}`);
    return data;
  },
};
