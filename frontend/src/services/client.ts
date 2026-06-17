import { api } from "@/services/api";
import type { ClientProfile, ClientProfileUpdate, ClientSession } from "@/types/client";

export const clientService = {
  async getProfile(): Promise<ClientProfile> {
    const { data } = await api.get<ClientProfile>("/client/profile");
    return data;
  },

  async updateProfile(payload: ClientProfileUpdate): Promise<ClientProfile> {
    const { data } = await api.put<ClientProfile>("/client/profile", payload);
    return data;
  },

  async getSessions(): Promise<ClientSession[]> {
    const { data } = await api.get<ClientSession[]>("/client/sessions");
    return data;
  },

  async revokeSession(jti: string): Promise<void> {
    await api.post("/client/sessions/revoke", { jti });
  },

  async logoutAll(): Promise<void> {
    await api.post("/client/logout-all");
  },
};
