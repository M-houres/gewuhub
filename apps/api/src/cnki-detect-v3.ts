export type CnkiV3RiskLevel = "none" | "low" | "medium" | "high";
export type CnkiV3HitDetail = {
  type: "lexical" | "phrase" | "structural";  matched: string;  weight: number;  position: number;};
export type CnkiV3ParagraphResult = {
  text: string;  score: number;  score100: number;  riskLevel: CnkiV3RiskLevel;  hits: CnkiV3HitDetail[];  densityMultiplier: number;  breakdown: {
    f1Lexical: number;    f2Phrase: number;    f3Structural: number;    sentencePenalty: number;    rawScore: number;    finalScore: number;  };  charCount: number;};
export type CnkiV3DocumentResult = {
  score: number;  riskLevel: CnkiV3RiskLevel;  paragraphs: CnkiV3ParagraphResult[];  summary: {
    totalChars: number;    paragraphCount: number;    highRiskParagraphs: number;    topHitWords: string[];  };};
type ParagraphContext = {
  globalAWithBCount: number;  previousHasProblem: boolean;  nextHasSolution: boolean;};
const CONFIG = {
  weights: { alpha: 0.6, beta: 1.0, gamma: 1.2, delta: 0.8 },
  bias: -1.5,
  thresholds: { low: 0.5, medium: 0.7, high: 0.9 },
  globalDensityBonus: { p60: 1.15, p80: 1.25 },
  sentencePenalty: { n3: 1.5, n5: 2.0 },
} as const;
const lexicalExtremeWords = [
  "能力", "影响", "问题", "策略", "机制", "路径", "层面", "理念", "情境", "平台",
  "生态", "体系", "质量", "内容", "成效", "动力", "优势", "体验", "维度", "框架",
  "视角", "逻辑", "模式", "导向", "驱动", "赋能", "价值", "边界", "痛点", "抓手",
  "构建", "提升", "推动", "制约", "探讨", "实现", "促进", "聚焦", "依托", "赋予",
  "激发", "培育", "塑造", "打造", "优化", "完善", "创新", "深化", "强化", "夯实",
  "拓展", "延伸", "渗透", "融合", "整合", "协调", "统筹", "谋划", "部署", "落实",
  "推进", "落地", "重塑", "再造", "重构", "往往", "明显", "显著", "充分", "深刻",
  "核心", "有效", "积极", "系统", "综合", "深度", "重要", "关键", "根本", "本质",
  "内在", "外在", "全面", "整体", "宏观", "微观", "纵深", "立体", "多元", "多维",
  "多层", "多角度", "多维度", "多元化", "高质量", "高效率", "高水平", "深层次",
];
const lexicalHighBiasWords = [
  "此外", "进一步", "与此同时", "从而", "以及", "持续", "完整", "全面", "整体", "不断",
  "深入", "有力", "切实", "真正", "根本上", "从本质", "正是", "恰恰", "尤为", "尤其",
  "特别是", "更为", "更加", "愈发", "日益", "逐步", "逐渐", "稳步", "有序", "稳健",
  "高效", "精准", "系统性", "全局性", "战略性", "引领性", "紧迫性", "必要性",
  "重要性", "可行性", "可持续性", "相互", "彼此", "双向", "互动", "协同", "配合",
];
const lexicalHumanSignals = [
  "其实", "说白了", "坦白讲", "换句话说", "说实话", "不过", "但是", "然而", "可是", "只是",
  "倒是", "毕竟", "说到底", "归根结底", "追根溯源", "我认为", "笔者认为", "据笔者观察", "据了解",
  "也就是说", "换言之", "更直白地说", "这里", "那里", "彼时", "当时", "那会儿", "刚好", "恰好",
  "偶然", "碰巧", "这一点", "这件事", "这个问题", "这种情况", "回头来看", "事后来看", "现在看来",
  "甚至", "居然", "竟然", "没想到", "出乎意料",
];
const lexicalWhitelist = new Set([
  "研究", "分析", "方法", "结果", "数据", "样本", "实验", "对照", "变量", "假设",
  "验证", "结论", "文献", "期刊", "论文", "作者", "年份", "出版", "图表", "公式",
  "算法", "模型", "参数", "误差", "中国", "国家", "地区", "城市", "学校", "学生",
  "教师", "课程", "教学", "学习", "阅读", "写作",
]);
const phraseTier5 = [
  "研究表明", "研究显示", "数据表明", "数据显示", "调查显示", "调查表明", "结果表明", "结果显示",
  "文献表明", "实践表明", "已有研究证明", "已有研究表明", "理论表明", "分析表明", "实证表明",
  "事实表明", "综上所述", "综上可见", "由此可见", "由此可知", "由上可知", "综合以上", "综合来看",
  "综合分析", "至关重要", "尤为重要", "极为重要", "十分重要", "非常重要", "具有重要意义",
  "具有重要价值", "奠定坚实基础", "提供有力支撑", "提供重要保障", "有效路径", "重要路径",
  "关键路径", "必要路径", "重要抓手", "有力抓手", "关键抓手", "引起广泛关注", "受到广泛关注",
  "得到广泛认可", "备受关注", "引发高度关注",
];
const phraseTier4 = [
  "与此同时", "在此基础上", "基于此", "有鉴于此", "进一步地", "不仅如此", "与之相对", "与之相比",
  "不容忽视", "不可忽视", "值得关注", "值得注意", "值得重视", "不可回避", "亟需解决", "迫切需要",
  "多重因素", "多方面因素", "深层原因", "根本原因", "内在逻辑", "运行机制", "深层机制", "内在机制",
  "科学依据", "理论依据", "实践依据", "数据支撑", "深刻影响", "重大影响", "广泛影响", "深远影响",
  "全方位", "多维度", "多层面", "多角度", "系统发展", "协调发展", "可持续发展", "高质量发展",
  "有机统一", "相互促进", "相辅相成", "协同推进", "精准施策", "精准发力", "靶向发力", "靶向施策",
  "提质增效", "降本增效", "扩面提质", "守正创新", "继往开来", "革故鼎新", "落细落实", "落地落实",
  "落地生根", "久久为功", "善作善成", "积厚成势",
];
const phraseTier3 = [
  "一定程度上", "某种程度上", "很大程度上", "相当程度上", "在很大程度上", "在某种意义上", "从这个意义上",
  "客观而言", "客观来看", "客观地说", "相对而言", "总体而言", "总体来看", "总体来说", "整体而言",
  "从长远来看", "从长远角度", "从战略层面", "不难发现", "不难看出", "不难理解", "不难想象",
  "显而易见", "毋庸置疑", "无可争辩", "不言而喻", "究其原因", "究其根源", "究其本质", "正如前文",
  "如前所述", "上文提到", "前文分析", "由此出发", "基于以上", "依据上述", "因此", "从而", "进而", "继而",
  "可以说", "可以认为", "可以看出", "可以发现", "需要指出", "需要强调", "需要注意", "需要说明",
  "有必要", "有需要", "有理由", "有充分理由",
];
const sentenceOpenerPatterns = [
  /^从.{1,8}(来看|而言|角度|维度|层面|视角)[，,]/u,
  /^在.{1,8}(层面|方面|领域|维度)[，,上]?/u,
  /^就.{1,8}(而言|来说|层面而言)[，,]/u,
  /^对于.{1,8}(而言|来说)[，,]/u,
  /^(整体现状来看|整体来看|宏观来看|微观来看|具体而言|具体来说|一方面|另一方面|第三方面)[，,]/u,
];
const conclusionTriplets = [
  ["综上", "唯有", "方能"],
  ["综上", "才能", "坚实基础"],
  ["总之", "只有", "才能"],
  ["因此", "必须", "方可"],
  ["综合以上", "唯有", "真正"],
  ["总体来看", "关键在于", "有效"],
  ["综上所述", "进一步", "推动"],
];
const structuralRegexSets = {
  parallelEnumeration: [
    /^从.{1,8}(来看|而言|角度)[，,]/gmu,
    /^在.{1,8}(层面|方面|维度)[，,上]?/gmu,
    /^就.{1,8}(而言|来说)[，,]/gmu,
  ],
  enumSequence: /(首先|其次|再次|再者|最后|此外|另外|第一|第二|第三|第四|第五|一是|二是|三是|四是|五是|一方面|另一方面|同时|与此同时)/gu,
  aWithB: /[\u4e00-\u9fa5]{1,4}与[\u4e00-\u9fa5]{1,4}/gu,
  progressive: /不仅.{2,30}(而且|更|也|还).{2,30}/gu,
  summary: /(综上|总之|综合以上|由此可见|综上所述).{0,50}(需要|才能|应该|必须|要)/gu,
  modifierStacking: /(不断|持续|逐步|深入|切实|有效|积极|主动|充分)(推进|加强|提升|完善|优化|落实)/gu,
  definitionLike: [
    /是指.{4,30}的(过程|活动|行为|方式|机制|状态)/gu,
    /可以定义为.{4,40}/gu,
    /通常被认为是.{4,40}/gu,
    /被广泛定义为.{4,40}/gu,
    /本质上是.{4,30}/gu,
  ],
};
const problemSignals = ["存在问题", "面临挑战", "存在不足", "亟待解决", "不容忽视的问题"];const solutionSignals = ["需要", "应当", "必须", "亟需", "有必要", "应该"];
function normalizeText(value: string) {
  return (value || "")
    .replace(/\r/g, "\n")
    .replace(/<[^>]*>/g, " ")
    .replace(/[“”]/g, "\"")
    .replace(/[‘’]/g, "'")
    .replace(/[ \t]/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));}

function roundTo(value: number, digits = 2) {
  const factor = 10 ** digits;  return Math.round(value * factor) / factor;}

function sigmoid(x: number) {
  return 1 / (1 + Math.exp(-x));}

function riskLevelFromScore(score: number): CnkiV3RiskLevel {
  if (score >= CONFIG.thresholds.high) return "high";  if (score >= CONFIG.thresholds.medium) return "medium";  if (score >= CONFIG.thresholds.low) return "low";  return "none";}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");}

function splitSentences(text: string) {
  return text
    .split(/(?<=[。…])/u)
    .map((item) => item.trim())
    .filter(Boolean);}

function splitParagraphs(text: string) {
  const normalized = normalizeText(text);  if (!normalized) return [] as string[];
  let blocks = normalized
    .split(/\n{2,}/)
    .map((item) => item.trim())
    .filter(Boolean);
  if (blocks.length <= 1) {
    blocks = normalized
      .split(/(?<=[。…])\s*\n+/u)
      .map((item) => item.trim())
      .filter(Boolean);  }

  const expanded = blocks.flatMap((block) => {
    if (block.length <= 300) return [block];    const sentences = splitSentences(block);    const fragments: string[] = [];    let current = "";    for (const sentence of sentences) {
      const candidate = current ? `${current}${sentence}` : sentence;      if (candidate.length > 300 && current) {
        fragments.push(current);        current = sentence;      } else {
        current = candidate;      }
    }
    if (current) fragments.push(current);    return fragments;  });
  const merged: string[] = [];  for (const paragraph of expanded) {
    if (paragraph.length < 20 && merged.length > 0) {
      merged[merged.length - 1] += paragraph;    } else {
      merged.push(paragraph);    }
  }
  return merged.length > 0 ? merged : [normalized];}

function literalMatchPositions(text: string, token: string) {
  if (!token) return [] as number[];  const matches = [...text.matchAll(new RegExp(escapeRegExp(token), "gu"))];  return matches.map((match) => typeof match.index === "number" ? match.index : 0);}

function regexMatchPositions(text: string, pattern: RegExp) {
  const matches = [...text.matchAll(pattern)];  return matches.map((match) => typeof match.index === "number" ? match.index : 0);}

function densityMultiplierFromHitCount(count: number) {
  if (count >= 10) return 3.5;  if (count >= 7) return 3.0;  if (count === 6) return 2.5;  if (count === 5) return 2.0;  if (count === 4) return 1.6;  if (count === 3) return 1.3;  return 1.0;}

function increaseCounter(counter: Map<string, number>, key: string, inc = 1) {
  counter.set(key, (counter.get(key) || 0) + inc);}

function scoreLexical(text: string, charCount: number, topHits: Map<string, number>) {
  let score = 0;  const hits: CnkiV3HitDetail[] = [];
  const groups: Array<{ words: string[]; baseWeight: number; addToTop: boolean }> = [
    { words: lexicalExtremeWords, baseWeight: 1.5, addToTop: true },
    { words: lexicalHighBiasWords, baseWeight: 0.8, addToTop: true },
    { words: lexicalHumanSignals, baseWeight: -0.5, addToTop: false },
  ];
  for (const group of groups) {
    for (const token of group.words) {
      if (lexicalWhitelist.has(token)) continue;      const positions = literalMatchPositions(text, token);      if (positions.length === 0) continue;
      const tfWeight = Math.min((positions.length / charCount) * 100, 2.0);      const contribution = group.baseWeight * tfWeight;      score += contribution;
      const perHit = contribution / positions.length;      for (const position of positions) {
        hits.push({
          type: "lexical",
          matched: token,
          weight: roundTo(perHit, 6),
          position,
        });      }

      if (group.addToTop) increaseCounter(topHits, token, positions.length);    }
  }

  return { score, hits };}

function scorePhrases(text: string, topHits: Map<string, number>) {
  let score = 0;  const hits: CnkiV3HitDetail[] = [];
  const groups: Array<{ phrases: string[]; weight: number }> = [
    { phrases: phraseTier5, weight: 3.0 },
    { phrases: phraseTier4, weight: 2.0 },
    { phrases: phraseTier3, weight: 1.2 },
  ];
  for (const group of groups) {
    for (const phrase of group.phrases) {
      const positions = literalMatchPositions(text, phrase);      if (positions.length === 0) continue;      score += group.weight * positions.length;      for (const position of positions) {
        hits.push({
          type: "phrase",
          matched: phrase,
          weight: group.weight,
          position,
        });      }
      increaseCounter(topHits, phrase, positions.length);    }
  }

  const sentences = splitSentences(text);  let cursor = 0;  for (const sentence of sentences) {
    const start = text.indexOf(sentence, cursor);    if (start < 0) continue;    cursor = start + sentence.length;    if (sentenceOpenerPatterns.some((pattern) => pattern.test(sentence))) {
      score += 2.5;      hits.push({
        type: "phrase",
        matched: "sentence_opener",
        weight: 2.5,
        position: start,
      });      increaseCounter(topHits, "sentence_opener");    }
  }

  for (const triplet of conclusionTriplets) {
    if (triplet.every((token) => text.includes(token))) {
      score += 2.0;      for (const token of triplet) {
        hits.push({
          type: "phrase",
          matched: `conclusion_triplet:${token}`,
          weight: roundTo(2.0 / triplet.length, 6),
          position: text.indexOf(token),
        });      }
      increaseCounter(topHits, triplet.join("|"));    }
  }

  return { score, hits };}

function scoreStructure(text: string, context: ParagraphContext) {
  let score = 0;  const hits: CnkiV3HitDetail[] = [];
  const parallelMatchCount =
    regexMatchPositions(text, structuralRegexSets.parallelEnumeration[0]).length +
    regexMatchPositions(text, structuralRegexSets.parallelEnumeration[1]).length +
    regexMatchPositions(text, structuralRegexSets.parallelEnumeration[2]).length;  if (parallelMatchCount >= 2) {
    const contribution = 2.5 + (parallelMatchCount - 2) * 0.5;    score += contribution;    hits.push({ type: "structural", matched: "pattern_parallel_enumeration", weight: contribution, position: 0 });  }

  const enumCount = regexMatchPositions(text, structuralRegexSets.enumSequence).length;  if (enumCount >= 3) {
    const contribution = 2.0 + (enumCount - 3) * 0.3;    score += contribution;    hits.push({ type: "structural", matched: "pattern_enum_sequence", weight: contribution, position: 0 });  }

  const localAWithB = regexMatchPositions(text, structuralRegexSets.aWithB);  if (localAWithB.length > 0 && context.globalAWithBCount >= 6) {
    const extra = (context.globalAWithBCount - 6) * 0.2;    const contribution = Math.min(2.5 + Math.max(0, extra), 3.75);    score += contribution;    const eachWeight = contribution / localAWithB.length;    for (const pos of localAWithB) {
      hits.push({ type: "structural", matched: "pattern_a_with_b", weight: eachWeight, position: pos });    }
  }

  const progressiveMatches = regexMatchPositions(text, structuralRegexSets.progressive);  if (progressiveMatches.length > 0) {
    const contribution = progressiveMatches.length * 1.8;    score += contribution;    for (const pos of progressiveMatches) {
      hits.push({ type: "structural", matched: "pattern_progressive", weight: 1.8, position: pos });    }
  }

  const summaryMatches = regexMatchPositions(text, structuralRegexSets.summary);  if (summaryMatches.length > 0) {
    const contribution = summaryMatches.length * 1.5;    score += contribution;    for (const pos of summaryMatches) {
      hits.push({ type: "structural", matched: "pattern_summary_sentence", weight: 1.5, position: pos });    }
  }

  const modifierMatches = regexMatchPositions(text, structuralRegexSets.modifierStacking);  if (modifierMatches.length > 0) {
    const base = modifierMatches.length * 1.5;    const contribution = modifierMatches.length >= 3 ? base * 1.2 : base;    score += contribution;    const eachWeight = contribution / modifierMatches.length;    for (const pos of modifierMatches) {
      hits.push({ type: "structural", matched: "pattern_modifier_stacking", weight: eachWeight, position: pos });    }
  }

  for (const pattern of structuralRegexSets.definitionLike) {
    const definitionMatches = regexMatchPositions(text, pattern);    if (definitionMatches.length === 0) continue;    const contribution = definitionMatches.length * 1.3;    score += contribution;    for (const pos of definitionMatches) {
      hits.push({ type: "structural", matched: "pattern_definition_like", weight: 1.3, position: pos });    }
  }

  const hasProblem = problemSignals.some((phrase) => text.includes(phrase));  const hasSolution = solutionSignals.some((phrase) => text.includes(phrase));  if ((hasProblem && hasSolution) || (hasProblem && context.nextHasSolution) || (context.previousHasProblem && hasSolution)) {
    score += 2.0;    hits.push({ type: "structural", matched: "pattern_problem_solution", weight: 2.0, position: 0 });  }

  return { score, hits };}

function sentencePenalty(text: string, hits: CnkiV3HitDetail[]) {
  const sentences = splitSentences(text);  if (sentences.length === 0 || hits.length === 0) return 1;
  let penalty = 1;  let cursor = 0;  for (const sentence of sentences) {
    const start = text.indexOf(sentence, cursor);    if (start < 0) continue;    const end = start + sentence.length;    cursor = end;    const hitCount = hits.filter((hit) => hit.position >= start && hit.position < end).length;    if (hitCount >= 5) penalty = Math.max(penalty, CONFIG.sentencePenalty.n5);    else if (hitCount >= 3) penalty = Math.max(penalty, CONFIG.sentencePenalty.n3);  }
  return penalty;}

function scoreParagraph(text: string, context: ParagraphContext, topHits: Map<string, number>): CnkiV3ParagraphResult {
  const normalized = normalizeText(text);  const charCount = Math.max(1, normalized.replace(/\s+/g, "").length);
  const lexical = scoreLexical(normalized, charCount, topHits);  const phrase = scorePhrases(normalized, topHits);  const structural = scoreStructure(normalized, context);  const allHits = [...lexical.hits, ...phrase.hits, ...structural.hits];
  const densityMultiplier = densityMultiplierFromHitCount(allHits.length);  const perSentencePenalty = sentencePenalty(normalized, allHits);
  const rawScore =
    CONFIG.weights.alpha * lexical.score +
    CONFIG.weights.beta * phrase.score +
    CONFIG.weights.gamma * structural.score +
    CONFIG.weights.delta * densityMultiplier;  const finalScore = clamp(sigmoid(rawScore * perSentencePenalty + CONFIG.bias), 0, 1);
  return {
    text: normalized,
    score: finalScore,
    score100: roundTo(finalScore * 100, 2),
    riskLevel: riskLevelFromScore(finalScore),
    hits: allHits,
    densityMultiplier,
    breakdown: {
      f1Lexical: roundTo(lexical.score, 4),
      f2Phrase: roundTo(phrase.score, 4),
      f3Structural: roundTo(structural.score, 4),
      sentencePenalty: perSentencePenalty,
      rawScore: roundTo(rawScore, 4),
      finalScore: roundTo(finalScore, 6),
    },
    charCount,
  };}

function weightedAverageParagraphScore(paragraphs: CnkiV3ParagraphResult[]) {
  const totalChars = Math.max(1, paragraphs.reduce((sum, item) => sum + item.charCount, 0));  return paragraphs.reduce((sum, item) => sum + item.score * item.charCount, 0) / totalChars;}

function applyGlobalDensityBonus(score: number, paragraphs: CnkiV3ParagraphResult[]) {
  const total = paragraphs.length || 1;  const over50Ratio = paragraphs.filter((item) => item.score > 0.5).length / total;  const over70Ratio = paragraphs.filter((item) => item.score > 0.7).length / total;  if (over70Ratio >= 0.8) return clamp(score * CONFIG.globalDensityBonus.p80, 0, 1);  if (over50Ratio >= 0.6) return clamp(score * CONFIG.globalDensityBonus.p60, 0, 1);  return score;}

export function detectCnkiV3Document(text: string): CnkiV3DocumentResult {
  const paragraphs = splitParagraphs(text);  if (paragraphs.length === 0) {
    return {
      score: 0,
      riskLevel: "none",
      paragraphs: [],
      summary: {
        totalChars: 0,
        paragraphCount: 0,
        highRiskParagraphs: 0,
        topHitWords: [],
      },
    };  }

  const globalAWithBCount = paragraphs.reduce(
    (sum, paragraph) => sum + regexMatchPositions(paragraph, structuralRegexSets.aWithB).length,
    0,
  );  const hasProblem = paragraphs.map((paragraph) => problemSignals.some((signal) => paragraph.includes(signal)));  const hasSolution = paragraphs.map((paragraph) => solutionSignals.some((signal) => paragraph.includes(signal)));  const topHits = new Map<string, number>();
  const paragraphResults = paragraphs.map((paragraph, index) =>
    scoreParagraph(
      paragraph,
      {
        globalAWithBCount,
        previousHasProblem: index > 0 ? hasProblem[index - 1] : false,
        nextHasSolution: index < paragraphs.length - 1 ? hasSolution[index + 1] : false,
      },
      topHits,
    ),
  );
  const totalChars = paragraphResults.reduce((sum, item) => sum + item.charCount, 0);  const baseScore = weightedAverageParagraphScore(paragraphResults);  const score = applyGlobalDensityBonus(baseScore, paragraphResults);
  const topHitWords = [...topHits.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 12)
    .map(([word]) => word);
  return {
    score: roundTo(score, 6),
    riskLevel: riskLevelFromScore(score),
    paragraphs: paragraphResults,
    summary: {
      totalChars,
      paragraphCount: paragraphResults.length,
      highRiskParagraphs: paragraphResults.filter((item) => item.riskLevel === "high").length,
      topHitWords,
    },
  };}

export function detectCnkiV3Paragraph(paragraph: string): CnkiV3ParagraphResult {
  const normalized = normalizeText(paragraph);  const topHits = new Map<string, number>();  return scoreParagraph(
    normalized,
    {
      globalAWithBCount: regexMatchPositions(normalized, structuralRegexSets.aWithB).length,
      previousHasProblem: false,
      nextHasSolution: false,
    },
    topHits,
  );}










