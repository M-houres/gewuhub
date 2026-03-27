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
  const contentType = response.headers.get("content-type") || "";
  let payload = null;
  if (contentType.includes("application/json")) {
    payload = await response.json().catch(() => null);
  } else {
    payload = await response.text().catch(() => null);
  }
  return { status: response.status, payload };
}

async function registerVerifyLogin(prefix) {
  const email = randomEmail(prefix);
  const password = "pass1234";

  const register = await request("/api/v1/auth/register", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      email,
      password,
    }),
  });
  ensure(register.status === 201, `register failed: ${register.status}`);
  ensure(
    register.payload && typeof register.payload.debugVerificationToken === "string",
    "register missing debug verification token",
  );

  const verify = await request("/api/v1/auth/verify-email", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      token: register.payload.debugVerificationToken,
    }),
  });
  ensure(verify.status === 200, `verify failed: ${verify.status}`);

  const login = await request("/api/v1/auth/login", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      email,
      password,
    }),
  });
  ensure(login.status === 200, `login failed: ${login.status}`);
  ensure(login.payload && typeof login.payload.token === "string", "login payload missing token");

  return { email, token: login.payload.token };
}

async function getAdminUserByEmail(email) {
  const users = await request("/api/v1/admin/users", {
    method: "GET",
    headers: {
      "x-admin-token": adminToken,
    },
  });
  ensure(users.status === 200, `admin users failed: ${users.status}`);
  ensure(Array.isArray(users.payload), "admin users payload should be array");

  const found = users.payload.find((item) => item.email === email);
  ensure(found && typeof found.id === "string", `user not found in admin list: ${email}`);
  return found;
}

async function main() {
  const account = await registerVerifyLogin("smoke_admin_audit");
  const targetUser = await getAdminUserByEmail(account.email);

  const adjust = await request(`/api/v1/admin/users/${targetUser.id}/points`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-admin-token": adminToken,
    },
    body: JSON.stringify({
      change: 8,
      reason: "smoke audit adjust",
    }),
  });
  ensure(adjust.status === 200, `admin points adjust failed: ${adjust.status}`);

  const ban = await request(`/api/v1/admin/users/${targetUser.id}/ban`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-admin-token": adminToken,
    },
    body: JSON.stringify({
      banned: true,
      reason: "smoke audit ban",
    }),
  });
  ensure(ban.status === 200, `admin ban failed: ${ban.status}`);

  const unban = await request(`/api/v1/admin/users/${targetUser.id}/ban`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-admin-token": adminToken,
    },
    body: JSON.stringify({
      banned: false,
      reason: "smoke audit unban",
    }),
  });
  ensure(unban.status === 200, `admin unban failed: ${unban.status}`);

  const logs = await request("/api/v1/admin/action-logs?limit=200", {
    method: "GET",
    headers: {
      "x-admin-token": adminToken,
    },
  });
  ensure(logs.status === 200, `admin action logs failed: ${logs.status}`);
  ensure(Array.isArray(logs.payload), "action logs payload should be array");

  const pointLog = logs.payload.find(
    (item) => item && item.action === "admin.user.points.adjust" && item.targetId === targetUser.id,
  );
  const banLog = logs.payload.find(
    (item) => item && item.action === "admin.user.ban.toggle" && item.targetId === targetUser.id,
  );

  ensure(pointLog, "action log missing points adjust entry");
  ensure(banLog, "action log missing user ban entry");

  console.log(
    JSON.stringify(
      {
        ok: true,
        apiBase,
        checks: [
          "admin points adjustment is logged",
          "admin ban/unban action is logged",
          "admin action logs endpoint is queryable",
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
