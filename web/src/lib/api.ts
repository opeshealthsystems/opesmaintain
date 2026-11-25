"use client";

export interface ApiErrorBody {
  status: number;
  code: string;
  detail: string;
  errors?: { field: string; message: string }[];
}

export class ApiError extends Error {
  status: number;
  code: string;
  errors: { field: string; message: string }[];
  constructor(body: ApiErrorBody) {
    super(body.detail || body.code || "Request failed");
    this.status = body.status;
    this.code = body.code;
    this.errors = body.errors ?? [];
  }
}

const TOKEN_KEY = "opes.token";
let memToken: string | null = null;

const SUPPORT_KEY = "opes.supportToken";

/** A support session lives only in its own browser tab, so it never replaces the operator's own sign-in. */
export function startSupportSession(token: string) {
  try { window.sessionStorage.setItem(SUPPORT_KEY, token); } catch { /* blocked */ }
}
export function endSupportSession() {
  try { window.sessionStorage.removeItem(SUPPORT_KEY); } catch { /* blocked */ }
}

export function getToken(): string | null {
  if (typeof window !== "undefined") {
    try { const s = window.sessionStorage.getItem(SUPPORT_KEY); if (s) return s; } catch { /* blocked */ }
  }
  try {
    return window.localStorage.getItem(TOKEN_KEY) ?? memToken;
  } catch {
    return memToken;
  }
}

export function setToken(token: string | null) {
  // Ending a support session (expired or signed out) must not sign the operator out of their own account.
  try {
    if (!token && window.sessionStorage.getItem(SUPPORT_KEY)) { endSupportSession(); return; }
  } catch { /* blocked */ }
  memToken = token;
  try {
    if (token) window.localStorage.setItem(TOKEN_KEY, token);
    else window.localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* storage unavailable */
  }
}

type Json = Record<string, unknown>;

const PUBLIC_PAGES = ["/features", "/pricing", "/licensing", "/industries", "/about", "/contact", "/privacy", "/terms",
  "/signup", "/login", "/forgot-password", "/reset-password", "/fr"];

/** Pages anyone may view signed out: the website, sign-up and sign-in flows. */
export function isPublicPath(path: string): boolean {
  return path === "/" || PUBLIC_PAGES.some((p) => path === p || path.startsWith(p + "/"));
}

export async function api<T = Json>(
  path: string,
  init: { method?: string; body?: unknown; headers?: Record<string, string>; raw?: boolean } = {},
): Promise<T> {
  const headers: Record<string, string> = { Accept: "application/json", ...(init.headers ?? {}) };
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  let body: BodyInit | undefined;
  if (init.body instanceof FormData) body = init.body;
  else if (init.body !== undefined) {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(init.body);
  }
  let res: Response;
  try {
    res = await fetch(`/api/v1${path}`, { method: init.method ?? (body ? "POST" : "GET"), headers, body, cache: "no-store" });
  } catch {
    throw new ApiError({ status: 0, code: "OFFLINE", detail: "The server cannot be reached. Check your connection." });
  }
  if (res.status === 401 && !path.startsWith("/auth/")) {
    setToken(null);
    // An expired session must never bounce a visitor off the public website — only off app pages.
    if (typeof window !== "undefined" && !isPublicPath(window.location.pathname)) {
      window.location.href = `/login?next=${encodeURIComponent(window.location.pathname + window.location.search)}`;
    }
  }
  if (res.status === 403 && typeof window !== "undefined" && !window.location.pathname.startsWith("/settings") && !isPublicPath(window.location.pathname)) {
    const peek = res.clone();
    try {
      const b = await peek.json();
      if (b.code === "MFA_ENROLLMENT_REQUIRED") window.location.href = "/settings?mfa=1";
    } catch { /* not JSON */ }
  }
  if (!res.ok) {
    let parsed: ApiErrorBody;
    try {
      parsed = await res.json();
    } catch {
      parsed = { status: res.status, code: "HTTP_" + res.status, detail: res.statusText || "Request failed" };
    }
    throw new ApiError({ ...parsed, status: res.status });
  }
  if (init.raw) return res as unknown as T;
  const text = await res.text();
  return (text ? JSON.parse(text) : {}) as T;
}

export async function download(path: string, filename: string) {
  const res = await api<Response>(path, { raw: true, headers: { Accept: "*/*" } });
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export type Row = Record<string, unknown> & { id: string; version: number; _label: string };
export interface Page {
  items: Row[];
  total: number;
  page: number;
  size: number;
}
