import path from "node:path";
import { runScreenshotCapture } from "./screenshot-runner.mjs";

const baseUrl = process.env.CURRENT_BASE_URL || "http://127.0.0.1:3000";
const outputDir = path.resolve(process.env.CURRENT_SCREENSHOT_DIR || "research/screenshots/current");
const storageStatePath = process.env.PLAYWRIGHT_STORAGE_STATE
  ? path.resolve(process.env.PLAYWRIGHT_STORAGE_STATE)
  : undefined;

async function waitForServer(url, retries = 30, intervalMs = 1000) {
  for (let attempt = 1; attempt <= retries; attempt += 1) {
    try {
      const response = await fetch(url);
      if (response.ok || response.status < 500) {
        return;
      }
    } catch {
      // retry
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  throw new Error(`Server not ready: ${url}`);
}

await waitForServer(baseUrl);
await runScreenshotCapture({
  baseUrl,
  outputDir,
  storageStatePath,
});
