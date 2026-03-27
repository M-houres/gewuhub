import fs from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";

const DESKTOP = { width: 1440, height: 900 };
const MOBILE = { width: 375, height: 812 };

/**
 * @typedef {Object} ScreenshotPage
 * @property {string} name
 * @property {string} path
 * @property {{ width: number, height: number }} viewport
 * @property {boolean=} fullPage
 * @property {boolean=} requiresAuth
 * @property {(page: import("playwright").Page) => Promise<void>=} action
 */

/**
 * @param {import("playwright").Page} page
 * @param {string} text
 */
async function fillWorkbenchText(page, text) {
  const selectors = ["textarea", "[contenteditable='true']"];
  for (const selector of selectors) {
    const locator = page.locator(selector).first();
    if ((await locator.count()) === 0) continue;
    try {
      if (selector === "textarea") {
        await locator.fill(text);
      } else {
        await locator.click({ timeout: 2000 });
        await page.keyboard.type(text);
      }
      return true;
    } catch {
      // continue
    }
  }
  return false;
}

/**
 * @param {import("playwright").Page} page
 */
async function clickSubmit(page) {
  const labels = ["开始处理", "开始生成", "提交", "检测", "Generate", "Submit", "Start"];
  for (const label of labels) {
    const locator = page.getByRole("button", { name: label }).first();
    if ((await locator.count()) === 0) continue;
    try {
      await locator.click({ timeout: 2000 });
      return true;
    } catch {
      // continue
    }
  }

  const fallback = page.locator("button[type='submit']").first();
  if ((await fallback.count()) > 0) {
    await fallback.click({ timeout: 2000 }).catch(() => {});
    return true;
  }
  return false;
}

/** @type {ScreenshotPage[]} */
const defaultPages = [
  { name: "home-desktop", path: "/", viewport: DESKTOP, fullPage: false },
  { name: "home-mobile", path: "/", viewport: MOBILE, fullPage: false },
  { name: "pricing-desktop", path: "/pricing", viewport: DESKTOP, fullPage: false },
  { name: "tutorials-desktop", path: "/tutorials", viewport: DESKTOP, fullPage: false },
  { name: "login-desktop", path: "/login", viewport: DESKTOP, fullPage: false },
  { name: "register-desktop", path: "/register", viewport: DESKTOP, fullPage: false },
  { name: "ai-search-desktop", path: "/zh/AI-search", viewport: DESKTOP, fullPage: false },
  { name: "reduce-ai-empty", path: "/zh/reduce-ai", viewport: DESKTOP, fullPage: false },
  {
    name: "reduce-ai-input",
    path: "/zh/reduce-ai",
    viewport: DESKTOP,
    fullPage: false,
    action: async (page) => {
      await fillWorkbenchText(
        page,
        "This is a demo abstract about transformer-based learning in academic writing quality control.",
      );
      await page.waitForTimeout(500);
    },
  },
  {
    name: "reduce-ai-loading",
    path: "/zh/reduce-ai",
    viewport: DESKTOP,
    fullPage: false,
    action: async (page) => {
      await fillWorkbenchText(
        page,
        "This is a demo abstract about transformer-based learning in academic writing quality control.",
      );
      await clickSubmit(page);
      await page.waitForTimeout(800);
    },
  },
  { name: "reduce-repeat-desktop", path: "/zh/reduce-repeat", viewport: DESKTOP, fullPage: false },
  { name: "detect-desktop", path: "/zh/detect", viewport: DESKTOP, fullPage: false },
  { name: "points-desktop", path: "/zh/points", viewport: DESKTOP, fullPage: false },
];

/**
 * @param {{
 *   baseUrl: string;
 *   outputDir: string;
 *   storageStatePath?: string;
 *   pages?: ScreenshotPage[];
 * }} input
 */
export async function runScreenshotCapture(input) {
  const pages = input.pages && input.pages.length > 0 ? input.pages : defaultPages;
  await fs.mkdir(input.outputDir, { recursive: true });

  const browser = await chromium.launch({ headless: true });
  const hasStorageState = Boolean(input.storageStatePath);

  for (const target of pages) {
    if (target.requiresAuth && !hasStorageState) {
      // eslint-disable-next-line no-console
      console.log(`SKIP ${target.name} (auth required, no storage state file provided)`);
      continue;
    }

    const context = await browser.newContext({
      viewport: target.viewport,
      locale: "zh-CN",
      storageState: target.requiresAuth && input.storageStatePath ? input.storageStatePath : undefined,
    });
    const page = await context.newPage();

    try {
      await page.goto(new URL(target.path, input.baseUrl).toString(), {
        waitUntil: "domcontentloaded",
        timeout: 90_000,
      });
      await page.waitForLoadState("networkidle", { timeout: 15_000 }).catch(() => {});
      await page.waitForTimeout(1200);

      if (target.action) {
        await target.action(page);
      }

      const filePath = path.join(input.outputDir, `${target.name}.png`);
      await page.screenshot({
        path: filePath,
        fullPage: target.fullPage ?? true,
      });
      // eslint-disable-next-line no-console
      console.log(`OK   ${target.name}`);
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error(`FAIL ${target.name}: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      await context.close();
    }
  }

  await browser.close();
}
