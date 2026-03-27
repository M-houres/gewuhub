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

  return { status: response.status, payload, headers: response.headers };
}

async function registerVerifyLogin(prefix) {
  const email = randomEmail(prefix);
  const password = "pass1234";

  const register = await request("/api/v1/auth/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  ensure(register.status === 201, `register failed: ${register.status}`);
  ensure(typeof register.payload?.debugVerificationToken === "string", "verification token missing");

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

async function seedUserPoints(userId, change) {
  const response = await request(`/api/v1/admin/users/${userId}/points`, {
    method: "POST",
    headers: {
      "x-admin-token": adminToken,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      change,
      reason: "smoke detect pdf seed",
    }),
  });
  ensure(response.status === 200, `seed points failed: ${response.status}`);
}

async function createDetectTask(token) {
  const response = await request("/api/v1/tasks", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      type: "detect",
      content:
        "标题：小学语文教学中阅读能力的培养策略研究\n文件：小学语文教学中阅读能力的培养策略研究.docx\n本文围绕小学语文阅读教学展开分析，综合来看，该方法具有重要意义。与此同时，这一方案在多个维度都可以看出明显优势，因此值得进一步探讨。",
      mode: "balanced",
      provider: "deepseek",
      modelId: "deepseek-v3",
      platform: "cnki",
    }),
  });
  ensure(response.status === 202, `create detect task failed: ${response.status}`);
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
      throw new Error(`detect task ${taskId} failed unexpectedly`);
    }
  }
  throw new Error(`detect task ${taskId} did not complete in time`);
}

async function main() {
  const session = await registerVerifyLogin("smoke_detect_pdf");
  await seedUserPoints(session.userId, 5000);
  const taskId = await createDetectTask(session.token);
  const detail = await pollTask(session.token, taskId);

  ensure(typeof detail.result?.report?.reportNo === "string", "detect task missing structured report payload");
  ensure(detail.result?.report?.platform === "cnki", "detect report platform mismatch");

  const ticket = await request(`/api/v1/tasks/${taskId}/download-link`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${session.token}`,
    },
  });
  ensure(ticket.status === 200, `download-link failed: ${ticket.status}`);
  ensure(typeof ticket.payload?.downloadPath === "string", "download-link missing downloadPath");

  const resolveResponse = await request(ticket.payload.downloadPath, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${session.token}`,
    },
  });
  ensure(resolveResponse.status === 200, `download resolve failed: ${resolveResponse.status}`);
  ensure(typeof resolveResponse.payload?.downloadUrl === "string", "resolved download missing downloadUrl");
  ensure(/generated-files\/detect\//.test(resolveResponse.payload.downloadUrl), "downloadUrl should point to generated detect PDF");

  const pdfUrl = /^https?:\/\//i.test(resolveResponse.payload.downloadUrl)
    ? resolveResponse.payload.downloadUrl
    : `${apiBase}${resolveResponse.payload.downloadUrl}`;

  const pdfResponse = await fetch(pdfUrl);
  ensure(pdfResponse.status === 200, `pdf fetch failed: ${pdfResponse.status}`);
  const contentType = pdfResponse.headers.get("content-type") || "";
  ensure(contentType.includes("application/pdf"), `unexpected pdf content type: ${contentType}`);
  const buffer = Buffer.from(await pdfResponse.arrayBuffer());
  ensure(buffer.length > 1500, "pdf report too small");
  ensure(buffer.slice(0, 4).toString("utf8") === "%PDF", "pdf signature missing");

  console.log(
    JSON.stringify(
      {
        ok: true,
        apiBase,
        taskId,
        checks: [
          "detect task stores structured report metadata",
          "detect download-link resolves to signed PDF route",
          "signed detect report route returns application/pdf content",
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
