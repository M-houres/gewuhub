"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";
import { toApiUrl } from "@/lib/auth";

type ResetPasswordResponse = {
  message?: string;
};

type ApiErrorResponse = {
  message?: string;
};

export default function ResetPasswordPage() {
  const router = useRouter();

  const [token, setToken] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const tokenFromQuery = params.get("token");
    if (tokenFromQuery) {
      setToken(tokenFromQuery);
    }
  }, []);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!token.trim()) {
      setError("Please enter reset token.");
      return;
    }
    if (password.length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }
    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setSubmitting(true);
    setError("");
    setInfo("");
    try {
      const response = await fetch(toApiUrl("/api/v1/auth/reset-password"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token: token.trim(),
          password,
        }),
      });
      const data = (await response.json().catch(() => null)) as ResetPasswordResponse | ApiErrorResponse | null;
      if (!response.ok) {
        setError((data && "message" in data && data.message) || "Failed to reset password.");
        return;
      }
      setInfo((data && "message" in data && data.message) || "Password reset successful.");
      setTimeout(() => {
        router.replace("/login");
      }, 800);
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="mx-auto flex min-h-[calc(100vh-40px)] max-w-[520px] items-center px-4 py-12">
      <section className="dashboard-card w-full p-7">
        <p className="text-xs uppercase tracking-[0.2em] text-[#7a84ad]">GEWU RESET PASSWORD</p>
        <h1 className="mt-2 text-2xl font-semibold text-[#202848]">Reset password</h1>
        <p className="mt-1 text-sm text-[#68739a]">Paste the reset token, set a new password, then login again.</p>

        <form className="mt-5 space-y-3" onSubmit={submit}>
          <input
            className="w-full rounded-xl border border-[#dbe1fb] px-3 py-2.5 text-sm outline-none focus:border-[#6366f1]"
            placeholder="Reset token"
            value={token}
            onChange={(event) => setToken(event.target.value)}
          />
          <input
            className="w-full rounded-xl border border-[#dbe1fb] px-3 py-2.5 text-sm outline-none focus:border-[#6366f1]"
            placeholder="New password"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoComplete="new-password"
          />
          <input
            className="w-full rounded-xl border border-[#dbe1fb] px-3 py-2.5 text-sm outline-none focus:border-[#6366f1]"
            placeholder="Confirm new password"
            type="password"
            value={confirmPassword}
            onChange={(event) => setConfirmPassword(event.target.value)}
            autoComplete="new-password"
          />

          {error ? <p className="text-xs text-[#c0392b]">{error}</p> : null}
          {info ? <p className="text-xs text-[#2e8b57]">{info}</p> : null}

          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded-xl bg-[#6366f1] px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
          >
            {submitting ? "Submitting..." : "Reset password"}
          </button>
        </form>

        <div className="mt-4 text-xs text-[#6f789f]">
          <Link href="/login" className="text-[#4651ba] hover:underline">
            Back to login
          </Link>
        </div>
      </section>
    </main>
  );
}
