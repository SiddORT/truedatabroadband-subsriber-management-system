import { api } from "./api";
import type {
  NotificationLogPage,
  NotificationPreference,
  NotificationTemplate,
  NotificationTemplateUpdate,
} from "@/types/notification";

const BASE = "/notifications";

// ── Templates ─────────────────────────────────────────────────────────────

export async function listTemplates(): Promise<NotificationTemplate[]> {
  const { data } = await api.get<NotificationTemplate[]>(`${BASE}/templates`);
  return data;
}

export async function updateTemplate(
  id: string,
  payload: NotificationTemplateUpdate,
): Promise<NotificationTemplate> {
  const { data } = await api.put<NotificationTemplate>(
    `${BASE}/templates/${id}`,
    payload,
  );
  return data;
}

// ── Logs ──────────────────────────────────────────────────────────────────

export interface LogFilter {
  page?: number;
  page_size?: number;
  template_key?: string;
  channel?: string;
  status?: string;
  date_from?: string;
  date_to?: string;
}

export async function listLogs(params: LogFilter = {}): Promise<NotificationLogPage> {
  const { data } = await api.get<NotificationLogPage>(`${BASE}/logs`, { params });
  return data;
}

// ── Preferences ───────────────────────────────────────────────────────────

export async function getPreferences(customerId: string): Promise<NotificationPreference> {
  const { data } = await api.get<NotificationPreference>(
    `${BASE}/preferences/${customerId}`,
  );
  return data;
}

export async function updatePreferences(
  customerId: string,
  payload: Partial<NotificationPreference>,
): Promise<NotificationPreference> {
  const { data } = await api.put<NotificationPreference>(
    `${BASE}/preferences/${customerId}`,
    payload,
  );
  return data;
}

// ── Test send ─────────────────────────────────────────────────────────────

export async function testEmail(params: {
  to_email: string;
  subject?: string;
  body?: string;
}): Promise<{ success: boolean; message: string }> {
  const { data } = await api.post(`${BASE}/test-email`, params);
  return data;
}

export async function testSms(params: {
  to_mobile: string;
  message?: string;
}): Promise<{ success: boolean; message: string }> {
  const { data } = await api.post(`${BASE}/test-sms`, params);
  return data;
}

export const notificationService = {
  listTemplates,
  updateTemplate,
  listLogs,
  getPreferences,
  updatePreferences,
  testEmail,
  testSms,
};
