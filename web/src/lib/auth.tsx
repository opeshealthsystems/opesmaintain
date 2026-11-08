"use client";
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { api, getToken, setToken } from "./api";
import { setLocaleSettings } from "./format";
import { applyModelLanguage } from "./registry";

export interface User {
  id: string;
  fullName: string;
  email: string;
  role: string;
  language: string;
  customerId: string | null;
  siteId: string | null;
  tenantName: string;
  currency: string;
  timeZone: string;
  mfaEnrolled: boolean;
  mfaEnrollmentRequired: boolean;
  emailNotifications: boolean;
}

interface AuthState {
  user: User | null;
  writable: Set<string>;
  loading: boolean;
  login: (email: string, password: string, code?: string) => Promise<User>;
  refresh: () => Promise<void>;
  logout: () => void;
  setLanguage: (lang: string) => void;
  canWrite: (path: string) => boolean;
  hasRole: (...roles: string[]) => boolean;
}

const Ctx = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [writable, setWritable] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);

  const apply = useCallback((u: User) => {
    let lang = u.language;
    try {
      lang = window.localStorage.getItem("opes.lang") ?? u.language;
    } catch {
      /* ignore */
    }
    const nu = { ...u, language: lang };
    setLocaleSettings(nu.currency, nu.language);
    applyModelLanguage(nu.language);
    try { document.documentElement.lang = nu.language === "FR" ? "fr" : "en"; } catch { /* SSR */ }
    setUser(nu);
    return nu;
  }, []);

  const loadPermissions = useCallback(async () => {
    try {
      const p = await api<{ writable: string[] }>("/me/permissions");
      setWritable(new Set(p.writable));
    } catch {
      setWritable(new Set());
    }
  }, []);

  useEffect(() => {
    if (!getToken()) {
      setLoading(false);
      return;
    }
    Promise.all([api<User>("/me"), loadPermissions()])
      .then(([u]) => apply(u))
      .catch(() => setToken(null))
      .finally(() => setLoading(false));
  }, [apply, loadPermissions]);

  const login = useCallback(
    async (email: string, password: string, code?: string) => {
      const r = await api<{ token: string; user: User }>("/auth/login", { body: { email, password, ...(code ? { code } : {}) } });
      setToken(r.token);
      await loadPermissions();
      return apply(r.user);
    },
    [apply, loadPermissions],
  );

  const refresh = useCallback(async () => {
    apply(await api<User>("/me"));
  }, [apply]);

  const logout = useCallback(() => {
    setToken(null);
    setUser(null);
    window.location.href = "/login";
  }, []);

  const setLanguage = useCallback(
    (lang: string) => {
      try {
        window.localStorage.setItem("opes.lang", lang);
      } catch {
        /* ignore */
      }
      if (user) apply({ ...user, language: lang });
      api("/me:preferences", { body: { language: lang } }).catch(() => undefined);
    },
    [user, apply],
  );

  const value = useMemo<AuthState>(
    () => ({
      user,
      writable,
      loading,
      login,
      refresh,
      logout,
      setLanguage,
      canWrite: (path) => writable.has(path),
      hasRole: (...roles) => !!user && (user.role === "ADMIN" || roles.includes(user.role)),
    }),
    [user, writable, loading, login, refresh, logout, setLanguage],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth(): AuthState {
  const c = useContext(Ctx);
  if (!c) throw new Error("AuthProvider missing");
  return c;
}
