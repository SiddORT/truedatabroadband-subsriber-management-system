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
