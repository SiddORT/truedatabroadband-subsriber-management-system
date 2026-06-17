// Communication infrastructure types

export type CommChannel = "SMS" | "EMAIL";
export type CommStatus = "PENDING" | "SENT" | "DELIVERED" | "FAILED";

// ── SMS Settings ──────────────────────────────────────────────────────────

export interface SmsSettingsOut {
  is_enabled: boolean;
  provider: string | null;
  api_base_url: string | null;
  status_api_url: string | null;
  api_key_configured: boolean;
  client_id_configured: boolean;
  sender_id_configured: boolean;
  entity_id_configured: boolean;
  test_template_id: string | null;
  test_message: string | null;
}

export interface SmsSettingsUpdate {
  is_enabled: boolean;
  provider?: string | null;
  api_base_url?: string | null;
  status_api_url?: string | null;
  api_key?: string | null;
  client_id?: string | null;
  sender_id?: string | null;
  entity_id?: string | null;
  replace_api_key?: boolean;
  replace_client_id?: boolean;
  replace_sender_id?: boolean;
  replace_entity_id?: boolean;
  test_template_id?: string | null;
  test_message?: string | null;
}

// ── Email Settings ────────────────────────────────────────────────────────

export interface EmailSettingsOut {
  is_enabled: boolean;
  host: string | null;
  port: number | null;
  from_email: string | null;
  from_name: string | null;
  use_tls: boolean;
  use_ssl: boolean;
  username_configured: boolean;
  password_configured: boolean;
}

export interface EmailSettingsUpdate {
  is_enabled: boolean;
  host?: string | null;
  port?: number | null;
  from_email?: string | null;
  from_name?: string | null;
  use_tls?: boolean;
  use_ssl?: boolean;
  username?: string | null;
  password?: string | null;
  replace_username?: boolean;
  replace_password?: boolean;
}

// ── Communication Logs ────────────────────────────────────────────────────

export interface CommunicationLog {
  id: string;
  channel: CommChannel;
  template_key: string | null;
  recipient_mobile: string | null;
  recipient_email: string | null;
  provider_name: string | null;
  provider_message_id: string | null;
  request_payload: Record<string, unknown> | null;
  response_payload: Record<string, unknown> | null;
  status: CommStatus;
  error_message: string | null;
  entity_type: string | null;
  entity_id: string | null;
  created_at: string;
  sent_at: string | null;
  delivered_at: string | null;
}

export interface CommunicationLogPage {
  items: CommunicationLog[];
  total: number;
  page: number;
  page_size: number;
  total_pages: number;
}

// ── UI Helpers ────────────────────────────────────────────────────────────

export const COMM_STATUS_COLORS: Record<CommStatus, string> = {
  PENDING: "bg-yellow-100 text-yellow-800",
  SENT: "bg-blue-100 text-blue-800",
  DELIVERED: "bg-green-100 text-green-800",
  FAILED: "bg-red-100 text-red-800",
};

export const COMM_CHANNEL_COLORS: Record<CommChannel, string> = {
  SMS: "bg-purple-100 text-purple-800",
  EMAIL: "bg-sky-100 text-sky-800",
};

export const SMS_PROVIDERS = [
  { value: "CUSTOM_API", label: "Custom API" },
  { value: "MSG91", label: "MSG91" },
  { value: "TEXTLOCAL", label: "TextLocal" },
  { value: "TWILIO", label: "Twilio" },
];
