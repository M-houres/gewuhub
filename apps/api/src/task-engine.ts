import { defaultAcademicPlatform, getAcademicPlatformLabel, normalizeAcademicPlatform, type AcademicPlatform } from "./academic-platforms";
import { detectCnkiV3Document } from "./cnki-detect-v3";
import type { DetectDistributionBucket, DetectFragmentRecord, DetectHighlightKind, DetectMetricRecord, DetectReportModel } from "./detect-report-model";
import { getAlgorithmEngineSettings, getAlgorithmSlot, getTaskExecutionSettings, type DetectAlgorithmSlot, type RewriteAlgorithmSlot, type TaskExecutionMode } from "./system-settings";
import { rewriteAcademicContent } from "./rewrite-engine";

type RewriteVariant = "reduce-repeat" | "reduce-ai";

export type TaskEngineInput = {
  taskId: string;
  taskType: string;
  content: string;
  mode: string;
  provider: string;
  modelId: string;
  modelHasApiKey?: boolean;
  platform?: AcademicPlatform;
};

type ParsedStructuredContent = {
  fields: Record<string, string>;
  body: string;
  primaryText: string;
  title: string;
  subject: string;
  discipline: string;
  references: string;
  wordCount: number | null;
  platform: string;
  fileName: string;
};

type LanguageCode = "zh" | "en";

const fieldAliases: Record<string, string[]> = {
  taskType: ["任务类型", "Task Type"],
  platform: ["平台", "Platform"],
  language: ["语言", "Language"],
  title: ["标题", "题目", "Title", "Topic"],
  author: ["作者", "Author"],
  report: ["报告", "Report"],
  file: ["文件", "File"],
  subject: ["学科", "Subject"],
  discipline: ["一级学科", "Discipline"],
  detail: ["补充说明", "说明", "Detail", "Description"],
  wordCount: ["字数要求", "Word Count"],
  templateMode: ["模板模式", "Template"],
  references: ["自定义参考资料", "参考资料", "References"],
};

const reduceRepeatReplacements: Array<[RegExp, string]> = [
  [/首先/g, "第一"],
  [/其次/g, "另外"],
  [/最后/g, "最终"],
  [/非常/g, "较为"],
  [/总体来说/g, "综合来看"],
  [/\bfirst(?:ly)?\b/gi, "to begin with"],
  [/\bsecond(?:ly)?\b/gi, "in addition"],
  [/\bfinally\b/gi, "ultimately"],
  [/\bvery\b/gi, "relatively"],
];

const reduceAiReplacements: Array<[RegExp, string]> = [
  [/人工智能/g, "智能工具"],
  [/\bAI\b/g, "辅助系统"],
  [/因此/g, "由此可见"],
  [/总之/g, "综合来看"],
  [/可以看出/g, "从文本表现来看"],
  [/显然/g, "在当前语境下"],
  [/\bartificial intelligence\b/gi, "intelligent tooling"],
  [/\btherefore\b/gi, "as a result"],
  [/\bin conclusion\b/gi, "overall"],
  [/\bit is obvious that\b/gi, "within the current context"],
];

const genericAcademicPhrases = [
  "总之",
  "综上所述",
  "可以看出",
  "显而易见",
  "具有重要意义",
  "值得注意的是",
  "在一定程度上",
  "本文认为",
  "人工智能",
  "AI",
  "in conclusion",
  "overall",
  "it is obvious that",
  "it can be seen that",
  "artificial intelligence",
];

const connectorTokens = [
  "首先",
  "其次",
  "最后",
  "此外",
  "因此",
  "总之",
  "综上",
  "进一步",
  "同时",
  "first",
  "second",
  "finally",
  "therefore",
  "moreover",
  "furthermore",
  "meanwhile",
];

function normalizeText(value: string) {
  return value.replace(/\r/g, "").trim();
}

function detectPrimaryLanguage(text: string): LanguageCode {
  return /[\u4e00-\u9fff]/u.test(text) ? "zh" : "en";
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function parseStructuredContent(content: string): ParsedStructuredContent {
  const normalized = normalizeText(content);
  const lines = normalized.split("\n");
  const fields: Record<string, string> = {};
  const bodyLines: string[] = [];
  let bodyStarted = false;

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) {
      if (bodyStarted) bodyLines.push("");
      continue;
    }

    if (!bodyStarted) {
      let matchedField = false;
      for (const [field, aliases] of Object.entries(fieldAliases)) {
        const aliasPattern = aliases.map((alias) => escapeRegExp(alias)).join("|");
        const matched = line.match(new RegExp(`^(?:${aliasPattern})[:：]\\s*(.+)$`, "i"));
        if (matched?.[1]) {
          fields[field] = matched[1].trim();
          matchedField = true;
          break;
        }
      }
      if (matchedField) continue;
    }

    bodyStarted = true;
    bodyLines.push(line);
  }

  const body = bodyLines.join("\n").trim();
  const primaryText = body || fields.detail || fields.title || fields.references || fields.file || normalized;
  const wordCountMatch = (fields.wordCount || "").match(/(\d{3,6})/);

  return {
    fields,
    body,
    primaryText,
    title: fields.title || "",
    subject: fields.subject || "",
    discipline: fields.discipline || "",
    references: fields.references || "",
    wordCount: wordCountMatch?.[1] ? Number(wordCountMatch[1]) : null,
    platform: fields.platform || "",
    fileName: fields.file || "",
  };
}

function splitSentences(text: string) {
  return normalizeText(text)
    .split(/(?<=[。！？!?\.])\s*/u)
    .map((item) => item.trim())
    .filter(Boolean);
}

function applyReplacementSet(input: string, replacements: Array<[RegExp, string]>) {
  return replacements.reduce((result, [pattern, replacement]) => result.replace(pattern, replacement), input);
}

function reorderAtComma(input: string) {
  const matched = input.match(/^(.+?)[,，](.+)$/u);
  if (!matched) return input;
  const [, before, after] = matched;
  if (before.trim().length < 5 || after.trim().length < 5) return input;
  return `${after.trim()}，${before.trim()}`;
}

function ensureSentenceEnding(input: string, language: LanguageCode) {
  if (/[。！？!?\.]$/u.test(input)) return input;
  return `${input}${language === "zh" ? "。" : "."}`;
}

function appendShortSentenceExpansion(input: string, language: LanguageCode) {
  const base = input.replace(/[。！？!?\.]+$/u, "");
  if (language === "zh") {
    return `${base}，这样表达会更贴近论文写作语境。`;
  }
  return `${base}, which makes the paragraph read closer to human academic writing.`;
}

function appendEvidenceTail(input: string, language: LanguageCode) {
  const base = input.replace(/[。！？!?\.]+$/u, "");
  if (language === "zh") {
    return `${base}，并补充研究对象、证据来源与论证边界。`;
  }
  return `${base}, while clarifying the research object, evidence source, and argumentative boundary.`;
}

function expandSentence(input: string, variant: RewriteVariant, index: number, language: LanguageCode) {
  const engine = getAlgorithmEngineSettings();
  let output = variant === "reduce-repeat" ? applyReplacementSet(input, reduceRepeatReplacements) : applyReplacementSet(input, reduceAiReplacements);

  if (engine.rewrite.reorderAlternatingSentences) {
    const shouldReorder = variant === "reduce-repeat" ? index % 2 === 1 : index % 2 === 0;
    if (shouldReorder) {
      output = reorderAtComma(output);
    }
  }

  output = ensureSentenceEnding(output, language);

  if (output.replace(/\s+/g, "").length < engine.rewrite.shortSentenceExpandThreshold) {
    output = appendShortSentenceExpansion(output, language);
  }

  if (
    variant === "reduce-ai" &&
    engine.rewrite.appendEvidenceTailOnReduceAi &&
    !/研究|证据|数据|论证|research|evidence|dataset|argument/iu.test(output)
  ) {
    output = appendEvidenceTail(output, language);
  }

  return ensureSentenceEnding(output, language);
}

function rewriteContent(raw: string, variant: RewriteVariant) {
  const source = normalizeText(raw);
  const language = detectPrimaryLanguage(source);
  if (!source) {
    return language === "zh" ? "未检测到可处理文本。" : "No processable text was detected.";
  }

  const sentences = splitSentences(source);
  if (sentences.length === 0) return source;

  const engine = getAlgorithmEngineSettings();
  const limitedSentences = sentences.slice(0, engine.rewrite.maxSentenceCount);
  return limitedSentences.map((sentence, index) => expandSentence(sentence, variant, index, language)).join("\n");
}

function tokenize(text: string) {
  return normalizeText(text).match(/[\p{Script=Han}A-Za-z0-9]+/gu) || [];
}

function calculateVariance(values: number[]) {
  if (values.length === 0) return 0;
  const average = values.reduce((sum, value) => sum + value, 0) / values.length;
  return values.reduce((sum, value) => sum + (value - average) ** 2, 0) / values.length;
}

function buildRiskLevel(score: number) {
  const engine = getAlgorithmEngineSettings();
  if (score >= engine.detect.highRiskThreshold) return "high";
  if (score >= engine.detect.mediumRiskThreshold) return "medium";
  return "low";
}

function clampNumber(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function roundTo(value: number, digits = 2) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function formatPercent(value: number) {
  return `${roundTo(value, 2).toFixed(2)}%`;
}

function average(values: number[]) {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function toPercentDisplay(value: number, digits = 1) {
  return `${roundTo(value, digits).toFixed(digits)}%`;
}

function formatTimestamp(value: Date) {
  const parts = [
    value.getFullYear(),
    String(value.getMonth() + 1).padStart(2, "0"),
    String(value.getDate()).padStart(2, "0"),
  ];
  const time = [
    String(value.getHours()).padStart(2, "0"),
    String(value.getMinutes()).padStart(2, "0"),
    String(value.getSeconds()).padStart(2, "0"),
  ];
  return `${parts.join("-")} ${time.join(":")}`;
}

function buildDetectReportNo(platform: AcademicPlatform, taskId: string, value = new Date()) {
  const date = [
    value.getFullYear(),
    String(value.getMonth() + 1).padStart(2, "0"),
    String(value.getDate()).padStart(2, "0"),
  ].join("");
  return `${platform.toUpperCase()}AIGC_${date}_${taskId.toUpperCase()}`;
}

function highlightLabel(highlight: DetectHighlightKind, platform: AcademicPlatform) {
  if (platform === "cnki") {
    if (highlight === "significant") return "显著";
    if (highlight === "suspected") return "疑似";
    if (highlight === "skipped") return "未检测";
    return "未标识";
  }

  if (highlight === "significant") return "高风险";
  if (highlight === "suspected") return "中风险";
  if (highlight === "skipped") return "未检测";
  return "低风险";
}

function createDistributionBuckets(text: string, fragments: DetectFragmentRecord[], platform: AcademicPlatform): DetectDistributionBucket[] {
  const totalChars = Math.max(1, normalizeText(text).replace(/\s+/g, "").length);
  const bucketPlan = [
    { label: "前部20%", rangeLabel: "0%-20%", start: 0, end: 0.2 },
    { label: "中部60%", rangeLabel: "20%-80%", start: 0.2, end: 0.8 },
    { label: "后部20%", rangeLabel: "80%-100%", start: 0.8, end: 1 },
  ];

  let cursor = 0;
  const located = fragments.map((fragment) => {
    const start = cursor;
    const end = Math.min(totalChars, cursor + fragment.charCount);
    cursor = end;
    return { ...fragment, start, end };
  });

  return bucketPlan.map((bucket) => {
    const bucketStart = Math.floor(totalChars * bucket.start);
    const bucketEnd = Math.max(bucketStart + 1, Math.floor(totalChars * bucket.end));
    const bucketTotal = Math.max(1, bucketEnd - bucketStart);
    let significantChars = 0;
    let suspectedChars = 0;

    for (const fragment of located) {
      const overlap = Math.max(0, Math.min(bucketEnd, fragment.end) - Math.max(bucketStart, fragment.start));
      if (overlap <= 0) continue;
      if (fragment.highlight === "significant") significantChars += overlap;
      else if (fragment.highlight === "suspected") suspectedChars += overlap;
    }

    const score = platform === "cnki"
      ? roundTo((significantChars / bucketTotal) * 100, 1)
      : roundTo(((significantChars + suspectedChars) / bucketTotal) * 100, 1);

    return {
      label: bucket.label,
      rangeLabel: bucket.rangeLabel,
      totalChars: bucketTotal,
      significantChars,
      suspectedChars,
      score,
      scoreDisplay: toPercentDisplay(score),
    };
  });
}

function formatDetectReportOutput(report: DetectReportModel) {
  const lines = [`${report.platformLabel} AIGC Detection Report`, `Platform: ${report.platformLabel}`];

  if (report.platform === "cnki") {
    lines.push(`AI特征值: ${report.overallScoreDisplay}`);
    lines.push(`AI特征字符数: ${report.significantChars}`);
    lines.push(`AI特征疑似字符数: ${report.suspectedChars}`);
    lines.push(`总字符数: ${report.totalChars}`);
  } else {
    lines.push(`AIGC score: ${report.overallScoreDisplay}`);
    lines.push(`${report.significantLabel}: ${report.significantChars}`);
    lines.push(`${report.suspectedLabel}: ${report.suspectedChars}`);
    lines.push(`Total chars: ${report.totalChars}`);
  }

  lines.push(...report.metrics.map((item) => `${item.label} ${item.value}`));

  if (report.distribution.length > 0) {
    lines.push("Distribution:");
    lines.push(...report.distribution.map((item) => `- ${item.label} ${item.scoreDisplay}`));
  }

  if (report.fragments.length > 0) {
    lines.push("Fragments:");
    lines.push(
      ...report.fragments.map(
        (fragment) => `${fragment.title} | ${fragment.highlightLabel} | ${fragment.scoreDisplay} | ${fragment.text}`,
      ),
    );
  }

  if (report.summary) {
    lines.push(`Summary: ${report.summary}`);
  }
  if (report.methodology.length > 0) {
    lines.push(`Methodology: ${report.methodology.join(" ")}`);
  }
  if (report.notes.length > 0) {
    lines.push(`Suggestions: ${report.notes.join(" ")}`);
  }

  return lines.filter(Boolean).join("\n");
}

function buildPhrasePattern(phrase: string) {
  const asciiWord = /^[A-Za-z0-9][A-Za-z0-9\s-]*$/u.test(phrase);
  return new RegExp(asciiWord ? `\\b${escapeRegExp(phrase)}\\b` : escapeRegExp(phrase), "gi");
}

function countPhraseHits(text: string, phrases: string[]) {
  return phrases.reduce((sum, phrase) => sum + (text.match(buildPhrasePattern(phrase)) || []).length, 0);
}

function applyConfiguredRewriteReplacements(text: string, slot: RewriteAlgorithmSlot) {
  if (!slot.enabled || slot.replacements.length === 0) {
    return text;
  }

  return slot.replacements.reduce((output, rule) => {
    const from = rule.from.trim();
    if (!from) return output;
    return output.replace(buildPhrasePattern(from), rule.to);
  }, text);
}

function mergeProtectedTerms(baseTerms: string[], slot: RewriteAlgorithmSlot) {
  const merged = [...baseTerms, ...(slot.enabled ? slot.protectedTerms : [])]
    .map((item) => item.trim())
    .filter(Boolean);
  return Array.from(new Set(merged));
}

function applyDetectSlotAdjustments(raw: string, report: DetectReportModel, slot: DetectAlgorithmSlot) {
  const next: DetectReportModel = {
    ...report,
    metrics: [...report.metrics],
    notes: [...report.notes],
    methodology: [...report.methodology],
  };

  if (!slot.enabled) {
    next.notes.push(`Rule slot ${slot.version} is disabled; default detect algorithm output kept.`);
    return next;
  }

  let delta = slot.scoreOffset;
  const adjustmentItems: string[] = [];

  if (slot.scoreOffset !== 0) {
    adjustmentItems.push(`base:${slot.scoreOffset >= 0 ? "+" : ""}${slot.scoreOffset}`);
  }

  for (const rule of slot.phraseWeights) {
    const hits = countPhraseHits(raw, [rule.phrase]);
    if (hits <= 0) continue;
    const contribution = roundTo(hits * rule.weight, 2);
    delta += contribution;
    adjustmentItems.push(`${rule.phrase} x${hits} (${contribution >= 0 ? "+" : ""}${contribution})`);
  }

  if (delta !== 0) {
    const adjustedScore = clampNumber(roundTo(next.overallScore + delta, 2), 0, 100);
    next.overallScore = adjustedScore;
    next.overallScoreDisplay = formatPercent(adjustedScore);
  }

  if (adjustmentItems.length > 0) {
    next.metrics.push({
      label: "slotAdjustments:",
      value: `${delta >= 0 ? "+" : ""}${roundTo(delta, 2)} (${adjustmentItems.join("; ")})`,
    });
  }

  next.methodology.push(`Configured detect slot: ${slot.version}`);
  if (slot.notes.length > 0) {
    next.notes.push(...slot.notes);
  }
  next.notes.push(`Rule slot version: ${slot.version}`);

  return next;
}

function countCitationHits(text: string) {
  return (text.match(/(\[[0-9,\s-]+\]|\([A-Z][A-Za-z]+,\s*\d{4}\))/g) || []).length;
}

const detectPlatformProfiles: Record<AcademicPlatform, { guidance: string }> = {
  cnki: { guidance: "Align the final review with the selected CNKI-facing submission requirements." },
  weipu: { guidance: "Recheck the final report against the selected Weipu-facing submission requirements." },
  paperpass: { guidance: "Recheck the final report against the selected PaperPass-facing submission requirements." },
  wanfang: { guidance: "Recheck the final report against the selected Wanfang-facing submission requirements." },
  daya: { guidance: "Recheck the final report against the selected Daya-facing submission requirements." },
};

function buildGenericDetectAnalysis(
  raw: string,
  platform: AcademicPlatform,
  meta: DetectAlgorithmContext["meta"] & { taskId: string },
): DetectReportModel {
  const source = normalizeText(raw);
  const sentences = splitSentences(source);
  const tokens = tokenize(source);
  const engine = getAlgorithmEngineSettings();
  const profile = detectPlatformProfiles[platform];
  const uniqueRatio = tokens.length > 0 ? new Set(tokens.map((item) => item.toLowerCase())).size / tokens.length : 1;
  const genericHitCount = countPhraseHits(source, genericAcademicPhrases);
  const connectorHitCount = countPhraseHits(source, connectorTokens);
  const citationHitCount = countCitationHits(source);
  const sentenceLengths = sentences.map((item) => item.length);
  const averageSentenceLength = average(sentenceLengths);
  const sentenceStdDev = Math.sqrt(calculateVariance(sentenceLengths));

  let score = engine.detect.baseScore;
  score += Math.min(18, genericHitCount * engine.detect.genericPhraseWeight);
  score += Math.min(14, connectorHitCount * engine.detect.connectorWeight);
  if (source.length > 180 && citationHitCount === 0) score += engine.detect.citationMissingPenalty;
  if (uniqueRatio < engine.detect.lowDiversityThreshold) score += engine.detect.lowDiversityPenalty;
  if (sentences.length >= 3 && sentenceStdDev < Math.max(6, averageSentenceLength * 0.18)) score += engine.detect.uniformSentencePenalty;
  if (averageSentenceLength > 36) score += 6;
  score = Math.max(6, Math.min(96, Math.round(score)));

  const riskLevel = buildRiskLevel(score);
  const signals = [
    genericHitCount > 0 ? "template-like claims appear too often" : "",
    connectorHitCount > 0 ? "connectors repeat too frequently" : "",
    citationHitCount === 0 && source.length > 180 ? "long passage lacks citation anchors" : "",
    uniqueRatio < engine.detect.lowDiversityThreshold ? "lexical diversity is too low" : "",
    sentences.length >= 3 && sentenceStdDev < Math.max(6, averageSentenceLength * 0.18) ? "sentence lengths are unusually uniform" : "",
  ].filter(Boolean);

  const rankedSnippets = sentences
    .map((sentence) => {
      let snippetScore = 0;
      snippetScore += countPhraseHits(sentence, genericAcademicPhrases) * 3;
      snippetScore += countPhraseHits(sentence, connectorTokens) * 2;
      if (sentence.length > 36) snippetScore += 2;
      return { sentence, score: snippetScore };
    })
    .filter((item) => item.sentence.trim().length > 0)
    .sort((left, right) => right.score - left.score)
    .slice(0, 3);

  const suggestions = [
    "Rewrite the highest-risk sentences first and reduce repeated connectors or generic claims.",
    citationHitCount === 0 ? "Add citations, evidence sources, or concrete research objects before rechecking." : "",
    "Increase manual analysis, case details, and scope limitations to avoid over-smooth machine patterns.",
  ].filter(Boolean);

  const fragments: DetectFragmentRecord[] = sentences.map((sentence, index) => {
    const sentenceScore = clampNumber(
      countPhraseHits(sentence, genericAcademicPhrases) * 8 +
        countPhraseHits(sentence, connectorTokens) * 5 +
        (sentence.length > 36 ? 14 : 6) +
        (citationHitCount === 0 && sentence.length > 50 ? 8 : 0),
      8,
      92,
    );
    const highlight: DetectHighlightKind = sentenceScore >= 72 ? "significant" : sentenceScore >= 45 ? "suspected" : "neutral";
    return {
      id: `${platform}-fragment-${index + 1}`,
      title: `片段${index + 1}`,
      text: sentence,
      charCount: sentence.replace(/\s+/g, "").length,
      score: sentenceScore,
      scoreDisplay: toPercentDisplay(sentenceScore),
      highlight,
      highlightLabel: highlightLabel(highlight, platform),
    };
  });

  const significantChars = fragments
    .filter((item) => item.highlight === "significant")
    .reduce((sum, item) => sum + item.charCount, 0);
  const suspectedChars = fragments
    .filter((item) => item.highlight === "suspected")
    .reduce((sum, item) => sum + item.charCount, 0);

  return {
    platform,
    platformLabel: getAcademicPlatformLabel(platform),
    reportTitle: "AIGC检测 · 全文报告单",
    reportSubtitle: `${getAcademicPlatformLabel(platform)} 平台检测结果`,
    reportNo: buildDetectReportNo(platform, meta.taskId),
    generatedAt: formatTimestamp(meta.generatedAt),
    documentTitle: meta.documentTitle || deriveTopic(parseStructuredContent(raw)),
    author: meta.author,
    unit: meta.unit,
    fileName: meta.fileName,
    scoreLabel: "AIGC综合得分",
    overallScore: score,
    overallScoreDisplay: toPercentDisplay(score),
    totalChars: source.replace(/\s+/g, "").length,
    significantChars,
    suspectedChars,
    significantLabel: "高风险字符数",
    suspectedLabel: "中风险字符数",
    neutralLabel: "低风险 / 未标识",
    metrics: [
      { label: "Risk level:", value: riskLevel },
      { label: "Lexical diversity:", value: roundTo(uniqueRatio * 100, 1).toFixed(1) + "%" },
      { label: "Avg sentence length:", value: roundTo(averageSentenceLength, 1).toFixed(1) },
      { label: "Sentence std dev:", value: roundTo(sentenceStdDev, 1).toFixed(1) },
      { label: "Citation anchors:", value: String(citationHitCount) },
    ],
    distribution: createDistributionBuckets(source, fragments, platform),
    fragments: fragments
      .filter((item) => item.highlight !== "neutral")
      .sort((left, right) => right.score - left.score)
      .slice(0, 6),
    methodology: [
      "This branch uses public-facing platform heuristics and evaluates template-like language, connector repetition, evidence anchors, and sentence-shape uniformity.",
      profile.guidance,
    ],
    notes: [
      `Main signals: ${signals.length > 0 ? signals.join("; ") : "no dominant high-risk pattern detected"}`,
      `Suggestions: ${suggestions.join(" ")}`.trim(),
    ],
    summary: "当前分数用于定位高风险片段与优先改写顺序，不替代人工复核。",
  };
}

function cnkiRiskToHighlight(risk: "none" | "low" | "medium" | "high"): DetectHighlightKind {
  if (risk === "high") return "significant";
  if (risk === "medium" || risk === "low") return "suspected";
  return "neutral";
}

function buildCnkiDetectAnalysis(raw: string, meta: DetectAlgorithmContext["meta"] & { taskId: string }): DetectReportModel {
  const source = normalizeText(raw);
  const analysis = detectCnkiV3Document(source);
  const totalChars = Math.max(1, analysis.summary.totalChars || source.replace(/\s+/g, "").length);

  const fragments: DetectFragmentRecord[] = analysis.paragraphs.map((paragraph, index) => {
    const score = roundTo(paragraph.score * 100, 1);
    const highlight = cnkiRiskToHighlight(paragraph.riskLevel);

    return {
      id: `cnki-paragraph-${index + 1}`,
      title: `片段${index + 1}`,
      text: paragraph.text,
      charCount: paragraph.charCount,
      score,
      scoreDisplay: toPercentDisplay(score),
      highlight,
      highlightLabel: highlightLabel(highlight, "cnki"),
      metrics: [
        { label: "F1词汇层", value: paragraph.breakdown.f1Lexical.toFixed(2) },
        { label: "F2短语层", value: paragraph.breakdown.f2Phrase.toFixed(2) },
        { label: "F3句法层", value: paragraph.breakdown.f3Structural.toFixed(2) },
        { label: "密度乘数", value: paragraph.densityMultiplier.toFixed(2) },
      ],
    };
  });

  const significantChars = fragments
    .filter((item) => item.highlight === "significant")
    .reduce((sum, item) => sum + item.charCount, 0);
  const suspectedChars = fragments
    .filter((item) => item.highlight === "suspected")
    .reduce((sum, item) => sum + item.charCount, 0);

  const aiFeatureValue = roundTo((significantChars / totalChars) * 100, 1);
  const paragraphScoreDisplay = toPercentDisplay(analysis.score * 100);

  return {
    platform: "cnki",
    platformLabel: getAcademicPlatformLabel("cnki"),
    reportTitle: "AIGC检测 · 全文报告单",
    reportSubtitle: "知网规则引擎 v3（词汇+短语+句法+密度）",
    reportNo: buildDetectReportNo("cnki", meta.taskId),
    generatedAt: formatTimestamp(meta.generatedAt),
    documentTitle: meta.documentTitle || "未命名文档",
    author: meta.author,
    unit: meta.unit,
    fileName: meta.fileName,
    scoreLabel: "AI特征值",
    overallScore: aiFeatureValue,
    overallScoreDisplay: toPercentDisplay(aiFeatureValue),
    totalChars,
    significantChars,
    suspectedChars,
    significantLabel: "AI特征字符数",
    suspectedLabel: "AI特征疑似字符数",
    neutralLabel: "未标识部分",
    metrics: [
      { label: "段落加权综合概率", value: paragraphScoreDisplay },
      { label: "风险等级", value: analysis.riskLevel },
      { label: "高风险段落数", value: String(analysis.summary.highRiskParagraphs) },
      { label: "命中高频词", value: analysis.summary.topHitWords.slice(0, 8).join("、") || "无" },
      { label: "AI特征字符数", value: String(significantChars) },
      { label: "总字符数", value: String(totalChars) },
    ],
    distribution: createDistributionBuckets(source, fragments, "cnki"),
    fragments: fragments
      .filter((item) => item.highlight !== "neutral")
      .sort((left, right) => right.score - left.score)
      .slice(0, 8),
    methodology: [
      "规则来源：aigc_detection_engine_spec_v3（段落级评分）。",
      "特征层：F1词汇特征 + F2短语特征 + F3句法结构特征。",
      "惩罚层：段落命中密度乘数 + 句子级密度惩罚 + 全文跨段落密度加成。",
      "总分：按段落字数加权求和，输出风险分层与命中明细。",
    ],
    notes: [
      "说明：AI特征值 = 高风险段落字符数 / 全文字符数。",
      "说明：检测结果用于辅助判定，仍需结合人工复核。",
    ],
    summary: "当前知网分支已切换为 v3 规则引擎，报告字段与前端展示结构保持兼容。",
  };
}

type PaperpassFragmentLevel = "high" | "middle" | "low" | "none" | "skipped";

type PaperpassFragment = {
  text: string;
  charCount: number;
  overall: number;
  level: PaperpassFragmentLevel;
  ppl: number;
  burstiness: number;
  detail: Record<"electra" | "distil-bert" | "bloom" | "roberta" | "neo_gpt" | "bart", number>;
  tokenProbabilities: Array<{ token: string; probability: number }>;
};

const paperpassModelWeights = {
  electra: 0.22,
  "distil-bert": 0.13,
  bloom: 0.17,
  roberta: 0.16,
  neo_gpt: 0.17,
  bart: 0.15,
} as const;

function getPaperpassFragmentLevel(score: number): PaperpassFragmentLevel {
  if (score === -1) return "skipped";
  if (score >= 70) return "high";
  if (score >= 60) return "middle";
  if (score >= 50) return "low";
  return "none";
}

function getPaperpassLevelLabel(level: PaperpassFragmentLevel) {
  if (level === "high") return "高度疑似AI";
  if (level === "middle") return "中度疑似AI";
  if (level === "low") return "轻度疑似AI";
  if (level === "skipped") return "不予检测";
  return "人工写作";
}

function tokenizePaperpassHeatmap(text: string) {
  return text.match(/[\p{Script=Han}]{1,4}|[A-Za-z0-9-]+/gu) || [];
}

function buildPaperpassTokenProbabilities(text: string, overall: number, genericHitCount: number, connectorHitCount: number) {
  const baseProbability = clampNumber(0.25 + overall / 220, 0.25, 0.72);
  return tokenizePaperpassHeatmap(text)
    .slice(0, 18)
    .map((token) => {
      let probability = baseProbability;
      if (countPhraseHits(token, genericAcademicPhrases) > 0) probability += 0.08;
      if (countPhraseHits(token, connectorTokens) > 0) probability += 0.05;
      if (genericHitCount === 0 && connectorHitCount === 0) probability -= 0.06;
      if (token.length <= 1) probability -= 0.04;
      return {
        token,
        probability: roundTo(clampNumber(probability, 0.25, 0.75), 2),
      };
    });
}

function buildPaperpassFragmentReport(text: string, globalSentenceStdDev: number): PaperpassFragment {
  const normalized = text.trim();
  const charCount = normalized.replace(/\s+/g, "").length;

  if (charCount < 8) {
    return {
      text: normalized,
      charCount,
      overall: -1,
      level: "skipped",
      ppl: 0,
      burstiness: 0,
      detail: {
        electra: 0,
        "distil-bert": 0,
        bloom: 0,
        roberta: 0,
        neo_gpt: 0,
        bart: 0,
      },
      tokenProbabilities: [],
    };
  }

  const fragmentTokens = tokenize(normalized);
  const uniqueRatio =
    fragmentTokens.length > 0 ? new Set(fragmentTokens.map((item) => item.toLowerCase())).size / fragmentTokens.length : 1;
  const genericHitCount = countPhraseHits(normalized, genericAcademicPhrases);
  const connectorHitCount = countPhraseHits(normalized, connectorTokens);
  const citationHitCount = countCitationHits(normalized);
  const clauseLengths = normalized
    .split(/[，,；;：:]/u)
    .map((item) => item.trim())
    .filter(Boolean)
    .map((item) => item.length);
  const clauseMean = average(clauseLengths);
  const clauseStdDev = Math.sqrt(calculateVariance(clauseLengths));
  const uniformitySignal =
    clauseLengths.length >= 2 ? clampNumber((1 - Math.min(clauseStdDev / Math.max(clauseMean, 1), 1)) * 22, 0, 22) : 12;
  const diversitySignal = clampNumber((0.68 - uniqueRatio) * 120, 0, 22);
  const genericSignal = Math.min(genericHitCount * 7, 24);
  const connectorSignal = Math.min(connectorHitCount * 4.5, 16);
  const citationSignal = charCount > 110 && citationHitCount === 0 ? 8 : 0;
  const longSentenceSignal = charCount > 70 ? 5 : 0;
  const aiSignal = clampNumber(
    28 + genericSignal + connectorSignal + diversitySignal + uniformitySignal + citationSignal + longSentenceSignal,
    8,
    99,
  );

  const ppl = roundTo(clampNumber(36 - aiSignal * 0.28 + uniqueRatio * 8 + citationHitCount * 1.4, 4.2, 42), 2);
  const burstiness = roundTo(
    clampNumber(12 + clauseStdDev * 1.8 + globalSentenceStdDev * 0.15 - genericHitCount * 2.2 - connectorHitCount * 1.4, 8.2, 42),
    2,
  );
  const featureBoost = clampNumber((10 - ppl) * 2.2 + (15 - burstiness) * 1.4, 0, 18);
  const baseModelScore = clampNumber(aiSignal + featureBoost, 0, 99);

  const detail = {
    electra: roundTo(clampNumber(baseModelScore + 2.2, 0, 99), 1),
    "distil-bert": roundTo(clampNumber(baseModelScore - 0.8, 0, 99), 1),
    bloom: roundTo(clampNumber(baseModelScore + 1.4 + (citationHitCount === 0 ? 1.2 : 0), 0, 99), 1),
    roberta: roundTo(clampNumber(baseModelScore + genericHitCount * 0.6, 0, 99), 1),
    neo_gpt: roundTo(clampNumber(baseModelScore + connectorHitCount * 0.7 + 1, 0, 99), 1),
    bart: roundTo(clampNumber(baseModelScore + longSentenceSignal * 0.3 + 0.5, 0, 99), 1),
  };

  const weightedOverall =
    detail.electra * paperpassModelWeights.electra +
    detail["distil-bert"] * paperpassModelWeights["distil-bert"] +
    detail.bloom * paperpassModelWeights.bloom +
    detail.roberta * paperpassModelWeights.roberta +
    detail.neo_gpt * paperpassModelWeights.neo_gpt +
    detail.bart * paperpassModelWeights.bart;
  const overall = roundTo(
    clampNumber(weightedOverall - uniqueRatio * 4 + (citationHitCount === 0 ? 1.5 : -1.5), 0, 99),
    2,
  );

  return {
    text: normalized,
    charCount,
    overall,
    level: getPaperpassFragmentLevel(overall),
    ppl,
    burstiness,
    detail,
    tokenProbabilities: buildPaperpassTokenProbabilities(normalized, overall, genericHitCount, connectorHitCount),
  };
}

function buildPaperpassDetectAnalysis(raw: string, meta: DetectAlgorithmContext["meta"] & { taskId: string }): DetectReportModel {
  const source = normalizeText(raw);
  const fragments = splitSentences(source);
  const effectiveFragments = fragments.length > 0 ? fragments : source ? [source] : [];
  const globalSentenceStdDev = Math.sqrt(calculateVariance(effectiveFragments.map((item) => item.length)));
  const fragmentReports = effectiveFragments.map((fragment) => buildPaperpassFragmentReport(fragment, globalSentenceStdDev));
  const detectedFragments = fragmentReports.filter((item) => item.overall >= 0);
  const totalChars = detectedFragments.reduce((sum, item) => sum + item.charCount, 0);

  const score =
    totalChars > 0
      ? roundTo(detectedFragments.reduce((sum, item) => sum + item.charCount * item.overall, 0) / totalChars, 2)
      : 0;

  const ratioFor = (level: Exclude<PaperpassFragmentLevel, "skipped">) => {
    if (totalChars === 0) return 0;
    const matchedChars = detectedFragments
      .filter((item) => item.level === level)
      .reduce((sum, item) => sum + item.charCount, 0);
    return roundTo((matchedChars / totalChars) * 100, 2);
  };

  const highSuspectedTextRatio = ratioFor("high");
  const middleSuspectedTextRatio = ratioFor("middle");
  const lowSuspectedTextRatio = ratioFor("low");
  const noAISuspectedTextRatio = ratioFor("none");
  const highAndMiddleSuspectedTextRatio = roundTo(highSuspectedTextRatio + middleSuspectedTextRatio, 2);
  const totalSuspectedTextRatio = roundTo(highSuspectedTextRatio + middleSuspectedTextRatio + lowSuspectedTextRatio, 2);

  const tokenHeatmap = fragmentReports
    .flatMap((fragment) => fragment.tokenProbabilities)
    .slice(0, 18)
    .map((item) => `${item.token}:${item.probability.toFixed(2)}`);

  const suggestions = [
    highSuspectedTextRatio >= 40 ? "优先重写高疑似片段，先拆长句、换连接词、补研究对象与证据来源。" : "",
    totalSuspectedTextRatio >= 60 ? "整段模板化表达偏多，建议补入案例、限定条件和人工判断语句。" : "",
    "复检时尽量按平台逐段处理，不要对全文做机械式重复改写。",
  ].filter(Boolean);

  const mappedFragments: DetectFragmentRecord[] = fragmentReports.map((fragment, index) => ({
    id: `paperpass-fragment-${index + 1}`,
    title: `片段${index + 1}`,
    text: fragment.text,
    charCount: fragment.charCount,
    score: fragment.overall < 0 ? 0 : fragment.overall,
    scoreDisplay: fragment.overall < 0 ? "-1" : fragment.overall.toFixed(2) + "%",
    highlight:
      fragment.level === "high" ? "significant" : fragment.level === "middle" || fragment.level === "low" ? "suspected" : fragment.level === "skipped" ? "skipped" : "neutral",
    highlightLabel: getPaperpassLevelLabel(fragment.level),
    metrics:
      fragment.level === "skipped"
        ? undefined
        : [
            { label: "PPL：", value: fragment.ppl.toFixed(2) },
            { label: "Burstiness：", value: fragment.burstiness.toFixed(2) },
            { label: "Electra：", value: fragment.detail.electra.toFixed(1) },
            { label: "RoBERTa：", value: fragment.detail.roberta.toFixed(1) },
          ],
  }));

  const significantChars = mappedFragments
    .filter((item) => item.highlight === "significant")
    .reduce((sum, item) => sum + item.charCount, 0);
  const suspectedChars = mappedFragments
    .filter((item) => item.highlight === "suspected")
    .reduce((sum, item) => sum + item.charCount, 0);

  return {
    platform: "paperpass",
    platformLabel: getAcademicPlatformLabel("paperpass"),
    reportTitle: "AIGC检测 · 全文报告单",
    reportSubtitle: "PaperPass 平台检测结果",
    reportNo: buildDetectReportNo("paperpass", meta.taskId),
    generatedAt: formatTimestamp(meta.generatedAt),
    documentTitle: meta.documentTitle || "未命名文档",
    author: meta.author,
    unit: meta.unit,
    fileName: meta.fileName,
    scoreLabel: "AIGC综合得分",
    overallScore: score,
    overallScoreDisplay: formatPercent(score),
    totalChars,
    significantChars,
    suspectedChars,
    significantLabel: "高疑似字符数",
    suspectedLabel: "中 / 低疑似字符数",
    neutralLabel: "人工写作 / 未检测",
    metrics: [
      { label: "totalSuspectedTextRatio:", value: formatPercent(totalSuspectedTextRatio) },
      { label: "highAndMiddleSuspectedTextRatio:", value: formatPercent(highAndMiddleSuspectedTextRatio) },
      { label: "highSuspectedTextRatio:", value: formatPercent(highSuspectedTextRatio) },
      { label: "middleSuspectedTextRatio:", value: formatPercent(middleSuspectedTextRatio) },
      { label: "lowSuspectedTextRatio:", value: formatPercent(lowSuspectedTextRatio) },
      { label: "noAISuspectedTextRatio:", value: formatPercent(noAISuspectedTextRatio) },
    ],
    distribution: createDistributionBuckets(source, mappedFragments, "paperpass"),
    fragments: mappedFragments.filter((item) => item.highlight !== "neutral").slice(0, 10),
    methodology: [
      "PaperPass branch uses the current local ensemble simulation: PPL, burstiness, six-model weighted voting, and token heatmap sampling.",
      tokenHeatmap.length > 0 ? `Token heatmap sample: ${tokenHeatmap.join(", ")}` : "",
    ].filter(Boolean),
    notes: [
      `Suggestions: ${suggestions.join(" ")}`,
      "High + middle + low suspected ratios are preserved in the PDF report for downstream review.",
    ],
    summary: "该报告保留 PaperPass 风格的分段得分、PPL、Burstiness 和多模型明细。",
  };
}

function deriveTopic(parsed: ParsedStructuredContent) {
  return parsed.title || parsed.primaryText.slice(0, 64) || "Untitled academic topic";
}

function buildLongformSections(taskType: string, language: LanguageCode) {
  const zhSections: Record<string, string[]> = {
    literature: ["研究背景与问题提出", "核心研究路径梳理", "主要争议与方法分歧", "现有成果不足", "后续研究方向"],
    proposal: ["研究背景与意义", "研究目标与核心问题", "研究设计与技术路线", "创新点与可行性", "进度安排"],
    article: ["摘要", "引言", "研究设计", "结果分析", "结论与展望"],
    format: ["版式问题总览", "标题与层级建议", "图表与参考文献建议", "可直接执行的修改清单"],
    ppt: ["研究背景", "问题与方法", "关键结果", "讨论与价值", "答辩建议"],
    review: ["总体评价", "主要问题", "次要问题", "可改进方向", "建议结论"],
  };

  const enSections: Record<string, string[]> = {
    literature: ["Research background and problem framing", "Main research paths", "Core debates and methodological splits", "Current gaps", "Next-step directions"],
    proposal: ["Background and significance", "Research objectives", "Design and technical route", "Innovation and feasibility", "Timeline"],
    article: ["Abstract", "Introduction", "Research design", "Findings and analysis", "Conclusion and outlook"],
    format: ["Formatting overview", "Heading and hierarchy advice", "Figures and references advice", "Direct edit checklist"],
    ppt: ["Background", "Problem and method", "Key results", "Discussion and value", "Defense notes"],
    review: ["Overall assessment", "Major issues", "Minor issues", "Improvement directions", "Recommendation"],
  };

  const catalog = language === "zh" ? zhSections : enSections;
  return catalog[taskType] || catalog.literature;
}

function buildLongformParagraph(taskType: string, index: number, topic: string, subjectLabel: string, language: LanguageCode) {
  if (language === "zh") {
    const focusByIndex = [
      `首先界定“${topic}”在${subjectLabel}语境中的问题边界，并说明其在当前学术与实践场景中的现实意义。`,
      "进一步梳理已有研究的代表性路径，对比不同作者在概念界定、方法选取和证据组织上的差异。",
      "在此基础上归纳主要争议点，说明结论为何会因样本、口径或评价指标不同而发生偏移。",
      "结合前述分析，总结最值得继续深入的研究空白，并说明其理论与实践意义。",
      "最后给出可继续展开的写作或研究建议，明确后续补充数据、文献和案例的位置。",
    ];
    return focusByIndex[index] || focusByIndex[focusByIndex.length - 1];
  }

  const focusByIndex = [
    `Frame "${topic}" inside the ${subjectLabel} context and explain why the topic still matters in current academic practice.`,
    "Summarize representative research paths and compare how prior work differs in definitions, methods, and evidence structure.",
    "Clarify where the core debates come from and why conclusions shift across samples, metrics, or interpretive lenses.",
    "Identify the most actionable research gaps and explain their theoretical as well as practical relevance.",
    "Close with concrete follow-up writing or research directions, including where to extend evidence, citations, and cases.",
  ];
  return focusByIndex[index] || focusByIndex[focusByIndex.length - 1];
}

function buildLongformDraft(taskType: string, prompt: string, provider: string, modelId: string) {
  const parsed = parseStructuredContent(prompt);
  const sourceForLanguage = `${parsed.title}\n${parsed.primaryText}\n${parsed.references}`;
  const language = detectPrimaryLanguage(sourceForLanguage);
  const topic = deriveTopic(parsed);
  const subjectLabel = parsed.discipline || parsed.subject || (language === "zh" ? "未指定学科" : "unspecified discipline");
  const engine = getAlgorithmEngineSettings();
  const sectionTitles = buildLongformSections(taskType, language).slice(0, engine.longform.maxSections);

  const intro =
    language === "zh"
      ? `围绕“${topic}”这一主题，当前草稿从${subjectLabel}视角展开，重点强调问题链路、研究路径和可执行的后续方向。`
      : `This draft focuses on "${topic}" from the perspective of ${subjectLabel}, emphasizing the problem chain, research path, and executable next steps.`;

  const sections = sectionTitles.map((title, index) => {
    const heading = language === "zh" ? `${index + 1}. ${title}` : `${index + 1}. ${title}`;
    const paragraph = buildLongformParagraph(taskType, index, topic, subjectLabel, language);
    return `${heading}\n${paragraph}`;
  });

  const evidenceReminder = parsed.references
    ? language === "zh"
      ? `参考资料已纳入写作线索：${parsed.references.slice(0, 120)}`
      : `Reference cues already included: ${parsed.references.slice(0, 120)}`
    : engine.longform.includeEvidenceReminder
      ? language === "zh"
        ? "建议后续补充核心文献、数据来源和案例材料，以增强论证可靠性。"
        : "Add core citations, data sources, and cases in the next pass to strengthen the argument."
      : "";

  const parts = [
    language === "zh" ? `主题：${topic}` : `Topic: ${topic}`,
    language === "zh" ? `学科方向：${subjectLabel}` : `Discipline: ${subjectLabel}`,
    intro,
    ...sections,
    evidenceReminder,
  ].filter(Boolean);

  if (engine.longform.includeModelAttribution) {
    parts.push(`Generated by ${provider}/${modelId}`);
  }

  return parts.join("\n\n");
}

function buildOutputUrl(taskType: string, taskId: string) {
  if (taskType === "detect") {
    return `/api/v1/generated-files/detect/${taskId}.pdf`;
  }
  return `https://oss-example.gewu.local/results/${taskId}.docx`;
}

type RewriteAlgorithmContext = {
  raw: string;
  variant: RewriteVariant;
  extraProtectedTerms: string[];
};

type DetectAlgorithmContext = {
  taskId: string;
  raw: string;
  meta: {
    generatedAt: Date;
    documentTitle: string;
    author?: string;
    unit?: string;
    fileName?: string;
  };
};

type DetectAlgorithmResult = {
  output: string;
  report: DetectReportModel;
};

// CNKI is the currently specified ruleset. The remaining platform slots are routed explicitly
// so we can drop in their dedicated algorithms as soon as the user provides those specs.
const rewriteAlgorithms: Record<AcademicPlatform, (input: RewriteAlgorithmContext) => string> = {
  cnki: ({ raw, variant, extraProtectedTerms }) => rewriteAcademicContent(raw, variant, extraProtectedTerms, { platform: "cnki" }),
  weipu: ({ raw, variant, extraProtectedTerms }) => rewriteAcademicContent(raw, variant, extraProtectedTerms, { platform: "weipu" }),
  paperpass: ({ raw, variant, extraProtectedTerms }) =>
    rewriteAcademicContent(raw, variant, extraProtectedTerms, { platform: "paperpass" }),
  wanfang: ({ raw, variant, extraProtectedTerms }) => rewriteAcademicContent(raw, variant, extraProtectedTerms, { platform: "wanfang" }),
  daya: ({ raw, variant, extraProtectedTerms }) => rewriteAcademicContent(raw, variant, extraProtectedTerms, { platform: "daya" }),
};

const detectAlgorithms: Record<AcademicPlatform, (input: DetectAlgorithmContext) => DetectAlgorithmResult> = {
  cnki: ({ raw, taskId, meta }) => {
    const report = buildCnkiDetectAnalysis(raw, { ...meta, taskId });
    return { output: formatDetectReportOutput(report), report };
  },
  weipu: ({ raw, taskId, meta }) => {
    const report = buildGenericDetectAnalysis(raw, "weipu", { ...meta, taskId });
    return { output: formatDetectReportOutput(report), report };
  },
  paperpass: ({ raw, taskId, meta }) => {
    const report = buildPaperpassDetectAnalysis(raw, { ...meta, taskId });
    return { output: formatDetectReportOutput(report), report };
  },
  wanfang: ({ raw, taskId, meta }) => {
    const report = buildGenericDetectAnalysis(raw, "wanfang", { ...meta, taskId });
    return { output: formatDetectReportOutput(report), report };
  },
  daya: ({ raw, taskId, meta }) => {
    const report = buildGenericDetectAnalysis(raw, "daya", { ...meta, taskId });
    return { output: formatDetectReportOutput(report), report };
  },
};

const liveProviderApiKeyEnv: Record<string, string> = {
  deepseek: "DEEPSEEK_API_KEY",
  qwen: "QWEN_API_KEY",
  ernie: "ERNIE_API_KEY",
  glm: "GLM_API_KEY",
  spark: "SPARK_API_KEY",
  openai: "OPENAI_API_KEY",
  anthropic: "ANTHROPIC_API_KEY",
  gemini: "GEMINI_API_KEY",
};

function hasLiveModelExecution(provider: string, modelId: string, modelHasApiKey?: boolean) {
  void modelId;
  if (modelHasApiKey) return true;
  const envKey = liveProviderApiKeyEnv[provider.toLowerCase()];
  if (!envKey) return false;
  const secret = process.env[envKey];
  return typeof secret === "string" && secret.trim().length > 0;
}

function resolveExecutionMode(
  taskType: string,
  platform: AcademicPlatform,
  provider: string,
  modelId: string,
  modelHasApiKey?: boolean,
) {
  const executionSettings = getTaskExecutionSettings(taskType, platform);
  const liveModelAvailable = hasLiveModelExecution(provider, modelId, modelHasApiKey);
  const configuredMode = executionSettings.configuredMode;

  let effectiveMode: TaskExecutionMode = configuredMode;
  let fallbackApplied = false;
  let fallbackReason: string | undefined;

  if (configuredMode !== "rules_only" && !liveModelAvailable) {
    effectiveMode = "rules_only";
    fallbackApplied = true;
    fallbackReason = "real model adapter not connected yet";
  }

  return {
    target: executionSettings.target,
    platform,
    configuredMode,
    effectiveMode,
    liveModelAvailable,
    fallbackToRulesOnModelError: executionSettings.fallbackToRulesOnModelError,
    slotEnabled: executionSettings.slotEnabled,
    slotVersion: executionSettings.slotVersion,
    fallbackApplied,
    fallbackReason,
  };
}

export function estimateTaskPoints(input: { taskType: string; content: string; mode: string }) {
  const parsed = parseStructuredContent(input.content);
  const baseText = parsed.primaryText || input.content;
  const engine = getAlgorithmEngineSettings();
  const modeMultiplier = input.mode === "light" ? 0.85 : input.mode === "deep" ? 1.35 : 1;

  if (input.taskType === "detect") {
    return Math.max(1, Math.ceil((baseText.length / engine.points.detectCharsPerPoint) * modeMultiplier));
  }

  if (input.taskType === "literature" || input.taskType === "proposal" || input.taskType === "article") {
    const requestedWordCount =
      parsed.wordCount || Math.max(engine.longform.defaultWordCount, Math.min(engine.longform.maxWordCount, baseText.length * engine.points.longformCharFactor));
    return Math.ceil(requestedWordCount * modeMultiplier);
  }

  if (input.taskType === "format" || input.taskType === "ppt" || input.taskType === "review") {
    return Math.ceil(Math.max(engine.points.formatBaseCost, baseText.length * 2.2) * modeMultiplier);
  }

  const rewriteWeight = input.taskType === "reduce-ai" ? engine.points.reduceAiCostMultiplier : 1;
  return Math.ceil(Math.max(engine.points.rewriteMinCost, baseText.length * rewriteWeight) * modeMultiplier);
}

export function buildTaskResult(input: TaskEngineInput) {
  const parsed = parseStructuredContent(input.content);
  const baseText = parsed.primaryText;
  const platform = normalizeAcademicPlatform(input.platform || parsed.platform || defaultAcademicPlatform);
  const execution = resolveExecutionMode(input.taskType, platform, input.provider, input.modelId, input.modelHasApiKey);

  if (input.taskType === "detect") {
    const detectSlot = getAlgorithmSlot("detect", platform) as DetectAlgorithmSlot;
    const detectResult = detectAlgorithms[platform]({
      taskId: input.taskId,
      raw: baseText,
      meta: {
        generatedAt: new Date(),
        documentTitle: parsed.title || deriveTopic(parsed),
        author: parsed.fields.author || "",
        unit: parsed.fields.report || "",
        fileName: parsed.fileName || undefined,
      },
    });
    const adjustedReport = applyDetectSlotAdjustments(baseText, detectResult.report, detectSlot);

    return {
      output: formatDetectReportOutput(adjustedReport),
      outputUrl: buildOutputUrl(input.taskType, input.taskId),
      report: adjustedReport,
      execution,
    };
  }

  if (input.taskType === "reduce-repeat" || input.taskType === "reduce-ai") {
    const rewriteSlot = getAlgorithmSlot(input.taskType, platform) as RewriteAlgorithmSlot;
    const baseProtectedTerms = [parsed.title, parsed.subject, parsed.discipline].filter((item) => item && item.trim().length > 0);
    const extraProtectedTerms = mergeProtectedTerms(baseProtectedTerms, rewriteSlot);
    const rewritten = rewriteAlgorithms[platform]({
      raw: baseText,
      variant: input.taskType,
      extraProtectedTerms,
    });

    return {
      output: applyConfiguredRewriteReplacements(rewritten, rewriteSlot),
      outputUrl: buildOutputUrl(input.taskType, input.taskId),
      execution,
    };
  }

  if (["literature", "proposal", "article", "format", "ppt", "review"].includes(input.taskType)) {
    return {
      output: buildLongformDraft(input.taskType, input.content, input.provider, input.modelId),
      outputUrl: buildOutputUrl(input.taskType, input.taskId),
    };
  }

  return {
    output: `Task ${input.taskId} completed by ${input.provider}/${input.modelId}.`,
    outputUrl: buildOutputUrl(input.taskType, input.taskId),
  };
}

export function generateModelOutput(input: { provider: string; modelId: string; prompt: string; taskType?: string }) {
  const parsed = parseStructuredContent(input.prompt);
  const taskType =
    input.taskType?.toLowerCase() ||
    parsed.fields.taskType?.toLowerCase() ||
    (input.prompt.includes("文献综述") ? "literature" : "literature");

  return buildLongformDraft(taskType, input.prompt, input.provider, input.modelId);
}










