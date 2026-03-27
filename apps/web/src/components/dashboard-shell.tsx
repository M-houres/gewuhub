"use client";

import {
  clearSession,
  getValidSession,
  saveSession,
  subscribeSession,
  toApiUrl,
  type AuthSession,
  type SessionUser,
} from "@/lib/auth";
import clsx from "clsx";
import {
  Bell,
  BookText,
  Bot,
  FileEdit,
  FileSearch,
  FileText,
  Files,
  FolderKanban,
  LayoutDashboard,
  LogIn,
  LogOut,
  Presentation,
  ScanSearch,
  Sparkles,
  Wand2,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

type DashboardShellProps = {
  children: React.ReactNode;
};

type NavKey =
  | "ai-search"
  | "reduce-repeat"
  | "reduce-ai"
  | "detect"
  | "literature"
  | "proposal"
  | "article"
  | "format"
  | "editor"
  | "ppt"
  | "review"
  | "assets"
  | "points";

type NavApiItem = {
  key: NavKey;
  href: string;
  label: string;
  visible: boolean;
};

type NavVisibilityMap = Record<NavKey, boolean>;

type NavItem = {
  key: NavKey;
  href: string;
  label: string;
  icon: LucideIcon;
};

const defaultNavVisibility: NavVisibilityMap = {
  "ai-search": false,
  "reduce-repeat": true,
  "reduce-ai": true,
  detect: true,
  literature: true,
  proposal: false,
  article: false,
  format: false,
  editor: false,
  ppt: false,
  review: false,
  assets: false,
  points: true,
};

const guestUser: SessionUser = {
  id: "guest",
  email: "guest@gewu.local",
  emailVerified: false,
  role: "USER",
  points: 0,
  agentPoints: 0,
};

const allNavItems: NavItem[] = [
  { key: "ai-search", href: "/zh/AI-search", label: "科研智能体", icon: LayoutDashboard },
  { key: "reduce-repeat", href: "/zh/reduce-repeat", label: "降重复率", icon: Wand2 },
  { key: "reduce-ai", href: "/zh/reduce-ai", label: "降AIGC率", icon: Bot },
  { key: "detect", href: "/zh/detect", label: "AIGC检测", icon: ScanSearch },
  { key: "literature", href: "/zh/literature", label: "文献综述", icon: BookText },
  { key: "proposal", href: "/zh/proposal", label: "开题报告", icon: FileText },
  { key: "article", href: "/zh/article", label: "文章生成", icon: Sparkles },
  { key: "format", href: "/zh/format", label: "格式调整", icon: Files },
  { key: "editor", href: "/zh/editor", label: "AI编辑器", icon: FileEdit },
  { key: "ppt", href: "/zh/ppt", label: "AI PPT", icon: Presentation },
  { key: "review", href: "/zh/review", label: "AI审稿", icon: FileSearch },
  { key: "assets", href: "/zh/assets", label: "我的资产", icon: FolderKanban },
  { key: "points", href: "/zh/points", label: "积分中心", icon: LayoutDashboard },
];

const guestNavKeys = new Set<NavKey>([
  "ai-search",
  "reduce-repeat",
  "reduce-ai",
  "detect",
  "literature",
  "proposal",
  "article",
  "format",
  "editor",
  "ppt",
  "review",
  "assets",
]);

const guestBlockedPaths = new Set<string>(["/zh/points"]);

function getSafeNext(pathname: string | null) {
  if (!pathname || !pathname.startsWith("/")) return "/zh/reduce-repeat";
  return pathname;
}

function getNoticeText(pathname: string | null) {
  if (!pathname) return "学术写作工具区";
  if (pathname.startsWith("/zh/reduce-repeat") || pathname.startsWith("/zh/reduce-ai")) {
    return "提示：Agent 点数不可用于降重/降AI功能";
  }
  if (pathname.startsWith("/zh/detect")) {
    return "提示：Agent 点数不可用于 AIGC 检测功能";
  }
  if (pathname.startsWith("/zh/literature")) {
    return "文献综述支持流式生成与结果续写";
  }
  return "学术写作工具区";
}

function getFallbackPath(items: NavItem[]) {
  return items.find((item) => item.key !== "points")?.href || "/zh/reduce-repeat";
}

export function DashboardShell({ children }: DashboardShellProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [session, setSession] = useState<AuthSession | null>(null);
  const [currentUser, setCurrentUser] = useState<SessionUser>(guestUser);
  const [authReady, setAuthReady] = useState(false);
  const [navVisibility, setNavVisibility] = useState<NavVisibilityMap>(defaultNavVisibility);

  const isLoggedIn = Boolean(session);

  useEffect(() => {
    let cancelled = false;

    const loadAuthState = async () => {
      const localSession = getValidSession();
      if (!localSession) {
        if (!cancelled) {
          setSession(null);
          setCurrentUser(guestUser);
          setAuthReady(true);
        }
        return;
      }

      try {
        const meResponse = await fetch(toApiUrl("/api/v1/auth/me"), {
          method: "GET",
          headers: {
            Authorization: `Bearer ${localSession.accessToken}`,
          },
        });

        if (!meResponse.ok) {
          clearSession();
          if (!cancelled) {
            setSession(null);
            setCurrentUser(guestUser);
            setAuthReady(true);
          }
          return;
        }

        const meData = (await meResponse.json()) as { user: SessionUser; expiresAt?: string };
        if (cancelled) return;

        const normalizedSession: AuthSession = {
          accessToken: localSession.accessToken,
          expiresAt: typeof meData.expiresAt === "string" ? meData.expiresAt : localSession.expiresAt,
          user: meData.user,
        };

        saveSession(normalizedSession);
        setSession(normalizedSession);
        setCurrentUser(meData.user);

        const pointsResponse = await fetch(toApiUrl("/api/v1/points/summary"), {
          method: "GET",
          headers: {
            Authorization: `Bearer ${normalizedSession.accessToken}`,
          },
        });

        if (pointsResponse.ok) {
          const pointsData = (await pointsResponse.json()) as { points: number; agentPoints: number };
          if (!cancelled) {
            const mergedUser: SessionUser = {
              ...meData.user,
              points: pointsData.points,
              agentPoints: pointsData.agentPoints,
            };
            setCurrentUser(mergedUser);
            saveSession({
              ...normalizedSession,
              user: mergedUser,
            });
          }
        }
      } catch {
        clearSession();
        if (!cancelled) {
          setSession(null);
          setCurrentUser(guestUser);
        }
      } finally {
        if (!cancelled) {
          setAuthReady(true);
        }
      }
    };

    void loadAuthState();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    return subscribeSession((nextSession) => {
      if (!nextSession) {
        setSession(null);
        setCurrentUser(guestUser);
        return;
      }

      setSession(nextSession);
      setCurrentUser(nextSession.user);
    });
  }, []);

  useEffect(() => {
    if (!authReady) return;
    let cancelled = false;

    const loadWorkbenchNav = async () => {
      try {
        const headers: HeadersInit = {};
        if (session?.accessToken) {
          headers.Authorization = `Bearer ${session.accessToken}`;
        }

        const response = await fetch(toApiUrl("/api/v1/workbench/nav"), {
          method: "GET",
          headers,
        });
        if (!response.ok || cancelled) return;

        const data = (await response.json()) as { items?: NavApiItem[] };
        if (!data.items?.length) return;

        const nextVisibility = data.items.reduce((accumulator, item) => {
          accumulator[item.key] = item.visible;
          return accumulator;
        }, {} as NavVisibilityMap);

        setNavVisibility(nextVisibility);
      } catch {
        // Keep default navigation visibility.
      }
    };

    void loadWorkbenchNav();
    return () => {
      cancelled = true;
    };
  }, [authReady, session]);

  const visibleNavItems = useMemo(() => {
    return allNavItems.filter((item) => navVisibility[item.key] !== false);
  }, [navVisibility]);

  const navItems = useMemo(() => {
    if (isLoggedIn) return visibleNavItems;
    return visibleNavItems.filter((item) => guestNavKeys.has(item.key));
  }, [isLoggedIn, visibleNavItems]);

  const sidebarNavItems = useMemo(() => navItems.filter((item) => item.key !== "points"), [navItems]);
  const pointsEntry = useMemo(() => navItems.find((item) => item.key === "points"), [navItems]);
  const fallbackPath = useMemo(() => getFallbackPath(navItems), [navItems]);
  const noticeText = useMemo(() => getNoticeText(pathname), [pathname]);

  useEffect(() => {
    if (!pathname || !pathname.startsWith("/zh/")) return;
    if (isLoggedIn) return;
    if (!guestBlockedPaths.has(pathname)) return;
    router.replace(fallbackPath);
  }, [fallbackPath, isLoggedIn, pathname, router]);

  useEffect(() => {
    if (!pathname || !pathname.startsWith("/zh/")) return;
    const currentItem = allNavItems.find((item) => item.href === pathname);
    if (!currentItem) return;

    const isVisible = navVisibility[currentItem.key] !== false;
    const isAllowedForGuest = isLoggedIn || guestNavKeys.has(currentItem.key);
    if (isVisible && isAllowedForGuest) return;

    if (pathname !== fallbackPath) {
      router.replace(fallbackPath);
    }
  }, [fallbackPath, isLoggedIn, navVisibility, pathname, router]);

  const onLogout = async () => {
    const token = session?.accessToken;
    clearSession();
    setSession(null);
    setCurrentUser(guestUser);

    if (token) {
      try {
        await fetch(toApiUrl("/api/v1/auth/logout"), {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });
      } catch {
        // Local session already cleared.
      }
    }

    router.replace(fallbackPath);
  };

  if (!authReady) {
    return <div className="flex min-h-screen items-center justify-center text-sm text-[#5f6a99]">正在加载工作台...</div>;
  }

  return (
    <div className="min-h-screen bg-[#fafafc]">
      <div className="flex min-h-screen">
        <aside className="hidden w-[212px] shrink-0 border-r border-[#eceef4] bg-white lg:flex lg:flex-col">
          <div className="flex items-center gap-3 px-5 pb-4 pt-5">
            <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-[linear-gradient(135deg,#7568ff,#5f74ff)] text-white shadow-[0_10px_20px_rgba(103,93,255,0.22)]">
              <Sparkles size={16} />
            </span>
            <div>
              <p className="text-[28px] font-semibold tracking-[-0.03em] text-[#2b3560]">Gewu</p>
              <p className="text-[12px] text-[#98a0b8]">格物学术工作台</p>
            </div>
          </div>

          <nav className="flex-1 space-y-1 overflow-y-auto px-3">
            {sidebarNavItems.map((item) => {
              const Icon = item.icon;
              const active = pathname === item.href;

              return (
                <Link
                  key={item.key}
                  href={item.href}
                  className={clsx(
                    "flex items-center gap-3 rounded-lg px-3 py-3 text-[15px] transition",
                    active
                      ? "bg-[#f1efff] font-medium text-[#6357e8]"
                      : "text-[#40485f] hover:bg-[#f7f7fb] hover:text-[#6357e8]",
                  )}
                >
                  <Icon size={17} className={active ? "text-[#6357e8]" : "text-[#7f879d]"} />
                  <span>{item.label}</span>
                </Link>
              );
            })}
          </nav>

          <div className="px-4 pb-5 pt-4">
            <div className="rounded-xl border border-[#ecebf7] bg-[linear-gradient(180deg,#ffffff_0%,#fbf9ff_100%)] p-4 shadow-[0_10px_24px_rgba(60,66,124,0.05)]">
              <p className="text-xs text-[#8f97af]">剩余点数</p>
              <p className="mt-2 text-[34px] font-semibold leading-none text-[#232c45]">{currentUser.points}</p>
              <p className="mt-2 text-[11px] text-[#9aa2b8]">
                通用 {currentUser.points} + Agent {currentUser.agentPoints}
              </p>
              <Link
                href={pointsEntry?.href || `/auth/login?next=${encodeURIComponent(getSafeNext(pathname))}`}
                className="mt-4 inline-flex h-9 items-center justify-center rounded-full bg-[linear-gradient(135deg,#dcd2ff,#b7d8ff)] px-4 text-sm font-medium text-[#4b4aa1]"
              >
                {isLoggedIn ? "充值点数" : "登录后充值"}
              </Link>
            </div>
          </div>
        </aside>

        <section className="flex min-w-0 flex-1 flex-col">
          <header className="border-b border-[#eceef4] bg-white">
            <div className="mx-auto flex w-full max-w-[1160px] items-center justify-between gap-4 px-4 py-3 md:px-6">
              <div className="flex min-w-0 items-center gap-2">
                <span className="truncate rounded-full border border-[#e7eaf2] bg-[#fbfbff] px-4 py-1.5 text-xs text-[#59607b]">
                  {noticeText}
                </span>
                {!isLoggedIn ? (
                  <span className="hidden rounded-full border border-[#e7eaf2] bg-white px-4 py-1.5 text-xs text-[#6e7489] md:inline-flex">
                    游客模式，提交前请先登录
                  </span>
                ) : null}
              </div>

              <div className="flex items-center gap-2">
                {isLoggedIn ? (
                  <>
                    <Link
                      href={pointsEntry?.href || "/zh/points"}
                      className="hidden items-center rounded-full border border-[#dfe4f0] px-4 py-2 text-xs text-[#48506e] md:inline-flex"
                    >
                      剩余点数：{currentUser.points}
                    </Link>
                    <Link
                      href={pointsEntry?.href || "/zh/points"}
                      className="hidden items-center rounded-full border border-[#dfe4f0] px-4 py-2 text-xs text-[#6c63e7] md:inline-flex"
                    >
                      充值
                    </Link>
                  </>
                ) : (
                  <span className="hidden items-center rounded-full border border-[#dfe4f0] px-4 py-2 text-xs text-[#48506e] md:inline-flex">
                    未登录
                  </span>
                )}

                <button
                  type="button"
                  className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-[#dfe4f0] bg-white text-[#69718c]"
                >
                  <Bell size={16} />
                </button>

                {isLoggedIn ? (
                  <>
                    <span className="hidden h-10 min-w-10 items-center justify-center rounded-full bg-[#6b62eb] px-3 text-sm font-semibold text-white md:inline-flex">
                      {currentUser.email.slice(0, 1).toUpperCase()}
                    </span>
                    <button
                      onClick={onLogout}
                      className="inline-flex h-10 items-center gap-1 rounded-full border border-[#dfe4f0] bg-white px-4 text-sm text-[#4e5670]"
                    >
                      <LogOut size={14} />
                      退出
                    </button>
                  </>
                ) : (
                  <Link
                    href={`/auth/login?next=${encodeURIComponent(getSafeNext(pathname))}`}
                    className="inline-flex h-10 items-center gap-1 rounded-full border border-[#dfe4f0] bg-white px-4 text-sm text-[#4e5670]"
                  >
                    <LogIn size={14} />
                    登录
                  </Link>
                )}
              </div>
            </div>
          </header>

          <main className="min-h-0 flex-1 px-4 py-5 md:px-6">
            <div className="mx-auto w-full max-w-[1160px]">{children}</div>
          </main>
        </section>
      </div>
    </div>
  );
}
