"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";
import { toApiUrl } from "@/lib/auth";

type RegisterResponse = {
  message: string;
  email: string;
  verificationRequired: boolean;
  verificationExpiresAt: string;
  debugVerificationToken?: string;
};

function getSafeNextPath(nextValue: string | null) {
  if (!nextValue) return "/zh/AI-search";
  if (!nextValue.startsWith("/") || nextValue.startsWith("//")) return "/zh/AI-search";
  return nextValue;
}

export default function RegisterPage() {
  const router = useRouter();

  const [nextPath, setNextPath] = useState("/zh/AI-search");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setNextPath(getSafeNextPath(params.get("next")));
  }, []);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!email.trim() || password.length < 6) {
      setError("请输入有效邮箱和至少 6 位密码。");
      return;
    }

    setSubmitting(true);
    setError("");
    try {
      const response = await fetch(toApiUrl("/api/v1/auth/register"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: email.trim(),
          password,
          inviteCode: inviteCode.trim() || undefined,
        }),
      });

      const data = (await response.json().catch(() => null)) as RegisterResponse | { message?: string } | null;
      if (!response.ok || !data || !("verificationRequired" in data)) {
        setError((data && "message" in data && data.message) || "注册失败，请重试。");
        return;
      }

      const params = new URLSearchParams({
        email: data.email,
      });
      if (data.debugVerificationToken) {
        params.set("token", data.debugVerificationToken);
      }
      params.set("next", nextPath);
      router.replace(`/verify-email?${params.toString()}`);
    } catch {
      setError("网络异常，请稍后重试。");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="mx-auto flex min-h-[calc(100vh-40px)] max-w-[520px] items-center px-4 py-12">
      <section className="dashboard-card w-full p-7">
        <p className="text-xs uppercase tracking-[0.2em] text-[#7a84ad]">GEWU REGISTER</p>
        <h1 className="mt-2 text-2xl font-semibold text-[#202848]">创建账号</h1>
        <p className="mt-1 text-sm text-[#68739a]">支持邀请码。注册后需完成邮箱验证才可登录。</p>

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
            placeholder="密码（至少 6 位）"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoComplete="new-password"
          />
          <input
            className="w-full rounded-xl border border-[#dbe1fb] px-3 py-2.5 text-sm outline-none focus:border-[#6366f1]"
            placeholder="邀请码（可选）"
            value={inviteCode}
            onChange={(event) => setInviteCode(event.target.value)}
          />

          {error ? <p className="text-xs text-[#c0392b]">{error}</p> : null}

          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded-xl bg-[#6366f1] px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
          >
            {submitting ? "注册中..." : "立即注册"}
          </button>
        </form>

        <p className="mt-4 text-center text-xs text-[#6f789f]">
          已有账号？
          <Link href={`/auth/login?next=${encodeURIComponent(nextPath)}`} className="ml-1 text-[#4651ba] hover:underline">
            去登录
          </Link>
        </p>
      </section>
    </main>
  );
}
