export type DataPolicy = "UNLIMITED" | "FUP";
export type BillingCycle = "MONTHLY" | "QUARTERLY" | "HALF_YEARLY" | "ANNUALLY";

export const BILLING_CYCLE_LABELS: Record<BillingCycle, string> = {
  MONTHLY:     "Monthly",
  QUARTERLY:   "Quarterly",
  HALF_YEARLY: "Half-Yearly",
  ANNUALLY:    "Annually",
};

export const BILLING_CYCLE_MONTHS: Record<BillingCycle, number> = {
  MONTHLY:     1,
  QUARTERLY:   3,
  HALF_YEARLY: 6,
  ANNUALLY:    12,
};

export interface PlanPricing {
  id: string;
  plan_id: string;
  billing_cycle: BillingCycle;
  base_price: number;
  gst_percentage: number;
  total_price: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Plan {
  id: string;
  plan_code: string;
  name: string;
  description: string | null;
  speed_mbps: number;
  data_policy: DataPolicy;
  fup_limit_gb: number | null;
  is_active: boolean;
  pricing: PlanPricing[];
  active_pricing_count: number;
  active_subscription_count: number;
  created_at: string;
  updated_at: string;
}

export interface PlanListResponse {
  items: Plan[];
  total: number;
  page: number;
  page_size: number;
  total_pages: number;
}

export interface PricingCreatePayload {
  billing_cycle: BillingCycle;
  base_price: number;
  gst_percentage: number;
  is_active?: boolean;
}

export interface PricingUpdatePayload {
  base_price?: number;
  gst_percentage?: number;
  is_active?: boolean;
}

export interface PlanCreatePayload {
  name: string;
  description?: string;
  speed_mbps: number;
  data_policy: DataPolicy;
  fup_limit_gb?: number;
  is_active?: boolean;
  pricing: PricingCreatePayload[];
}

export interface PlanUpdatePayload {
  name?: string;
  description?: string;
  speed_mbps?: number;
  data_policy?: DataPolicy;
  fup_limit_gb?: number;
}

export interface PlanListParams {
  page?: number;
  page_size?: number;
  search?: string;
  sort_by?: string;
  sort_order?: "asc" | "desc";
  is_active?: boolean;
  data_policy?: string;
  speed_min?: number;
  speed_max?: number;
}
