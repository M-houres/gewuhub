#!/usr/bin/env node

const apiBase = process.env.SMOKE_API_BASE || "http://127.0.0.1:4000";
const adminToken = process.env.ADMIN_TOKEN || "dev-admin-token";

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

async function listModels() {
  const response = await request("/api/v1/admin/models", {
    method: "GET",
    headers: {
      "x-admin-token": adminToken,
    },
  });
  ensure(response.status === 200, `list models failed: ${response.status}`);
  ensure(Array.isArray(response.payload), "models payload should be array");
  return response.payload;
}

async function main() {
  const models = await listModels();
  ensure(models.length > 0, "no models available");
  const target = models[0];

  const setKeyResponse = await request(`/api/v1/admin/models/${target.id}/api-key`, {
    method: "POST",
    headers: {
      "x-admin-token": adminToken,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      apiKey: "test_key_0123456789",
    }),
  });
  ensure(setKeyResponse.status === 200, `set model key failed: ${setKeyResponse.status}`);
  ensure(setKeyResponse.payload?.hasApiKey === true, "set model key should enable hasApiKey");
  ensure(typeof setKeyResponse.payload?.keyUpdatedAt === "string", "set model key should return keyUpdatedAt");

  const modelsAfterSet = await listModels();
  const updatedModel = modelsAfterSet.find((item) => item.id === target.id);
  ensure(updatedModel, "updated model not found");
  ensure(updatedModel.hasApiKey === true, "model should report hasApiKey=true after set");

  const clearResponse = await request(`/api/v1/admin/models/${target.id}/api-key`, {
    method: "POST",
    headers: {
      "x-admin-token": adminToken,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      clear: true,
    }),
  });
  ensure(clearResponse.status === 200, `clear model key failed: ${clearResponse.status}`);
  ensure(clearResponse.payload?.hasApiKey === false, "clear model key should set hasApiKey=false");

  const modelsAfterClear = await listModels();
  const clearedModel = modelsAfterClear.find((item) => item.id === target.id);
  ensure(clearedModel, "cleared model not found");
  ensure(clearedModel.hasApiKey === false, "model should report hasApiKey=false after clear");

  console.log(
    JSON.stringify(
      {
        ok: true,
        apiBase,
        checks: [
          "admin can set model api key",
          "model list reports hasApiKey after set",
          "admin can clear model api key",
          "model list reports hasApiKey=false after clear",
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
