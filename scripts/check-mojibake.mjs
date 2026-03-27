import fs from "node:fs/promises";
import path from "node:path";

const textExtensions = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".md", ".json", ".css", ".scss"]);
const roots = ["apps/api/src", "apps/web/src", "apps/admin/src", "scripts"];
const ignoreDirs = new Set(["node_modules", ".next", "dist", "screenshots", "outputs", "fixtures", "coverage"]);

// High-confidence mojibake characters frequently produced by bad UTF-8/GBK conversion.
const hardFailRegex = /[�锟锛鈥銆]/g;

// Lower-confidence fragments; trigger only when they appear repeatedly.
const softTokens = [
  "闄",
  "鍚",
  "鏄",
  "鐨",
  "鎴",
  "缁",
  "妯",
  "瑙",
  "璇",
  "澶",
  "娴",
  "鍒",
  "鎺",
  "寮",
  "鎵",
  "鍙",
  "璁",
];

function shouldSkipDir(name) {
  return ignoreDirs.has(name);
}

async function walk(dir) {
  const files = [];
  const entries = await fs.readdir(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!shouldSkipDir(entry.name)) {
        files.push(...(await walk(fullPath)));
      }
      continue;
    }

    if (!textExtensions.has(path.extname(entry.name))) {
      continue;
    }
    files.push(fullPath);
  }

  return files;
}

function normalizeRelative(filePath, cwd) {
  return path.relative(cwd, filePath).replaceAll("\\", "/");
}

function countSoftTokenHits(line) {
  let hits = 0;
  for (const token of softTokens) {
    if (line.includes(token)) {
      hits += 1;
    }
  }
  return hits;
}

async function main() {
  const cwd = process.cwd();
  const scanFiles = [];

  for (const root of roots) {
    const absRoot = path.join(cwd, root);
    try {
      const stat = await fs.stat(absRoot);
      if (stat.isDirectory()) {
        scanFiles.push(...(await walk(absRoot)));
      } else if (stat.isFile() && textExtensions.has(path.extname(absRoot))) {
        scanFiles.push(absRoot);
      }
    } catch {
      // Ignore missing roots in partial workspaces.
    }
  }

  const findings = [];

  for (const filePath of scanFiles) {
    const normalized = normalizeRelative(filePath, cwd);
    if (normalized === "scripts/check-mojibake.mjs") {
      continue;
    }

    const content = await fs.readFile(filePath, "utf8");
    const lines = content.split(/\r?\n/);
    let fileSoftSignals = 0;

    for (let index = 0; index < lines.length; index += 1) {
      const line = lines[index];
      const lineNo = index + 1;

      if (hardFailRegex.test(line)) {
        findings.push({
          file: normalized,
          line: lineNo,
          reason: "hard-suspicious-char",
          content: line.trim(),
        });
        continue;
      }

      const softHits = countSoftTokenHits(line);
      if (softHits >= 5) {
        findings.push({
          file: normalized,
          line: lineNo,
          reason: "soft-token-cluster",
          content: line.trim(),
        });
        continue;
      }

      if (softHits >= 2) {
        fileSoftSignals += 1;
      }
    }

    if (fileSoftSignals >= 6) {
      findings.push({
        file: normalized,
        line: 1,
        reason: "file-soft-signal-overflow",
        content: `soft signal lines: ${fileSoftSignals}`,
      });
    }
  }

  if (findings.length === 0) {
    // eslint-disable-next-line no-console
    console.log("Encoding check passed: no suspicious mojibake patterns detected.");
    return;
  }

  // eslint-disable-next-line no-console
  console.error("Encoding check failed. Suspicious mojibake patterns found:\n");
  for (const finding of findings.slice(0, 200)) {
    // eslint-disable-next-line no-console
    console.error(`${finding.file}:${finding.line} [${finding.reason}] ${finding.content}`);
  }
  if (findings.length > 200) {
    // eslint-disable-next-line no-console
    console.error(`\n...and ${findings.length - 200} more.`);
  }

  process.exitCode = 1;
}

void main();
