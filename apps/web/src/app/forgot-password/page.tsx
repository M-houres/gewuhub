"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { toApiUrl } from "@/lib/auth";

type ForgotPasswordResponse = {
  message?: string;
  debugResetToken?: string;
};

type ApiErrorResponse = {
  message?: string;
};

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [debugToken, setDebugToken] = useState("");

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!email.trim()) {
      setError("Please enter your email.");
      return;
    }

    setSubmitting(true);
    setError("");
    setInfo("");
    setDebugToken("");
    try {
      const response = await fetch(toApiUrl("/api/v1/auth/forgot-password"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim() }),
      });
      const data = (await response.json().catch(() => null)) as ForgotPasswordResponse | ApiErrorResponse | null;
      if (!response.ok) {
        setError((data && "message" in data && data.message) || "Failed to request password reset.");
        return;
      }
      setInfo((data && "message" in data && data.message) || "If the email exists, reset instructions have been sent.");
      if (data && "debugResetToken" in data && typeof data.debugResetToken === "string") {
        setDebugToken(data.debugResetToken);
      }
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="mx-auto flex min-h-[calc(100vh-40px)] max-w-[520px] items-center px-4 py-12">
      <section className="dashboard-card w-full p-7">
        <p className="text-xs uppercase tracking-[0.2em] text-[#7a84ad]">GEWU PASSWORD RESET</p>
        <h1 className="mt-2 text-2xl font-semibold text-[#202848]">Forgot password</h1>
        <p className="mt-1 text-sm text-[#68739a]">Enter your email and we will send reset instructions.</p>

        <form className="mt-5 space-y-3" onSubmit={submit}>
          <input
            className="w-full rounded-xl border border-[#dbe1fb] px-3 py-2.5 text-sm outline-none focus:border-[#6366f1]"
            placeholder="Email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            autoComplete="email"
          />

          {error ? <p className="text-xs text-[#c0392b]">{error}</p> : null}
          {info ? <p className="text-xs text-[#2e8b57]">{info}</p> : null}
          {debugToken ? (
            <p className="rounded-lg border border-[#dbe1fb] bg-[#f8f9ff] px-2 py-1 text-xs text-[#4a57b5]">
              Debug reset token: {debugToken}
            </p>
          ) : null}

          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded-xl bg-[#6366f1] px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
          >
            {submitting ? "Submitting..." : "Send reset email"}
          </button>
        </form>

        <div className="mt-4 flex items-center justify-between text-xs text-[#6f789f]">
          <Link href="/login" className="text-[#4651ba] hover:underline">
            Back to login
          </Link>
          <Link href="/reset-password" className="text-[#4651ba] hover:underline">
            I already have a token
          </Link>
        </div>
      </section>
    </main>
  );
}
