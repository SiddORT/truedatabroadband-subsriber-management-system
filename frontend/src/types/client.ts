export interface ClientProfile {
  customer_code: string;
  full_name: string;
  customer_type: string;
  email: string;
  mobile_number: string;
  alternate_mobile_number: string | null;
  installation_address: string;
  city: string;
  state: string;
  pincode: string;
  status: string;
  connection_date: string | null;
  created_at: string;
}

export interface ClientProfileUpdate {
  alternate_mobile_number?: string | null;
}

export interface ClientSession {
  id: string;
  jti: string;
  user_agent: string | null;
  ip_address: string | null;
  created_at: string;
  expires_at: string;
  is_current: boolean;
}

// ---------------------------------------------------------------------------
// Dashboard
// ---------------------------------------------------------------------------

export interface DashboardSummary {
  active_connections: number;
  expiring_soon: number;
  outstanding_amount: string;
  last_payment_amount: string | null;
  last_payment_date: string | null;
}

export interface DashboardConnection {
  id: string;
  connection_name: string | null;
  plan_name: string;
  speed_mbps: number;
  billing_cycle: string;
  expiry_date: string;
  days_remaining: number;
  status: string;
}

export interface DashboardInvoice {
  id: string;
  invoice_number: string;
  connection_name: string;
  invoice_date: string;
  due_date: string;
  total_amount: string;
  balance_amount: string;
  status: string;
}

export interface DashboardOutstandingInvoice {
  id: string;
  invoice_number: string;
  due_date: string;
  outstanding_amount: string;
  days_overdue: number;
}

export interface DashboardInvoicesResponse {
  recent: DashboardInvoice[];
  outstanding: DashboardOutstandingInvoice[];
}

export interface DashboardPayment {
  id: string;
  payment_number: string;
  payment_date: string;
  invoice_number: string;
  connection_name: string;
  amount: string;
  payment_method: string;
}

export interface DashboardNotification {
  id: string;
  created_at: string;
  template_key: string;
  channel: string;
  status: string;
}

// ---------------------------------------------------------------------------
// Billing & Invoices
// ---------------------------------------------------------------------------

export interface BillingSummary {
  total_invoiced: string;
  total_paid: string;
  outstanding_amount: string;
  overdue_amount: string;
  last_payment_amount: string | null;
  last_payment_date: string | null;
}

export interface ClientInvoiceListItem {
  id: string;
  invoice_number: string;
  connection_name: string | null;
  invoice_date: string;
  due_date: string;
  total_amount: string;
  paid_amount: string;
  balance_amount: string;
  status: string;
}

export interface ClientInvoicesPage {
  items: ClientInvoiceListItem[];
  total: number;
  page: number;
  page_size: number;
  pages: number;
}

export interface ClientInvoicePayment {
  id: string;
  payment_number: string;
  payment_date: string;
  amount: string;
  payment_method: string;
  transaction_reference: string | null;
}

export interface ClientInvoiceDetail {
  id: string;
  invoice_number: string;
  invoice_date: string;
  due_date: string;
  status: string;
  connection_name: string | null;
  plan_name: string;
  billing_period_start: string;
  billing_period_end: string;
  base_amount: string;
  discount_amount: string;
  gst_amount: string;
  gst_percentage: string;
  total_amount: string;
  paid_amount: string;
  balance_amount: string;
  payments: ClientInvoicePayment[];
  pdf_available: boolean;
}

// ---------------------------------------------------------------------------
// Payments
// ---------------------------------------------------------------------------

export interface ClientPaymentListItem {
  id: string;
  payment_number: string;
  payment_date: string;
  invoice_number: string;
  connection_name: string | null;
  amount: string;
  payment_method: string;
  transaction_reference: string | null;
}

export interface ClientPaymentsPage {
  items: ClientPaymentListItem[];
  total: number;
  page: number;
  page_size: number;
  pages: number;
}

// ---------------------------------------------------------------------------
// Connections (Subscriptions — client view)
// ---------------------------------------------------------------------------

export interface ClientSubscriptionListItem {
  id: string;
  subscription_code: string;
  connection_name: string | null;
  plan_name: string;
  speed_mbps: number;
  billing_cycle: string;
  start_date: string;
  renewal_date: string;
  expiry_date: string;
  status: string;
  days_remaining: number;
}

export interface ClientSubscriptionsPage {
  items: ClientSubscriptionListItem[];
  total: number;
  page: number;
  page_size: number;
  pages: number;
}

export interface ClientSubscriptionDetail {
  id: string;
  subscription_code: string;
  connection_name: string | null;
  plan_id: string;
  plan_name: string;
  plan_code: string;
  speed_mbps: number;
  billing_cycle: string;
  data_policy: string;
  fup_limit_gb: number | null;
  base_price: string;
  total_price: string;
  start_date: string;
  renewal_date: string;
  expiry_date: string;
  installation_address: string | null;
  status: string;
  days_remaining: number;
  pending_renewal_request: boolean;
  pending_plan_change_request: boolean;
  recent_invoices: ClientInvoiceListItem[];
  recent_payments: ClientPaymentListItem[];
  recent_notifications: DashboardNotification[];
}

// ---------------------------------------------------------------------------
// Requests
// ---------------------------------------------------------------------------

export interface RenewalRequestCreate {
  requested_billing_cycle: string;
  remarks?: string | null;
}

export interface PlanChangeRequestCreate {
  requested_plan_id: string;
  remarks?: string | null;
}

export interface ClientRequestHistoryItem {
  id: string;
  request_type: string;
  status: string;
  created_at: string;
  remarks: string | null;
  review_notes: string | null;
  reviewed_at: string | null;
  requested_billing_cycle: string | null;
  current_plan_name: string | null;
  requested_plan_name: string | null;
}

// ---------------------------------------------------------------------------
// Plans (for plan-change form)
// ---------------------------------------------------------------------------

export interface ClientPlanPricingItem {
  id: string;
  billing_cycle: string;
  total_price: string;
}

export interface ClientPlanListItem {
  id: string;
  plan_code: string;
  name: string;
  speed_mbps: number;
  data_policy: string;
  fup_limit_gb: number | null;
  pricing: ClientPlanPricingItem[];
}
