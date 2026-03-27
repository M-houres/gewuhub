#!/usr/bin/env node

const apiBase = process.env.SMOKE_API_BASE || "http://127.0.0.1:4000";
const adminToken = process.env.ADMIN_TOKEN || "dev-admin-token";

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

async function main() {
  const response = await request("/api/v1/admin/dashboard", {
    method: "GET",
    headers: {
      "x-admin-token": adminToken,
    },
  });

  ensure(response.status === 200, `admin dashboard failed: ${response.status}`);
  ensure(response.payload && typeof response.payload === "object", "dashboard payload missing");

  const payload = response.payload;
  const requiredNumberFields = [
    "newUsersToday",
    "taskCount",
    "income",
    "modelCalls",
    "totalIncome",
    "activeUsers",
  ];

  for (const field of requiredNumberFields) {
    ensure(typeof payload[field] === "number", `dashboard field ${field} should be number`);
  }

  ensure(Array.isArray(payload.taskTrend), "dashboard taskTrend should be array");
  ensure(Array.isArray(payload.costTrend), "dashboard costTrend should be array");
  ensure(Array.isArray(payload.modelUsage), "dashboard modelUsage should be array");
  ensure(Array.isArray(payload.recentTasks), "dashboard recentTasks should be array");

  ensure(payload.taskTrend.length === 7, `taskTrend should include 7 days, got ${payload.taskTrend.length}`);
  ensure(payload.costTrend.length === 7, `costTrend should include 7 days, got ${payload.costTrend.length}`);

  const breakdown = payload.taskStatusBreakdown;
  ensure(
    breakdown &&
      typeof breakdown.queued === "number" &&
      typeof breakdown.running === "number" &&
      typeof breakdown.completed === "number" &&
      typeof breakdown.failed === "number",
    "taskStatusBreakdown fields missing",
  );

  console.log(
    JSON.stringify(
      {
        ok: true,
        apiBase,
        checks: [
          "admin dashboard endpoint is authorized and reachable",
          "dashboard metrics fields are present",
          "7-day trend datasets are complete",
          "task status breakdown shape is valid",
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
