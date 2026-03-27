"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";
import { fromAuthResponse, saveSession, toApiUrl } from "@/lib/auth";

type LoginResponse = {
  token: string;
  expiresAt: string;
  user: {
    id: string;
    email: string;
    emailVerified: boolean;
    role: "USER" | "ADMIN";
    points: number;
    agentPoints: number;
  };
};

type LoginErrorResponse = {
  message?: string;
  code?: string;
};

function getSafeNextPath(nextValue: string | null) {
  if (!nextValue) return "/zh/AI-search";
  if (!nextValue.startsWith("/") || nextValue.startsWith("//")) return "/zh/AI-search";
  return nextValue;
}

export default function LoginPage() {
  const router = useRouter();

  const [nextPath, setNextPath] = useState("/zh/AI-search");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [unverifiedEmail, setUnverifiedEmail] = useState("");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setNextPath(getSafeNextPath(params.get("next")));
  }, []);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!email.trim() || !password) {
      setError("请输入邮箱和密码。");
      return;
    }

    setSubmitting(true);
    setError("");
    setUnverifiedEmail("");
    try {
      const response = await fetch(toApiUrl("/api/v1/auth/login"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: email.trim(),
          password,
        }),
      });

      const data = (await response.json().catch(() => null)) as LoginResponse | LoginErrorResponse | null;
      if (!response.ok || !data || !("token" in data) || !("expiresAt" in data) || !("user" in data)) {
        if (response.status === 403 && data && "code" in data && data.code === "EMAIL_NOT_VERIFIED") {
          setUnverifiedEmail(email.trim().toLowerCase());
        }
        setError((data && "message" in data && data.message) || "登录失败，请重试。");
        return;
      }

      saveSession(fromAuthResponse(data));
      router.replace(nextPath);
    } catch {
      setError("网络异常，请稍后重试。");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="mx-auto flex min-h-[calc(100vh-40px)] max-w-[520px] items-center px-4 py-12">
      <section className="dashboard-card w-full p-7">
        <p className="text-xs uppercase tracking-[0.2em] text-[#7a84ad]">GEWU LOGIN</p>
        <h1 className="mt-2 text-2xl font-semibold text-[#202848]">登录</h1>
        <p className="mt-1 text-sm text-[#68739a]">仅支持邮箱 + 密码登录。</p>

        <form className="mt-5 space-y-3" onSubmit={submit}>
          <input
            className="w-full rounded-xl border border-[#dbe1fb] px-3 py-2.5 text-sm outline-none focus:border-[#6366f1]"
            placeholder="邮箱"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            autoComplete="email"
          />
          <input
            className="w-full rounded-xl border border-[#dbe1fb] px-3 py-2.5 text-sm outline-none focus:border-[#6366f1]"
            placeholder="密码"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoComplete="current-password"
          />

          {error ? <p className="text-xs text-[#c0392b]">{error}</p> : null}

          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded-xl bg-[#6366f1] px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
          >
            {submitting ? "登录中..." : "立即登录"}
          </button>
        </form>

        <div className="mt-3 flex items-center justify-between text-xs">
          <Link href="/forgot-password" className="text-[#5a67cb] hover:underline">
            忘记密码？
          </Link>
          {unverifiedEmail ? (
            <Link href={`/verify-email?email=${encodeURIComponent(unverifiedEmail)}`} className="text-[#5a67cb] hover:underline">
              去验证邮箱
            </Link>
          ) : null}
        </div>

        <p className="mt-4 text-center text-xs text-[#6f789f]">
          还没有账号？
          <Link href={`/auth/register?next=${encodeURIComponent(nextPath)}`} className="ml-1 text-[#4651ba] hover:underline">
            立即注册
          </Link>
        </p>
      </section>
    </main>
  );
}
