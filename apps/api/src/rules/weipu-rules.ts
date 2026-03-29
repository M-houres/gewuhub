// 维普检测算法规则包
export const weipuDetectRules = {
  version: "v1.0",
  platform: "weipu",
  taskType: "detect",
  weights: {
    lexical: 0.5,
    phrase: 1.2,
    structural: 1.0,
  },
  thresholds: {
    low: 0.4,
    medium: 0.65,
    high: 0.85,
  },
  keywords: [
    "研究表明", "数据显示", "结果表明", "综上所述", "由此可见",
    "具有重要意义", "值得注意", "不容忽视", "显而易见",
  ],
  aiPatterns: [
    /首先.*其次.*最后/g,
    /第一.*第二.*第三/g,
    /总之.*综上所述/g,
  ],
};

// 维普降重规则包
export const weipuRewriteRules = {
  version: "v1.0",
  platform: "weipu",
  taskType: "rewrite_reduce_repeat",
  replacements: [
    ["研究表明", ["数据显示", "实验证明", "调查发现"]],
    ["综上所述", ["总体来看", "整体而言", "综合分析"]],
    ["具有重要意义", ["意义重大", "价值显著", "作用明显"]],
    ["显而易见", ["可以看出", "不难发现", "明显可见"]],
  ],
};

// 维普降AIGC规则包
export const weipuReduceAiRules = {
  version: "v1.0",
  platform: "weipu",
  taskType: "rewrite_reduce_ai",
  replacements: [
    ["首先", ["第一", "先看", "开始"]],
    ["其次", ["另外", "接着", "然后"]],
    ["最后", ["最终", "终于", "最后来看"]],
    ["总之", ["综合来看", "整体上", "总体而言"]],
  ],
};
