// Dashboard API response types

export interface DashboardSummary {
  total_customers: number;
  active_customers: number;
  business_customers: number;
  individual_customers: number;
  active_subscriptions: number;
  expiring_subscriptions: number;
  expired_subscriptions: number;
  unpaid_invoices: number;
  overdue_invoices: number;
  outstanding_amount: number;
  collections_this_period: number;
  revenue_this_period: number;
}

export interface RevenueTrendPoint {
  month: string; // "YYYY-MM"
  label: string; // "Jan 2025"
  revenue: number;
}

export interface CustomerGrowthPoint {
  month: string;
  label: string;
  new_customers: number;
}

export interface SubscriptionGrowthPoint {
  month: string;
  label: string;
  new_subscriptions: number;
}

export interface PlanDistributionItem {
  plan_id: string;
  plan_name: string;
  active_count: number;
}

export interface RecentCustomer {
  id: string;
  customer_code: string;
  full_name: string;
  city: string;
  status: string;
  created_at: string;
}

export interface RecentInvoice {
  id: string;
  invoice_number: string;
  customer_name: string;
  connection_name: string;
  total_amount: number;
  status: string;
  created_at: string;
}

export interface RecentPayment {
  id: string;
  payment_number: string;
  customer_name: string;
  invoice_number: string;
  amount: number;
  payment_date: string;
  invoice_id: string;
}

export interface ExpiringSubscription {
  id: string;
  subscription_code: string;
  customer_name: string;
  connection_name: string | null;
  plan_name: string;
  expiry_date: string;
  days_remaining: number;
  customer_id: string;
}

export interface OverdueInvoice {
  id: string;
  invoice_number: string;
  customer_name: string;
  connection_name: string;
  due_date: string;
  balance_amount: number;
}

export interface DashboardParams {
  date_from?: string;
  date_to?: string;
}
