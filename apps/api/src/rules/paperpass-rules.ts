// PaperPass检测算法规则包
export const paperpassDetectRules = {
  version: "v1.0",
  platform: "paperpass",
  taskType: "detect",
  weights: {
    lexical: 0.7,
    phrase: 1.0,
    structural: 0.9,
  },
  thresholds: {
    low: 0.35,
    medium: 0.6,
    high: 0.8,
  },
  keywords: [
    "本文认为", "笔者认为", "据此可知", "由上可知",
    "不言而喻", "毋庸置疑", "至关重要", "极为重要",
  ],
  aiPatterns: [
    /可以说.*可以认为/g,
    /一方面.*另一方面/g,
    /不仅.*而且/g,
  ],
};

// PaperPass降重规则包
export const paperpassRewriteRules = {
  version: "v1.0",
  platform: "paperpass",
  taskType: "rewrite_reduce_repeat",
  replacements: [
    ["本文认为", ["笔者认为", "据分析", "从研究看"]],
    ["至关重要", ["非常重要", "意义重大", "作用显著"]],
    ["由此可见", ["可以看出", "不难发现", "显然"]],
  ],
};
