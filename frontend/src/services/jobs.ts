import { api } from "@/services/api";
import type {
  JobExecutionLogOut,
  JobListResponse,
  JobRunResponse,
  JobToggleResponse,
  JobUpdatePayload,
  ScheduledJobOut,
} from "@/types/jobs";

export const jobService = {
  async listJobs(params?: { page?: number; page_size?: number }): Promise<JobListResponse> {
    const { data } = await api.get("/jobs", { params });
    return data;
  },

  async getJob(id: string): Promise<ScheduledJobOut> {
    const { data } = await api.get(`/jobs/${id}`);
    return data;
  },

  async getJobLogs(
    id: string,
    params?: { limit?: number; status?: string; date_from?: string; date_to?: string }
  ): Promise<JobExecutionLogOut[]> {
    const { data } = await api.get(`/jobs/${id}/logs`, { params });
    return data;
  },

  async updateJob(id: string, payload: JobUpdatePayload): Promise<ScheduledJobOut> {
    const { data } = await api.put(`/jobs/${id}`, payload);
    return data;
  },

  async toggleJob(id: string): Promise<JobToggleResponse> {
    const { data } = await api.patch(`/jobs/${id}/toggle`);
    return data;
  },

  async runJob(id: string): Promise<JobRunResponse> {
    const { data } = await api.post(`/jobs/${id}/run`);
    return data;
  },
};
