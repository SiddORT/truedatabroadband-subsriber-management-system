// Notification framework types

export type NotificationChannel = "EMAIL" | "SMS";
export type NotificationStatus = "PENDING" | "SENT" | "FAILED";
export type TemplateKey =
  | "WELCOME_CUSTOMER"
  | "PASSWORD_RESET"
  | "OTP_LOGIN"
  | "INVOICE_GENERATED"
  | "PAYMENT_RECEIVED"
  | "SUBSCRIPTION_EXPIRING"
  | "SUBSCRIPTION_EXPIRED"
  | "PLAN_CHANGED"
  | "SUPPORT_TICKET_CREATED";

// ── Template ──────────────────────────────────────────────────────────────

export interface NotificationTemplate {
  id: string;
  template_key: TemplateKey | string;
  channel: NotificationChannel;
  subject: string | null;
  body: string;
  is_active: boolean;
  dlt_template_id: string | null;
  dlt_entity_id: string | null;
  approved_variables: string[] | null;
  created_at: string;
  updated_at: string;
}

export interface NotificationTemplateUpdate {
  subject?: string | null;
  body?: string;
  is_active?: boolean;
  approved_variables?: string[];
  dlt_template_id?: string | null;
  dlt_entity_id?: string | null;
}

// ── Log ───────────────────────────────────────────────────────────────────

export interface NotificationLog {
  id: string;
  template_key: string;
  channel: NotificationChannel;
  recipient_email: string | null;
  recipient_mobile: string | null;
  entity_type: string | null;
  entity_id: string | null;
  subscription_id: string | null;
  days_offset: number | null;
  provider_name: string | null;
  provider_message_id: string | null;
  status: NotificationStatus;
  error_message: string | null;
  created_at: string;
  sent_at: string | null;
}

export interface NotificationLogPage {
  items: NotificationLog[];
  total: number;
  page: number;
  page_size: number;
  total_pages: number;
}

// ── Preference ────────────────────────────────────────────────────────────

export interface NotificationPreference {
  id: string;
  customer_id: string;
  welcome_sms_enabled: boolean;
  welcome_email_enabled: boolean;
  renewal_sms_enabled: boolean;
  renewal_email_enabled: boolean;
  invoice_email_enabled: boolean;
  payment_email_enabled: boolean;
  otp_sms_enabled: boolean;
  otp_email_enabled: boolean;
  created_at: string;
  updated_at: string;
}

// ── Display helpers ───────────────────────────────────────────────────────

export const TEMPLATE_KEY_LABELS: Record<string, string> = {
  WELCOME_CUSTOMER: "Welcome Customer",
  PASSWORD_RESET: "Password Reset",
  OTP_LOGIN: "OTP Login",
  INVOICE_GENERATED: "Invoice Generated",
  PAYMENT_RECEIVED: "Payment Received",
  SUBSCRIPTION_EXPIRING: "Subscription Expiring",
  SUBSCRIPTION_EXPIRED: "Subscription Expired",
  PLAN_CHANGED: "Plan Changed",
  SUPPORT_TICKET_CREATED: "Support Ticket Created",
};

export const CHANNEL_COLORS: Record<NotificationChannel, string> = {
  EMAIL: "bg-blue-100 text-blue-700",
  SMS: "bg-green-100 text-green-700",
};

export const STATUS_COLORS: Record<NotificationStatus, string> = {
  SENT: "bg-emerald-100 text-emerald-700",
  FAILED: "bg-red-100 text-red-700",
  PENDING: "bg-yellow-100 text-yellow-700",
};

export const TEMPLATE_KEY_OPTIONS: { label: string; value: string }[] = [
  { label: "All Templates", value: "" },
  ...Object.entries(TEMPLATE_KEY_LABELS).map(([value, label]) => ({ label, value })),
];

export const CHANNEL_OPTIONS: { label: string; value: string }[] = [
  { label: "All Channels", value: "" },
  { label: "Email", value: "EMAIL" },
  { label: "SMS", value: "SMS" },
];

export const STATUS_OPTIONS: { label: string; value: string }[] = [
  { label: "All Statuses", value: "" },
  { label: "Sent", value: "SENT" },
  { label: "Failed", value: "FAILED" },
  { label: "Pending", value: "PENDING" },
];
