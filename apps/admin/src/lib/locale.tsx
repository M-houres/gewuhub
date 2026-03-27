import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

export type AdminLocale = "zh-CN" | "en-US";

const ADMIN_LOCALE_STORAGE_KEY = "gewu_admin_locale_v1";

type AdminLocaleContextValue = {
  locale: AdminLocale;
  isChinese: boolean;
  setLocale: (locale: AdminLocale) => void;
  toggleLocale: () => void;
  pick: (zh: string, en: string) => string;
};

const AdminLocaleContext = createContext<AdminLocaleContextValue | null>(null);

function readStoredLocale(): AdminLocale {
  if (typeof window === "undefined") return "zh-CN";
  const storedValue = window.localStorage.getItem(ADMIN_LOCALE_STORAGE_KEY);
  return storedValue === "en-US" ? "en-US" : "zh-CN";
}

export function AdminLocaleProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<AdminLocale>("zh-CN");

  useEffect(() => {
    setLocaleState(readStoredLocale());
  }, []);

  const setLocale = (nextLocale: AdminLocale) => {
    setLocaleState(nextLocale);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(ADMIN_LOCALE_STORAGE_KEY, nextLocale);
    }
  };

  const value = useMemo<AdminLocaleContextValue>(() => {
    const isChinese = locale === "zh-CN";
    return {
      locale,
      isChinese,
      setLocale,
      toggleLocale: () => setLocale(isChinese ? "en-US" : "zh-CN"),
      pick: (zh, en) => (isChinese ? zh : en),
    };
  }, [locale]);

  return <AdminLocaleContext.Provider value={value}>{children}</AdminLocaleContext.Provider>;
}

export function useAdminLocale() {
  const context = useContext(AdminLocaleContext);
  if (!context) {
    throw new Error("useAdminLocale must be used inside AdminLocaleProvider");
  }
  return context;
}
