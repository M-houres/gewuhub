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

function randomEmail(prefix) {
  const random = Math.random().toString(36).slice(2, 8);
  return `${prefix}_${Date.now()}_${random}@example.com`;
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
  ensure(typeof response.payload?.debugVerificationToken === "string", "register verification token missing");
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
  ensure(typeof response.payload?.token === "string", "login token missing");
  ensure(typeof response.payload?.user?.id === "string", "login user id missing");
  return {
    token: response.payload.token,
    userId: response.payload.user.id,
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
      reason: "smoke core algorithms seed",
    }),
  });

  ensure(response.status === 200, `seed points failed: ${response.status}`);
}

function resolveAcademicPlatform(taskType) {
  if (taskType === "reduce-repeat") return "cnki";
  if (taskType === "reduce-ai") return "cnki";
  if (taskType === "detect") return "paperpass";
  return undefined;
}

async function createTask(token, { type, content, mode = "balanced" }) {
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
      mode,
      provider: "deepseek",
      modelId: "deepseek-v3",
      ...(platform ? { platform } : {}),
    }),
  });

  ensure(response.status === 202, `create ${type} task failed: ${response.status}`);
  ensure(typeof response.payload?.taskId === "string", `${type} response missing taskId`);
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

  return {
    events,
    rest,
  };
}

async function streamLiteratureTask(token) {
  const response = await fetch(`${apiBase}/api/v1/tasks/stream`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      type: "literature",
      content:
        "Title: Responsible AI governance in university academic writing support\nSubject: Education technology\nWord Count: 3500\nReferences: UNESCO AI ethics recommendations; recent higher education governance studies.",
      mode: "balanced",
      provider: "deepseek",
      modelId: "deepseek-v3",
    }),
  });

  ensure(response.status === 200, `literature stream failed: ${response.status}`);
  ensure(response.body, "literature stream body missing");

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let output = "";
  let taskId = null;

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

      if (frame.event === "complete" && frame.data && typeof frame.data === "object") {
        output = typeof frame.data.output === "string" ? frame.data.output : output;
        taskId = frame.data.taskId || taskId;
      }
    }
  }

  ensure(taskId, "literature stream missing taskId");
  ensure(output.length > 120, "literature stream output too short");

  return { taskId, output };
}

async function main() {
  const account = await registerUser("smoke_core_algorithms");
  await verifyEmail(account.verificationToken);
  const session = await loginUser(account.email, account.password);
  await seedUserPoints(session.userId, 8000);
  const token = session.token;

  const repeatInput =
    "首先，人工智能写作工具在高校论文辅助中非常常见。其次，这类系统会提供统一句式和固定连接词。最后，这会让文本重复率更容易被放大。";
  const repeatTaskId = await createTask(token, {
    type: "reduce-repeat",
    content: repeatInput,
  });
  const repeatTask = await pollTask(token, repeatTaskId);
  const repeatOutput = repeatTask.result?.output || "";

  ensure(repeatOutput !== repeatInput, "reduce-repeat output should differ from input");
  ensure(!repeatOutput.includes("首先"), "reduce-repeat output still contains original connector");
  ensure(!repeatOutput.includes("其次"), "reduce-repeat output still contains repeated transition");
  ensure(!repeatOutput.includes("非常"), "reduce-repeat output still contains unreduced intensifier");
  ensure(/第一|另外|接着/.test(repeatOutput), "reduce-repeat output lacks rewrite markers");

  const reduceAiInput =
    "将AI诊断结果有效转化为作业设计方案。不同于传统按主观感知分层的做法，AI诊断能够从多个维度刻画学生水平。研究认为，个性化作业设计的核心不在于技术本身，而在于教师能否做出判断。信息获取不及时，批改周期往往在学生遗忘错误原因之后；覆盖面有限，难以在短时间内掌握每个学生的障碍点；“一人一案”在2022年试点后效果明显[1]。";
  const reduceAiTaskId = await createTask(token, {
    type: "reduce-ai",
    content: reduceAiInput,
  });
  const reduceAiTask = await pollTask(token, reduceAiTaskId);
  const reduceAiOutput = reduceAiTask.result?.output || "";

  ensure(reduceAiOutput !== reduceAiInput, "reduce-ai output should differ from input");
  ensure(reduceAiOutput.includes("把AI诊断结果"), "reduce-ai output should rewrite 将... into 把...");
  ensure(reduceAiOutput.includes("和传统按主观感知分层的做法不一样"), "reduce-ai output should rewrite 不同于... template");
  ensure(reduceAiOutput.includes("核心不是技术本身，而是教师能不能做出判断"), "reduce-ai output should rewrite 核心不在于...而在于...");
  ensure(!reduceAiOutput.includes("；"), "reduce-ai output should normalize semicolon lists into comma flow");
  ensure(reduceAiOutput.includes("“一人一案”"), "reduce-ai output should preserve quoted content");
  ensure(reduceAiOutput.includes("[1]"), "reduce-ai output should preserve citation markers");
  ensure(reduceAiOutput.includes("AI"), "reduce-ai output should preserve uppercase abbreviations");

  const detectInput =
    "总之，本文认为该方法具有重要意义。综上所述，这一方案在很多场景都可以看出优势。值得注意的是，这种表述方式在一定程度上显得过于模板化。";
  const detectTaskId = await createTask(token, {
    type: "detect",
    content: detectInput,
  });
  const detectTask = await pollTask(token, detectTaskId);
  const detectOutput = detectTask.result?.output || "";

  ensure(/Platform:\s*PaperPass/.test(detectOutput), "detect report missing PaperPass platform marker");
  ensure(/AIGC score:\s*\d+(?:\.\d+)?%/.test(detectOutput), "detect report missing AIGC score");
  ensure(/totalSuspectedTextRatio:\s*\d+(?:\.\d+)?%/.test(detectOutput), "detect report missing PaperPass ratio field");
  ensure(/Token heatmap sample:/.test(detectOutput), "detect report missing PaperPass token heatmap");
  ensure(/Suggestions:/.test(detectOutput), "detect report missing suggestions");

  const literature = await streamLiteratureTask(token);
  ensure(
    /Responsible AI governance|university academic writing support/i.test(literature.output),
    "literature output should retain topic context",
  );
  ensure(/Generated by deepseek\/deepseek-v3/.test(literature.output), "literature output missing model attribution");
  ensure(/Trace:\s*trace_/.test(literature.output), "literature output missing trace id");

  console.log(
    JSON.stringify(
      {
        ok: true,
        apiBase,
        taskIds: {
          reduceRepeat: repeatTaskId,
          reduceAi: reduceAiTaskId,
          detect: detectTaskId,
          literature: literature.taskId,
        },
        checks: [
          "reduce-repeat rewrites repeated connector patterns instead of echoing input",
          "reduce-ai output applies locked-term protection plus sentence-template rewrites",
          "detect output returns structured score/risk/suggestions report",
          "literature stream keeps topic context and completes with trace metadata",
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
