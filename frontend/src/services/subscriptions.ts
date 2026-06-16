import { api } from "@/services/api";
import type {
  Subscription,
  SubscriptionChangePlanPayload,
  SubscriptionCreatePayload,
  SubscriptionListResponse,
} from "@/types/subscription";

const BASE = "/subscriptions";

export interface SubscriptionListParams {
  page?: number;
  page_size?: number;
  search?: string;
  sort_by?: string;
  sort_order?: string;
  status_filter?: string;
}

export const subscriptionsService = {
  async list(params: SubscriptionListParams = {}): Promise<SubscriptionListResponse> {
    const { data } = await api.get<SubscriptionListResponse>(BASE, { params });
    return data;
  },

  async get(id: string): Promise<Subscription> {
    const { data } = await api.get<Subscription>(`${BASE}/${id}`);
    return data;
  },

  async listByCustomer(customerId: string): Promise<Subscription[]> {
    const { data } = await api.get<Subscription[]>(`${BASE}/customer/${customerId}`);
    return data;
  },

  async getMine(): Promise<Subscription> {
    const { data } = await api.get<Subscription>(`${BASE}/mine`);
    return data;
  },

  async create(payload: SubscriptionCreatePayload): Promise<Subscription> {
    const { data } = await api.post<Subscription>(BASE, payload);
    return data;
  },

  async update(id: string, remarks: string | null): Promise<Subscription> {
    const { data } = await api.put<Subscription>(`${BASE}/${id}`, { remarks });
    return data;
  },

  async renew(id: string): Promise<Subscription> {
    const { data } = await api.post<Subscription>(`${BASE}/${id}/renew`);
    return data;
  },

  async setStatus(id: string, status: string): Promise<Subscription> {
    const { data } = await api.patch<Subscription>(`${BASE}/${id}/status`, { status });
    return data;
  },

  async changePlan(id: string, payload: SubscriptionChangePlanPayload): Promise<Subscription> {
    const { data } = await api.post<Subscription>(`${BASE}/${id}/change-plan`, payload);
    return data;
  },
};
