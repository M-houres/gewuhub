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

function resolveAcademicPlatform(taskType) {
  if (taskType === "reduce-repeat") return "cnki";
  if (taskType === "reduce-ai") return "cnki";
  if (taskType === "detect") return "paperpass";
  return undefined;
}

async function createTask(token, type) {
  const platform = resolveAcademicPlatform(type);
  const response = await request("/api/v1/tasks", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      type,
      content: `${type} docx guardrail content`,
      mode: "balanced",
      provider: "deepseek",
      modelId: "deepseek-v3",
      ...(platform ? { platform } : {}),
    }),
  });
  ensure(response.status === 202, `create ${type} task failed: ${response.status}`);
  ensure(typeof response.payload?.taskId === "string", `${type} taskId missing`);
  return response.payload.taskId;
}

async function main() {
  const token = await registerAndLogin("smoke_docx_guardrails");

  const reduceAiTaskId = await createTask(token, "reduce-ai");
  const incompatible = await request("/api/v1/tasks/docx", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      taskId: reduceAiTaskId,
      sourceFileUrl: "https://mock-oss.gewu.local/uploads/wrong-mode.docx",
      sourceFileName: "wrong-mode.docx",
      sourceFileSizeBytes: 2048,
      mode: "rewrite",
    }),
  });
  ensure(incompatible.status === 409, `incompatible docx mode should return 409, got ${incompatible.status}`);

  const reduceRepeatTaskId = await createTask(token, "reduce-repeat");
  const unsupported = await request("/api/v1/tasks/docx", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      taskId: reduceRepeatTaskId,
      sourceFileUrl: "https://mock-oss.gewu.local/uploads/malware.exe",
      sourceFileName: "malware.exe",
      sourceFileSizeBytes: 2048,
      mode: "rewrite",
    }),
  });
  ensure(unsupported.status === 400, `unsupported file type should return 400, got ${unsupported.status}`);

  const tooLargeTaskId = await createTask(token, "detect");
  const tooLarge = await request("/api/v1/tasks/docx", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      taskId: tooLargeTaskId,
      sourceFileUrl: "https://mock-oss.gewu.local/uploads/oversize.pdf",
      sourceFileName: "oversize.pdf",
      sourceFileSizeBytes: 50 * 1024 * 1024,
      mode: "detect",
    }),
  });
  ensure(tooLarge.status === 413, `oversize file should return 413, got ${tooLarge.status}`);

  console.log(
    JSON.stringify(
      {
        ok: true,
        apiBase,
        checks: [
          "docx endpoint rejects task-type and mode mismatches",
          "docx endpoint rejects unsupported file extensions",
          "docx endpoint rejects oversize uploads before processing",
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
