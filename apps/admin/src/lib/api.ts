import { clearAdminSession, getValidAdminSession } from "./admin-auth";

export const apiBase = import.meta.env.VITE_API_BASE_URL || (import.meta.env.DEV ? "http://127.0.0.1:4000" : "");
const staticAdminToken = import.meta.env.VITE_ADMIN_TOKEN || "";

export function hasStaticAdminToken() {
  return staticAdminToken.length > 0;
}

function withAdminHeaders(headers?: HeadersInit) {
  const nextHeaders = new Headers(headers);
  const session = getValidAdminSession();
  if (session?.accessToken) {
    nextHeaders.set("Authorization", `Bearer ${session.accessToken}`);
    return nextHeaders;
  }

  if (staticAdminToken) {
    nextHeaders.set("x-admin-token", staticAdminToken);
  }
  return nextHeaders;
}

function redirectToAdminLogin() {
  if (typeof window === "undefined") return;
  const currentPath = window.location.pathname;
  if (currentPath.endsWith("/login")) return;
  const loginPath = currentPath.startsWith("/admin") ? "/admin/login" : "/login";
  window.location.replace(loginPath);
}

export async function fetchJson<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${apiBase}${path}`, {
    ...init,
    headers: withAdminHeaders(init?.headers),
  });
  if (!response.ok) {
    if (response.status === 401 && !hasStaticAdminToken()) {
      clearAdminSession();
      redirectToAdminLogin();
    }

    let message = `request failed: ${response.status}`;
    try {
      const contentType = response.headers.get("content-type") || "";
      if (contentType.includes("application/json")) {
        const payload = (await response.json()) as { message?: string };
        if (payload?.message) {
          message = payload.message;
        }
      } else {
        const text = await response.text();
        if (text) message = text;
      }
    } catch {
      // Keep fallback message.
    }
    throw new Error(message);
  }
  return (await response.json()) as T;
}
