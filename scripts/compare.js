const fs = require("node:fs");
const path = require("node:path");
const { PNG } = require("pngjs");

const pixelmatchImport = require("pixelmatch");
const pixelmatch = pixelmatchImport.default ?? pixelmatchImport;

const THRESHOLD_PERCENT = 2;
const ORIGINAL_DIR = path.resolve(process.env.ORIGINAL_SCREENSHOT_DIR || "research/screenshots/original");
const CURRENT_DIR = path.resolve(process.env.CURRENT_SCREENSHOT_DIR || "research/screenshots/current");
const DIFF_DIR = path.resolve(process.env.DIFF_SCREENSHOT_DIR || "research/screenshots/diff");
const REPORT_PATH = path.resolve(process.env.COMPARE_REPORT_PATH || "research/compare-report.json");

fs.mkdirSync(DIFF_DIR, { recursive: true });

if (!fs.existsSync(ORIGINAL_DIR)) {
  // eslint-disable-next-line no-console
  console.error(`Missing baseline directory: ${ORIGINAL_DIR}`);
  process.exit(1);
}

if (!fs.existsSync(CURRENT_DIR)) {
  // eslint-disable-next-line no-console
  console.error(`Missing current screenshot directory: ${CURRENT_DIR}`);
  process.exit(1);
}

const pages = fs.readdirSync(ORIGINAL_DIR).filter((file) => file.endsWith(".png"));
if (pages.length === 0) {
  // eslint-disable-next-line no-console
  console.error(`No baseline screenshots found in ${ORIGINAL_DIR}`);
  process.exit(1);
}

const results = [];

for (const page of pages) {
  const originalPath = path.join(ORIGINAL_DIR, page);
  const currentPath = path.join(CURRENT_DIR, page);
  const diffPath = path.join(DIFF_DIR, page);

  if (!fs.existsSync(currentPath)) {
    results.push({
      page,
      diffPct: "N/A",
      pass: false,
      reason: "missing current screenshot",
    });
    // eslint-disable-next-line no-console
    console.log(`FAIL ${page}: missing current screenshot`);
    continue;
  }

  const original = PNG.sync.read(fs.readFileSync(originalPath));
  const current = PNG.sync.read(fs.readFileSync(currentPath));

  if (original.width !== current.width || original.height !== current.height) {
    results.push({
      page,
      diffPct: "N/A",
      pass: false,
      reason: `size mismatch baseline(${original.width}x${original.height}) current(${current.width}x${current.height})`,
    });
    // eslint-disable-next-line no-console
    console.log(`FAIL ${page}: size mismatch baseline(${original.width}x${original.height}) current(${current.width}x${current.height})`);
    continue;
  }

  const { width, height } = original;
  const diff = new PNG({ width, height });
  const diffPixels = pixelmatch(original.data, current.data, diff.data, width, height, {
    threshold: 0.1,
  });
  const diffPct = Number(((diffPixels / (width * height)) * 100).toFixed(2));

  fs.writeFileSync(diffPath, PNG.sync.write(diff));

  const pass = diffPct < THRESHOLD_PERCENT;
  results.push({
    page,
    diffPct: `${diffPct.toFixed(2)}%`,
    pass,
  });
  // eslint-disable-next-line no-console
  console.log(`${pass ? "PASS" : "FAIL"} ${page}: ${diffPct.toFixed(2)}% difference`);
}

const allPass = results.every((item) => item.pass);

fs.writeFileSync(
  REPORT_PATH,
  JSON.stringify(
    {
      generatedAt: new Date().toISOString(),
      thresholdPercent: THRESHOLD_PERCENT,
      allPass,
      results,
    },
    null,
    2,
  ),
);

// eslint-disable-next-line no-console
console.log(allPass ? "\nAll pages passed." : "\nSome pages failed. Check research/screenshots/diff/.");
process.exit(allPass ? 0 : 1);
