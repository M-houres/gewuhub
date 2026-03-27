#!/usr/bin/env node

const apiBase = process.env.SMOKE_API_BASE || "http://127.0.0.1:4000";const adminToken = process.env.ADMIN_TOKEN || "dev-admin-token";
function randomEmail(prefix) {
  const random = Math.random().toString(36).slice(2, 8);  return `${prefix}_${Date.now()}_${random}@example.com`;}

function ensure(condition, message) {
  if (!condition) {
    throw new Error(message);  }
}

async function request(path, options = {}) {
  const response = await fetch(`${apiBase}${path}`, options);  const contentType = response.headers.get("content-type") || "";  let payload = null;  if (contentType.includes("application/json")) {
    payload = await response.json().catch(() => null);  } else {
    payload = await response.text().catch(() => null);  }
  return { status: response.status, payload };}

async function registerAndLogin(prefix) {
  const email = randomEmail(prefix);  const password = "pass1234";
  const register = await request("/api/v1/auth/register", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      email,
      password,
    }),
  });  ensure(register.status === 201, `register failed: ${register.status}`);  ensure(
    register.payload && typeof register.payload.debugVerificationToken === "string",
    "register missing debugVerificationToken",
  );
  const verify = await request("/api/v1/auth/verify-email", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      token: register.payload.debugVerificationToken,
    }),
  });  ensure(verify.status === 200, `verify failed: ${verify.status}`);
  const login = await request("/api/v1/auth/login", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      email,
      password,
    }),
  });  ensure(login.status === 200, `login failed: ${login.status}`);  ensure(login.payload && typeof login.payload.token === "string", "login missing token");
  return {
    email,
    token: login.payload.token,
  };}

async function findUserByEmail(email) {
  const users = await request("/api/v1/admin/users", {
    method: "GET",
    headers: {
      "x-admin-token": adminToken,
    },
  });  ensure(users.status === 200, `admin users failed: ${users.status}`);  ensure(Array.isArray(users.payload), "admin users payload is not array");
  const found = users.payload.find((item) => item.email === email);  ensure(found && typeof found.id === "string", `user not found in admin list: ${email}`);  return found;}

async function setUserPointsExactly(userId, currentPoints, targetPoints) {
  const change = targetPoints - currentPoints;  if (change === 0) return;
  const adjust = await request(`/api/v1/admin/users/${userId}/points`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-admin-token": adminToken,
    },
    body: JSON.stringify({
      change,
      reason: "smoke concurrency baseline",
    }),
  });  ensure(adjust.status === 200, `admin adjust points failed: ${adjust.status}`);}

async function createTask(token, content) {
  return request("/api/v1/tasks", {
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
  });}

async function getPointsSummary(token) {
  const summary = await request("/api/v1/points/summary", {
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });  ensure(summary.status === 200, `points summary failed: ${summary.status}`);  ensure(summary.payload && typeof summary.payload.points === "number", "points summary missing points");  return summary.payload;}

async function main() {
  const account = await registerAndLogin("smoke_concurrency");  const user = await findUserByEmail(account.email);
  const baselinePoints = 60;  await setUserPointsExactly(user.id, user.points, baselinePoints);
  const before = await getPointsSummary(account.token);  ensure(before.points === baselinePoints, `expected baseline points ${baselinePoints}, got ${before.points}`);
  const content = "a".repeat(50);  const [r1, r2] = await Promise.all([createTask(account.token, content), createTask(account.token, content)]);
  const statuses = [r1.status, r2.status].sort((a, b) => a - b);  ensure(statuses[0] === 202 && statuses[1] === 402, `expected one 202 and one 402, got ${statuses.join(",")}`);
  const success = r1.status === 202 ? r1 : r2;  const failed = r1.status === 402 ? r1 : r2;  ensure(success.payload && typeof success.payload.pointsCost === "number", "success payload missing pointsCost");  ensure(failed.payload && typeof failed.payload.required === "number", "failed payload missing required");
  const after = await getPointsSummary(account.token);  ensure(after.points >= 0, `points should not be negative, got ${after.points}`);  ensure(after.points < baselinePoints, `points should decrease after one successful task, got ${after.points}`);  ensure(after.points === baselinePoints - success.payload.pointsCost, "final points do not match one-task deduction");
  console.log(
    JSON.stringify(
      {
        ok: true,
        apiBase,
        checks: [
          "concurrent submit results in one success and one insufficient points response",
          "server-side points deduction remains non-negative under concurrency",
          "final points equals exactly one successful task deduction",
        ],
      },
      null,
      2,
    ),
  );}

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
  );  process.exit(1);});

