"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useRef, useState } from "react";
import { toApiUrl } from "@/lib/auth";

type VerifyEmailResponse = {
  message?: string;
  email?: string;
  verifiedAt?: string;
  idempotent?: boolean;
};

type ResendVerificationResponse = {
  message?: string;
  debugVerificationToken?: string;
};

type ApiErrorResponse = {
  message?: string;
};

function getSafeNextPath(nextValue: string | null) {
  if (!nextValue) return "/zh/AI-search";
  if (!nextValue.startsWith("/") || nextValue.startsWith("//")) return "/zh/AI-search";
  return nextValue;
}

export default function VerifyEmailPage() {
  const router = useRouter();
  const autoVerifyTriggeredRef = useRef(false);

  const [email, setEmail] = useState("");
  const [token, setToken] = useState("");
  const [nextPath, setNextPath] = useState("/zh/AI-search");
  const [verifying, setVerifying] = useState(false);
  const [resending, setResending] = useState(false);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [verified, setVerified] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const emailFromQuery = params.get("email") || "";
    const tokenFromQuery = params.get("token") || "";
    const nextFromQuery = getSafeNextPath(params.get("next"));

    setEmail(emailFromQuery);
    setToken(tokenFromQuery);
    setNextPath(nextFromQuery);

    if (tokenFromQuery && !autoVerifyTriggeredRef.current) {
      autoVerifyTriggeredRef.current = true;
      void (async () => {
        setVerifying(true);
        setError("");
        setInfo("");
        const response = await fetch(toApiUrl("/api/v1/auth/verify-email"), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token: tokenFromQuery }),
        });
        const data = (await response.json().catch(() => null)) as VerifyEmailResponse | ApiErrorResponse | null;
        if (!response.ok) {
          setError((data && "message" in data && data.message) || "Email verification failed.");
          setVerifying(false);
          return;
        }
        setVerified(true);
        setInfo((data && "message" in data && data.message) || "Email verified successfully.");
        setVerifying(false);
      })();
    }
  }, []);

  const submitVerify = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!token.trim()) {
      setError("Please enter your verification token.");
      return;
    }

    setVerifying(true);
    setError("");
    setInfo("");
    try {
      const response = await fetch(toApiUrl("/api/v1/auth/verify-email"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: token.trim() }),
      });
      const data = (await response.json().catch(() => null)) as VerifyEmailResponse | ApiErrorResponse | null;
      if (!response.ok) {
        setError((data && "message" in data && data.message) || "Email verification failed.");
        return;
      }

      setVerified(true);
      setInfo((data && "message" in data && data.message) || "Email verified successfully.");
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setVerifying(false);
    }
  };

  const resendVerification = async () => {
    if (!email.trim()) {
      setError("Please enter your email to resend verification.");
      return;
    }

    setResending(true);
    setError("");
    setInfo("");
    try {
      const response = await fetch(toApiUrl("/api/v1/auth/resend-verification"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim() }),
      });
      const data = (await response.json().catch(() => null)) as ResendVerificationResponse | ApiErrorResponse | null;
      if (!response.ok) {
        setError((data && "message" in data && data.message) || "Failed to resend verification.");
        return;
      }

      if (data && "debugVerificationToken" in data && typeof data.debugVerificationToken === "string") {
        setToken(data.debugVerificationToken);
      }
      setInfo((data && "message" in data && data.message) || "Verification email sent.");
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setResending(false);
    }
  };

  return (
    <main className="mx-auto flex min-h-[calc(100vh-40px)] max-w-[560px] items-center px-4 py-12">
      <section className="dashboard-card w-full p-7">
        <p className="text-xs uppercase tracking-[0.2em] text-[#7a84ad]">GEWU VERIFY EMAIL</p>
        <h1 className="mt-2 text-2xl font-semibold text-[#202848]">Verify your email</h1>
        <p className="mt-1 text-sm text-[#68739a]">Complete email verification first, then you can login and use paid AI features.</p>

        <form className="mt-5 space-y-3" onSubmit={submitVerify}>
          <input
            className="w-full rounded-xl border border-[#dbe1fb] px-3 py-2.5 text-sm outline-none focus:border-[#6366f1]"
            placeholder="Email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            autoComplete="email"
          />
          <input
            className="w-full rounded-xl border border-[#dbe1fb] px-3 py-2.5 text-sm outline-none focus:border-[#6366f1]"
            placeholder="Verification token"
            value={token}
            onChange={(event) => setToken(event.target.value)}
          />

          {error ? <p className="text-xs text-[#c0392b]">{error}</p> : null}
          {info ? <p className="text-xs text-[#2e8b57]">{info}</p> : null}

          <button
            type="submit"
            disabled={verifying || verified}
            className="w-full rounded-xl bg-[#6366f1] px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
          >
            {verifying ? "Verifying..." : verified ? "Verified" : "Verify email"}
          </button>
        </form>

        <button
          onClick={resendVerification}
          disabled={resending}
          className="mt-2 w-full rounded-xl border border-[#dbe1fb] bg-white px-4 py-2.5 text-sm font-semibold text-[#4651ba] disabled:opacity-60"
        >
          {resending ? "Sending..." : "Resend verification email"}
        </button>

        <div className="mt-4 flex items-center justify-between text-xs text-[#6f789f]">
          <Link href={`/login?next=${encodeURIComponent(nextPath)}`} className="text-[#4651ba] hover:underline">
            Back to login
          </Link>
          {verified ? (
            <button onClick={() => router.push(`/login?next=${encodeURIComponent(nextPath)}`)} className="text-[#4651ba] hover:underline">
              Continue to login
            </button>
          ) : null}
        </div>
      </section>
    </main>
  );
}
