#!/usr/bin/env node

import http from "node:http";

const apiBase = process.env.SMOKE_API_BASE || "http://127.0.0.1:4000";
const adminToken = process.env.ADMIN_TOKEN || "dev-admin-token";
const pollIntervalMs = Number(process.env.SMOKE_TASK_POLL_INTERVAL_MS || 2000);
const maxPollTimes = Number(process.env.SMOKE_TASK_MAX_POLLS || 12);
const seededPoints = 600;

function ensure(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function randomEmail(prefix) {
  const random = Math.random().toString(36).slice(2, 8);
  return `${prefix}_${Date.now()}_${random}@example.com`;
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

  return { status: response.status, payload, headers: response.headers };
}

async function registerUser(prefix) {
  const email = randomEmail(prefix);
  const password = "pass1234";

  const register = await request("/api/v1/auth/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  ensure(register.status === 201, `register failed: ${register.status}`);
  ensure(typeof register.payload?.debugVerificationToken === "string", "register verification token missing");

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
  ensure(typeof login.payload?.user?.id === "string", "login user id missing");

  return {
    token: login.payload.token,
    userId: login.payload.user.id,
  };
}

async function seedUserPoints(userId) {
  const response = await request(`/api/v1/admin/users/${userId}/points`, {
    method: "POST",
    headers: {
      "x-admin-token": adminToken,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      change: seededPoints,
      reason: "smoke docx repricing seed",
    }),
  });

  ensure(response.status === 200, `seed points failed: ${response.status}`);
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
  ensure(typeof response.payload?.pointsCost === "number", "initial task cost missing");

  return response.payload;
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
      sourceFileName: "repricing-source.txt",
      sourceFileSizeBytes: 2048,
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
      throw new Error(`task ${taskId} failed unexpectedly: ${response.payload?.result?.output || "unknown failure"}`);
    }
  }

  throw new Error(`task ${taskId} did not complete in time`);
}

async function getCurrentPoints(token) {
  const response = await request("/api/v1/auth/me", {
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  ensure(response.status === 200, `auth/me failed: ${response.status}`);
  ensure(typeof response.payload?.user?.points === "number", "current user points missing");
  return response.payload.user.points;
}

async function getPointRecords(token) {
  const response = await request("/api/v1/points/records", {
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  ensure(response.status === 200, `point records failed: ${response.status}`);
  ensure(Array.isArray(response.payload), "point records payload should be an array");
  return response.payload;
}

async function runScenario(name, placeholderContent, extractedContent, repricingReason) {
  const sourceServer = http.createServer((incomingRequest, response) => {
    if (incomingRequest.url !== "/source.txt") {
      response.statusCode = 404;
      response.end("not found");
      return;
    }

    response.statusCode = 200;
    response.setHeader("Content-Type", "text/plain; charset=utf-8");
    response.end(extractedContent);
  });

  await waitForServer(sourceServer);
  const address = sourceServer.address();
  const port = address && typeof address === "object" ? address.port : null;
  ensure(typeof port === "number", "failed to resolve source server port");

  try {
    const session = await registerUser(`smoke_docx_repricing_${name}`);
    await seedUserPoints(session.userId);
    const pointsBeforeCreate = await getCurrentPoints(session.token);

    const createdTask = await createTask(session.token, placeholderContent);
    await submitDocx(session.token, createdTask.taskId, `http://127.0.0.1:${port}/source.txt`);
    const completedTask = await waitForCompletedTask(session.token, createdTask.taskId);
    const currentPoints = await getCurrentPoints(session.token);
    const pointRecords = await getPointRecords(session.token);

    ensure(typeof completedTask.pointsCost === "number", "completed task cost missing");
    ensure(
      currentPoints === pointsBeforeCreate - completedTask.pointsCost,
      `${name}: current points do not match final task cost`,
    );
    ensure(
      pointRecords.some((record) => typeof record.reason === "string" && record.reason.includes(repricingReason)),
      `${name}: repricing point record missing`,
    );

    return {
      taskId: createdTask.taskId,
      pointsBeforeCreate,
      initialCost: createdTask.pointsCost,
      finalCost: completedTask.pointsCost,
      currentPoints,
    };
  } finally {
    await closeServer(sourceServer);
  }
}

async function main() {
  const surchargeScenario = await runScenario(
    "surcharge",
    "short",
    "This uploaded document contains substantially more detail, evidence, structure, and analysis. ".repeat(6),
    "docx repricing surcharge",
  );
  ensure(
    surchargeScenario.finalCost > surchargeScenario.initialCost,
    "docx surcharge scenario should increase the final task cost after extraction",
  );

  const refundScenario = await runScenario(
    "refund",
    "Long placeholder content that should cost more before extraction. ".repeat(8),
    "tiny",
    "task repricing refund",
  );
  ensure(
    refundScenario.finalCost < refundScenario.initialCost,
    "docx refund scenario should decrease the final task cost after extraction",
  );

  console.log(
    JSON.stringify(
      {
        ok: true,
        apiBase,
        scenarios: {
          surcharge: surchargeScenario,
          refund: refundScenario,
        },
        checks: [
          "uploaded documents are repriced against extracted content before completion",
          "repricing surcharges deduct additional points on the server",
          "repricing refunds restore the unused points and leave an audit trail",
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
