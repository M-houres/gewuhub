import fs from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";

const baseUrl = process.env.WEB_BASE_URL || "http://127.0.0.1:3014";
const apiBase = process.env.API_BASE_URL || "http://127.0.0.1:4000";
const outputDir = path.resolve(process.env.BROWSER_SMOKE_OUTPUT_DIR || "output/browser-smoke");
const credentials = {
  email: process.env.SMOKE_USER_EMAIL || "demo@gewu.local",
  password: process.env.SMOKE_USER_PASSWORD || "demo123",
};

function ensure(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

async function waitForText(page, needle, timeout = 30_000) {
  await page.waitForFunction(
    (expected) => document.body.innerText.includes(expected),
    needle,
    { timeout },
  );
}

async function createAuthSession() {
  const response = await fetch(`${apiBase}/api/v1/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(credentials),
  });
  const data = await response.json().catch(() => null);
  ensure(response.ok, `api login failed: ${response.status}`);
  ensure(data && typeof data.token === "string", "api login missing token");
  ensure(typeof data.expiresAt === "string", "api login missing expiresAt");
  ensure(data.user && typeof data.user.email === "string", "api login missing user");
  return {
    accessToken: data.token,
    expiresAt: data.expiresAt,
    user: data.user,
  };
}

async function runRewriteFlow(page, config) {
  await page.goto(`${baseUrl}${config.path}`, {
    waitUntil: "domcontentloaded",
    timeout: 90_000,
  });
  await page.locator("textarea").fill(config.input);
  await page.getByRole("button", { name: config.submitLabel }).click();
  await waitForText(page, config.expectedText);
  const bodyText = await page.locator("body").innerText();
  ensure(bodyText.includes(config.expectedText), `${config.path} missing expected result text`);
}

async function runDetectFlow(page) {
  await page.goto(`${baseUrl}/zh/detect`, {
    waitUntil: "domcontentloaded",
    timeout: 90_000,
  });
  await page.locator("textarea").fill("人工智能技术正在影响论文写作，因此学校需要识别潜在的生成式写作痕迹。");
  await page.getByRole("button", { name: "开始检测" }).click();
  await waitForText(page, "AIGC score:");
  const bodyText = await page.locator("body").innerText();
  ensure(bodyText.includes("AIGC score:"), "detect page missing score output");
}

async function runLiteratureFlow(page) {
  await page.goto(`${baseUrl}/zh/literature`, {
    waitUntil: "domcontentloaded",
    timeout: 90_000,
  });
  await page.locator("textarea").first().fill("围绕人工智能辅助写作治理的研究现状、争议点和未来方向生成一份文献综述草稿。");
  await page.locator('input[type="checkbox"]').check();
  await page.getByRole("button", { name: "开始任务" }).click();
  await waitForText(page, "LITERATURE Draft", 40_000);
  const bodyText = await page.locator("body").innerText();
  ensure(bodyText.includes("LITERATURE Draft"), "literature page missing streamed output");
}

async function main() {
  await fs.mkdir(outputDir, { recursive: true });

  const browser = await chromium.launch({ headless: true });
  const authSession = await createAuthSession();
  const context = await browser.newContext({ locale: "zh-CN", viewport: { width: 1440, height: 900 } });
  await context.addInitScript((session) => {
    window.localStorage.setItem("gewu.auth.session", JSON.stringify(session));
  }, authSession);
  const page = await context.newPage();

  const result = {
    ok: false,
    baseUrl,
    checks: [],
  };

  try {
    result.checks.push("browser session seeded from API login");

    await runRewriteFlow(page, {
      path: "/zh/reduce-repeat",
      submitLabel: "开始降重",
      input: "首先，人工智能技术在学术写作中非常常见，因此学生需要保持独立思考。最后，研究者应注意表达方式。",
      expectedText: "第一",
    });
    result.checks.push("reduce-repeat page submits and renders rewritten result");

    await runRewriteFlow(page, {
      path: "/zh/reduce-ai",
      submitLabel: "开始降 AI",
      input: "人工智能与AI工具正在影响论文写作，因此我们需要谨慎使用。总之，作者应自行负责。",
      expectedText: "智能工具",
    });
    result.checks.push("reduce-ai page submits and renders rewritten result");

    await runDetectFlow(page);
    result.checks.push("detect page submits and renders score result");

    await runLiteratureFlow(page);
    result.checks.push("literature page submits and renders streamed result");

    result.ok = true;
    console.log(JSON.stringify(result, null, 2));
  } catch (error) {
    const screenshotPath = path.join(outputDir, "smoke-workbench-browser-failure.png");
    await page.screenshot({ path: screenshotPath, fullPage: true }).catch(() => {});
    const failure = {
      ...result,
      error: error instanceof Error ? error.message : String(error),
      screenshotPath,
    };
    console.error(JSON.stringify(failure, null, 2));
    process.exitCode = 1;
  } finally {
    await context.close();
    await browser.close();
  }
}

await main();
