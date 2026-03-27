#!/usr/bin/env node

const apiBase = process.env.SMOKE_API_BASE || "http://127.0.0.1:4000";
const adminUsername = process.env.ADMIN_USERNAME || "admin";
const adminPassword = process.env.ADMIN_PASSWORD || "dev-admin-password";

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

async function main() {
  const badLogin = await request("/api/v1/admin/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      username: adminUsername,
      password: `${adminPassword}_invalid`,
    }),
  });
  ensure(badLogin.status === 401, `invalid admin login should fail with 401, got ${badLogin.status}`);

  const login = await request("/api/v1/admin/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      username: adminUsername,
      password: adminPassword,
    }),
  });
  ensure(login.status === 200, `admin login failed: ${login.status}`);
  ensure(login.payload && typeof login.payload === "object", "admin login payload missing");

  const token = typeof login.payload.token === "string" ? login.payload.token : "";
  ensure(token.length > 10, "admin login token missing");

  const me = await request("/api/v1/admin/auth/me", {
    method: "GET",
    headers: { Authorization: `Bearer ${token}` },
  });
  ensure(me.status === 200, `admin auth me failed: ${me.status}`);
  ensure(me.payload && typeof me.payload.username === "string", "admin me payload missing username");

  const logout = await request("/api/v1/admin/auth/logout", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
  });
  ensure(logout.status === 200, `admin logout failed: ${logout.status}`);

  const meAfterLogout = await request("/api/v1/admin/auth/me", {
    method: "GET",
    headers: { Authorization: `Bearer ${token}` },
  });
  ensure(meAfterLogout.status === 401, `admin token should be invalid after logout, got ${meAfterLogout.status}`);

  console.log(
    JSON.stringify(
      {
        ok: true,
        apiBase,
        checks: [
          "invalid admin credentials are rejected",
          "admin can login and get session token",
          "admin auth me endpoint accepts bearer token",
          "admin logout invalidates the session token",
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
