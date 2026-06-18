import { api } from "@/services/api";

export interface TicketAttachment {
  id: string;
  ticket_message_id: string;
  original_filename: string;
  file_name: string;
  file_size: number;
  mime_type: string;
  created_at: string;
}

export interface TicketMessage {
  id: string;
  ticket_id: string;
  sender_user_id: string;
  sender_name: string;
  sender_role: string;
  message: string;
  is_internal_note: boolean;
  created_at: string;
  attachments: TicketAttachment[];
}

export interface ClientTicketListItem {
  id: string;
  ticket_number: string;
  subject: string;
  category: string;
  status: string;
  priority: string;
  created_at: string;
  updated_at: string;
}

export interface ClientTicketOut {
  id: string;
  ticket_number: string;
  subject: string;
  description: string;
  category: string;
  status: string;
  priority: string;
  subscription_id: string | null;
  created_at: string;
  updated_at: string;
  messages: TicketMessage[];
}

export interface ClientTicketsPage {
  items: ClientTicketListItem[];
  total: number;
  page: number;
  page_size: number;
  total_pages: number;
}

export interface AdminTicketListItem {
  id: string;
  ticket_number: string;
  customer_name: string;
  customer_code: string;
  connection_name: string;
  subject: string;
  category: string;
  priority: string;
  status: string;
  assigned_to_name: string;
  created_at: string;
  updated_at: string;
}

export interface CustomerContext {
  customer_name: string;
  customer_code: string;
  mobile_number: string;
  email: string;
}

export interface SubscriptionContext {
  connection_name: string;
  plan_name: string;
  expiry_date: string | null;
}

export interface AdminTicketOut {
  id: string;
  ticket_number: string;
  subject: string;
  description: string;
  category: string;
  status: string;
  priority: string;
  created_at: string;
  updated_at: string;
  first_response_at: string | null;
  resolved_at: string | null;
  closed_at: string | null;
  assigned_to_user_id: string | null;
  assigned_to_name: string;
  customer: CustomerContext;
  subscription: SubscriptionContext | null;
  outstanding_amount: number;
  messages: TicketMessage[];
}

export interface AdminTicketsPage {
  items: AdminTicketListItem[];
  total: number;
  page: number;
  page_size: number;
  total_pages: number;
}

export interface SupportDashboardStats {
  open_tickets: number;
  high_priority_tickets: number;
  waiting_for_customer: number;
  resolved_today: number;
  recent_tickets: AdminTicketListItem[];
}

// ── Client API ──────────────────────────────────────────────────────────────

export const clientSupportApi = {
  list: (params?: {
    page?: number;
    page_size?: number;
    status?: string;
    category?: string;
    search?: string;
  }) =>
    api
      .get<ClientTicketsPage>("/client/support", { params })
      .then((r) => r.data),

  get: (id: string) =>
    api.get<ClientTicketOut>(`/client/support/${id}`).then((r) => r.data),

  create: (payload: {
    subject: string;
    description: string;
    category: string;
    subscription_id?: string | null;
  }) => api.post<ClientTicketOut>("/client/support", payload).then((r) => r.data),

  reply: (id: string, message: string) =>
    api
      .post<TicketMessage>(`/client/support/${id}/reply`, { message })
      .then((r) => r.data),

  close: (id: string) =>
    api.post<ClientTicketOut>(`/client/support/${id}/close`).then((r) => r.data),

  uploadAttachment: (id: string, file: File) => {
    const fd = new FormData();
    fd.append("file", file);
    return api
      .post<TicketAttachment>(`/client/support/${id}/attachments`, fd, {
        headers: { "Content-Type": "multipart/form-data" },
      })
      .then((r) => r.data);
  },
};

// ── Admin API ───────────────────────────────────────────────────────────────

export const adminSupportApi = {
  list: (params?: {
    page?: number;
    page_size?: number;
    status?: string;
    category?: string;
    priority?: string;
    assigned_to_user_id?: string;
    customer_id?: string;
    search?: string;
  }) =>
    api
      .get<AdminTicketsPage>("/admin/support", { params })
      .then((r) => r.data),

  get: (id: string) =>
    api.get<AdminTicketOut>(`/admin/support/${id}`).then((r) => r.data),

  update: (
    id: string,
    payload: {
      status?: string;
      priority?: string;
      assigned_to_user_id?: string | null;
    }
  ) =>
    api.patch<AdminTicketOut>(`/admin/support/${id}`, payload).then((r) => r.data),

  close: (id: string) =>
    api.patch<AdminTicketOut>(`/admin/support/${id}`, { status: "CLOSED" }).then((r) => r.data),

  reply: (id: string, message: string) =>
    api
      .post<TicketMessage>(`/admin/support/${id}/reply`, { message, is_internal_note: false })
      .then((r) => r.data),

  addInternalNote: (id: string, message: string) =>
    api
      .post<TicketMessage>(`/admin/support/${id}/internal-note`, {
        message,
        is_internal_note: true,
      })
      .then((r) => r.data),

  uploadAttachment: (id: string, file: File) => {
    const fd = new FormData();
    fd.append("file", file);
    return api
      .post<TicketAttachment>(`/admin/support/${id}/attachments`, fd, {
        headers: { "Content-Type": "multipart/form-data" },
      })
      .then((r) => r.data);
  },

  dashboardStats: () =>
    api
      .get<SupportDashboardStats>("/admin/support/dashboard-stats")
      .then((r) => r.data),
};
