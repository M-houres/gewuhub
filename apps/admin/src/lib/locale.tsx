import { createContext, useContext, useMemo, useState, type ReactNode } from "react";

export type AdminLocale = "zh-CN";

type AdminLocaleContextValue = {
  locale: AdminLocale;
  isChinese: boolean;
  setLocale: (_locale: AdminLocale) => void;
  toggleLocale: () => void;
  pick: (zh: string, _en?: string) => string;
};

const AdminLocaleContext = createContext<AdminLocaleContextValue | null>(null);

export function AdminLocaleProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<AdminLocale>("zh-CN");

  const value = useMemo<AdminLocaleContextValue>(() => {
    return {
      locale,
      isChinese: true,
      setLocale: () => setLocaleState("zh-CN"),
      toggleLocale: () => setLocaleState("zh-CN"),
      pick: (zh) => zh,
    };
  }, [locale]);

  return <AdminLocaleContext.Provider value={value}>{children}</AdminLocaleContext.Provider>;
}

export function useAdminLocale() {
  const context = useContext(AdminLocaleContext);
  if (!context) {
    throw new Error("useAdminLocale 必须在 AdminLocaleProvider 内使用。");
  }
  return context;
}

