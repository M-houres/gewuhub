#!/usr/bin/env node

const apiBase = process.env.SMOKE_API_BASE || "http://127.0.0.1:4000";
const adminToken = process.env.ADMIN_TOKEN || "dev-admin-token";

function ensure(condition, message) {
  if (!condition) throw new Error(message);
}

function randomEmail(prefix) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}@example.com`;
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
  return { status: response.status, payload, headers: response.headers };
}

async function registerVerifyLogin(prefix) {
  const email = randomEmail(prefix);
  const password = "pass1234";

  const register = await request("/api/v1/auth/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  ensure(register.status === 201, `register failed: ${register.status}`);
  ensure(typeof register.payload?.debugVerificationToken === "string", "verification token missing");

  const verify = await request("/api/v1/auth/verify-email", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token: register.payload.debugVerificationToken }),
  });
  ensure(verify.status === 200, `verify failed: ${verify.status}`);

  const login = await request("/api/v1/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  ensure(login.status === 200, `login failed: ${login.status}`);
  ensure(typeof login.payload?.token === "string", "login token missing");

  return login.payload.token;
}

async function listAdminModels() {
  const response = await request("/api/v1/admin/models", {
    method: "GET",
    headers: { "x-admin-token": adminToken },
  });
  ensure(response.status === 200, `list admin models failed: ${response.status}`);
  return response.payload;
}

async function setModelApiKey(modelId, payload) {
  const response = await request(`/api/v1/admin/models/${modelId}/api-key`, {
    method: "POST",
    headers: {
      "x-admin-token": adminToken,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  ensure(response.status === 200, `set model api key failed: ${response.status}`);
  return response.payload;
}

async function callModelRoute(token) {
  const response = await request("/api/v1/model/route", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      provider: "deepseek",
      modelId: "deepseek-v3",
      prompt: "Generate a short academic intro paragraph about AI writing governance.",
      temperature: 0.7,
    }),
  });
  ensure(response.status === 200, `model route failed: ${response.status}`);
  return response.payload;
}

async function main() {
  const token = await registerVerifyLogin("smoke_model_route");

  const models = await listAdminModels();
  const target = models.find((item) => item.provider === "deepseek" && item.modelId === "deepseek-v3");
  ensure(Boolean(target?.id), "target model deepseek-v3 not found");

  try {
    await setModelApiKey(target.id, { clear: true });

    const withoutKey = await callModelRoute(token);
    ensure(withoutKey.source === "fallback_local", "expected fallback_local when api key missing");
    ensure(
      typeof withoutKey.fallbackReason === "string" && withoutKey.fallbackReason.includes("api key"),
      "expected fallback reason for missing key",
    );

    await setModelApiKey(target.id, { apiKey: "sk-smoke-model-route-key" });

    const withKey = await callModelRoute(token);
    ensure(typeof withKey.output === "string" && withKey.output.length > 0, "model route output missing");
    ensure(withKey.source === "remote" || withKey.source === "fallback_local", "unexpected source flag");
    ensure(
      withKey.source === "remote" || withKey.fallbackReason !== "model api key is missing",
      "key-configured run should not fail on missing key",
    );

    console.log(
      JSON.stringify(
        {
          ok: true,
          apiBase,
          checks: [
            "model route falls back when model key is missing",
            "admin model api-key configuration is used by model route",
            "model route returns output in both remote or safe-fallback paths",
          ],
        },
        null,
        2,
      ),
    );
  } finally {
    await setModelApiKey(target.id, { clear: true });
  }
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
