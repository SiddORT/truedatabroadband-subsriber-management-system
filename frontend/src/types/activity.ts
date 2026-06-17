export interface ActivityListItem {
  id: string;
  created_at: string;
  module: string | null;
  action: string;
  entity_type: string | null;
  entity_name: string | null;
  performed_by_name: string | null;
  ip_address: string | null;
}

export interface ActivityDetail extends ActivityListItem {
  entity_id: string | null;
  user_id: string | null;
  user_agent: string | null;
  old_values: Record<string, unknown> | null;
  new_values: Record<string, unknown> | null;
  remarks: string | null;
}

export interface ActivityPage {
  items: ActivityListItem[];
  total: number;
  page: number;
  page_size: number;
  total_pages: number;
}

export interface ActivityExportRequest {
  format: "csv" | "xlsx";
  filters: {
    search?: string;
    module?: string;
    action?: string;
    entity_type?: string;
    date_from?: string;
    date_to?: string;
  };
}

export interface ActivityExportResponse {
  download_url: string;
  expires_at: string;
  filename: string;
}

export const MODULE_COLORS: Record<string, string> = {
  AUTH: "bg-blue-100 text-blue-800",
  CUSTOMERS: "bg-green-100 text-green-800",
  PLANS: "bg-purple-100 text-purple-800",
  SUBSCRIPTIONS: "bg-indigo-100 text-indigo-800",
  INVOICES: "bg-orange-100 text-orange-800",
  PAYMENTS: "bg-emerald-100 text-emerald-800",
  SETTINGS: "bg-gray-100 text-gray-800",
  REPORTS: "bg-teal-100 text-teal-800",
  DASHBOARD: "bg-sky-100 text-sky-800",
  SYSTEM: "bg-slate-100 text-slate-700",
};

export const MODULE_OPTIONS = [
  "AUTH",
  "CUSTOMERS",
  "PLANS",
  "SUBSCRIPTIONS",
  "INVOICES",
  "PAYMENTS",
  "SETTINGS",
  "REPORTS",
];

export const ACTION_LABELS: Record<string, string> = {
  login: "Login",
  logout: "Logout",
  password_change: "Password Changed",
  customer_created: "Customer Created",
  customer_updated: "Customer Updated",
  customer_status_changed: "Customer Status Changed",
  customer_password_reset: "Customer Password Reset",
  customer_deleted: "Customer Deleted",
  plan_created: "Plan Created",
  plan_updated: "Plan Updated",
  plan_deleted: "Plan Deleted",
  pricing_created: "Pricing Created",
  pricing_updated: "Pricing Updated",
  pricing_deleted: "Pricing Deleted",
  subscription_created: "Subscription Created",
  subscription_renewed: "Subscription Renewed",
  subscription_status_changed: "Subscription Status Changed",
  subscription_plan_changed: "Plan Changed",
  subscription_deleted: "Subscription Deleted",
  settings_updated: "Settings Updated",
  settings_logo_uploaded: "Logo Uploaded",
  invoice_created: "Invoice Created",
  invoice_updated: "Invoice Updated",
  invoice_edited: "Invoice Edited",
  invoice_pdf_regenerated: "PDF Regenerated",
  invoice_generation_rejected: "Invoice Rejected",
  duplicate_invoice_blocked: "Duplicate Blocked",
  invoice_locked: "Invoice Locked",
  invoice_cancelled: "Invoice Cancelled",
  invoice_deleted: "Invoice Deleted",
  invoice_emailed: "Invoice Emailed",
  payment_recorded: "Payment Recorded",
  payment_deleted: "Payment Deleted",
  dashboard_viewed: "Dashboard Viewed",
  report_viewed: "Report Viewed",
  report_exported: "Report Exported",
};
