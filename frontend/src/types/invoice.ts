export interface LineItem {
  description: string;
  amount: string;
}

export interface InvoiceListItem {
  id: string;
  invoice_number: string;
  customer_code_snapshot: string;
  customer_name_snapshot: string;
  connection_name_snapshot: string;
  invoice_date: string;
  due_date: string;
  total_amount: string;
  balance_amount: string;
  paid_amount: string;
  status: InvoiceStatus;
  is_locked: boolean;
  pdf_path: string | null;
  created_at: string;
}

export interface PaymentSummary {
  id: string;
  payment_number: string;
  amount: string;
  payment_date: string;
  payment_method: string;
  transaction_reference: string | null;
  notes: string | null;
  created_at: string;
}

export interface ChangeLog {
  id: string;
  changed_by_user_id: string | null;
  change_type: string;
  old_values: Record<string, unknown> | null;
  new_values: Record<string, unknown> | null;
  change_reason: string | null;
  created_at: string;
}

export interface Invoice extends InvoiceListItem {
  subscription_id: string;
  version_number: number;
  edited_count: number;
  original_invoice_id: string | null;
  company_name_snapshot: string;
  legal_name_snapshot: string | null;
  gst_number_snapshot: string | null;
  pan_number_snapshot: string | null;
  support_email_snapshot: string | null;
  support_phone_snapshot: string | null;
  company_address_snapshot: string | null;
  invoice_footer_snapshot: string | null;
  terms_snapshot: string | null;
  installation_address_snapshot: string | null;
  plan_code_snapshot: string;
  plan_name_snapshot: string;
  speed_mbps_snapshot: number;
  data_policy_snapshot: string;
  fup_limit_gb_snapshot: number | null;
  billing_cycle_snapshot: string;
  base_amount: string;
  gst_percentage: string;
  gst_amount: string;
  // Line items
  line_items: LineItem[] | null;
  line_items_total: string;
  // Discount
  discount_type: "percentage" | "fixed" | null;
  discount_value: string | null;
  discount_amount: string;
  discount_label: string | null;
  billing_period_start: string;
  billing_period_end: string;
  remarks: string | null;
  pdf_url: string | null;
  updated_at: string;
  payments: PaymentSummary[];
  change_logs: ChangeLog[];
}

export type InvoiceStatus =
  | "DRAFT"
  | "UNPAID"
  | "PARTIALLY_PAID"
  | "PAID"
  | "OVERDUE"
  | "CANCELLED";

export const INVOICE_STATUS_LABELS: Record<InvoiceStatus, string> = {
  DRAFT: "Draft",
  UNPAID: "Unpaid",
  PARTIALLY_PAID: "Partially Paid",
  PAID: "Paid",
  OVERDUE: "Overdue",
  CANCELLED: "Cancelled",
};

export const INVOICE_STATUS_COLORS: Record<InvoiceStatus, string> = {
  DRAFT: "bg-gray-100 text-gray-700",
  UNPAID: "bg-red-100 text-red-700",
  PARTIALLY_PAID: "bg-amber-100 text-amber-700",
  PAID: "bg-green-100 text-green-700",
  OVERDUE: "bg-rose-100 text-rose-800",
  CANCELLED: "bg-gray-100 text-gray-500",
};

export interface InvoiceListResponse {
  items: InvoiceListItem[];
  total: number;
  page: number;
  page_size: number;
  total_pages: number;
}
