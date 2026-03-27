#!/usr/bin/env node

const apiBase = process.env.SMOKE_API_BASE || "http://127.0.0.1:4000";
const adminToken = process.env.ADMIN_TOKEN || "dev-admin-token";
const pollIntervalMs = Number(process.env.SMOKE_TASK_POLL_INTERVAL_MS || 2000);
const maxPollTimes = Number(process.env.SMOKE_TASK_MAX_POLLS || 12);

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

async function registerUser(prefix) {
  const email = randomEmail(prefix);
  const password = "pass1234";

  const response = await request("/api/v1/auth/register", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      email,
      password,
    }),
  });
  ensure(response.status === 201, `register failed: ${response.status}`);
  ensure(response.payload?.verificationRequired === true, "register should require email verification");
  ensure(typeof response.payload?.debugVerificationToken === "string", "register missing debug verification token");
  return {
    email,
    password,
    verificationToken: response.payload.debugVerificationToken,
  };
}

async function verifyEmail(token) {
  const response = await request("/api/v1/auth/verify-email", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ token }),
  });
  ensure(response.status === 200, `verify email failed: ${response.status}`);
}

async function loginUser(email, password) {
  const response = await request("/api/v1/auth/login", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ email, password }),
  });
  ensure(response.status === 200, `login failed: ${response.status}`);
  ensure(typeof response.payload?.token === "string", "login response missing token");
  return response.payload.token;
}

async function registerAndLogin(prefix) {
  const account = await registerUser(prefix);
  await verifyEmail(account.verificationToken);
  const token = await loginUser(account.email, account.password);
  return { token };
}

async function getPointsSummary(token) {
  const response = await request("/api/v1/points/summary", {
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
  ensure(response.status === 200, `points summary failed: ${response.status}`);
  ensure(typeof response.payload?.points === "number", "points summary missing points");
  return response.payload;
}

async function createTopupOrder(token, input) {
  const response = await request("/api/v1/payments/orders", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(input),
  });
  ensure(response.status === 201, `create payment order failed: ${response.status}`);
  ensure(typeof response.payload?.orderId === "string", "payment order missing orderId");
  return response.payload;
}

async function mockPayOrder(token, orderId) {
  const response = await request(`/api/v1/payments/orders/${orderId}/mock-pay`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ status: "SUCCESS" }),
  });
  ensure(response.status === 200, `mock pay failed: ${response.status}`);
  ensure(response.payload?.status === "paid", "mock pay did not mark order as paid");
  return response.payload;
}

async function createTask(token, content) {
  const response = await request("/api/v1/tasks", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      type: "reduce-ai",
      content,
      mode: "balanced",
      provider: "deepseek",
      modelId: "deepseek-v3",
      platform: "cnki",
    }),
  });
  ensure(response.status === 202, `create task failed: ${response.status}`);
  ensure(typeof response.payload?.taskId === "string", "create task missing taskId");
  ensure(typeof response.payload?.pointsCost === "number", "create task missing pointsCost");
  return response.payload;
}

async function pollTaskDone(token, taskId) {
  for (let index = 0; index < maxPollTimes; index += 1) {
    await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
    const detail = await request(`/api/v1/tasks/${taskId}`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
    ensure(detail.status === 200, `poll task failed: ${detail.status}`);
    if (detail.payload?.status === "completed") {
      return detail.payload;
    }
    if (detail.payload?.status === "failed") {
      throw new Error(`task ${taskId} unexpectedly failed`);
    }
  }
  throw new Error(`task ${taskId} did not complete in time`);
}

async function listOrders(token) {
  const response = await request("/api/v1/payments/orders", {
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
  ensure(response.status === 200, `list orders failed: ${response.status}`);
  ensure(Array.isArray(response.payload), "list orders did not return array");
  return response.payload;
}

function findOrder(orders, orderId) {
  const order = orders.find((item) => item.id === orderId);
  ensure(Boolean(order), `order not found in user list: ${orderId}`);
  return order;
}

async function adminRefund(orderId, reason) {
  const response = await request(`/api/v1/admin/orders/${orderId}/refund`, {
    method: "POST",
    headers: {
      "x-admin-token": adminToken,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ reason }),
  });
  ensure(response.status === 200, `admin refund failed: ${response.status}`);
  ensure(typeof response.payload?.refundedPoints === "number", "refund response missing refundedPoints");
  ensure(typeof response.payload?.idempotent === "boolean", "refund response missing idempotent");
  return response.payload;
}

async function main() {
  const user = await registerAndLogin("smoke_refund");

  const initialSummary = await getPointsSummary(user.token);
  const topupInput = { pointsAmount: 120, amount: 12, channel: "alipay" };

  const createdOrder = await createTopupOrder(user.token, topupInput);
  await mockPayOrder(user.token, createdOrder.orderId);

  const paidSummary = await getPointsSummary(user.token);
  ensure(
    paidSummary.points === initialSummary.points + topupInput.pointsAmount,
    `points after topup mismatch: expected ${initialSummary.points + topupInput.pointsAmount}, got ${paidSummary.points}`,
  );

  const taskContent = "x".repeat(40);
  const task = await createTask(user.token, taskContent);
  ensure(task.pointsCost > 0, "task pointsCost should be > 0");
  ensure(task.pointsCost < topupInput.pointsAmount, "task pointsCost must be lower than topup points for partial refund check");
  await pollTaskDone(user.token, task.taskId);

  const spentSummary = await getPointsSummary(user.token);
  ensure(
    spentSummary.points === paidSummary.points - task.pointsCost,
    `points after spending mismatch: expected ${paidSummary.points - task.pointsCost}, got ${spentSummary.points}`,
  );

  const orderAfterSpend = findOrder(await listOrders(user.token), createdOrder.orderId);
  const availableAfterSpend = Math.max(0, Number(orderAfterSpend.availablePoints ?? 0));
  ensure(
    availableAfterSpend === topupInput.pointsAmount - task.pointsCost,
    `available points mismatch: expected ${topupInput.pointsAmount - task.pointsCost}, got ${availableAfterSpend}`,
  );

  const firstRefund = await adminRefund(createdOrder.orderId, "smoke test partial refund");
  ensure(firstRefund.idempotent === false, "first refund should not be idempotent");
  ensure(firstRefund.partialRefund === true, "refund should be partial when points were consumed");
  ensure(
    firstRefund.refundedPoints === availableAfterSpend,
    `refunded points mismatch: expected ${availableAfterSpend}, got ${firstRefund.refundedPoints}`,
  );
  ensure(firstRefund.refundedAmount > 0 && firstRefund.refundedAmount < topupInput.amount, "refunded amount should be partial");

  const refundedSummary = await getPointsSummary(user.token);
  ensure(
    refundedSummary.points === spentSummary.points - firstRefund.refundedPoints,
    `points after refund mismatch: expected ${spentSummary.points - firstRefund.refundedPoints}, got ${refundedSummary.points}`,
  );

  const secondRefund = await adminRefund(createdOrder.orderId, "smoke test idempotent refund");
  ensure(secondRefund.idempotent === true, "second refund should be idempotent");
  ensure(
    secondRefund.refundedPoints === firstRefund.refundedPoints,
    "idempotent refund should return same refundedPoints total",
  );

  const summaryAfterSecondRefund = await getPointsSummary(user.token);
  ensure(
    summaryAfterSecondRefund.points === refundedSummary.points,
    "idempotent refund should not change user points",
  );

  const finalOrder = findOrder(await listOrders(user.token), createdOrder.orderId);
  ensure(finalOrder.status === "refunded", "final order status should be refunded");
  ensure(finalOrder.partialRefund === true, "final order should be marked as partial refund");
  ensure(Number(finalOrder.availablePoints ?? 0) === 0, "final order available points should be 0");

  console.log(
    JSON.stringify(
      {
        ok: true,
        apiBase,
        checks: [
          "payment topup increases points",
          "task consumption decreases topup available credits",
          "refund only returns unconsumed points",
          "partial refund metadata is persisted",
          "second refund call is idempotent",
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
