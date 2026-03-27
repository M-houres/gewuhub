#!/usr/bin/env node

import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { rewriteAcademicContent } = require("../apps/api/dist/rewrite-engine.js");

function ensure(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

const input = [
  "\u9996\u5148\uff0c\u7814\u7a76\u8ba4\u4e3a\u8be5\u7b56\u7565\u5177\u6709\u91cd\u8981\u610f\u4e49\u3002",
  "\u4e0d\u540c\u4e8e\u4f20\u7edf\u505a\u6cd5\uff0c\u8fd9\u4e00\u7b56\u7565\u80fd\u591f\u4ece\u591a\u4e2a\u7ef4\u5ea6\u523b\u753b\u5b66\u751f\u6c34\u5e73\u3002",
  "\u4e2a\u6027\u5316\u4f5c\u4e1a\u8bbe\u8ba1\u7684\u6838\u5fc3\u4e0d\u5728\u4e8e\u6280\u672f\u672c\u8eab\uff0c\u800c\u5728\u4e8e\u6559\u5e08\u80fd\u5426\u505a\u51fa\u5224\u65ad\u3002",
].join("");

try {
  const reduceRepeatOutput = rewriteAcademicContent(input, "reduce-repeat");
  const reduceAiOutput = rewriteAcademicContent(input, "reduce-ai");

  ensure(reduceRepeatOutput === reduceAiOutput, "reduce-repeat and reduce-ai should share the same rewrite output");
  ensure(!reduceRepeatOutput.includes("\u4e0d\u540c\u4e8e"), "shared rewrite should replace reduce-ai sentence patterns in reduce-repeat");
  ensure(
    reduceRepeatOutput.includes("\u548c\u4f20\u7edf\u505a\u6cd5\u4e0d\u4e00\u6837"),
    "shared rewrite should apply the different-from sentence template",
  );
  ensure(
    reduceRepeatOutput.includes(
      "\u6838\u5fc3\u4e0d\u662f\u6280\u672f\u672c\u8eab\uff0c\u800c\u662f\u6559\u5e08\u80fd\u4e0d\u80fd\u505a\u51fa\u5224\u65ad",
    ),
    "shared rewrite should apply the core-not-a-but-b sentence template",
  );

  console.log(
    JSON.stringify(
      {
        ok: true,
        checks: [
          "reduce-repeat and reduce-ai now use the same rewrite pipeline",
          "shared connector rewrites remain active",
          "shared sentence templates remain active for both task types",
        ],
      },
      null,
      2,
    ),
  );
} catch (error) {
  console.error(
    JSON.stringify(
      {
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      },
      null,
      2,
    ),
  );
  process.exit(1);
}
