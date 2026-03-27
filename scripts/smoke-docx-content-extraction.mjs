#!/usr/bin/env node

import http from "node:http";

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

function waitForServer(server) {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      server.off("error", reject);
      resolve();
    });
  });
}

function closeServer(server) {
  return new Promise((resolve) => {
    server.close(() => resolve());
  });
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
  return response.payload.taskId;
}

async function submitDocx(token, taskId, sourceFileUrl) {
  const response = await request("/api/v1/tasks/docx", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      taskId,
      sourceFileUrl,
      sourceFileName: "source.txt",
      sourceFileSizeBytes: 512,
      mode: "rewrite",
    }),
  });
  ensure(response.status === 202, `submit docx failed: ${response.status}`);
}

async function waitForCompletedTask(token, taskId) {
  for (let index = 0; index < maxPollTimes; index += 1) {
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
      throw new Error(`task ${taskId} unexpectedly failed`);
    }
  }

  throw new Error(`task ${taskId} did not complete in time`);
}

async function main() {
  const sourceText = "研究方法显示该路径具有重复表述，因此需要重新组织句式并补足论证层次。";
  const sourceServer = http.createServer((request, response) => {
    if (request.url !== "/source.txt") {
      response.statusCode = 404;
      response.end("not found");
      return;
    }

    response.statusCode = 200;
    response.setHeader("Content-Type", "text/plain; charset=utf-8");
    response.end(sourceText);
  });

  await waitForServer(sourceServer);
  const address = sourceServer.address();
  const port = address && typeof address === "object" ? address.port : null;
  ensure(typeof port === "number", "failed to resolve source server port");

  try {
    const token = await registerAndLogin("smoke_docx_content");
    const taskId = await createTask(token, "PLACEHOLDER_ONLY_TEXT_FOR_DOCX_EXTRACTION");
    await submitDocx(token, taskId, `http://127.0.0.1:${port}/source.txt`);
    const completedTask = await waitForCompletedTask(token, taskId);
    const output = String(completedTask.result?.output || "");

    ensure(!output.includes("PLACEHOLDER_ONLY_TEXT_FOR_DOCX_EXTRACTION"), "docx extraction should not fall back to placeholder content");
    ensure(/研究|句式|论证/.test(output), "docx extraction should feed uploaded txt content into rewrite result");

    console.log(
      JSON.stringify(
        {
          ok: true,
          apiBase,
          taskId,
          checks: [
            "uploaded txt source is fetched by the document pipeline",
            "local docx fallback uses extracted file content instead of placeholder task text",
          ],
        },
        null,
        2,
      ),
    );
  } finally {
    await closeServer(sourceServer);
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
