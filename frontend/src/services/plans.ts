import { api } from "@/services/api";
import type {
  Plan,
  PlanCreatePayload,
  PlanListParams,
  PlanListResponse,
  PlanUpdatePayload,
  PlanPricing,
  PricingCreatePayload,
  PricingUpdatePayload,
} from "@/types/plan";

const BASE = "/plans";

export const plansService = {
  async list(params: PlanListParams = {}): Promise<PlanListResponse> {
    const { data } = await api.get<PlanListResponse>(BASE, { params });
    return data;
  },

  async get(id: string): Promise<Plan> {
    const { data } = await api.get<Plan>(`${BASE}/${id}`);
    return data;
  },

  async create(payload: PlanCreatePayload): Promise<Plan> {
    const { data } = await api.post<Plan>(BASE, payload);
    return data;
  },

  async update(id: string, payload: PlanUpdatePayload): Promise<Plan> {
    const { data } = await api.put<Plan>(`${BASE}/${id}`, payload);
    return data;
  },

  async setStatus(id: string, is_active: boolean): Promise<Plan> {
    const { data } = await api.patch<Plan>(`${BASE}/${id}/status`, { is_active });
    return data;
  },

  async addPricing(id: string, payload: PricingCreatePayload): Promise<PlanPricing> {
    const { data } = await api.post<PlanPricing>(`${BASE}/${id}/pricing`, payload);
    return data;
  },

  async updatePricing(
    id: string,
    pricingId: string,
    payload: PricingUpdatePayload,
  ): Promise<PlanPricing> {
    const { data } = await api.put<PlanPricing>(
      `${BASE}/${id}/pricing/${pricingId}`,
      payload,
    );
    return data;
  },

  async deletePricing(id: string, pricingId: string): Promise<void> {
    await api.delete(`${BASE}/${id}/pricing/${pricingId}`);
  },
};
