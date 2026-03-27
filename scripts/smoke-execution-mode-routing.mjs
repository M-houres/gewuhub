#!/usr/bin/env node

const apiBase = process.env.SMOKE_API_BASE || "http://127.0.0.1:4000";
const adminToken = process.env.ADMIN_TOKEN || "dev-admin-token";
const pollIntervalMs = Number(process.env.SMOKE_TASK_POLL_INTERVAL_MS || 2000);
const maxPollTimes = Number(process.env.SMOKE_TASK_MAX_POLLS || 12);

function ensure(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function randomEmail(prefix) {
  const random = Math.random().toString(36).slice(2, 8);
  return `${prefix}_${Date.now()}_${random}@example.com`;
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

async function getSettings() {
  const response = await request("/api/v1/admin/settings", {
    method: "GET",
    headers: {
      "x-admin-token": adminToken,
    },
  });
  ensure(response.status === 200, `get settings failed: ${response.status}`);
  return response.payload;
}

async function putSettings(payload) {
  const response = await request("/api/v1/admin/settings", {
    method: "PUT",
    headers: {
      "x-admin-token": adminToken,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  ensure(response.status === 200, `update settings failed: ${response.status}`);
  return response.payload;
}

async function registerVerifyLogin(prefix) {
  const email = randomEmail(prefix);
  const password = "pass1234";

  const register = await request("/api/v1/auth/register", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ email, password }),
  });
  ensure(register.status === 201, `register failed: ${register.status}`);
  ensure(typeof register.payload?.debugVerificationToken === "string", "verification token missing");

  const verify = await request("/api/v1/auth/verify-email", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ token: register.payload.debugVerificationToken }),
  });
  ensure(verify.status === 200, `verify failed: ${verify.status}`);

  const login = await request("/api/v1/auth/login", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ email, password }),
  });
  ensure(login.status === 200, `login failed: ${login.status}`);
  ensure(typeof login.payload?.token === "string", "token missing");
  ensure(typeof login.payload?.user?.id === "string", "user id missing");

  return {
    token: login.payload.token,
    userId: login.payload.user.id,
  };
}

async function seedUserPoints(userId, change) {
  const response = await request(`/api/v1/admin/users/${userId}/points`, {
    method: "POST",
    headers: {
      "x-admin-token": adminToken,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      change,
      reason: "smoke execution routing seed",
    }),
  });
  ensure(response.status === 200, `seed points failed: ${response.status}`);
}

async function createTask(token, payload) {
  const response = await request("/api/v1/tasks", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  ensure(response.status === 202, `create task failed: ${response.status}`);
  ensure(typeof response.payload?.taskId === "string", "task id missing");
  return response.payload.taskId;
}

async function pollTask(token, taskId) {
  for (let attempt = 0; attempt < maxPollTimes; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
    const response = await request(`/api/v1/tasks/${taskId}`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
    ensure(response.status === 200, `task detail failed: ${response.status}`);
    if (response.payload?.status === "completed") {
      return response.payload;
    }
    if (response.payload?.status === "failed") {
      throw new Error(`task ${taskId} failed unexpectedly`);
    }
  }

  throw new Error(`task ${taskId} did not complete in time`);
}

async function main() {
  const originalSettings = await getSettings();
  const modifiedSettings = clone(originalSettings);
  modifiedSettings.algorithmEngine.execution.rewrite.platformModes.paperpass = "llm_only";
  modifiedSettings.algorithmEngine.execution.detect.platformModes.paperpass = "hybrid";

  await putSettings(modifiedSettings);

  try {
    const afterUpdate = await getSettings();
    ensure(
      afterUpdate.algorithmEngine?.execution?.rewrite?.platformModes?.paperpass === "llm_only",
      "rewrite platform execution mode not persisted",
    );
    ensure(
      afterUpdate.algorithmEngine?.execution?.detect?.platformModes?.paperpass === "hybrid",
      "detect platform execution mode not persisted",
    );

    const session = await registerVerifyLogin("smoke_execution_mode");
    await seedUserPoints(session.userId, 5000);

    const rewriteTaskId = await createTask(session.token, {
      type: "reduce-ai",
      content: "将AI诊断结果有效转化为论文修改建议。不同于传统做法，系统能够从多个维度刻画文本问题。",
      mode: "balanced",
      provider: "deepseek",
      modelId: "deepseek-v3",
      platform: "paperpass",
    });
    const rewriteTask = await pollTask(session.token, rewriteTaskId);
    ensure(rewriteTask.result?.execution?.configuredMode === "llm_only", "rewrite configuredMode mismatch");
    ensure(rewriteTask.result?.execution?.effectiveMode === "rules_only", "rewrite should fall back to rules_only");
    ensure(rewriteTask.result?.execution?.fallbackApplied === true, "rewrite fallbackApplied should be true");
    ensure(
      rewriteTask.result?.execution?.fallbackReason === "real model adapter not connected yet",
      "rewrite fallback reason mismatch",
    );

    const detectTaskId = await createTask(session.token, {
      type: "detect",
      content: "总之，本文认为这一方案具有重要意义，因此在很多场景都可以看出优势。",
      mode: "balanced",
      provider: "deepseek",
      modelId: "deepseek-v3",
      platform: "paperpass",
    });
    const detectTask = await pollTask(session.token, detectTaskId);
    ensure(detectTask.result?.execution?.configuredMode === "hybrid", "detect configuredMode mismatch");
    ensure(detectTask.result?.execution?.effectiveMode === "rules_only", "detect should fall back to rules_only");
    ensure(detectTask.result?.execution?.fallbackApplied === true, "detect fallbackApplied should be true");

    console.log(
      JSON.stringify(
        {
          ok: true,
          apiBase,
          checks: [
            "admin settings persist per-platform execution mode overrides",
            "rewrite tasks expose configuredMode and effectiveMode metadata",
            "detect tasks expose configuredMode and effectiveMode metadata",
            "unwired real-model modes safely fall back to rules_only",
          ],
        },
        null,
        2,
      ),
    );
  } finally {
    await putSettings(originalSettings);
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
