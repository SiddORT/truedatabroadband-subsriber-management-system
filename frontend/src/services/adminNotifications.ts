import { api } from "@/services/api";

export interface AdminNotification {
  id: string;
  user_id: string;
  notification_type: string;
  title: string;
  message: string;
  entity_type: string | null;
  entity_id: string | null;
  action_url: string | null;
  is_read: boolean;
  created_at: string;
  read_at: string | null;
}

export interface AdminNotificationsPage {
  items: AdminNotification[];
  total: number;
  unread_count: number;
}

export const adminNotificationsApi = {
  list: (params?: { page?: number; page_size?: number }) =>
    api
      .get<AdminNotificationsPage>("/admin/notifications", { params })
      .then((r) => r.data),

  markRead: (id: string) =>
    api
      .patch<AdminNotification>(`/admin/notifications/${id}/read`)
      .then((r) => r.data),

  markAllRead: () =>
    api.patch("/admin/notifications/read-all").then((r) => r.data),
};
