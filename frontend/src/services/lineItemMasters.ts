import { api } from "./api";
import type { LineItemMaster, LineItemMasterListResponse } from "@/types/lineItemMaster";

export interface LineItemMasterListParams {
  page?: number;
  page_size?: number;
  search?: string;
  active_only?: boolean;
}

export interface LineItemMasterPayload {
  name: string;
  hsn_sac_code?: string | null;
  description?: string | null;
  default_amount?: number | null;
  gst_percentage: number;
  is_active?: boolean;
}

async function list(params: LineItemMasterListParams = {}): Promise<LineItemMasterListResponse> {
  const { data } = await api.get("/line-item-masters", { params });
  return data;
}

async function create(payload: LineItemMasterPayload): Promise<LineItemMaster> {
  const { data } = await api.post("/line-item-masters", payload);
  return data;
}

async function update(id: string, payload: Partial<LineItemMasterPayload>): Promise<LineItemMaster> {
  const { data } = await api.put(`/line-item-masters/${id}`, payload);
  return data;
}

async function remove(id: string): Promise<void> {
  await api.delete(`/line-item-masters/${id}`);
}

export const lineItemMastersService = { list, create, update, remove };
