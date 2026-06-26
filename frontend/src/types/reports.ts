export interface ReportPage<T, S = Record<string, number>> {
  items: T[];
  total: number;
  page: number;
  page_size: number;
  total_pages: number;
  summary: S;
}

// ── Customer Report ────────────────────────────────────────────────────────

export interface CustomerReportRow {
  id: string;
  customer_code: string;
  full_name: string;
  customer_type: string;
  city: string;
  mobile_number: string;
  active_subscription_count: number;
  outstanding_amount: number;
  status: string;
}

export interface CustomerReportSummary {
  total_customers: number;
  active_customers: number;
  business_customers: number;
  individual_customers: number;
}

// ── Subscription Report ────────────────────────────────────────────────────

export interface SubscriptionReportRow {
  id: string;
  subscription_code: string;
  customer_name: string;
  customer_code: string;
  connection_name: string;
  plan_name: string;
  billing_cycle: string;
  start_date: string;
  renewal_date: string;
  expiry_date: string;
  status: string;
}

export interface SubscriptionReportSummary {
  total_subscriptions: number;
  active_subscriptions: number;
  expiring_soon: number;
  expired: number;
}

// ── Invoice Report ─────────────────────────────────────────────────────────

export interface InvoiceReportRow {
  id: string;
  invoice_number: string;
  customer_name: string;
  connection_name: string;
  plan_name: string;
  invoice_date: string;
  due_date: string;
  total_amount: number;
  paid_amount: number;
  balance_amount: number;
  status: string;
}

export interface InvoiceReportSummary {
  total_invoices: number;
  total_invoiced_amount: number;
  total_collected_amount: number;
  total_outstanding_amount: number;
}

// ── Payment Report ─────────────────────────────────────────────────────────

export interface PaymentReportRow {
  id: string;
  payment_number: string;
  invoice_number: string;
  customer_name: string;
  amount: number;
  payment_method: string;
  payment_date: string;
  transaction_reference: string;
}

export interface PaymentReportSummary {
  total_payments: number;
  total_collection_amount: number;
}

// ── Revenue Report ─────────────────────────────────────────────────────────

export interface RevenueByMonth {
  month: string;
  label: string;
  revenue: number;
}

export interface RevenueByPlan {
  plan_name: string;
  revenue: number;
}

export interface RevenueByCustomer {
  customer_name: string;
  revenue: number;
}

export interface RevenueByCity {
  city: string;
  revenue: number;
}

export interface RevenueSummary {
  total_revenue: number;
  avg_revenue_per_customer: number;
  avg_revenue_per_subscription: number;
}

export interface RevenueReport {
  revenue_by_month: RevenueByMonth[];
  revenue_by_plan: RevenueByPlan[];
  revenue_by_customer: RevenueByCustomer[];
  revenue_by_city: RevenueByCity[];
  summary: RevenueSummary;
}

// ── Outstanding Report ─────────────────────────────────────────────────────

export interface OutstandingReportRow {
  id: string;
  invoice_number: string;
  customer_name: string;
  connection_name: string;
  due_date: string;
  outstanding_amount: number;
  days_overdue: number;
  aging_bucket: string;
  status: string;
}

export interface OutstandingReportSummary {
  total_outstanding: number;
  bucket_current: number;
  bucket_0_30: number;
  bucket_31_60: number;
  bucket_61_90: number;
  bucket_90_plus: number;
}

// ── Export ─────────────────────────────────────────────────────────────────

export interface ExportRequest {
  report_type: string;
  filters: Record<string, string | null | undefined>;
  format: "csv" | "xlsx";
}

export interface ExportResponse {
  download_url: string;
  expires_at: string;
  filename: string;
}
