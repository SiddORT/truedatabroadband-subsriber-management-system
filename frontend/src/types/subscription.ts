import type { BillingCycle } from "./plan";

export type SubscriptionStatus = "ACTIVE" | "EXPIRED" | "SUSPENDED" | "CANCELLED";

export interface Subscription {
  id: string;
  subscription_code: string;
  customer_id: string;
  plan_id: string;
  plan_pricing_id: string;

  plan_name_snapshot: string;
  plan_code_snapshot: string;
  speed_mbps_snapshot: number;
  billing_cycle_snapshot: BillingCycle;
  base_price_snapshot: string;
  gst_percentage_snapshot: string;
  total_price_snapshot: string;

  start_date: string;
  renewal_date: string;
  expiry_date: string;

  connection_name?: string | null;
  installation_address?: string | null;

  status: SubscriptionStatus;
  remarks?: string | null;

  customer_code?: string;
  customer_name?: string;
  customer_email?: string;
  customer_mobile?: string;
  customer_status?: string;

  created_at: string;
  updated_at: string;
}

export interface SubscriptionListResponse {
  items: Subscription[];
  total: number;
  page: number;
  page_size: number;
  total_pages: number;
}

export interface SubscriptionCreatePayload {
  customer_id: string;
  plan_pricing_id: string;
  start_date: string;
  connection_name?: string;
  installation_address?: string;
  remarks?: string;
}

export interface SubscriptionChangePlanPayload {
  plan_pricing_id: string;
  start_date: string;
  remarks?: string;
}

export const SUBSCRIPTION_STATUS_LABELS: Record<SubscriptionStatus, string> = {
  ACTIVE: "Active",
  EXPIRED: "Expired",
  SUSPENDED: "Suspended",
  CANCELLED: "Cancelled",
};

export const SUBSCRIPTION_STATUS_COLORS: Record<SubscriptionStatus, string> = {
  ACTIVE: "bg-green-100 text-green-800 border border-green-200",
  EXPIRED: "bg-gray-100 text-gray-600 border border-gray-200",
  SUSPENDED: "bg-amber-100 text-amber-800 border border-amber-200",
  CANCELLED: "bg-red-100 text-red-800 border border-red-200",
};
