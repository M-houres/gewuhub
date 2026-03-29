#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const docxFixturePath = path.join(rootDir, "research", "fixtures", "sample-academic.docx");

const apiBase = process.env.SMOKE_API_BASE || "http://127.0.0.1:4000";
const pollIntervalMs = Number(process.env.SMOKE_TASK_POLL_INTERVAL_MS || 2000);
const maxPollTimes = Number(process.env.SMOKE_TASK_MAX_POLLS || 12);
const expectLocalFallback = process.env.SMOKE_EXPECT_LOCAL_DOCX_FALLBACK !== "false";

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
  return { token };
}

async function createTask(token) {
  const response = await request("/api/v1/tasks", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      type: "reduce-repeat",
      content: "docx smoke test content for local fallback verification",
      mode: "balanced",
      provider: "deepseek",
      modelId: "deepseek-v3",
      platform: "cnki",
    }),
  });
  ensure(response.status === 202, `create task failed: ${response.status}`);
  ensure(response.payload && typeof response.payload.taskId === "string", "create task missing taskId");
  return response.payload.taskId;
}

async function submitDocxTask(token, taskId, sourceFileBase64) {
  const response = await request("/api/v1/tasks/docx", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      taskId,
      sourceFileUrl: "https://mock-oss.gewu.local/uploads/docx-smoke.docx",
      sourceFileName: "docx-smoke.docx",
      sourceFileSizeBytes: 4096,
      sourceFileBase64,
      mode: "rewrite",
    }),
  });
  ensure(response.status === 202, `docx submit failed: ${response.status}`);
  ensure(response.payload?.taskId === taskId, "docx submit returned unexpected taskId");
  ensure(
    response.payload?.status === "fallback-local" || response.payload?.status === "queued",
    `unexpected docx submit status: ${response.payload?.status}`,
  );
  if (expectLocalFallback) {
    ensure(response.payload?.status === "fallback-local", "docx submit should use local fallback when queue is disabled");
  }
  return response.payload;
}

async function pollDocxProgress(token, taskId) {
  const seenProgress = new Set();
  let lastProgressPayload = null;

  for (let i = 0; i < maxPollTimes; i += 1) {
    await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));

    const progress = await request(`/api/v1/tasks/docx/${taskId}`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
    ensure(progress.status === 200, `docx progress failed: ${progress.status}`);
    ensure(typeof progress.payload?.progress === "number", "docx progress missing numeric progress");
    lastProgressPayload = progress.payload;
    seenProgress.add(progress.payload.progress);

    const detail = await request(`/api/v1/tasks/${taskId}`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
    ensure(detail.status === 200, `task detail failed: ${detail.status}`);

    if (detail.payload?.status === "completed") {
      ensure(typeof detail.payload?.result?.output === "string", "completed docx task missing output");
      ensure(typeof detail.payload?.result?.outputUrl === "string", "completed docx task missing outputUrl");
      return {
        seenProgress: Array.from(seenProgress).sort((a, b) => a - b),
        detail: detail.payload,
        progressPayload: lastProgressPayload,
      };
    }

    if (detail.payload?.status === "failed") {
      throw new Error(`docx task ${taskId} unexpectedly failed`);
    }
  }

  throw new Error(`docx task ${taskId} did not complete in time`);
}

async function main() {
  const { token } = await registerAndLogin("smoke_docx");
  const fixtureDocx = await readFile(docxFixturePath);
  const sourceFileBase64 = fixtureDocx.toString("base64");
  const taskId = await createTask(token);
  const submitPayload = await submitDocxTask(token, taskId, sourceFileBase64);
  const submitStatus = submitPayload?.status;
  const repeatedSubmit = await submitDocxTask(token, taskId, sourceFileBase64);
  ensure(repeatedSubmit?.idempotent === true, "repeated docx submit should be idempotent");
  const result = await pollDocxProgress(token, taskId);
  ensure(result.progressPayload?.mode === "rewrite", "docx progress should expose rewrite mode");
  ensure(result.progressPayload?.queueStrategy === "local", "docx progress should expose local queue strategy");
  ensure(result.progressPayload?.sourceFileName === "docx-smoke.docx", "docx progress should expose source file name");

  const downloadLinkResponse = await request(`/api/v1/tasks/${taskId}/download-link`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
  ensure(downloadLinkResponse.status === 200, `download link request failed: ${downloadLinkResponse.status}`);
  ensure(typeof downloadLinkResponse.payload?.downloadPath === "string", "download link response missing ticket path");

  const ticketResolveResponse = await request(downloadLinkResponse.payload.downloadPath, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
  ensure(ticketResolveResponse.status === 200, `download ticket resolve failed: ${ticketResolveResponse.status}`);
  ensure(typeof ticketResolveResponse.payload?.downloadUrl === "string", "download ticket response missing generated download URL");
  ensure(ticketResolveResponse.payload.downloadUrl.includes(".docx"), "docx upload should resolve to .docx generated download URL");

  const generatedFileResponse = await fetch(`${apiBase}${ticketResolveResponse.payload.downloadUrl}`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
  ensure(generatedFileResponse.status === 200, `generated file fetch failed: ${generatedFileResponse.status}`);
  const generatedFileContentType = generatedFileResponse.headers.get("content-type") || "";
  ensure(
    generatedFileContentType.includes("application/vnd.openxmlformats-officedocument.wordprocessingml.document"),
    "docx download should return docx content-type",
  );

  console.log(
    JSON.stringify(
      {
        ok: true,
        apiBase,
        taskId,
        submitStatus,
        seenProgress: result.seenProgress,
        checks: [
          "docx endpoint accepts upload task submission",
          "repeated docx submit is idempotent while processing",
          "local fallback mode keeps docx progress polling available",
          "docx progress endpoint exposes mode and queue strategy metadata",
          "docx task completes with downloadable result without Redis",
          "docx upload returns .docx download URL and content-type",
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







