import {
  createContext,
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import { tokenService } from "@/services/api";
import { authService } from "@/services/auth";
import type {
  ChangePasswordPayload,
  LoginCredentials,
  User,
} from "@/types/auth";

interface AuthContextValue {
  user: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  mustChangePassword: boolean;
  login: (credentials: LoginCredentials) => Promise<User>;
  logout: () => Promise<void>;
  changePassword: (payload: ChangePasswordPayload) => Promise<void>;
}

export const AuthContext = createContext<AuthContextValue | undefined>(
  undefined,
);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Bootstrap: rehydrate session from stored access token.
  useEffect(() => {
    let active = true;
    const bootstrap = async () => {
      if (!tokenService.getAccess()) {
        setIsLoading(false);
        return;
      }
      try {
        const me = await authService.me();
        if (active) setUser(me);
      } catch {
        tokenService.clear();
      } finally {
        if (active) setIsLoading(false);
      }
    };
    void bootstrap();
    return () => {
      active = false;
    };
  }, []);

  const login = useCallback(async (credentials: LoginCredentials) => {
    const response = await authService.login(credentials);
    // Use the user embedded in the login response — no extra /me round-trip.
    setUser(response.user);
    return response.user;
  }, []);

  const logout = useCallback(async () => {
    const rt = tokenService.getRefresh() ?? undefined;
    await authService.logout(rt);
    setUser(null);
  }, []);

  const changePassword = useCallback(
    async (payload: ChangePasswordPayload) => {
      await authService.changePassword(payload);
      // Refresh user to pick up must_change_password = false.
      const updated = await authService.me();
      setUser(updated);
    },
    [],
  );

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      isLoading,
      isAuthenticated: user !== null,
      mustChangePassword: user?.must_change_password ?? false,
      login,
      logout,
      changePassword,
    }),
    [user, isLoading, login, logout, changePassword],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
