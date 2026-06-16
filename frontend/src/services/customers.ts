import { api } from "@/services/api";
import type {
  Customer,
  CustomerCreatePayload,
  CustomerCreateResponse,
  CustomerListParams,
  CustomerListResponse,
  CustomerStatus,
  CustomerUpdatePayload,
} from "@/types/customer";

const BASE = "/customers";

export const customersService = {
  async list(params: CustomerListParams = {}): Promise<CustomerListResponse> {
    const { data } = await api.get<CustomerListResponse>(BASE, { params });
    return data;
  },

  async get(id: string): Promise<Customer> {
    const { data } = await api.get<Customer>(`${BASE}/${id}`);
    return data;
  },

  async create(payload: CustomerCreatePayload): Promise<CustomerCreateResponse> {
    const { data } = await api.post<CustomerCreateResponse>(BASE, payload);
    return data;
  },

  async update(id: string, payload: CustomerUpdatePayload): Promise<Customer> {
    const { data } = await api.put<Customer>(`${BASE}/${id}`, payload);
    return data;
  },

  async updateStatus(id: string, status: CustomerStatus): Promise<Customer> {
    const { data } = await api.patch<Customer>(`${BASE}/${id}/status`, { status });
    return data;
  },

  async resetPassword(id: string): Promise<{ temp_password: string; message: string }> {
    const { data } = await api.post<{ temp_password: string; message: string }>(
      `${BASE}/${id}/reset-password`,
    );
    return data;
  },
};
