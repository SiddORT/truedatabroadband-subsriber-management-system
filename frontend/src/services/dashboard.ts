import { api } from "@/services/api";
import type {
  CustomerGrowthPoint,
  DashboardParams,
  DashboardSummary,
  ExpiringSubscription,
  OverdueInvoice,
  PlanDistributionItem,
  RecentCustomer,
  RecentInvoice,
  RecentPayment,
  RevenueTrendPoint,
  SubscriptionGrowthPoint,
} from "@/types/dashboard";

const BASE = "/dashboard";

export const dashboardService = {
  async getSummary(params: DashboardParams = {}): Promise<DashboardSummary> {
    const { data } = await api.get<DashboardSummary>(`${BASE}/summary`, { params });
    return data;
  },

  async getRevenueTrend(params: DashboardParams = {}): Promise<RevenueTrendPoint[]> {
    const { data } = await api.get<RevenueTrendPoint[]>(`${BASE}/revenue-trend`, { params });
    return data;
  },

  async getCustomerGrowth(params: DashboardParams = {}): Promise<CustomerGrowthPoint[]> {
    const { data } = await api.get<CustomerGrowthPoint[]>(`${BASE}/customer-growth`, { params });
    return data;
  },

  async getSubscriptionGrowth(params: DashboardParams = {}): Promise<SubscriptionGrowthPoint[]> {
    const { data } = await api.get<SubscriptionGrowthPoint[]>(`${BASE}/subscription-growth`, { params });
    return data;
  },

  async getPlanDistribution(params: DashboardParams = {}): Promise<PlanDistributionItem[]> {
    const { data } = await api.get<PlanDistributionItem[]>(`${BASE}/plan-distribution`, { params });
    return data;
  },

  async getRecentCustomers(params: DashboardParams = {}): Promise<RecentCustomer[]> {
    const { data } = await api.get<RecentCustomer[]>(`${BASE}/recent-customers`, { params });
    return data;
  },

  async getRecentInvoices(params: DashboardParams = {}): Promise<RecentInvoice[]> {
    const { data } = await api.get<RecentInvoice[]>(`${BASE}/recent-invoices`, { params });
    return data;
  },

  async getRecentPayments(params: DashboardParams = {}): Promise<RecentPayment[]> {
    const { data } = await api.get<RecentPayment[]>(`${BASE}/recent-payments`, { params });
    return data;
  },

  async getExpiringSubscriptions(params: DashboardParams = {}): Promise<ExpiringSubscription[]> {
    const { data } = await api.get<ExpiringSubscription[]>(`${BASE}/expiring-subscriptions`, { params });
    return data;
  },

  async getOverdueInvoices(params: DashboardParams = {}): Promise<OverdueInvoice[]> {
    const { data } = await api.get<OverdueInvoice[]>(`${BASE}/overdue-invoices`, { params });
    return data;
  },
};
