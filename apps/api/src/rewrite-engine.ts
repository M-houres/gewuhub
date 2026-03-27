import { defaultAcademicPlatform, type AcademicPlatform } from "./academic-platforms";
import { getAlgorithmEngineSettings } from "./system-settings";

export type RewriteVariant = "reduce-repeat" | "reduce-ai";

type LanguageCode = "zh" | "en";

type WeightedCandidate = {
  value: string;
  weight: number;
};

type PhraseLexiconEntry = {
  source: string;
  pattern: RegExp;
  candidates: WeightedCandidate[];
};

type ProtectedFragment = {
  placeholder: string;
  value: string;
};

type SentenceTemplate = {
  id: string;
  score: number;
  test: (sentence: string) => boolean;
  transform: (sentence: string) => string;
};

type RewriteContext = {
  variant: RewriteVariant;
  platform: AcademicPlatform;
  language: LanguageCode;
  usageCounter: Map<string, number>;
  abstractBoost: boolean;
  protectedTerms: string[];
};

type RewritePassOptions = {
  forceSecondPass: boolean;
};

export type RewriteRuntimeOptions = {
  platform?: AcademicPlatform;
};

const ZH_PERIOD = "。";
const ZH_COMMA = "，";
const ZH_SEMICOLON = "；";

const coreProtectedTerms = [
  "AI学情诊断",
  "大单元教学",
  "跨学科协同",
  "跨学科主题学习",
  "劳动教育",
  "义务教育数学课程标准",
  "个性化作业设计",
  "基础教育",
];

const genericZhLexicon = buildPhraseLexicon([
  ["首先", [["第一", 5], ["先看", 4]]],
  ["其次", [["另外", 5], ["接着", 4]]],
  ["最后", [["最后来看", 5], ["最终", 4]]],
  ["非常", [["较为", 5], ["相当", 4]]],
  ["总体来说", [["综合来看", 5], ["整体来看", 4]]],
  ["总体而言", [["综合来看", 5], ["整体来说", 4]]],
  ["可以看出", [["能够发现", 5], ["可以发现", 4]]],
  ["具有重要意义", [["很有价值", 5], ["意义比较突出", 4]]],
  ["值得注意的是", [["需要注意的是", 5], ["更值得关注的是", 4]]],
  ["在一定程度上", [["从某种程度上", 5], ["一定程度上", 4]]],
  ["与此同时", [["同时", 5], ["此外", 4]]],
  ["因此", [["由此可见", 5], ["基于此", 4]]],
  ["总之", [["综合来看", 5], ["总体上说", 4]]],
  ["综上所述", [["综合来看", 5], ["整体上看", 4]]],
]);

const paperpassDegreeLexicon = buildPhraseLexicon([
  ["显著", [["十分明显", 5], ["较为突出", 4]]],
  ["明显", [["较为明显", 5], ["更加突出", 4]]],
  ["良好", [["较为扎实", 5], ["比较明确", 4]]],
  ["重要", [["较为关键", 5], ["十分关键", 4]]],
  ["效果明显", [["效果较为明确", 5], ["成效比较突出", 4]]],
  ["研究表明", [["已有研究表明", 5], ["已有证据显示", 4]]],
  ["研究认为", [["已有观点认为", 5], ["相关研究认为", 4]]],
  ["部分", [["相当一部分", 5], ["其中一部分", 4]]],
  ["某些", [["相当一部分", 5], ["一部分", 4]]],
  ["很多", [["不少", 5], ["较多", 4]]],
  ["大量", [["较多", 5], ["不少", 4]]],
  ["比较", [["相对", 4], ["较为", 5]]],
  ["十分", [["相当", 5], ["较为", 4]]],
  ["容易", [["更容易", 5], ["更可能", 4]]],
  ["充分", [["较为充分", 5], ["相对充分", 4]]],
]);

const paperpassFormalLexicon = buildPhraseLexicon([
  ["探讨", [["厘清", 5], ["梳理", 4]]],
  ["分析", [["梳理", 5], ["剖析", 4]]],
  ["对比分析", [["对照分析", 5], ["比较分析", 4]]],
  ["起步较晚", [["此前应用较晚", 5], ["前期起步较晚", 4]]],
  ["上世纪末", [["上个世纪末", 5]]],
  ["探究", [["梳理", 5], ["考察", 4]]],
  ["问题", [["症结", 5], ["问题", 2]]],
  ["做法", [["处理方式", 5], ["实施做法", 4]]],
  ["路径", [["实施路径", 5], ["推进路径", 4]]],
  ["方法", [["具体方法", 4], ["实施方式", 3]]],
  ["框架", [["整体结构", 5], ["分析框架", 4]]],
  ["机制", [["运作机制", 5], ["协同机制", 4]]],
]);

const paperpassVerbLexicon = buildPhraseLexicon([
  ["影响", [["产生直接影响", 5], ["带来明显影响", 4]]],
  ["促进", [["切实促进", 5], ["持续推动", 4]]],
  ["提升", [["进一步提升", 5], ["切实提升", 4]]],
  ["推动", [["持续推动", 5], ["稳步推进", 4]]],
  ["实现", [["逐步实现", 5], ["真正实现", 4]]],
  ["开展", [["组织开展", 5], ["持续开展", 4]]],
  ["形成", [["逐步形成", 5], ["进一步形成", 4]]],
  ["优化", [["持续优化", 5], ["进一步优化", 4]]],
  ["改善", [["持续改善", 5], ["进一步改善", 4]]],
  ["取得成效", [["取得较为明确的结果", 5], ["形成较为清楚的成效", 4]]],
  ["构建", [["逐步构建", 5], ["系统构建", 4]]],
  ["整合", [["统筹整合", 5], ["进一步整合", 4]]],
  ["完善", [["持续完善", 5], ["进一步完善", 4]]],
]);

const formalDowngradeLexicon = buildPhraseLexicon([
  ["日趋成熟", [["越来越成熟", 5]]],
  ["逐渐成为", [["逐渐成了", 5]]],
  ["尤为突出", [["格外突出", 5]]],
  ["尤为显著", [["格外明显", 5]]],
  ["缘由", [["原因", 5]]],
  ["而非", [["不是", 5]]],
  ["并非", [["并不是", 5], ["不是", 4]]],
  ["截然不同", [["完全不同", 5]]],
  ["已然", [["已经", 5]]],
  ["颇为", [["比较", 5], ["相当", 4]]],
  ["加以", [["进行", 5], ["去", 4]]],
  ["予以", [["给予", 5], ["给", 4]]],
  ["亟需", [["迫切需要", 5]]],
  ["着力", [["努力", 5], ["着重", 4]]],
  ["其余", [["其他", 5], ["剩下的", 4]]],
]);

const reduceRepeatEnReplacements: Array<[RegExp, string]> = [
  [/\bfirst(?:ly)?\b/gi, "to begin with"],
  [/\bsecond(?:ly)?\b/gi, "in addition"],
  [/\bfinally\b/gi, "ultimately"],
  [/\bvery\b/gi, "relatively"],
  [/\boverall\b/gi, "taken together"],
];

const reduceAiEnReplacements: Array<[RegExp, string]> = [
  [/\bhowever\b/gi, "but"],
  [/\btherefore\b/gi, "so"],
  [/\bin conclusion\b/gi, "overall"],
  [/\bit can be seen that\b/gi, "this shows"],
  [/\bit is obvious that\b/gi, "within this context"],
];

const sharedZhLexicon = mergePhraseLexicons(genericZhLexicon, paperpassDegreeLexicon, paperpassFormalLexicon, paperpassVerbLexicon);
const sharedEnReplacements = mergeEnglishReplacements(reduceAiEnReplacements, reduceRepeatEnReplacements);

const sharedSentenceTemplates: SentenceTemplate[] = [
  {
    id: "put-construction",
    score: 12,
    test: (sentence) => /(^|[，,])将[^，。；]{1,40}?(转化为|纳入|融入|作为|视为|变成)/u.test(sentence),
    transform: (sentence) =>
      sentence.replace(/(^|[，,])将([^，。；]{1,40}?)(转化为|纳入|融入|作为|视为|变成)/gu, "$1把$2$3"),
  },
  {
    id: "different-from",
    score: 11,
    test: (sentence) => /^不同于.+?[，,]/u.test(sentence),
    transform: (sentence) => sentence.replace(/^不同于(.+?)[，,](.+)$/u, "和$1不一样，$2"),
  },
  {
    id: "core-not-a-but-b",
    score: 10,
    test: (sentence) => /核心不在于.+?而在于/u.test(sentence),
    transform: (sentence) =>
      sentence.replace(/核心不在于(.+?)[，,]?\s*而在于(.+?)([。！？!?]?$)/u, "核心不是$1，而是$2$3"),
  },
  {
    id: "not-only",
    score: 7,
    test: (sentence) => /不仅.+?(还|而且|更).+/u.test(sentence),
    transform: (sentence) => sentence.replace(/不仅(.+?)(?:，|,)?(?:还|而且|更)(.+)/u, "不但$1，还$2"),
  },
  {
    id: "even-if",
    score: 6,
    test: (sentence) => /虽然.+?但是.+/u.test(sentence),
    transform: (sentence) => sentence.replace(/虽然(.+?)但是(.+)/u, "虽说$1，但$2"),
  },
];

export function rewriteAcademicContent(
  raw: string,
  variant: RewriteVariant,
  extraProtectedTerms: string[] = [],
  options: RewriteRuntimeOptions = {},
) {
  const source = normalizeText(raw);
  const language = detectPrimaryLanguage(source);

  if (!source) {
    return language === "zh" ? "未检测到可处理文本。" : "No processable text was detected.";
  }

  const engine = getAlgorithmEngineSettings();
  const platform = options.platform ?? defaultAcademicPlatform;
  const abstractBoost = /(^|\n)\s*(摘要|abstract)[:：]?/iu.test(source) || /(目的|方法|结果|结论)[:：】]/u.test(source);
  const protectedTerms = collectProtectedTerms(source, extraProtectedTerms);
  const usageCounter = new Map<string, number>();
  const lines = source.split("\n");
  let processedSentenceCount = 0;
  let inReferenceSection = false;

  const rewrittenLines = lines.map((line, lineIndex) => {
    const trimmed = line.trim();
    if (!trimmed) {
      return "";
    }

    if (inReferenceSection) {
      return trimmed;
    }

    if (isReferenceHeading(trimmed)) {
      inReferenceSection = true;
      return trimmed;
    }

    if (shouldLockLine(trimmed, lineIndex)) {
      return trimmed;
    }

    let normalizedLine = stripFormattingMarks(trimmed);
    if (language === "zh" && platform === "paperpass") {
      normalizedLine = applyPaperpassParagraphRules(normalizedLine);
    }

    const sentenceUnits = splitSentences(normalizedLine);
    const rewrittenUnits = sentenceUnits.map((sentence) => {
      if (processedSentenceCount >= engine.rewrite.maxSentenceCount) {
        return sentence;
      }

      processedSentenceCount += 1;
      return rewriteSentenceWithQuality(sentence, {
        variant,
        platform,
        language,
        usageCounter,
        abstractBoost,
        protectedTerms,
      });
    });

    return joinSentences(rewrittenUnits, language);
  });

  return rewrittenLines.join("\n");
}

function normalizeText(value: string) {
  return value.replace(/\r/g, "").trim();
}

function detectPrimaryLanguage(text: string): LanguageCode {
  return /[\u4e00-\u9fff]/u.test(text) ? "zh" : "en";
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function buildPhraseLexicon(entries: Array<[string, Array<[string, number]>]>) {
  return entries
    .map(([source, candidates]) => ({
      source,
      pattern: new RegExp(escapeRegExp(source), "gu"),
      candidates: candidates.map(([value, weight]) => ({ value, weight })),
    }))
    .sort((left, right) => right.source.length - left.source.length);
}

function mergePhraseLexicons(...lexicons: PhraseLexiconEntry[][]) {
  const merged = new Map<string, WeightedCandidate[]>();

  for (const lexicon of lexicons) {
    for (const entry of lexicon) {
      const existing = merged.get(entry.source) ?? [];
      const seen = new Set(existing.map((candidate) => candidate.value));

      for (const candidate of entry.candidates) {
        if (!seen.has(candidate.value)) {
          existing.push(candidate);
          seen.add(candidate.value);
        }
      }

      merged.set(entry.source, existing);
    }
  }

  return Array.from(merged.entries())
    .map(([source, candidates]) => ({
      source,
      pattern: new RegExp(escapeRegExp(source), "gu"),
      candidates,
    }))
    .sort((left, right) => right.source.length - left.source.length);
}

function mergeEnglishReplacements(...replacementSets: Array<Array<[RegExp, string]>>) {
  const merged = new Map<string, [RegExp, string]>();

  for (const replacementSet of replacementSets) {
    for (const [pattern, replacement] of replacementSet) {
      const key = `${pattern.source}:${pattern.flags}`;
      if (!merged.has(key)) {
        merged.set(key, [pattern, replacement]);
      }
    }
  }

  return Array.from(merged.values());
}

function splitSentences(text: string) {
  return normalizeText(text)
    .split(/(?<=[。！？!?\.])\s*/u)
    .map((item) => item.trim())
    .filter(Boolean);
}

function joinSentences(sentences: string[], language: LanguageCode) {
  const separator = language === "zh" ? "" : " ";
  return sentences.join(separator).trim();
}

function isReferenceHeading(line: string) {
  return /^(参考文献|references?)[:：]?\s*$/iu.test(line);
}

function shouldLockLine(line: string, lineIndex: number) {
  if (/^(关键词|key words?)[:：]/iu.test(line)) {
    return true;
  }

  if (/^(摘要|abstract)[:：]?\s*$/iu.test(line)) {
    return true;
  }

  if (/^\[[0-9]+\]/u.test(line)) {
    return true;
  }

  if (/[|│┆\t]/u.test(line)) {
    return true;
  }

  if (
    /^([一二三四五六七八九十]+[、.）)]|（[一二三四五六七八九十0-9]+）|\([0-9]+\)|[0-9]+[、.)])/u.test(line) &&
    line.length <= 80
  ) {
    return true;
  }

  if (lineIndex === 0 && line.length <= 80 && !/[。！？!?]/u.test(line)) {
    return true;
  }

  return false;
}

function collectProtectedTerms(source: string, extraProtectedTerms: string[]) {
  const normalizedTerms = [...coreProtectedTerms, ...extraProtectedTerms]
    .map((term) => normalizeText(term))
    .filter((term) => term.length >= 2 && term.length <= 40 && source.includes(term));

  return Array.from(new Set(normalizedTerms)).sort((left, right) => right.length - left.length);
}

function rewriteSentenceWithQuality(sentence: string, context: RewriteContext) {
  const original = sentence.trim();
  if (!original) {
    return original;
  }

  const firstPass = rewriteSentenceCore(original, context, { forceSecondPass: false });
  const firstSimilarity = calculateSimilarity(original, firstPass);
  const needsSecondPass = firstSimilarity > 0.97 || (context.abstractBoost && firstSimilarity > 0.88);

  const candidate = needsSecondPass ? rewriteSentenceCore(original, context, { forceSecondPass: true }) : firstPass;
  const finalOutput = candidate.trim();
  const finalSimilarity = calculateSimilarity(original, finalOutput);

  if (finalSimilarity < 0.42) {
    return ensureSentenceEnding(original, context.language);
  }

  if (!hasProtectedTerms(original, finalOutput, context.protectedTerms)) {
    return ensureSentenceEnding(original, context.language);
  }

  return ensureSentenceEnding(finalOutput, context.language);
}

function rewriteSentenceCore(sentence: string, context: RewriteContext, options: RewritePassOptions) {
  const masked = maskProtectedFragments(sentence, context.protectedTerms);
  let output = masked.output;

  if (context.language === "zh") {
    output = normalizePunctuation(output, context.language);
    output = applySharedSentenceTemplates(output);

    if (context.platform === "paperpass") {
      output = applyPaperpassZhRewrite(output, context, options);
    } else {
      output = applyGenericZhRewrite(output, context, options);
    }

    output = normalizePunctuation(output, context.language);
    output = splitLongSentence(output, context.language);
  } else {
    output = applyEnglishRewrite(output);
  }

  output = restoreProtectedFragments(output, masked.fragments);
  return cleanupSpacing(output, context.language);
}

function applyGenericZhRewrite(sentence: string, context: RewriteContext, options: RewritePassOptions) {
  let output = sentence;
  output = applyPhraseLexicon(output, genericZhLexicon, context.usageCounter, options.forceSecondPass);
  output = applyPhraseLexicon(output, formalDowngradeLexicon, context.usageCounter, options.forceSecondPass);
  output = normalizeSemicolonFlow(output);
  output = replaceCommonModalWords(output);
  return output;
}

function applyPaperpassZhRewrite(sentence: string, context: RewriteContext, options: RewritePassOptions) {
  let output = sentence;
  output = applyPhraseLexicon(output, sharedZhLexicon, context.usageCounter, options.forceSecondPass);
  output = applyPhraseLexicon(output, formalDowngradeLexicon, context.usageCounter, options.forceSecondPass);
  output = applyPaperpassParallelSeries(output);
  output = applyPaperpassSubjectFronting(output);
  output = normalizeSemicolonFlow(output);
  output = replaceCommonModalWords(output);
  output = injectPaperpassLead(output, context, options);
  output = injectPaperpassEvaluation(output);
  return output;
}

function applyPhraseLexicon(
  sentence: string,
  lexicon: PhraseLexiconEntry[],
  usageCounter: Map<string, number>,
  forceSecondPass: boolean,
) {
  let output = sentence;

  for (const entry of lexicon) {
    output = output.replace(entry.pattern, () => pickCandidate(entry.candidates, usageCounter, forceSecondPass));
  }

  return output;
}

function pickCandidate(candidates: WeightedCandidate[], usageCounter: Map<string, number>, forceSecondPass: boolean) {
  const ranked = candidates
    .map((candidate, index) => {
      const usage = usageCounter.get(candidate.value) ?? 0;
      const usagePenalty = usage === 0 ? 1 : usage === 1 ? 0.55 : 0.15;
      const diversityBonus = forceSecondPass && usage === 0 ? 0.35 : 0;
      return {
        candidate,
        index,
        score: candidate.weight * usagePenalty + diversityBonus - index * 0.001,
      };
    })
    .sort((left, right) => right.score - left.score || left.index - right.index);

  const choice = ranked[0]?.candidate ?? candidates[0];
  if (!choice) return "";

  usageCounter.set(choice.value, (usageCounter.get(choice.value) ?? 0) + 1);
  return choice.value;
}

function applySharedSentenceTemplates(sentence: string) {
  let output = sentence.replace(/能否/gu, "能不能");

  const matched = sharedSentenceTemplates
    .filter((template) => template.test(output))
    .sort((left, right) => right.score - left.score)[0];

  if (matched) {
    output = matched.transform(output);
  }

  return output;
}

function normalizeSemicolonFlow(sentence: string) {
  return sentence.replace(/[；;]+/gu, ZH_COMMA);
}

function replaceCommonModalWords(sentence: string) {
  return sentence
    .replace(/(^|[，。；\s])其(?=[\u4e00-\u9fff])/gu, "$1它的")
    .replace(/(^|[，。；\s])该(?=[\u4e00-\u9fff])/gu, "$1这")
    .replace(/能够/gu, "可以");
}

function applyPaperpassParallelSeries(sentence: string) {
  let output = sentence;

  output = output.replace(
    /((?:[^，。；]{1,10}、){2,}[^，。；]{1,10})等(方面|部门|方式|措施|路径|环节|形式|维度)/gu,
    "$1诸$2",
  );
  output = output.replace(/((?:[^，。；]{1,10}、){2,}[^，。；]{1,10})等(?=[，。；])/gu, "$1诸方面");

  return output;
}

function applyPaperpassSubjectFronting(sentence: string) {
  let output = sentence;

  output = output.replace(/被([^，。；]{1,16}?)(认为|视为|用于|纳入)/gu, "$1$2");
  output = output.replace(/对([^，。；]{1,20}?)(产生直接影响|带来明显影响|有影响)/gu, "$1会$2");

  return output;
}

function injectPaperpassLead(sentence: string, context: RewriteContext, options: RewritePassOptions) {
  if (/^(首先|其次|再次|最后|另外|同时|此外|因此|由此可见|基于此|进一步看|在此基础上|毋庸讳言)/u.test(sentence)) {
    return sentence;
  }

  if (/(问题|症结|困难|挑战|缺乏|不足|参差不齐|不完善|不及时|有限)/u.test(sentence)) {
    return `毋庸讳言，${sentence}`;
  }

  if (/(结果|结论|表明|说明|显示|价值|意义)/u.test(sentence) || context.abstractBoost) {
    const lead = pickCandidate(
      [
        { value: "进一步看", weight: 5 },
        { value: "在此基础上", weight: 4.5 },
        { value: "由此可见", weight: 4.2 },
      ],
      context.usageCounter,
      options.forceSecondPass,
    );
    return `${lead}${ZH_COMMA}${sentence}`;
  }

  return sentence;
}

function injectPaperpassEvaluation(sentence: string) {
  if (/(这一点是比较明确的|这一判断较为稳妥|这一点比较关键)/u.test(sentence)) {
    return sentence;
  }

  if (/(效果|成效|提升|促进|改善|优势|价值|结果|意义)/u.test(sentence)) {
    const body = sentence.replace(/[。！？!?]+$/u, "");
    return `${body}，这一点是比较明确的`;
  }

  return sentence;
}

function applyEnglishRewrite(sentence: string) {
  return sharedEnReplacements.reduce((result, [pattern, replacement]) => result.replace(pattern, replacement), sentence);
}

function normalizePunctuation(sentence: string, language: LanguageCode) {
  let output = sentence;

  output = output.replace(/\s*[,，]\s*/gu, language === "zh" ? ZH_COMMA : ", ");
  output = output.replace(/\s*[;；]+\s*/gu, language === "zh" ? ZH_COMMA : ", ");
  output = output.replace(/\s*[—–-]{2,}\s*/gu, language === "zh" ? ZH_COMMA : ", ");
  output = output.replace(/[，]{2,}/gu, ZH_COMMA);
  output = output.replace(/[。]{2,}/gu, ZH_PERIOD);

  return output;
}

function splitLongSentence(sentence: string, language: LanguageCode) {
  if (language !== "zh" || sentence.length <= 90) {
    return sentence;
  }

  const stripped = sentence.replace(/[。！？!?]+$/u, "");
  const parts = stripped
    .split(/[，]/u)
    .map((part) => part.trim())
    .filter(Boolean);

  if (parts.length < 3) {
    return sentence;
  }

  const rebuilt: string[] = [];
  let bucket = "";

  for (const part of parts) {
    const next = bucket ? `${bucket}${ZH_COMMA}${part}` : part;
    if (next.length > 62 && bucket) {
      rebuilt.push(bucket);
      bucket = part;
      continue;
    }
    bucket = next;
  }

  if (bucket) {
    rebuilt.push(bucket);
  }

  if (rebuilt.length < 2) {
    return sentence;
  }

  return rebuilt.map((part) => ensureSentenceEnding(part, language)).join("");
}

function ensureSentenceEnding(sentence: string, language: LanguageCode) {
  const trimmed = sentence.trim();
  if (!trimmed) {
    return trimmed;
  }

  if (/[。！？!?\.]$/u.test(trimmed)) {
    return trimmed;
  }

  return `${trimmed}${language === "zh" ? ZH_PERIOD : "."}`;
}

function cleanupSpacing(sentence: string, language: LanguageCode) {
  if (language === "zh") {
    return sentence
      .replace(/\s*([，。！？；：])/gu, "$1")
      .replace(/([，。！？；：])\s*/gu, "$1")
      .trim();
  }

  return sentence.replace(/\s+/g, " ").trim();
}

function stripFormattingMarks(input: string) {
  return input
    .replace(/<\/?[^>]+>/gu, "")
    .replace(/&nbsp;/gu, " ")
    .replace(/\.(?:mark|highlight)\b/gu, "")
    .replace(/\s+/gu, " ")
    .trim();
}

function applyPaperpassParagraphRules(input: string) {
  let output = input;
  output = flattenAbstractLabels(output);
  output = serializeProblemParagraph(output);
  return output;
}

function flattenAbstractLabels(input: string) {
  const matches = Array.from(
    input.matchAll(/(?:【)?(目的|方法|结果|结论)(?:】|[:：])\s*([\s\S]*?)(?=(?:【?(?:目的|方法|结果|结论)(?:】|[:：]))|$)/gu),
  );

  if (matches.length < 2) {
    return input;
  }

  const content = new Map(matches.map((item) => [item[1], item[2].trim()]));
  const rebuilt: string[] = [];

  if (content.get("目的")) {
    rebuilt.push(`本文的目的很明确：${content.get("目的")}`);
  }
  if (content.get("方法")) {
    rebuilt.push(`具体方法是：${content.get("方法")}`);
  }
  if (content.get("结果")) {
    rebuilt.push(`研究结果显示：${content.get("结果")}`);
  }
  if (content.get("结论")) {
    rebuilt.push(`因此可以得出这样的结论：${content.get("结论")}`);
  }

  if (rebuilt.length === 0) {
    return input;
  }

  return `${rebuilt.map((part) => ensureSentenceEnding(part, "zh")).join("")}整体来看，这样的表达更接近人工学术写作。`;
}

function serializeProblemParagraph(input: string) {
  if (/^(首先|其次|再次|最后)/u.test(input)) {
    return input;
  }

  const rawClauses = input
    .split(/[；;]/u)
    .map((item) => item.trim())
    .filter(Boolean);

  const issueClauses = rawClauses.filter((clause) => /(问题|困难|挑战|不足|缺乏|不完善|不统一|参差不齐|有限|不及时)/u.test(clause));
  if (rawClauses.length < 4 || issueClauses.length < 3) {
    return input;
  }

  const markers = ["首先", "其次", "再次", "最后"];
  const rebuilt = rawClauses.map((clause, index) => `${markers[index] ?? `第${index + 1}`}${ZH_COMMA}${clause.replace(/[。！？!?]+$/u, "")}`);
  rebuilt.push("因此，要解决这些问题，就必须继续围绕关键环节做细化调整。");
  return rebuilt.map((part) => ensureSentenceEnding(part, "zh")).join("");
}

function maskProtectedFragments(sentence: string, protectedTerms: string[]) {
  let output = sentence;
  const fragments: ProtectedFragment[] = [];

  const reserve = (value: string) => {
    const placeholder = `__lock_${indexToLetters(fragments.length)}__`;
    fragments.push({ placeholder, value });
    return placeholder;
  };

  const maskPattern = (pattern: RegExp) => {
    output = output.replace(pattern, (matched) => reserve(matched));
  };

  maskPattern(/“[^”\n]{1,120}”/gu);
  maskPattern(/‘[^’\n]{1,120}’/gu);
  maskPattern(/《[^》\n]{1,120}》/gu);
  maskPattern(/\[[0-9,\s-]+\]/gu);
  maskPattern(/\([A-Z][A-Za-z]+,\s*\d{4}[a-z]?\)/gu);

  for (const term of protectedTerms) {
    output = output.replace(new RegExp(escapeRegExp(term), "gu"), (matched) => reserve(matched));
  }

  maskPattern(/[\u4e00-\u9fff]{2,24}(?:大学|学院|研究院|出版社|教育部|国务院|委员会|学校)/gu);
  maskPattern(/\b[A-Z]{2,}(?:-[A-Z0-9]+)*\b/g);
  maskPattern(/(?:19|20)\d{2}年?/g);
  maskPattern(/\d+(?:\.\d+)?[%％]/gu);
  maskPattern(/\b\d+(?:\.\d+)?\b/g);

  return { output, fragments };
}

function restoreProtectedFragments(sentence: string, fragments: ProtectedFragment[]) {
  return fragments.reduce((result, fragment) => result.replace(fragment.placeholder, fragment.value), sentence);
}

function indexToLetters(index: number) {
  let value = index;
  let result = "";

  do {
    result = String.fromCharCode(97 + (value % 26)) + result;
    value = Math.floor(value / 26) - 1;
  } while (value >= 0);

  return result;
}

function hasProtectedTerms(original: string, rewritten: string, protectedTerms: string[]) {
  const requiredTerms = [
    ...protectedTerms.filter((term) => original.includes(term)),
    ...(original.match(/“[^”\n]{1,120}”/gu) ?? []),
    ...(original.match(/‘[^’\n]{1,120}’/gu) ?? []),
    ...(original.match(/《[^》\n]{1,120}》/gu) ?? []),
    ...(original.match(/\[[0-9,\s-]+\]/gu) ?? []),
    ...(original.match(/\([A-Z][A-Za-z]+,\s*\d{4}[a-z]?\)/gu) ?? []),
    ...(original.match(/\b[A-Z]{2,}(?:-[A-Z0-9]+)*\b/g) ?? []),
  ];

  return requiredTerms.every((term) => rewritten.includes(term));
}

function calculateSimilarity(left: string, right: string) {
  const normalizedLeft = normalizeSimilarityInput(left);
  const normalizedRight = normalizeSimilarityInput(right);

  if (!normalizedLeft && !normalizedRight) {
    return 1;
  }

  if (!normalizedLeft || !normalizedRight) {
    return 0;
  }

  const leftLength = normalizedLeft.length;
  const rightLength = normalizedRight.length;
  const dp = Array.from({ length: leftLength + 1 }, () => new Array<number>(rightLength + 1).fill(0));

  for (let i = 1; i <= leftLength; i += 1) {
    for (let j = 1; j <= rightLength; j += 1) {
      if (normalizedLeft[i - 1] === normalizedRight[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
      }
    }
  }

  const lcs = dp[leftLength][rightLength];
  return (2 * lcs) / (leftLength + rightLength);
}

function normalizeSimilarityInput(value: string) {
  return value.replace(/\s+/g, "").replace(/[，。！？；：,.!?;:]/gu, "").trim();
}
