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

async function fetchAdminTutorials() {
  const response = await request("/api/v1/admin/content/tutorials", {
    method: "GET",
    headers: {
      "x-admin-token": adminToken,
    },
  });
  ensure(response.status === 200, `fetch admin tutorials failed: ${response.status}`);
  ensure(Array.isArray(response.payload), "admin tutorials should be array");
  return response.payload;
}

async function main() {
  const unique = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const title = `Smoke Tutorial ${unique}`;

  const createResponse = await request("/api/v1/admin/content/tutorials", {
    method: "POST",
    headers: {
      "x-admin-token": adminToken,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      title,
      tag: "smoke",
      summary: "Smoke summary",
      content: "Smoke content line 1\nSmoke content line 2",
      status: "published",
    }),
  });
  ensure(createResponse.status === 201, `create tutorial failed: ${createResponse.status}`);
  ensure(typeof createResponse.payload?.id === "string", "created tutorial id missing");
  ensure(typeof createResponse.payload?.slug === "string", "created tutorial slug missing");

  const tutorialId = createResponse.payload.id;
  const tutorialSlug = createResponse.payload.slug;

  const publicList = await request("/api/v1/tutorials?tag=smoke", { method: "GET" });
  ensure(publicList.status === 200, `public tutorials list failed: ${publicList.status}`);
  ensure(Array.isArray(publicList.payload), "public tutorials should be array");
  const inList = publicList.payload.some((item) => item.id === tutorialId);
  ensure(inList, "created tutorial should be visible in public list when published");

  const publicDetail = await request(`/api/v1/tutorials/${tutorialSlug}`, { method: "GET" });
  ensure(publicDetail.status === 200, `public tutorial detail failed: ${publicDetail.status}`);
  ensure(publicDetail.payload?.id === tutorialId, "public detail should match created tutorial id");

  const updateDraftResponse = await request(`/api/v1/admin/content/tutorials/${tutorialId}`, {
    method: "PUT",
    headers: {
      "x-admin-token": adminToken,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      status: "draft",
      summary: "Draft summary after update",
    }),
  });
  ensure(updateDraftResponse.status === 200, `update tutorial failed: ${updateDraftResponse.status}`);
  ensure(updateDraftResponse.payload?.status === "draft", "tutorial status should be updated to draft");

  const detailAfterDraft = await request(`/api/v1/tutorials/${tutorialSlug}`, { method: "GET" });
  ensure(detailAfterDraft.status === 404, `draft tutorial should not be public, got ${detailAfterDraft.status}`);

  const deleteResponse = await request(`/api/v1/admin/content/tutorials/${tutorialId}`, {
    method: "DELETE",
    headers: {
      "x-admin-token": adminToken,
    },
  });
  ensure(deleteResponse.status === 200, `delete tutorial failed: ${deleteResponse.status}`);
  ensure(deleteResponse.payload?.deleted === true, "delete tutorial should return deleted=true");

  const adminListAfterDelete = await fetchAdminTutorials();
  const stillExists = adminListAfterDelete.some((item) => item.id === tutorialId);
  ensure(!stillExists, "deleted tutorial should not exist in admin list");

  console.log(
    JSON.stringify(
      {
        ok: true,
        apiBase,
        checks: [
          "admin can create tutorial content",
          "published tutorial is visible in public tutorials API",
          "draft tutorial is hidden from public detail API",
          "admin can delete tutorial content",
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
