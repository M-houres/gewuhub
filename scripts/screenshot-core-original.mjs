import path from "node:path";
import { buildCoreScreenshotPages } from "./core-screenshot-pages.mjs";
import { runScreenshotCapture } from "./screenshot-runner.mjs";

const baseUrl = process.env.TARGET_BASE_URL || "https://speedai.fun";
const outputDir = path.resolve(process.env.ORIGINAL_SCREENSHOT_DIR || "research/screenshots/original-core");

await runScreenshotCapture({
  baseUrl,
  outputDir,
  pages: buildCoreScreenshotPages("original"),
});
