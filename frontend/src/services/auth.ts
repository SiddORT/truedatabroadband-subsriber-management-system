import { api, tokenStore } from "@/services/api";
import type { LoginCredentials, TokenPair, User } from "@/types/auth";

export const authService = {
  async login(credentials: LoginCredentials): Promise<TokenPair> {
    const { data } = await api.post<TokenPair>("/auth/login", credentials);
    tokenStore.setTokens(data.access_token, data.refresh_token);
    return data;
  },

  async me(): Promise<User> {
    const { data } = await api.get<User>("/auth/me");
    return data;
  },

  async logout(): Promise<void> {
    try {
      await api.post("/auth/logout");
    } finally {
      tokenStore.clear();
    }
  },
};
