import { api } from "./api";
import type {
  SmsSettingsOut,
  SmsSettingsUpdate,
  EmailSettingsOut,
  EmailSettingsUpdate,
  CommunicationLog,
  CommunicationLogPage,
} from "@/types/communication";

const BASE = "/settings/communication";

// ── SMS Settings ──────────────────────────────────────────────────────────

export async function getSmsSettings(): Promise<SmsSettingsOut> {
  const { data } = await api.get<SmsSettingsOut>(`${BASE}/sms`);
  return data;
}

export async function updateSmsSettings(payload: SmsSettingsUpdate): Promise<SmsSettingsOut> {
  const { data } = await api.put<SmsSettingsOut>(`${BASE}/sms`, payload);
  return data;
}

export async function testSms(mobile_number: string): Promise<{ success: boolean; provider_message_id?: string }> {
  const { data } = await api.post(`${BASE}/sms/test`, { mobile_number });
  return data;
}

// ── Email Settings ────────────────────────────────────────────────────────

export async function getEmailSettings(): Promise<EmailSettingsOut> {
  const { data } = await api.get<EmailSettingsOut>(`${BASE}/email`);
  return data;
}

export async function updateEmailSettings(payload: EmailSettingsUpdate): Promise<EmailSettingsOut> {
  const { data } = await api.put<EmailSettingsOut>(`${BASE}/email`, payload);
  return data;
}

export async function testEmail(email: string): Promise<{ success: boolean; message?: string }> {
  const { data } = await api.post(`${BASE}/email/test`, { email });
  return data;
}

// ── Communication Logs ────────────────────────────────────────────────────

export interface CommLogFilter {
  page?: number;
  page_size?: number;
  channel?: string;
  template_key?: string;
  status?: string;
  date_from?: string;
  date_to?: string;
}

export async function listCommunicationLogs(params: CommLogFilter = {}): Promise<CommunicationLogPage> {
  const { data } = await api.get<CommunicationLogPage>(`${BASE}/logs`, { params });
  return data;
}

export async function refreshLogStatus(logId: string): Promise<{ status: string }> {
  const { data } = await api.post<{ status: string }>(`${BASE}/logs/${logId}/refresh`);
  return data;
}
