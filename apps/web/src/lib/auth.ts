"use client";

export type SessionUser = {
  id: string;
  email: string;
  emailVerified: boolean;
  role: "USER" | "ADMIN";
  points: number;
  agentPoints: number;
};

export type AuthSession = {
  accessToken: string;
  expiresAt: string;
  user: SessionUser;
};

type AuthResponse = {
  token: string;
  expiresAt: string;
  user: SessionUser;
};

const SESSION_STORAGE_KEY = "gewu.auth.session";
const SESSION_EVENT_NAME = "gewu:session-updated";

const apiBase =
  process.env.NEXT_PUBLIC_API_BASE_URL || (process.env.NODE_ENV === "development" ? "http://127.0.0.1:4000" : "");

function isBrowser() {
  return typeof window !== "undefined";
}

export function toApiUrl(path: string) {
  if (!apiBase) return path;
  return `${apiBase}${path}`;
}

export function fromAuthResponse(response: AuthResponse): AuthSession {
  return {
    accessToken: response.token,
    expiresAt: response.expiresAt,
    user: response.user,
  };
}

export function saveSession(session: AuthSession) {
  if (!isBrowser()) return;
  window.localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session));
  window.dispatchEvent(new CustomEvent<AuthSession | null>(SESSION_EVENT_NAME, { detail: session }));
}

export function clearSession() {
  if (!isBrowser()) return;
  window.localStorage.removeItem(SESSION_STORAGE_KEY);
  window.dispatchEvent(new CustomEvent<AuthSession | null>(SESSION_EVENT_NAME, { detail: null }));
}

export function getSession(): AuthSession | null {
  if (!isBrowser()) return null;
  const raw = window.localStorage.getItem(SESSION_STORAGE_KEY);
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as Partial<AuthSession>;
    if (
      typeof parsed.accessToken !== "string" ||
      typeof parsed.expiresAt !== "string" ||
      !parsed.user ||
      typeof parsed.user.id !== "string" ||
      typeof parsed.user.email !== "string" ||
      typeof parsed.user.emailVerified !== "boolean" ||
      typeof parsed.user.role !== "string" ||
      typeof parsed.user.points !== "number" ||
      typeof parsed.user.agentPoints !== "number"
    ) {
      clearSession();
      return null;
    }

    if (parsed.user.role !== "USER" && parsed.user.role !== "ADMIN") {
      clearSession();
      return null;
    }

    return {
      accessToken: parsed.accessToken,
      expiresAt: parsed.expiresAt,
      user: {
        id: parsed.user.id,
        email: parsed.user.email,
        emailVerified: parsed.user.emailVerified,
        role: parsed.user.role,
        points: parsed.user.points,
        agentPoints: parsed.user.agentPoints,
      },
    };
  } catch {
    clearSession();
    return null;
  }
}

export function isSessionExpired(session: Pick<AuthSession, "expiresAt">) {
  const expiresAtMs = new Date(session.expiresAt).getTime();
  if (!Number.isFinite(expiresAtMs)) return true;
  return Date.now() >= expiresAtMs;
}

export function getValidSession() {
  const session = getSession();
  if (!session) return null;
  if (!isSessionExpired(session)) return session;
  clearSession();
  return null;
}

export function updateSessionUser(patch: Partial<SessionUser>) {
  const session = getSession();
  if (!session) return null;
  const nextSession: AuthSession = {
    ...session,
    user: {
      ...session.user,
      ...patch,
    },
  };
  saveSession(nextSession);
  return nextSession;
}

export function subscribeSession(callback: (session: AuthSession | null) => void) {
  if (!isBrowser()) return () => {};

  const onSessionUpdated = (event: Event) => {
    const customEvent = event as CustomEvent<AuthSession | null>;
    callback(customEvent.detail ?? getSession());
  };

  const onStorage = (event: StorageEvent) => {
    if (event.key !== SESSION_STORAGE_KEY) return;
    callback(getSession());
  };

  window.addEventListener(SESSION_EVENT_NAME, onSessionUpdated as EventListener);
  window.addEventListener("storage", onStorage);

  return () => {
    window.removeEventListener(SESSION_EVENT_NAME, onSessionUpdated as EventListener);
    window.removeEventListener("storage", onStorage);
  };
}
