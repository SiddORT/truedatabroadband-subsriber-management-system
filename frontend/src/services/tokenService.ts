/**
 * Centralised token storage.
 *
 * All token read/write operations go through this service — no other file
 * should access localStorage keys for tokens directly.
 */

const ACCESS_KEY = "td_access_token";
const REFRESH_KEY = "td_refresh_token";

export const tokenService = {
  getAccess: (): string | null => localStorage.getItem(ACCESS_KEY),

  getRefresh: (): string | null => localStorage.getItem(REFRESH_KEY),

  setTokens: (access: string, refresh: string): void => {
    localStorage.setItem(ACCESS_KEY, access);
    localStorage.setItem(REFRESH_KEY, refresh);
  },

  setAccess: (access: string): void => {
    localStorage.setItem(ACCESS_KEY, access);
  },

  clear: (): void => {
    localStorage.removeItem(ACCESS_KEY);
    localStorage.removeItem(REFRESH_KEY);
  },
};
