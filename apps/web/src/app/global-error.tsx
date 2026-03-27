"use client";

import { useEffect } from "react";
import { getValidSession, toApiUrl } from "@/lib/auth";

type GlobalErrorProps = {
  error: Error & { digest?: string };
  reset: () => void;
};

export default function GlobalError({ error, reset }: GlobalErrorProps) {
  useEffect(() => {
    const session = getValidSession();
    const headers: HeadersInit = {
      "Content-Type": "application/json",
    };
    if (session) {
      headers.Authorization = `Bearer ${session.accessToken}`;
    }

    void fetch(toApiUrl("/api/v1/monitoring/client-error"), {
      method: "POST",
      headers,
      body: JSON.stringify({
        message: error.message || "global error",
        stack: error.stack,
        source: "next.global-error",
        page: typeof window !== "undefined" ? window.location.pathname : "unknown",
        createdAt: new Date().toISOString(),
      }),
    }).catch(() => {
      // Ignore monitoring transport errors.
    });
  }, [error]);

  return (
    <html lang="zh-CN">
      <body className="flex min-h-screen items-center justify-center bg-[#f3f5ff] px-6">
        <main className="max-w-[560px] rounded-2xl border border-[#dfe4ff] bg-white p-6 text-center shadow-sm">
          <h1 className="text-xl font-semibold text-[#2a3151]">页面出现异常</h1>
          <p className="mt-2 text-sm text-[#5f6a95]">我们已记录错误信息，请点击重试；若持续失败，请稍后再试。</p>
          <button
            onClick={reset}
            className="mt-4 rounded-xl bg-[#6366f1] px-4 py-2 text-sm font-semibold text-white"
          >
            重新加载
          </button>
        </main>
      </body>
    </html>
  );
}
