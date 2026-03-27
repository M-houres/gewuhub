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

function adminHeaders(withJsonContentType = false) {
  const headers = {
    "x-admin-token": adminToken,
  };
  if (withJsonContentType) {
    headers["Content-Type"] = "application/json";
  }
  return headers;
}

async function main() {
  const listBefore = await request("/api/v1/admin/plans", {
    method: "GET",
    headers: adminHeaders(),
  });
  ensure(listBefore.status === 200, `load plans failed: ${listBefore.status}`);
  ensure(Array.isArray(listBefore.payload), "plans payload should be array");

  const createPayload = {
    name: "测试套餐",
    monthlyPrice: 199,
    yearlyPrice: 1999,
    quota: 220000,
    features: ["高级写作辅助", "批量任务处理"],
  };

  const createdResponse = await request("/api/v1/admin/plans", {
    method: "POST",
    headers: adminHeaders(true),
    body: JSON.stringify(createPayload),
  });
  ensure(createdResponse.status === 201, `create plan failed: ${createdResponse.status}`);
  ensure(createdResponse.payload && typeof createdResponse.payload.id === "string", "created plan id missing");
  const createdId = createdResponse.payload.id;

  const updatedResponse = await request(`/api/v1/admin/plans/${createdId}`, {
    method: "PUT",
    headers: adminHeaders(true),
    body: JSON.stringify({
      yearlyPrice: 1888,
      features: ["高级写作辅助", "模型优先队列"],
    }),
  });
  ensure(updatedResponse.status === 200, `update plan failed: ${updatedResponse.status}`);
  ensure(updatedResponse.payload.yearlyPrice === 1888, "updated yearlyPrice mismatch");
  ensure(
    Array.isArray(updatedResponse.payload.features) && updatedResponse.payload.features.includes("模型优先队列"),
    "updated features mismatch",
  );

  const publicList = await request("/api/v1/plans", {
    method: "GET",
  });
  ensure(publicList.status === 200, `public plans failed: ${publicList.status}`);
  ensure(Array.isArray(publicList.payload), "public plans payload should be array");
  ensure(publicList.payload.some((item) => item.id === createdId), "created plan missing from public plans");

  const deleteResponse = await request(`/api/v1/admin/plans/${createdId}`, {
    method: "DELETE",
    headers: adminHeaders(),
  });
  ensure(deleteResponse.status === 200, `delete plan failed: ${deleteResponse.status}`);

  const listAfterDelete = await request("/api/v1/admin/plans", {
    method: "GET",
    headers: adminHeaders(),
  });
  ensure(listAfterDelete.status === 200, `reload plans failed: ${listAfterDelete.status}`);
  ensure(Array.isArray(listAfterDelete.payload), "plans payload after delete should be array");
  ensure(!listAfterDelete.payload.some((item) => item.id === createdId), "deleted plan still exists");

  console.log(
    JSON.stringify(
      {
        ok: true,
        apiBase,
        checks: [
          "admin can create plan",
          "admin can update plan price and features",
          "public plans endpoint returns latest plan list",
          "admin can delete plan",
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
