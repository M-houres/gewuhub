import path from "node:path";
import { runScreenshotCapture } from "./screenshot-runner.mjs";

const baseUrl = process.env.TARGET_BASE_URL || "https://speedai.fun";
const outputDir = path.resolve(process.env.ORIGINAL_SCREENSHOT_DIR || "research/screenshots/original");
const storageStatePath = process.env.PLAYWRIGHT_STORAGE_STATE
  ? path.resolve(process.env.PLAYWRIGHT_STORAGE_STATE)
  : undefined;

await runScreenshotCapture({
  baseUrl,
  outputDir,
  storageStatePath,
});
