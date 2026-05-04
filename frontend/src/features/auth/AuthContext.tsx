import { createContext, PropsWithChildren, useEffect, useMemo, useRef, useState } from "react";

import { authService } from "../../services/authService";
import { AuthUser } from "../../types/auth";
import { AUTH_SESSION_CLEARED_EVENT, tokenStorage } from "../../utils/storage";

type AuthContextValue = {
  user: AuthUser | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
};

export const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: PropsWithChildren) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const initRequestedRef = useRef(false);

  const refreshUser = async () => {
    const me = await authService.me();
    setUser(me);
  };

  useEffect(() => {
    if (initRequestedRef.current) return;
    initRequestedRef.current = true;

    void (async () => {
      const token = tokenStorage.get();
      if (!token) {
        setIsLoading(false);
        return;
      }

      try {
        await refreshUser();
      } catch {
        tokenStorage.clear();
        setUser(null);
      } finally {
        setIsLoading(false);
      }
    })();
  }, []);

  useEffect(() => {
    const handleSessionCleared = () => {
      setUser(null);
      setIsLoading(false);
    };

    window.addEventListener(AUTH_SESSION_CLEARED_EVENT, handleSessionCleared);
    return () => window.removeEventListener(AUTH_SESSION_CLEARED_EVENT, handleSessionCleared);
  }, []);

  const login = async (email: string, password: string) => {
    const session = await authService.login({ email, password });
    tokenStorage.set(session.access_token);
    await refreshUser();
  };

  const logout = async () => {
    try {
      await authService.logout();
    } finally {
      tokenStorage.clear();
      setUser(null);
    }
  };

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      isAuthenticated: Boolean(user),
      isLoading,
      login,
      logout,
      refreshUser,
    }),
    [user, isLoading],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
