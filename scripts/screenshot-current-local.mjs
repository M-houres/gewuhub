import path from "node:path";
import { spawn } from "node:child_process";
import { runScreenshotCapture } from "./screenshot-runner.mjs";

const baseUrl = process.env.CURRENT_BASE_URL || "http://127.0.0.1:3000";
const outputDir = path.resolve(process.env.CURRENT_SCREENSHOT_DIR || "research/screenshots/current");
const storageStatePath = process.env.PLAYWRIGHT_STORAGE_STATE
  ? path.resolve(process.env.PLAYWRIGHT_STORAGE_STATE)
  : undefined;

async function waitForServer(url, retries = 45, intervalMs = 1000) {
  for (let i = 0; i < retries; i += 1) {
    try {
      const res = await fetch(url);
      if (res.ok || res.status < 500) return;
    } catch {
      // retry
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  throw new Error(`Server not ready: ${url}`);
}

function killProcessTree(proc) {
  if (!proc || proc.killed) return;
  if (process.platform === "win32") {
    const killer = spawn("taskkill", ["/pid", String(proc.pid), "/T", "/F"], {
      stdio: "ignore",
      windowsHide: true,
    });
    killer.on("error", () => {});
    return;
  }
  proc.kill("SIGTERM");
}

async function main() {
  const startCommand = "npm run start -w web -- --hostname 127.0.0.1 --port 3000";
  const server = spawn(startCommand, {
    cwd: path.resolve("."),
    stdio: "inherit",
    shell: true,
    windowsHide: true,
  });

  try {
    await waitForServer(baseUrl);
    await runScreenshotCapture({
      baseUrl,
      outputDir,
      storageStatePath,
    });
  } finally {
    killProcessTree(server);
  }
}

await main();
