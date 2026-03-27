#!/usr/bin/env node

const apiBase = process.env.SMOKE_API_BASE || "http://127.0.0.1:4000";
const adminToken = process.env.ADMIN_TOKEN || "dev-admin-token";

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
  return { status: response.status, payload, headers: response.headers };
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
    body: JSON.stringify({
      email,
      password,
    }),
  });
  ensure(response.status === 200, `login failed: ${response.status}`);
  ensure(typeof response.payload?.token === "string", "login response missing token");
  ensure(typeof response.payload?.user?.id === "string", "login response missing user.id");
  return response.payload;
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
      reason: "smoke longform seed",
    }),
  });
  ensure(response.status === 200, `seed points failed: ${response.status}`);
}

function parseSseFrames(buffer) {
  const events = [];
  let rest = buffer;

  while (true) {
    const frameEnd = rest.indexOf("\n\n");
    if (frameEnd < 0) break;

    const frame = rest.slice(0, frameEnd);
    rest = rest.slice(frameEnd + 2);
    if (!frame.trim()) continue;

    const lines = frame.split("\n");
    let event = "message";
    const dataLines = [];
    for (const line of lines) {
      if (line.startsWith("event:")) {
        event = line.slice("event:".length).trim();
      } else if (line.startsWith("data:")) {
        dataLines.push(line.slice("data:".length).trim());
      }
    }
    if (dataLines.length === 0) continue;

    const raw = dataLines.join("\n");
    let data = raw;
    try {
      data = JSON.parse(raw);
    } catch {
      // Keep raw text.
    }

    events.push({ event, data });
  }

  return {
    events,
    rest,
  };
}

async function streamLongformTask(token) {
  const response = await fetch(`${apiBase}/api/v1/tasks/stream`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      type: "literature",
      content: "Topic: governance practices for responsible AI-assisted academic writing in universities.",
      mode: "balanced",
      provider: "deepseek",
      modelId: "deepseek-v3",
    }),
  });

  ensure(response.status === 200, `streaming endpoint failed: ${response.status}`);
  ensure(response.body, "streaming response body is empty");

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let taskId = null;
  let output = "";
  let chunkCount = 0;
  let completed = false;

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const parsed = parseSseFrames(buffer);
    buffer = parsed.rest;

    for (const frame of parsed.events) {
      if (frame.event === "meta" && frame.data && typeof frame.data === "object") {
        taskId = frame.data.taskId || taskId;
      }

      if (frame.event === "chunk" && frame.data && typeof frame.data === "object") {
        const chunk = typeof frame.data.chunk === "string" ? frame.data.chunk : "";
        if (chunk) {
          chunkCount += 1;
          output += chunk;
        }
        taskId = frame.data.taskId || taskId;
      }

      if (frame.event === "complete" && frame.data && typeof frame.data === "object") {
        if (typeof frame.data.output === "string" && frame.data.output.length > 0) {
          output = frame.data.output;
        }
        taskId = frame.data.taskId || taskId;
        completed = true;
      }
    }
  }

  ensure(taskId, "streaming task did not emit taskId");
  ensure(chunkCount > 0, "streaming task emitted no chunks");
  ensure(completed, "streaming task did not emit complete event");
  ensure(output.length > 20, "streaming task output is too short");

  return { taskId, output, chunkCount };
}

async function main() {
  const account = await registerUser("smoke_longform");
  await verifyEmail(account.verificationToken);
  const login = await loginUser(account.email, account.password);
  await seedUserPoints(login.user.id, 6000);
  const token = login.token;

  const streamResult = await streamLongformTask(token);

  const detail = await request(`/api/v1/tasks/${streamResult.taskId}`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
  ensure(detail.status === 200, `task detail failed: ${detail.status}`);
  ensure(detail.payload?.status === "completed", `expected completed, got ${detail.payload?.status}`);
  ensure(typeof detail.payload?.result?.output === "string", "task output missing in persisted detail");

  console.log(
    JSON.stringify(
      {
        ok: true,
        apiBase,
        taskId: streamResult.taskId,
        streamedChunks: streamResult.chunkCount,
        checks: [
          "stream endpoint returns SSE events",
          "stream emits meta/chunk/complete sequence",
          "streamed task persists as completed in task detail endpoint",
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
