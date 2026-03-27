import fs from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";

const screenshotDir = path.resolve("research", "screenshots");
const outputDir = path.resolve("research", "outputs");

const storage = {
  i18nextLng: process.env.SPEEDAI_LANG || "en",
  token: process.env.SPEEDAI_TOKEN || "",
  username: process.env.SPEEDAI_USERNAME || "",
  wechatBound: "1",
  isInvited: "0",
  DISABLE_DOUYIN_FOLLOW_MODAL: "true",
  hasShownRewriteTips: "true",
};

if (!storage.token || !storage.username) {
  throw new Error("Missing SPEEDAI_TOKEN or SPEEDAI_USERNAME");
}

const samples = {
  rewriteSimilarity:
    "Artificial intelligence is rapidly reshaping academic writing. Students increasingly use generative systems to organize literature, outline arguments, and draft early versions of papers. While these tools improve efficiency, they can also produce repetitive phrasing, generic logic, and detectable stylistic patterns. Universities therefore need clear governance that encourages responsible assistance without replacing critical thinking, disciplinary judgment, and original analysis.",
  reduceAi:
    "Generative systems are now common in higher education writing workflows. They help students summarize literature, generate transitions, and draft early arguments. However, excessive reliance on these tools can leave strong stylistic signals that are easy to detect. Effective academic governance should therefore focus on transparency, revision quality, and human oversight rather than simple prohibition.",
  detect:
    "Artificial intelligence tools are increasingly used in student writing. They can accelerate drafting and help organize information, but they also create formulaic phrasing and predictable sentence rhythm. Academic writing support should therefore train students to revise, verify sources, and maintain genuine argument development instead of copying machine produced structure.",
};

await fs.mkdir(screenshotDir, { recursive: true });
await fs.mkdir(outputDir, { recursive: true });

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  locale: "en-US",
  viewport: { width: 1440, height: 1400 },
});

await context.addInitScript((data) => {
  for (const [key, value] of Object.entries(data)) {
    localStorage.setItem(key, value);
  }
}, storage);

function attachApiLogger(page) {
  const events = [];

  page.on("request", (request) => {
    if (!request.url().includes("api.kuaipaper.com/v1/")) return;
    events.push({
      type: "request",
      time: new Date().toISOString(),
      method: request.method(),
      url: request.url(),
      postData: request.postData(),
    });
  });

  page.on("response", async (response) => {
    if (!response.url().includes("api.kuaipaper.com/v1/")) return;

    let body = null;
    try {
      body = await response.text();
      if (body.length > 4000) {
        body = `${body.slice(0, 4000)}...[truncated]`;
      }
    } catch {
      body = null;
    }

    events.push({
      type: "response",
      time: new Date().toISOString(),
      status: response.status(),
      url: response.url(),
      body,
    });
  });

  return events;
}

async function saveJson(fileName, value) {
  await fs.writeFile(path.join(outputDir, fileName), JSON.stringify(value, null, 2));
}

async function capture(page, fileName) {
  await page.screenshot({
    path: path.join(screenshotDir, fileName),
    fullPage: true,
  });
}

async function waitForTaskResult(page, taskId, timeoutMs = 120000) {
  const endAt = Date.now() + timeoutMs;
  const pollUrl = `/v1/task_async/result/${taskId}`;
  const polls = [];

  while (Date.now() < endAt) {
    const response = await page
      .waitForResponse((candidate) => candidate.url().includes(pollUrl), {
        timeout: Math.min(15000, endAt - Date.now()),
      })
      .catch(() => null);

    if (!response) break;

    const json = await response.json().catch(() => null);
    polls.push(json);

    if (json && json.status && json.status !== "running") {
      return { final: json, polls };
    }
  }

  return { final: null, polls };
}

async function runRewriteFlow({ mode, label, sample }) {
  const page = await context.newPage();
  const events = attachApiLogger(page);
  const submitEndpoint = mode === "similarity" ? "/v1/rewrite_async" : "/v1/deai_async";

  await page.goto(`https://speedai.fun/en/rewrite?mode=${mode}`, {
    waitUntil: "networkidle",
    timeout: 60000,
  });

  await page.locator("button").filter({ hasText: "English" }).first().click();
  await page.locator("button").filter({ hasText: "CNKI" }).first().click();
  await page.locator('[role="tab"]').nth(0).click();
  await page.locator("textarea").fill(sample);
  await capture(page, `flow_${label}_filled.png`);

  const submitResponsePromise = page.waitForResponse(
    (response) => response.url().includes(submitEndpoint) && response.status() === 200,
    { timeout: 30000 },
  );

  await page.getByRole("button", { name: "Generate" }).click({ force: true });
  await page.waitForTimeout(1000);
  await capture(page, `flow_${label}_processing.png`);

  const submitResponse = await submitResponsePromise;
  const submitJson = await submitResponse.json();
  const taskId = submitJson.task_id;
  const { final, polls } = await waitForTaskResult(page, taskId);

  await page.waitForTimeout(1000);
  await capture(page, `flow_${label}_completed.png`);

  const bodyText = await page.locator("body").innerText();
  const result = {
    flow: label,
    url: page.url(),
    submit: submitJson,
    polls,
    final,
    bodyText,
    events,
  };

  await saveJson(`flow-${label}.json`, result);
  await page.close();
  return result;
}

async function runDetectParagraphFlow() {
  const page = await context.newPage();
  const events = attachApiLogger(page);

  await page.goto("https://speedai.fun/en/aigc-detection", {
    waitUntil: "networkidle",
    timeout: 60000,
  });

  await page.locator("text=Paragraph Detection").click();
  await page.locator("textarea").fill(samples.detect);
  await capture(page, "flow_detect_filled.png");

  const responsePromise = page.waitForResponse(
    (response) => response.url().includes("/v1/ai_detect_paragraphs") && response.status() === 200,
    { timeout: 30000 },
  );

  await page.getByRole("button", { name: "Start Detection" }).click({ force: true });
  await page.waitForTimeout(1000);
  await capture(page, "flow_detect_processing.png");

  const response = await responsePromise;
  const json = await response.json();
  await page.waitForTimeout(1000);
  await capture(page, "flow_detect_completed.png");

  const result = {
    flow: "detect",
    url: page.url(),
    response: json,
    bodyText: await page.locator("body").innerText(),
    events,
  };

  await saveJson("flow-detect.json", result);
  await page.close();
  return result;
}

const summary = {
  rewriteSimilarity: await runRewriteFlow({
    mode: "similarity",
    label: "rewrite_similarity",
    sample: samples.rewriteSimilarity,
  }),
  reduceAi: await runRewriteFlow({
    mode: "aigc",
    label: "reduce_ai",
    sample: samples.reduceAi,
  }),
  detect: await runDetectParagraphFlow(),
};

await saveJson("auth-flow-summary.json", {
  generatedAt: new Date().toISOString(),
  username: storage.username,
  summaries: Object.fromEntries(
    Object.entries(summary).map(([key, value]) => [
      key,
      {
        flow: value.flow,
        url: value.url,
      },
    ]),
  ),
});

await browser.close();
