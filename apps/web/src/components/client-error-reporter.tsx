"use client";

import { getValidSession, toApiUrl } from "@/lib/auth";
import { useEffect } from "react";

const REPORT_COOLDOWN_MS = 1500;

type ClientErrorPayload = {
  message: string;
  stack?: string;
  page?: string;
  userAgent?: string;
  source: string;
  createdAt: string;
};

function postClientError(payload: ClientErrorPayload) {
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
    body: JSON.stringify(payload),
  }).catch(() => {
    // Ignore monitoring transport errors.
  });
}

export function ClientErrorReporter() {
  useEffect(() => {
    let lastSentAt = 0;

    const canSend = () => {
      const now = Date.now();
      if (now - lastSentAt < REPORT_COOLDOWN_MS) return false;
      lastSentAt = now;
      return true;
    };

    const onWindowError = (event: ErrorEvent) => {
      if (!canSend()) return;
      postClientError({
        message: event.message || "window error",
        stack: event.error instanceof Error ? event.error.stack : undefined,
        page: window.location.pathname,
        userAgent: window.navigator.userAgent,
        source: "window.onerror",
        createdAt: new Date().toISOString(),
      });
    };

    const onUnhandledRejection = (event: PromiseRejectionEvent) => {
      if (!canSend()) return;
      const reason = event.reason;
      const message = reason instanceof Error ? reason.message : String(reason ?? "unhandled rejection");
      const stack = reason instanceof Error ? reason.stack : undefined;
      postClientError({
        message,
        stack,
        page: window.location.pathname,
        userAgent: window.navigator.userAgent,
        source: "window.unhandledrejection",
        createdAt: new Date().toISOString(),
      });
    };

    window.addEventListener("error", onWindowError);
    window.addEventListener("unhandledrejection", onUnhandledRejection);

    return () => {
      window.removeEventListener("error", onWindowError);
      window.removeEventListener("unhandledrejection", onUnhandledRejection);
    };
  }, []);

  return null;
}
