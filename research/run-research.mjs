import fs from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";

const rootDir = path.resolve("research");
const screenshotDir = path.join(rootDir, "screenshots");
const outputDir = path.join(rootDir, "outputs");
const networkLogPath = path.join(outputDir, "network-log.json");
const pageTextPath = path.join(outputDir, "page-text.json");

await fs.mkdir(screenshotDir, { recursive: true });
await fs.mkdir(outputDir, { recursive: true });

const browser = await chromium.launch({
  headless: true,
});

const context = await browser.newContext({
  viewport: { width: 1440, height: 1024 },
  locale: "zh-CN",
});

const page = await context.newPage();
const networkEvents = [];
const pageText = {};

page.on("request", async (request) => {
  const url = request.url();
  if (!url.includes("speedai.fun")) return;

  let postData = request.postData();
  if (postData && postData.length > 2000) {
    postData = `${postData.slice(0, 2000)}...[truncated]`;
  }

  networkEvents.push({
    type: "request",
    time: new Date().toISOString(),
    url,
    method: request.method(),
    resourceType: request.resourceType(),
    headers: request.headers(),
    postData,
  });
});

page.on("response", async (response) => {
  const url = response.url();
  if (!url.includes("speedai.fun")) return;

  let body = null;
  try {
    const contentType = response.headers()["content-type"] || "";
    if (contentType.includes("application/json") || contentType.includes("text/")) {
      body = await response.text();
      if (body.length > 4000) {
        body = `${body.slice(0, 4000)}...[truncated]`;
      }
    }
  } catch {
    body = null;
  }

  networkEvents.push({
    type: "response",
    time: new Date().toISOString(),
    url,
    status: response.status(),
    headers: response.headers(),
    body,
  });
});

async function capture(name, url) {
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForLoadState("networkidle", { timeout: 30000 }).catch(() => {});
  await page.screenshot({
    path: path.join(screenshotDir, `${name}.png`),
    fullPage: true,
  });
  pageText[name] = await page.locator("body").innerText().catch(() => "");
  console.log(`captured ${name}: ${page.url()}`);
}

const pages = [
  ["home", "https://speedai.fun/"],
  ["pricing", "https://speedai.fun/pricing"],
  ["tutorials", "https://speedai.fun/tutorials"],
  ["login", "https://speedai.fun/login"],
  ["register", "https://speedai.fun/register"],
  ["about", "https://speedai.fun/about"],
];

for (const [name, url] of pages) {
  await capture(name, url);
}

await fs.writeFile(networkLogPath, JSON.stringify(networkEvents, null, 2));
await fs.writeFile(pageTextPath, JSON.stringify(pageText, null, 2));
await browser.close();

