#!/usr/bin/env node

import { spawn } from "node:child_process";
import net from "node:net";
import { fileURLToPath } from "node:url";
import path from "node:path";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const apiDir = path.join(rootDir, "apps", "api");
const scriptNames = [
  "smoke-auth-lifecycle.mjs",
  "smoke-admin-auth.mjs",
  "smoke-admin-ban.mjs",
  "smoke-admin-dashboard.mjs",
  "smoke-workbench-nav.mjs",
  "smoke-plans-crud.mjs",
  "smoke-model-api-key.mjs",
  "smoke-admin-settings.mjs",
  "smoke-content-tutorials.mjs",
  "smoke-longform-task.mjs",
  "smoke-core-algorithms.mjs",
  "smoke-detect-pdf-report.mjs",
  "smoke-execution-mode-routing.mjs",
  "smoke-rewrite-shared-rules.mjs",
  "smoke-docx-local.mjs",
  "smoke-docx-guardrails.mjs",
  "smoke-docx-content-extraction.mjs",
  "smoke-docx-repricing.mjs",
  "smoke-docx-worker-callback.mjs",
  "smoke-email-notifications.mjs",
  "smoke-task-security.mjs",
  "smoke-admin-action-logs.mjs",
  "smoke-points-concurrency.mjs",
  "smoke-payment-refund.mjs",
];

function ensure(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function waitForProcessExit(processRef) {
  return new Promise((resolve) => {
    processRef.once("exit", (code, signal) => {
      resolve({ code, signal });
    });
  });
}

function checkPortAvailable(port) {
  return new Promise((resolve, reject) => {
    const server = net.createServer();

    server.once("error", (error) => {
      if (error && typeof error === "object" && "code" in error && error.code === "EADDRINUSE") {
        resolve(false);
        return;
      }
      reject(error);
    });

    server.once("listening", () => {
      server.close(() => resolve(true));
    });

    server.listen(port, "127.0.0.1");
  });
}

async function findAvailablePort(startPort = 4100, maxAttempts = 200) {
  for (let offset = 0; offset < maxAttempts; offset += 1) {
    const candidate = startPort + offset;
    const available = await checkPortAvailable(candidate);
    if (available) {
      return candidate;
    }
  }

  throw new Error(`no available port found starting from ${startPort}`);
}

async function waitForApiReady(processRef, apiBase) {
  const maxAttempts = 30;
  const intervalMs = 500;

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    if (processRef.exitCode !== null) {
      throw new Error(`api process exited before ready (code: ${processRef.exitCode})`);
    }
    try {
      const response = await fetch(`${apiBase}/api/v1/models`, { method: "GET" });
      if (response.ok) {
        return;
      }
    } catch {
      // Ignore until timeout.
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  throw new Error(`api not ready after ${maxAttempts * intervalMs}ms`);
}

async function runSmokeScript(fileName, env) {
  const scriptPath = path.join("scripts", fileName);
  const child = spawn(process.execPath, [scriptPath], {
    cwd: rootDir,
    env,
    stdio: "inherit",
  });
  const result = await waitForProcessExit(child);
  ensure(result.code === 0, `${fileName} failed with exit code ${result.code ?? "null"}`);
}

async function stopApiProcess(processRef, exitPromise) {
  if (processRef.exitCode !== null) {
    return;
  }

  processRef.kill("SIGTERM");
  const timeoutPromise = new Promise((resolve) => setTimeout(resolve, 3000));
  await Promise.race([exitPromise, timeoutPromise]);

  if (processRef.exitCode === null) {
    processRef.kill("SIGKILL");
    await exitPromise;
  }
}

async function main() {
  const apiPort = Number(process.env.SMOKE_API_PORT || (await findAvailablePort(4100)));
  const apiBase = process.env.SMOKE_API_BASE || `http://127.0.0.1:${apiPort}`;
  const smokeEnv = {
    ...process.env,
    API_HOST: "127.0.0.1",
    API_PORT: String(apiPort),
    SMOKE_API_BASE: apiBase,
    ENABLE_QUEUE: "false",
    SMOKE_EXPECT_LOCAL_DOCX_FALLBACK: "true",
    DOCX_WORKER_SECRET: process.env.DOCX_WORKER_SECRET || "smoke-docx-worker-secret",
  };

  const apiProcess = spawn(process.execPath, ["dist/server.js"], {
    cwd: apiDir,
    env: smokeEnv,
    stdio: "ignore",
  });
  const apiExitPromise = waitForProcessExit(apiProcess);

  try {
    await waitForApiReady(apiProcess, apiBase);
    for (const scriptName of scriptNames) {
      await runSmokeScript(scriptName, smokeEnv);
    }
  } finally {
    await stopApiProcess(apiProcess, apiExitPromise);
  }

  console.log(
    JSON.stringify(
      {
        ok: true,
        apiBase,
        scripts: scriptNames,
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  const apiBase = process.env.SMOKE_API_BASE || "unknown";
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


