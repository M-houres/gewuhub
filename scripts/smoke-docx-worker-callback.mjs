#!/usr/bin/env node

const apiBase = process.env.SMOKE_API_BASE || "http://127.0.0.1:4000";
const workerSecret = process.env.DOCX_WORKER_SECRET || "dev-docx-worker-secret";

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

async function registerAndLogin(prefix) {
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
  ensure(typeof register.payload?.debugVerificationToken === "string", "register verification token missing");

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
    body: JSON.stringify({ email, password }),
  });
  ensure(login.status === 200, `login failed: ${login.status}`);
  ensure(typeof login.payload?.token === "string", "login token missing");
  return login.payload.token;
}

async function createTask(token, content) {
  const response = await request("/api/v1/tasks", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      type: "reduce-repeat",
      content,
      mode: "balanced",
      provider: "deepseek",
      modelId: "deepseek-v3",
      platform: "cnki",
    }),
  });
  ensure(response.status === 202, `create task failed: ${response.status}`);
  ensure(typeof response.payload?.taskId === "string", "taskId missing");
  return response.payload;
}

async function submitDocx(token, taskId, sourceFileName) {
  const response = await request("/api/v1/tasks/docx", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      taskId,
      sourceFileUrl: `https://mock-oss.gewu.local/uploads/${sourceFileName}`,
      sourceFileName,
      sourceFileSizeBytes: 4096,
      mode: "rewrite",
    }),
  });
  ensure(response.status === 202, `submit docx failed: ${response.status}`);
  return response.payload;
}

async function getPointSummary(token) {
  const response = await request("/api/v1/points/summary", {
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
  ensure(response.status === 200, `point summary failed: ${response.status}`);
  return response.payload;
}

async function getTaskDetail(token, taskId) {
  const response = await request(`/api/v1/tasks/${taskId}`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
  ensure(response.status === 200, `task detail failed: ${response.status}`);
  return response.payload;
}

async function getDocxDetail(token, taskId) {
  const response = await request(`/api/v1/tasks/docx/${taskId}`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
  ensure(response.status === 200, `docx detail failed: ${response.status}`);
  return response.payload;
}

async function callWorkerEndpoint(path, payload, includeSecret = true) {
  const headers = {
    "Content-Type": "application/json",
  };

  if (includeSecret) {
    headers["x-docx-worker-secret"] = workerSecret;
  }

  return request(path, {
    method: "POST",
    headers,
    body: JSON.stringify(payload),
  });
}

async function main() {
  const token = await registerAndLogin("smoke_docx_worker_callback");
  const pointsBefore = await getPointSummary(token);

  const createdComplete = await createTask(token, "docx worker callback smoke complete flow");
  const completeTaskId = createdComplete.taskId;
  await submitDocx(token, completeTaskId, "worker-complete.docx");

  const unauthorizedProgress = await callWorkerEndpoint(
    "/api/internal/docx/progress",
    {
      taskId: completeTaskId,
      workerJobId: "worker-smoke-complete",
      progress: 55,
    },
    false,
  );
  ensure(unauthorizedProgress.status === 401, `worker progress without secret should be 401, got ${unauthorizedProgress.status}`);

  const progress = await callWorkerEndpoint("/api/internal/docx/progress", {
    taskId: completeTaskId,
    workerJobId: "worker-smoke-complete",
    progress: 55,
  });
  ensure(progress.status === 200, `worker progress failed: ${progress.status}`);
  ensure(progress.payload?.status === "running", `worker progress should mark running, got ${progress.payload?.status}`);

  const complete = await callWorkerEndpoint("/api/internal/docx/complete", {
    taskId: completeTaskId,
    workerJobId: "worker-smoke-complete",
    outputUrl: "https://oss-example.gewu.local/results/worker-smoke-complete.docx",
  });
  ensure(complete.status === 200, `worker complete failed: ${complete.status}`);
  ensure(complete.payload?.status === "completed", `worker complete should finalize task, got ${complete.payload?.status}`);

  const completedTask = await getTaskDetail(token, completeTaskId);
  const completedDocx = await getDocxDetail(token, completeTaskId);
  ensure(completedTask.status === "completed", "completed task should be completed");
  ensure(
    completedTask.result?.outputUrl === "https://oss-example.gewu.local/results/worker-smoke-complete.docx",
    `worker outputUrl should be preserved (task=${completedTask.result?.outputUrl || "null"}, callback=${complete.payload?.outputUrl || "null"}, idempotent=${String(complete.payload?.idempotent)}, taskStatus=${completedTask.status})`,
  );
  ensure(completedDocx.status === "completed", "docx detail should be completed after worker completion");

  const createdFail = await createTask(token, "docx worker callback smoke failure flow");
  const failedTaskId = createdFail.taskId;
  await submitDocx(token, failedTaskId, "worker-fail.docx");

  const fail = await callWorkerEndpoint("/api/internal/docx/fail", {
    taskId: failedTaskId,
    workerJobId: "worker-smoke-fail",
    message: "Simulated worker failure",
  });
  ensure(fail.status === 200, `worker fail endpoint failed: ${fail.status}`);
  ensure(fail.payload?.status === "failed", `worker fail should mark failed, got ${fail.payload?.status}`);
  ensure(fail.payload?.pointsRefunded === true, "worker fail should refund points exactly once");

  const failedTask = await getTaskDetail(token, failedTaskId);
  const failedDocx = await getDocxDetail(token, failedTaskId);
  ensure(failedTask.status === "failed", "failed task should be failed");
  ensure(failedTask.pointsRefunded === true, "failed task should record refund");
  ensure(failedDocx.status === "failed", "failed docx detail should be failed");

  const pointsAfter = await getPointSummary(token);
  ensure(pointsAfter.points === pointsBefore.points - createdComplete.pointsCost, "failed worker task should refund all deducted points");

  console.log(
    JSON.stringify(
      {
        ok: true,
        apiBase,
        checks: [
          "internal worker callbacks require shared secret",
          "worker progress updates docx processing state",
          "worker completion finalizes task output and keeps worker output URL",
          "worker failure marks task failed and refunds points once",
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


