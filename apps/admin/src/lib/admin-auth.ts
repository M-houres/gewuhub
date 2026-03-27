export type AdminSession = {
  accessToken: string;
  expiresAt: string;
  username: string;
};

const adminSessionStorageKey = "gewu_admin_session_v1";

function readStorageValue() {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(adminSessionStorageKey);
}

export function readAdminSession(): AdminSession | null {
  const rawValue = readStorageValue();
  if (!rawValue) return null;
  try {
    const parsed = JSON.parse(rawValue) as AdminSession;
    if (!parsed?.accessToken || !parsed?.expiresAt || !parsed?.username) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function getValidAdminSession(): AdminSession | null {
  const session = readAdminSession();
  if (!session) return null;
  const expiresAtMs = Date.parse(session.expiresAt);
  if (!Number.isFinite(expiresAtMs) || expiresAtMs <= Date.now()) {
    clearAdminSession();
    return null;
  }
  return session;
}

export function saveAdminSession(session: AdminSession) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(adminSessionStorageKey, JSON.stringify(session));
}

export function clearAdminSession() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(adminSessionStorageKey);
}
