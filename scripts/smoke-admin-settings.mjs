#!/usr/bin/env node

const apiBase = process.env.SMOKE_API_BASE || "http://127.0.0.1:4000";
const adminToken = process.env.ADMIN_TOKEN || "dev-admin-token";
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

function clone(value) {
  return JSON.parse(JSON.stringify(value));
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
  ensure(verify.status === 200, `verify email failed: ${verify.status}`);

  const login = await request("/api/v1/auth/login", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ email, password }),
  });
  ensure(login.status === 200, `login failed: ${login.status}`);
  ensure(typeof login.payload?.token === "string", "login token missing");
  ensure(typeof login.payload?.user?.id === "string", "login user id missing");

  return {
    email,
    userId: login.payload.user.id,
    token: login.payload.token,
    initialPoints: Number(login.payload.user.points ?? 0),
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
      reason: "smoke admin settings seed",
    }),
  });
  ensure(response.status === 200, `seed points failed: ${response.status}`);
}

function resolveAcademicPlatform(taskType) {
  if (taskType === "reduce-ai") return "cnki";
  if (taskType === "detect") return "paperpass";
  return undefined;
}

async function createTask(token, payload) {
  const platform = resolveAcademicPlatform(payload.type);
  const response = await request("/api/v1/tasks", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      ...payload,
      ...(platform ? { platform } : {}),
    }),
  });
  ensure(response.status === 202, `create task failed: ${response.status}`);
  ensure(typeof response.payload?.taskId === "string", "task id missing");
  return response.payload;
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
    if (response.payload?.status === "completed") return response.payload;
    if (response.payload?.status === "failed") {
      throw new Error(`task ${taskId} failed unexpectedly`);
    }
  }
  throw new Error(`task ${taskId} did not complete in time`);
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
      // Keep raw string.
    }
    events.push({ event, data });
  }

  return { events, rest };
}

async function streamLongform(token) {
  const response = await fetch(`${apiBase}/api/v1/tasks/stream`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      type: "literature",
      content: "Task Type: literature\nSubject: education\nDiscipline: education technology\nTitle: AI writing governance\nDetail: produce a literature review draft.",
      mode: "balanced",
      provider: "deepseek",
      modelId: "deepseek-v3",
    }),
  });

  ensure(response.status === 200, `stream task failed: ${response.status}`);
  ensure(response.body, "stream response body missing");

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let output = "";

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const parsed = parseSseFrames(buffer);
    buffer = parsed.rest;

    for (const frame of parsed.events) {
      if (frame.event === "complete" && frame.data && typeof frame.data === "object") {
        output = typeof frame.data.output === "string" ? frame.data.output : output;
      }
    }
  }

  ensure(output.length > 50, "stream output too short");
  return output;
}

async function main() {
  const originalSettings = await getSettings();
  const modifiedSettings = clone(originalSettings);
  modifiedSettings.checkinPoints = 9;
  modifiedSettings.algorithmEngine.detect.dailyFreeLimit = 0;
  modifiedSettings.algorithmEngine.rewrite.appendEvidenceTailOnReduceAi = false;
  modifiedSettings.algorithmEngine.longform.includeModelAttribution = false;
  modifiedSettings.algorithmEngine.taskMatrix["reduce-ai"].cnki.replacements = [
    { from: "SlotSmokeTokenAlpha", to: "SlotSmokeTokenBeta" },
  ];
  modifiedSettings.algorithmEngine.taskMatrix.detect.paperpass.scoreOffset = 3;
  modifiedSettings.algorithmEngine.taskMatrix.detect.paperpass.phraseWeights = [
    { phrase: "SlotDetectPhrase", weight: 4 },
  ];

  await putSettings(modifiedSettings);

  try {
    const afterUpdate = await getSettings();
    ensure(afterUpdate.checkinPoints === 9, "checkinPoints update not applied");
    ensure(afterUpdate.algorithmEngine?.detect?.dailyFreeLimit === 0, "detect daily free limit update not applied");
    ensure(
      afterUpdate.algorithmEngine?.rewrite?.appendEvidenceTailOnReduceAi === false,
      "rewrite config update not applied",
    );
    ensure(
      afterUpdate.algorithmEngine?.longform?.includeModelAttribution === false,
      "longform config update not applied",
    );
    ensure(
      afterUpdate.algorithmEngine?.taskMatrix?.["reduce-ai"]?.cnki?.replacements?.[0]?.to === "SlotSmokeTokenBeta",
      "task-matrix rewrite replacement not persisted",
    );
    ensure(
      afterUpdate.algorithmEngine?.taskMatrix?.detect?.paperpass?.scoreOffset === 3,
      "task-matrix detect scoreOffset not persisted",
    );

    const session = await registerVerifyLogin("smoke_admin_settings");

    const checkin = await request("/api/v1/points/checkin", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${session.token}`,
        "Content-Type": "application/json",
      },
      body: "{}",
    });
    ensure(checkin.status === 200, `checkin failed: ${checkin.status}`);
    ensure(checkin.payload?.reward === 9, `expected checkin reward 9, got ${checkin.payload?.reward}`);
    ensure(
      checkin.payload?.points === session.initialPoints + 9,
      `expected points to increase by 9, got ${checkin.payload?.points} from ${session.initialPoints}`,
    );

    const pointSummary = await request("/api/v1/points/summary", {
      method: "GET",
      headers: {
        Authorization: `Bearer ${session.token}`,
      },
    });
    ensure(pointSummary.status === 200, `points summary failed: ${pointSummary.status}`);
    ensure(pointSummary.payload?.dailyDetectLimit === 0, `expected dailyDetectLimit 0, got ${pointSummary.payload?.dailyDetectLimit}`);

    await seedUserPoints(session.userId, 8000);

    const detectTask = await createTask(session.token, {
      type: "detect",
      content: "SlotDetectPhrase appears in this academic paragraph. SlotDetectPhrase should trigger configured phrase weighting for smoke test.",
      mode: "balanced",
      provider: "deepseek",
      modelId: "deepseek-v3",
    });
    ensure(detectTask.freeDetectApplied === false, "detect task should not use free quota after config update");
    ensure(typeof detectTask.pointsCost === "number" && detectTask.pointsCost > 0, "detect task should deduct points");
    const detectDetail = await pollTask(session.token, detectTask.taskId);
    const detectMetrics = detectDetail.result?.report?.metrics || [];
    ensure(
      detectMetrics.some((item) => item.label === "slotAdjustments:"),
      "detect report should include slot adjustment metrics",
    );

    const reduceAiTask = await createTask(session.token, {
      type: "reduce-ai",
      content: "SlotSmokeTokenAlpha is embedded in this sentence to verify configurable rewrite replacement behavior.",
      mode: "balanced",
      provider: "deepseek",
      modelId: "deepseek-v3",
    });
    const reduceAiDetail = await pollTask(session.token, reduceAiTask.taskId);
    const reduceAiOutput = reduceAiDetail.result?.output || "";
    ensure(reduceAiOutput.includes("SlotSmokeTokenBeta"), "reduce-ai output should apply configurable replacement rules");

    const streamedOutput = await streamLongform(session.token);
    ensure(!/Generated by /.test(streamedOutput), "longform output should omit model attribution after config update");

    console.log(
      JSON.stringify(
        {
          ok: true,
          apiBase,
          checks: [
            "admin settings endpoint updates nested algorithm-engine config",
            "check-in reward follows runtime system settings",
            "points summary follows runtime detect free-limit config",
            "detect free quota respects runtime detect config",
            "reduce-ai rewrite behavior follows runtime rewrite config",
            "longform stream follows runtime attribution config",
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






