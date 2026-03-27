#!/usr/bin/env node

const apiBase = process.env.SMOKE_API_BASE || "http://127.0.0.1:4000";

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

async function main() {
  const email = randomEmail("smoke_auth");
  const password = "pass1234";
  const newPassword = "newpass1234";

  const register = await request("/api/v1/auth/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  ensure(register.status === 201, `register failed: ${register.status}`);
  ensure(register.payload?.verificationRequired === true, "register should require verification");
  ensure(typeof register.payload?.debugVerificationToken === "string", "missing debug verification token");

  const loginBeforeVerify = await request("/api/v1/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  ensure(loginBeforeVerify.status === 403, `unverified login should be 403, got ${loginBeforeVerify.status}`);
  ensure(loginBeforeVerify.payload?.code === "EMAIL_NOT_VERIFIED", "unverified login should return EMAIL_NOT_VERIFIED");

  const resend = await request("/api/v1/auth/resend-verification", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email }),
  });
  ensure(resend.status === 200, `resend verification failed: ${resend.status}`);
  const verificationToken =
    typeof resend.payload?.debugVerificationToken === "string"
      ? resend.payload.debugVerificationToken
      : register.payload.debugVerificationToken;

  const verify = await request("/api/v1/auth/verify-email", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token: verificationToken }),
  });
  ensure(verify.status === 200, `verify email failed: ${verify.status}`);

  const loginAfterVerify = await request("/api/v1/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  ensure(loginAfterVerify.status === 200, `verified login failed: ${loginAfterVerify.status}`);
  ensure(typeof loginAfterVerify.payload?.token === "string", "verified login missing token");

  const forgot = await request("/api/v1/auth/forgot-password", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email }),
  });
  ensure(forgot.status === 200, `forgot password failed: ${forgot.status}`);
  ensure(typeof forgot.payload?.debugResetToken === "string", "missing debug reset token");

  const reset = await request("/api/v1/auth/reset-password", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token: forgot.payload.debugResetToken, password: newPassword }),
  });
  ensure(reset.status === 200, `reset password failed: ${reset.status}`);

  const loginOldPassword = await request("/api/v1/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  ensure(loginOldPassword.status === 401, `old password should fail with 401, got ${loginOldPassword.status}`);

  const loginNewPassword = await request("/api/v1/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: newPassword }),
  });
  ensure(loginNewPassword.status === 200, `new password login failed: ${loginNewPassword.status}`);

  console.log(
    JSON.stringify(
      {
        ok: true,
        apiBase,
        checks: [
          "register requires email verification",
          "unverified user cannot login",
          "verified user can login",
          "forgot password issues reset token",
          "password reset invalidates old password",
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
