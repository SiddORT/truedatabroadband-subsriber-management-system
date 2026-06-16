import axios, { AxiosError, type AxiosRequestConfig, type InternalAxiosRequestConfig } from "axios";

import { tokenService } from "@/services/tokenService";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "/api/v1";

export const api = axios.create({
  baseURL: API_BASE_URL,
  headers: { "Content-Type": "application/json" },
});

// Attach access token to every request.
api.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  const token = tokenService.getAccess();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// Single shared refresh promise — prevents multiple concurrent refreshes.
let refreshPromise: Promise<string> | null = null;

async function doRefresh(): Promise<string> {
  const refreshToken = tokenService.getRefresh();
  if (!refreshToken) throw new Error("No refresh token");

  const { data } = await axios.post(`${API_BASE_URL}/auth/refresh`, {
    refresh_token: refreshToken,
  });

  // Token rotation: server returns both a new access AND refresh token.
  tokenService.setTokens(data.access_token, data.refresh_token);
  return data.access_token as string;
}

api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const original = error.config as AxiosRequestConfig & { _retry?: boolean };
    const isAuthEndpoint =
      original?.url?.includes("/auth/login") ||
      original?.url?.includes("/auth/refresh");

    if (
      error.response?.status === 401 &&
      original &&
      !original._retry &&
      !isAuthEndpoint &&
      tokenService.getRefresh()
    ) {
      original._retry = true;
      try {
        if (!refreshPromise) {
          refreshPromise = doRefresh().finally(() => {
            refreshPromise = null;
          });
        }
        const accessToken = await refreshPromise;
        original.headers = {
          ...original.headers,
          Authorization: `Bearer ${accessToken}`,
        };
        return api(original);
      } catch {
        tokenService.clear();
        return Promise.reject(error);
      }
    }

    return Promise.reject(error);
  },
);

export function getApiErrorMessage(
  error: unknown,
  fallback = "Something went wrong",
): string {
  if (axios.isAxiosError(error)) {
    const detail = error.response?.data?.detail;
    if (typeof detail === "string") return detail;
    if (detail?.message) return detail.message;
    if (Array.isArray(detail) && detail[0]?.msg) return detail[0].msg;
  }
  return fallback;
}

// Re-export tokenService both by its own name and under the legacy tokenStore alias.
export { tokenService };
export { tokenService as tokenStore };
