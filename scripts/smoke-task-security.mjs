#!/usr/bin/env node

const apiBase = process.env.SMOKE_API_BASE || "http://127.0.0.1:4000";
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
  ensure(
    response.payload && typeof response.payload.debugVerificationToken === "string",
    "register response missing debug verification token",
  );
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
  ensure(response.payload && typeof response.payload.token === "string", "login response missing token");
  return response.payload.token;
}

async function registerAndLogin(prefix) {
  const account = await registerUser(prefix);
  await verifyEmail(account.verificationToken);
  const token = await loginUser(account.email, account.password);
  return {
    token,
  };
}

function resolveAcademicPlatform(taskType) {
  if (taskType === "reduce-repeat") return "cnki";
  if (taskType === "reduce-ai") return "cnki";
  if (taskType === "detect") return "paperpass";
  return undefined;
}

async function createTask(token, type, content) {
  const platform = resolveAcademicPlatform(type);
  const response = await request("/api/v1/tasks", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      type,
      content,
      mode: "balanced",
      provider: "deepseek",
      modelId: "deepseek-v3",
      ...(platform ? { platform } : {}),
    }),
  });
  ensure(response.status === 202, `create task failed: ${response.status}`);
  ensure(response.payload && typeof response.payload.taskId === "string", "create task missing taskId");
  return response.payload.taskId;
}

async function pollTaskDone(token, taskId) {
  for (let i = 0; i < maxPollTimes; i += 1) {
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

async function main() {
  const user1 = await registerAndLogin("smoke_user1");
  const user2 = await registerAndLogin("smoke_user2");

  const cancelTaskId = await createTask(user1.token, "reduce-ai", "cancel smoke test content");

  const emptyJsonCancel = await request(`/api/v1/tasks/${cancelTaskId}/cancel`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${user1.token}`,
      "Content-Type": "application/json",
    },
  });
  ensure(
    emptyJsonCancel.status !== 500,
    `cancel empty-body should not return 500, got ${emptyJsonCancel.status}`,
  );

  const cancel1 = await request(`/api/v1/tasks/${cancelTaskId}/cancel`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${user1.token}`,
      "Content-Type": "application/json",
    },
    body: "{}",
  });
  ensure(cancel1.status === 200, `cancel request failed: ${cancel1.status}`);
  ensure(cancel1.payload?.cancelled === true, "first cancel should mark task as cancelled");

  const cancel2 = await request(`/api/v1/tasks/${cancelTaskId}/cancel`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${user1.token}`,
      "Content-Type": "application/json",
    },
    body: "{}",
  });
  ensure(cancel2.status === 200, `second cancel request failed: ${cancel2.status}`);
  ensure(cancel2.payload?.idempotent === true, "second cancel should be idempotent");

  const downloadTaskId = await createTask(user1.token, "reduce-repeat", "download smoke test content");
  await pollTaskDone(user1.token, downloadTaskId);

  const ticket = await request(`/api/v1/tasks/${downloadTaskId}/download-link`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${user1.token}`,
      "Content-Type": "application/json",
    },
    body: "{}",
  });
  ensure(ticket.status === 200, `download-link failed: ${ticket.status}`);
  ensure(typeof ticket.payload?.downloadPath === "string", "download-link response missing downloadPath");

  const unauthorized = await request(ticket.payload.downloadPath, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${user2.token}`,
    },
  });
  ensure(unauthorized.status === 403, `unauthorized download should return 403, got ${unauthorized.status}`);

  const resolved = await request(ticket.payload.downloadPath, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${user1.token}`,
    },
  });
  ensure(resolved.status === 200, `authorized download resolve failed: ${resolved.status}`);
  ensure(typeof resolved.payload?.downloadUrl === "string", "resolved download missing downloadUrl");

  const reused = await request(ticket.payload.downloadPath, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${user1.token}`,
    },
  });
  ensure(reused.status === 410, `reused ticket should return 410, got ${reused.status}`);

  console.log(
    JSON.stringify(
      {
        ok: true,
        apiBase,
        checks: [
          "cancel endpoint avoids false 500 on empty JSON body",
          "cancel is idempotent",
          "download ticket enforces ownership",
          "download ticket is one-time use",
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
