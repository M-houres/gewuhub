#!/usr/bin/env node

const apiBase = process.env.SMOKE_API_BASE || "http://127.0.0.1:4000";
const adminToken = process.env.ADMIN_TOKEN || "dev-admin-token";

function randomEmail(prefix) {
  const random = Math.random().toString(36).slice(2, 8);
  return `${prefix}_${Date.now()}_${random}@example.com`;
}

function ensure(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

async function request(path, options = {}) {
  const response = await fetch(`${apiBase}${path}`, options);
  let payload = null;
  const contentType = response.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    payload = await response.json().catch(() => null);
  } else {
    payload = await response.text().catch(() => null);
  }
  return { status: response.status, payload };
}

async function fetchEmailLogs() {
  const response = await request("/api/v1/admin/email-logs?limit=200", {
    method: "GET",
    headers: {
      "x-admin-token": adminToken,
    },
  });
  ensure(response.status === 200, `fetch email logs failed: ${response.status}`);
  ensure(Array.isArray(response.payload), "email logs payload should be array");
  return response.payload;
}

function findEmailLog(logs, input) {
  return logs.find((item) => item.to === input.to && item.category === input.category);
}

async function register(email, password) {
  const response = await request("/api/v1/auth/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  ensure(response.status === 201, `register failed: ${response.status}`);
  ensure(typeof response.payload?.debugVerificationToken === "string", "missing debug verification token");
  return response.payload;
}

async function verifyEmail(token) {
  const response = await request("/api/v1/auth/verify-email", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token }),
  });
  ensure(response.status === 200, `verify email failed: ${response.status}`);
}

async function login(email, password) {
  const response = await request("/api/v1/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  ensure(response.status === 200, `login failed: ${response.status}`);
  ensure(typeof response.payload?.token === "string", "login missing token");
  ensure(typeof response.payload?.user?.id === "string", "login missing user id");
  return response.payload;
}

async function requestPasswordReset(email) {
  const response = await request("/api/v1/auth/forgot-password", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email }),
  });
  ensure(response.status === 200, `forgot password failed: ${response.status}`);
  ensure(typeof response.payload?.debugResetToken === "string", "missing debug reset token");
  return response.payload;
}

async function createTopupOrder(token) {
  const response = await request("/api/v1/payments/orders", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      pointsAmount: 80,
      amount: 8,
      channel: "alipay",
    }),
  });
  ensure(response.status === 201, `create order failed: ${response.status}`);
  ensure(typeof response.payload?.orderId === "string", "orderId missing");
  return response.payload;
}

async function mockPay(token, orderId) {
  const response = await request(`/api/v1/payments/orders/${orderId}/mock-pay`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      status: "SUCCESS",
    }),
  });
  ensure(response.status === 200, `mock pay failed: ${response.status}`);
}

async function main() {
  const email = randomEmail("smoke_mail");
  const password = "pass1234";

  const registerResult = await register(email, password);
  const logsAfterRegister = await fetchEmailLogs();
  const verificationLog = findEmailLog(logsAfterRegister, {
    to: email,
    category: "auth.verify-email",
  });
  ensure(verificationLog, "verification email log not found");
  ensure(verificationLog.status === "sent", "verification email should be sent");

  await verifyEmail(registerResult.debugVerificationToken);
  const loginResult = await login(email, password);
  const userId = loginResult.user.id;

  await requestPasswordReset(email);
  const logsAfterReset = await fetchEmailLogs();
  const resetLog = findEmailLog(logsAfterReset, {
    to: email,
    category: "auth.reset-password",
  });
  ensure(resetLog, "reset password email log not found");
  ensure(resetLog.status === "sent", "reset email should be sent");
  ensure(resetLog.userId === userId, "reset email log should match user id");

  const order = await createTopupOrder(loginResult.token);
  await mockPay(loginResult.token, order.orderId);
  const logsAfterPayment = await fetchEmailLogs();
  const paymentLog = findEmailLog(logsAfterPayment, {
    to: email,
    category: "payment.success",
  });
  ensure(paymentLog, "payment success email log not found");
  ensure(paymentLog.status === "sent", "payment email should be sent");
  ensure(paymentLog.userId === userId, "payment email log should match user id");

  console.log(
    JSON.stringify(
      {
        ok: true,
        apiBase,
        checks: [
          "register sends verification email",
          "forgot password sends reset email",
          "payment success sends recharge email",
          "email logs can be audited in admin endpoint",
        ],
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(
    JSON.stringify(
      {
        ok: false,
        apiBase,
        error: error instanceof Error ? error.message : String(error),
      },
      null,
      2,
    ),
  );
  process.exit(1);
});
