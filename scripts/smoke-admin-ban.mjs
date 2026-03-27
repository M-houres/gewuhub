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
  ensure(typeof response.payload?.user?.id === "string", "login response missing user.id");
  return response.payload;
}

async function readPointsSummary(token) {
  return request("/api/v1/points/summary", {
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
}

async function setBanStatus(userId, banned, reason) {
  const response = await request(`/api/v1/admin/users/${userId}/ban`, {
    method: "POST",
    headers: {
      "x-admin-token": adminToken,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      banned,
      reason,
    }),
  });
  ensure(response.status === 200, `set ban status failed: ${response.status}`);
  ensure(response.payload?.banned === banned, `set ban status mismatch: expected ${banned}, got ${response.payload?.banned}`);
}

async function main() {
  const account = await registerUser("smoke_ban");
  await verifyEmail(account.verificationToken);
  const firstLogin = await loginUser(account.email, account.password);
  const userId = firstLogin.user.id;

  const summaryBeforeBan = await readPointsSummary(firstLogin.token);
  ensure(summaryBeforeBan.status === 200, `summary before ban failed: ${summaryBeforeBan.status}`);

  await setBanStatus(userId, true, "smoke ban check");

  const summaryAfterBan = await readPointsSummary(firstLogin.token);
  ensure(
    summaryAfterBan.status === 401 || summaryAfterBan.status === 403,
    `banned token should be blocked (401/403), got ${summaryAfterBan.status}`,
  );
  if (summaryAfterBan.status === 403) {
    ensure(summaryAfterBan.payload?.code === "ACCOUNT_BANNED", "403 blocked token should return ACCOUNT_BANNED");
  }

  const loginWhileBanned = await request("/api/v1/auth/login", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      email: account.email,
      password: account.password,
    }),
  });
  ensure(loginWhileBanned.status === 403, `banned login should return 403, got ${loginWhileBanned.status}`);
  ensure(loginWhileBanned.payload?.code === "ACCOUNT_BANNED", "banned login should return ACCOUNT_BANNED");

  await setBanStatus(userId, false, "smoke unban check");

  const loginAfterUnban = await loginUser(account.email, account.password);
  const summaryAfterUnban = await readPointsSummary(loginAfterUnban.token);
  ensure(summaryAfterUnban.status === 200, `summary after unban failed: ${summaryAfterUnban.status}`);

  console.log(
    JSON.stringify(
      {
        ok: true,
        apiBase,
        checks: [
          "admin can ban a user account",
          "banned user session is blocked on protected APIs",
          "banned user cannot login",
          "admin can unban user and login is restored",
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
