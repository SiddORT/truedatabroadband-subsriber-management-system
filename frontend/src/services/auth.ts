import { api, tokenService } from "@/services/api";
import type {
  ChangePasswordPayload,
  LoginCredentials,
  LoginResponse,
  User,
} from "@/types/auth";

export const authService = {
  async login(credentials: LoginCredentials): Promise<LoginResponse> {
    const { data } = await api.post<LoginResponse>("/auth/login", credentials);
    tokenService.setTokens(data.access_token, data.refresh_token);
    return data;
  },

  async me(): Promise<User> {
    const { data } = await api.get<User>("/auth/me");
    return data;
  },

  async logout(refreshToken?: string): Promise<void> {
    try {
      await api.post("/auth/logout", { refresh_token: refreshToken ?? null });
    } finally {
      tokenService.clear();
    }
  },

  async changePassword(payload: ChangePasswordPayload): Promise<void> {
    await api.post("/auth/change-password", payload);
  },
};
