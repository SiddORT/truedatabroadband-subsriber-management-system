import { api } from "@/services/api";
import type {
  ActivityDetail,
  ActivityExportRequest,
  ActivityExportResponse,
  ActivityPage,
} from "@/types/activity";

const BASE = "/activity";

export const activityService = {
  async list(
    params: Record<string, string | number | null | undefined> = {}
  ): Promise<ActivityPage> {
    const { data } = await api.get(BASE, { params });
    return data;
  },

  async get(id: string): Promise<ActivityDetail> {
    const { data } = await api.get(`${BASE}/${id}`);
    return data;
  },

  async export(payload: ActivityExportRequest): Promise<ActivityExportResponse> {
    const { data } = await api.post(`${BASE}/export`, payload);
    return data;
  },

  async download(filename: string): Promise<Blob> {
    const { data } = await api.get(`${BASE}/download/${filename}`, {
      responseType: "blob",
    });
    return data;
  },
};
