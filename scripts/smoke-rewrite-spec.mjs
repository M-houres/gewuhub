#!/usr/bin/env node

import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { rewriteAcademicContent } = require("../apps/api/dist/rewrite-engine.js");

function ensure(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function main() {
  const repeatInput =
    "首先，人工智能写作工具在高校论文辅助中非常常见。其次，这类系统会提供统一句式和固定连接词。最后，这会让文本重复率更容易被放大。";
  const repeatOutput = rewriteAcademicContent(repeatInput, "reduce-repeat");

  ensure(repeatOutput !== repeatInput, "reduce-repeat should not echo the input");
  ensure(!repeatOutput.includes("首先"), "reduce-repeat should rewrite 首先");
  ensure(!repeatOutput.includes("其次"), "reduce-repeat should rewrite 其次");
  ensure(/第一|另外|接着/.test(repeatOutput), "reduce-repeat should inject rotated transition markers");

  const reduceAiInput = [
    "研究背景",
    "关键词：AI学情诊断；小学数学",
    "将AI诊断结果有效转化为作业设计方案。",
    "不同于传统按主观感知分层的做法，AI诊断能够从多个维度刻画学生水平。",
    "研究认为，个性化作业设计的核心不在于技术本身，而在于教师能否做出判断。",
    "信息获取不及时，批改周期往往在学生遗忘错误原因之后；覆盖面有限，难以在短时间内掌握每个学生的障碍点；“一人一案”在2022年试点后效果明显[1]。",
    "参考文献",
    "[1] 郭华. 大单元教学的实践路径。",
  ].join("\n");

  const reduceAiOutput = rewriteAcademicContent(reduceAiInput, "reduce-ai", ["AI学情诊断", "个性化作业设计"]);
  const outputLines = reduceAiOutput.split("\n");
  const rewrittenBody = outputLines.slice(2, 6).join("");

  ensure(outputLines[0] === "研究背景", "title line should remain locked");
  ensure(outputLines[1] === "关键词：AI学情诊断；小学数学", "keyword line should remain locked");
  ensure(reduceAiOutput.includes("\n参考文献\n[1] 郭华. 大单元教学的实践路径。"), "reference section should remain locked");
  ensure(reduceAiOutput.includes("把AI诊断结果"), "reduce-ai should rewrite 将... into 把...");
  ensure(reduceAiOutput.includes("和传统按主观感知分层的做法不一样"), "reduce-ai should apply different-from template");
  ensure(reduceAiOutput.includes("核心不是技术本身，而是教师能不能做出判断"), "reduce-ai should apply 核心不在于 template");
  ensure(reduceAiOutput.includes("“一人一案”"), "quoted content should stay untouched");
  ensure(reduceAiOutput.includes("[1]"), "citations should stay untouched");
  ensure(reduceAiOutput.includes("AI"), "uppercase abbreviations should stay untouched");
  ensure(!rewrittenBody.includes("；"), "semicolon list should be normalized inside rewritten body");

  console.log(
    JSON.stringify(
      {
        ok: true,
        checks: [
          "locked title / keyword / reference lines remain unchanged",
          "将... / 不同于... / 核心不在于... templates are applied",
          "quotes, citations, uppercase abbreviations remain protected",
          "reduce-repeat still rewrites repeated connector patterns",
        ],
      },
      null,
      2,
    ),
  );
}

try {
  main();
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
