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

function adminHeaders() {
  return {
    "Content-Type": "application/json",
    "x-admin-token": adminToken,
  };
}

async function main() {
  const initial = await request("/api/v1/admin/workbench-nav", {
    method: "GET",
    headers: adminHeaders(),
  });
  ensure(initial.status === 200, `failed to load workbench nav: ${initial.status}`);
  ensure(Array.isArray(initial.payload), "workbench nav payload should be array");
  ensure(initial.payload.length > 0, "workbench nav should not be empty");

  const target = initial.payload.find((item) => item.key === "reduce-ai") || initial.payload[0];
  ensure(target && typeof target.key === "string", "unable to resolve target nav item");
  ensure(typeof target.visible === "boolean", "target nav visible flag missing");

  const nextVisible = !target.visible;

  try {
    const updateResponse = await request(`/api/v1/admin/workbench-nav/${target.key}`, {
      method: "PATCH",
      headers: adminHeaders(),
      body: JSON.stringify({ visible: nextVisible }),
    });
    ensure(updateResponse.status === 200, `failed to update nav visibility: ${updateResponse.status}`);

    const publicNav = await request("/api/v1/workbench/nav", {
      method: "GET",
    });
    ensure(publicNav.status === 200, `failed to load public nav: ${publicNav.status}`);
    ensure(Array.isArray(publicNav.payload?.items), "public nav items should be array");
    const updatedItem = publicNav.payload.items.find((item) => item.key === target.key);
    ensure(updatedItem, "updated nav item missing in public API response");
    ensure(updatedItem.visible === nextVisible, "public nav visibility does not match admin setting");
  } finally {
    await request(`/api/v1/admin/workbench-nav/${target.key}`, {
      method: "PATCH",
      headers: adminHeaders(),
      body: JSON.stringify({ visible: target.visible }),
    });
  }

  const reverted = await request("/api/v1/workbench/nav", {
    method: "GET",
  });
  ensure(reverted.status === 200, `failed to verify reverted nav: ${reverted.status}`);
  const revertedItem = Array.isArray(reverted.payload?.items)
    ? reverted.payload.items.find((item) => item.key === target.key)
    : null;
  ensure(revertedItem && revertedItem.visible === target.visible, "workbench nav visibility was not restored");

  console.log(
    JSON.stringify(
      {
        ok: true,
        apiBase,
        checks: [
          "admin can toggle workbench navigation visibility",
          "public workbench nav endpoint reflects admin visibility settings",
          "workbench nav visibility is restored after test",
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
