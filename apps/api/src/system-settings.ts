import { z } from "zod";
import { academicPlatforms, defaultAcademicPlatform, getAcademicPlatformLabel, type AcademicPlatform } from "./academic-platforms";
export const taskExecutionModeValues = ["rules_only", "hybrid", "llm_only"] as const;
export const taskExecutionModeSchema = z.enum(taskExecutionModeValues);
export const algorithmTaskTypeValues = ["reduce-repeat", "reduce-ai", "detect"] as const;
export type AlgorithmTaskType = (typeof algorithmTaskTypeValues)[number];
const executionPlatformModesSchema = z.object({
  cnki: taskExecutionModeSchema,
  weipu: taskExecutionModeSchema,
  paperpass: taskExecutionModeSchema,
  wanfang: taskExecutionModeSchema,
  daya: taskExecutionModeSchema,
});
const executionPolicySchema = z.object({
  defaultMode: taskExecutionModeSchema,
  fallbackToRulesOnModelError: z.boolean(),
  platformModes: executionPlatformModesSchema,
});
const platformRegistryEntrySchema = z.object({
  enabled: z.boolean(),
  order: z.number().int().min(1).max(99),
});
const platformRegistrySchema = z.object({
  cnki: platformRegistryEntrySchema,
  weipu: platformRegistryEntrySchema,
  paperpass: platformRegistryEntrySchema,
  wanfang: platformRegistryEntrySchema,
  daya: platformRegistryEntrySchema,
});
const rewriteReplacementSchema = z.object({
  from: z.string().min(1).max(120),
  to: z.string().max(120),
});
const detectPhraseWeightSchema = z.object({
  phrase: z.string().min(1).max(120),
  weight: z.number().min(-20).max(20),
});
export const rewriteAlgorithmSlotSchema = z.object({
  enabled: z.boolean(),
  version: z.string().min(1).max(48),
  mode: taskExecutionModeSchema,
  fallbackToRulesOnModelError: z.boolean(),
  protectedTerms: z.array(z.string().min(1).max(64)).max(200),
  replacements: z.array(rewriteReplacementSchema).max(300),
  notes: z.array(z.string().min(1).max(200)).max(30),
});
export const detectAlgorithmSlotSchema = z.object({
  enabled: z.boolean(),
  version: z.string().min(1).max(48),
  mode: taskExecutionModeSchema,
  fallbackToRulesOnModelError: z.boolean(),
  scoreOffset: z.number().min(-50).max(50),
  phraseWeights: z.array(detectPhraseWeightSchema).max(200),
  notes: z.array(z.string().min(1).max(200)).max(30),
});
const rewriteSlotPatchSchema = z
  .object({
    enabled: z.boolean().optional(),
    version: z.string().min(1).max(48).optional(),
    mode: taskExecutionModeSchema.optional(),
    fallbackToRulesOnModelError: z.boolean().optional(),
    protectedTerms: z.array(z.string().min(1).max(64)).max(200).optional(),
    replacements: z.array(rewriteReplacementSchema).max(300).optional(),
    notes: z.array(z.string().min(1).max(200)).max(30).optional(),
  })
  .passthrough();
const detectSlotPatchSchema = z
  .object({
    enabled: z.boolean().optional(),
    version: z.string().min(1).max(48).optional(),
    mode: taskExecutionModeSchema.optional(),
    fallbackToRulesOnModelError: z.boolean().optional(),
    scoreOffset: z.number().min(-50).max(50).optional(),
    phraseWeights: z.array(detectPhraseWeightSchema).max(200).optional(),
    notes: z.array(z.string().min(1).max(200)).max(30).optional(),
  })
  .passthrough();
const rewritePlatformSlotSchema = z.object({
  cnki: rewriteAlgorithmSlotSchema,
  weipu: rewriteAlgorithmSlotSchema,
  paperpass: rewriteAlgorithmSlotSchema,
  wanfang: rewriteAlgorithmSlotSchema,
  daya: rewriteAlgorithmSlotSchema,
});
const detectPlatformSlotSchema = z.object({
  cnki: detectAlgorithmSlotSchema,
  weipu: detectAlgorithmSlotSchema,
  paperpass: detectAlgorithmSlotSchema,
  wanfang: detectAlgorithmSlotSchema,
  daya: detectAlgorithmSlotSchema,
});
export const algorithmTaskMatrixSchema = z.object({
  "reduce-repeat": rewritePlatformSlotSchema,
  "reduce-ai": rewritePlatformSlotSchema,
  detect: detectPlatformSlotSchema,
});
export const algorithmEngineSchema = z.object({
  rewrite: z.object({
    shortSentenceExpandThreshold: z.number().int().min(8).max(200),
    reorderAlternatingSentences: z.boolean(),
    appendEvidenceTailOnReduceAi: z.boolean(),
    maxSentenceCount: z.number().int().min(1).max(200),
  }),
  detect: z.object({
    dailyFreeLimit: z.number().int().min(0).max(50),
    baseScore: z.number().int().min(0).max(80),
    genericPhraseWeight: z.number().int().min(0).max(20),
    connectorWeight: z.number().int().min(0).max(20),
    citationMissingPenalty: z.number().int().min(0).max(40),
    lowDiversityThreshold: z.number().min(0.1).max(1),
    lowDiversityPenalty: z.number().int().min(0).max(40),
    uniformSentencePenalty: z.number().int().min(0).max(30),
    mediumRiskThreshold: z.number().int().min(0).max(100),
    highRiskThreshold: z.number().int().min(0).max(100),
  }),
  longform: z.object({
    defaultWordCount: z.number().int().min(1000).max(10000),
    maxWordCount: z.number().int().min(1000).max(20000),
    maxSections: z.number().int().min(3).max(10),
    includeModelAttribution: z.boolean(),
    includeEvidenceReminder: z.boolean(),
  }),
  points: z.object({
    detectCharsPerPoint: z.number().min(1).max(200),
    rewriteMinCost: z.number().int().min(1).max(500),
    reduceAiCostMultiplier: z.number().min(0.5).max(3),
    longformCharFactor: z.number().min(1).max(100),
    formatBaseCost: z.number().int().min(50).max(5000),
  }),
  platformRegistry: platformRegistrySchema,
  execution: z.object({
    rewrite: executionPolicySchema,
    detect: executionPolicySchema,
  }),
  taskMatrix: algorithmTaskMatrixSchema,
});
export const systemSettingsSchema = z.object({
  siteName: z.string().min(1),
  smtpHost: z.string().min(1),
  checkinPoints: z.number().int().positive(),
  algorithmEngine: algorithmEngineSchema,
});
export type AlgorithmEngineSettings = z.infer<typeof algorithmEngineSchema>;
export type SystemSettings = z.infer<typeof systemSettingsSchema>;
export type SystemSettingsSnapshot = SystemSettings;
export type TaskExecutionMode = z.infer<typeof taskExecutionModeSchema>;
export type RewriteAlgorithmSlot = z.infer<typeof rewriteAlgorithmSlotSchema>;
export type DetectAlgorithmSlot = z.infer<typeof detectAlgorithmSlotSchema>;
export type AlgorithmTaskMatrix = z.infer<typeof algorithmTaskMatrixSchema>;
export type PlatformRegistry = z.infer<typeof platformRegistrySchema>;
export type AlgorithmSlot = RewriteAlgorithmSlot | DetectAlgorithmSlot;
export type TaskExecutionTarget = AlgorithmTaskType;
export type AcademicPlatformConfig = {
  code: AcademicPlatform;
  label: string;
  enabled: boolean;
  order: number;
};
export type RulePackageSummary = {
  taskType: AlgorithmTaskType;
  platform: AcademicPlatform;
  platformLabel: string;
  enabled: boolean;
  mode: TaskExecutionMode;
  version: string;
  fallbackToRulesOnModelError: boolean;
  replacementCount?: number;
  protectedTermCount?: number;
  phraseWeightCount?: number;
  noteCount: number;
};
const defaultExecutionPlatformModes: Record<AcademicPlatform, TaskExecutionMode> = {
  cnki: "rules_only",
  weipu: "rules_only",
  paperpass: "rules_only",
  wanfang: "rules_only",
  daya: "rules_only",
};
const defaultPlatformRegistry: PlatformRegistry = {
  cnki: { enabled: true, order: 1 },
  weipu: { enabled: true, order: 2 },
  paperpass: { enabled: false, order: 3 },
  wanfang: { enabled: false, order: 4 },
  daya: { enabled: false, order: 5 },
};
const defaultRewriteProfiles: Record<
  AcademicPlatform,
  {
    protectedTerms: string[];
    replacements: Array<{ from: string; to: string }>;
    notes: string[];
  }
> = {
  cnki: {
    protectedTerms: ["知网", "AIGC", "摘要", "关键词", "参考文献", "结论"],
    replacements: [
      { from: "总之", to: "综合来看" },
      { from: "可以看出", to: "从文本表现来看" },
      { from: "显而易见", to: "在当前论述中较为明确" },
    ],
    notes: ["CNKI rewrite defaults"],
  },
  weipu: {
    protectedTerms: ["维普", "AIGC", "摘要", "关键词", "参考文献"],
    replacements: [
      { from: "总之", to: "整体而言" },
      { from: "可以看出", to: "可以进一步观察到" },
      { from: "值得注意的是", to: "需要重点关注的是" },
    ],
    notes: ["Weipu rewrite defaults"],
  },
  paperpass: {
    protectedTerms: ["PaperPass", "AIGC", "摘要", "关键词", "参考文献"],
    replacements: [
      { from: "总之", to: "综合来看" },
      { from: "可以看出", to: "从文本结构看" },
    ],
    notes: ["PaperPass rewrite defaults"],
  },
  wanfang: {
    protectedTerms: ["万方", "AIGC", "摘要", "关键词", "参考文献"],
    replacements: [
      { from: "总之", to: "总体来看" },
      { from: "可以看出", to: "由此能够观察到" },
    ],
    notes: ["Wanfang rewrite defaults"],
  },
  daya: {
    protectedTerms: ["大雅", "AIGC", "摘要", "关键词", "参考文献"],
    replacements: [
      { from: "总之", to: "综合而言" },
      { from: "可以看出", to: "从当前文本可以判断" },
    ],
    notes: ["Daya rewrite defaults"],
  },
};
const defaultDetectProfiles: Record<
  AcademicPlatform,
  {
    scoreOffset: number;
    phraseWeights: Array<{ phrase: string; weight: number }>;
    notes: string[];
  }
> = {
  cnki: {
    scoreOffset: 0,
    phraseWeights: [
      { phrase: "综上所述", weight: 3.2 },
      { phrase: "可以看出", weight: 2.8 },
      { phrase: "显而易见", weight: 3.4 },
    ],
    notes: ["CNKI detect defaults"],
  },
  weipu: {
    scoreOffset: 0.8,
    phraseWeights: [
      { phrase: "综上所述", weight: 2.9 },
      { phrase: "可以看出", weight: 2.6 },
      { phrase: "在一定程度上", weight: 2.4 },
    ],
    notes: ["Weipu detect defaults"],
  },
  paperpass: {
    scoreOffset: 1.5,
    phraseWeights: [
      { phrase: "综上所述", weight: 3.1 },
      { phrase: "首先", weight: 2.4 },
      { phrase: "其次", weight: 2.4 },
    ],
    notes: ["PaperPass detect defaults"],
  },
  wanfang: {
    scoreOffset: 0.5,
    phraseWeights: [
      { phrase: "综上所述", weight: 2.7 },
      { phrase: "进一步研究", weight: 2.3 },
      { phrase: "可以看出", weight: 2.5 },
    ],
    notes: ["Wanfang detect defaults"],
  },
  daya: {
    scoreOffset: 0.6,
    phraseWeights: [
      { phrase: "综上所述", weight: 2.8 },
      { phrase: "显而易见", weight: 3.0 },
      { phrase: "可以看出", weight: 2.6 },
    ],
    notes: ["Daya detect defaults"],
  },
};
function createDefaultRewriteSlot(taskType: "reduce-repeat" | "reduce-ai", platform: AcademicPlatform): RewriteAlgorithmSlot {
  const profile = defaultRewriteProfiles[platform];
  return {
    enabled: true,
    version: `${platform}-${taskType}-v2`,
    mode: "rules_only",
    fallbackToRulesOnModelError: true,
    protectedTerms: [...profile.protectedTerms],
    replacements: [...profile.replacements],
    notes: [...profile.notes, `Task slot: ${taskType}`],
  };
}

function createDefaultDetectSlot(platform: AcademicPlatform): DetectAlgorithmSlot {
  const profile = defaultDetectProfiles[platform];
  return {
    enabled: true,
    version: `${platform}-detect-v2`,
    mode: "rules_only",
    fallbackToRulesOnModelError: true,
    scoreOffset: profile.scoreOffset,
    phraseWeights: [...profile.phraseWeights],
    notes: [...profile.notes],
  };
}

function createRewritePlatformSlots(taskType: "reduce-repeat" | "reduce-ai"): Record<AcademicPlatform, RewriteAlgorithmSlot> {
  return {
    cnki: createDefaultRewriteSlot(taskType, "cnki"),
    weipu: createDefaultRewriteSlot(taskType, "weipu"),
    paperpass: createDefaultRewriteSlot(taskType, "paperpass"),
    wanfang: createDefaultRewriteSlot(taskType, "wanfang"),
    daya: createDefaultRewriteSlot(taskType, "daya"),
  };
}

function createDetectPlatformSlots(): Record<AcademicPlatform, DetectAlgorithmSlot> {
  return {
    cnki: createDefaultDetectSlot("cnki"),
    weipu: createDefaultDetectSlot("weipu"),
    paperpass: createDefaultDetectSlot("paperpass"),
    wanfang: createDefaultDetectSlot("wanfang"),
    daya: createDefaultDetectSlot("daya"),
  };
}

const defaultTaskMatrix: AlgorithmTaskMatrix = {
  "reduce-repeat": createRewritePlatformSlots("reduce-repeat"),
  "reduce-ai": createRewritePlatformSlots("reduce-ai"),
  detect: createDetectPlatformSlots(),
};
function clonePlain<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

const defaultSystemSettings: SystemSettings = {
  siteName: "Gewu",
  smtpHost: process.env.SMTP_HOST || "smtp.example.com",
  checkinPoints: 5,
  algorithmEngine: {
    rewrite: {
      shortSentenceExpandThreshold: 26,
      reorderAlternatingSentences: true,
      appendEvidenceTailOnReduceAi: true,
      maxSentenceCount: 60,
    },
    detect: {
      dailyFreeLimit: 5,
      baseScore: 18,
      genericPhraseWeight: 4,
      connectorWeight: 3,
      citationMissingPenalty: 10,
      lowDiversityThreshold: 0.45,
      lowDiversityPenalty: 14,
      uniformSentencePenalty: 12,
      mediumRiskThreshold: 40,
      highRiskThreshold: 70,
    },
    longform: {
      defaultWordCount: 3000,
      maxWordCount: 8000,
      maxSections: 5,
      includeModelAttribution: true,
      includeEvidenceReminder: true,
    },
    points: {
      detectCharsPerPoint: 10,
      rewriteMinCost: 20,
      reduceAiCostMultiplier: 1.08,
      longformCharFactor: 18,
      formatBaseCost: 400,
    },
    platformRegistry: clonePlain(defaultPlatformRegistry),
    execution: {
      rewrite: {
        defaultMode: "rules_only",
        fallbackToRulesOnModelError: true,
        platformModes: { ...defaultExecutionPlatformModes },
      },
      detect: {
        defaultMode: "rules_only",
        fallbackToRulesOnModelError: true,
        platformModes: { ...defaultExecutionPlatformModes },
      },
    },
    taskMatrix: clonePlain(defaultTaskMatrix),
  },
};
function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function deepMerge<T>(base: T, override: unknown): T {
  if (!isPlainObject(base) || !isPlainObject(override)) {
    return (override === undefined ? base : override) as T;
  }

  const result: Record<string, unknown> = { ...base };
  for (const [key, value] of Object.entries(override)) {
    const current = result[key];
    if (isPlainObject(current) && isPlainObject(value)) {
      result[key] = deepMerge(current, value);
      continue;
    }
    if (value !== undefined) {
      result[key] = value;
    }
  }
  return result as T;
}

function normalizeSystemSettings(input: unknown) {
  return systemSettingsSchema.safeParse(deepMerge(clonePlain(defaultSystemSettings), input));
}

export const systemSettings: SystemSettings = clonePlain(defaultSystemSettings);
export function getSystemSettings() {
  return systemSettings;
}

export function getAlgorithmEngineSettings() {
  return systemSettings.algorithmEngine;
}

export function normalizeAlgorithmTaskType(taskType: string): TaskExecutionTarget {
  if (taskType === "detect") return "detect";
  if (taskType === "reduce-ai") return "reduce-ai";
  return "reduce-repeat";
}

export function getAlgorithmSlot(taskType: string, platform?: AcademicPlatform): AlgorithmSlot {
  const target = normalizeAlgorithmTaskType(taskType);
  const resolvedPlatform = platform || defaultAcademicPlatform;
  return systemSettings.algorithmEngine.taskMatrix[target][resolvedPlatform];
}

export function getTaskExecutionSettings(taskType: string, platform?: AcademicPlatform) {
  const target = normalizeAlgorithmTaskType(taskType);
  const resolvedPlatform = platform || defaultAcademicPlatform;
  const slot = getAlgorithmSlot(target, resolvedPlatform);
  const legacyTarget: "rewrite" | "detect" = target === "detect" ? "detect" : "rewrite";
  const policy = systemSettings.algorithmEngine.execution[legacyTarget];
  const legacyMode = policy.platformModes[resolvedPlatform] || policy.defaultMode;
  return {
    target,
    platform: resolvedPlatform,
    configuredMode: slot.enabled ? slot.mode : legacyMode,
    fallbackToRulesOnModelError: slot.enabled ? slot.fallbackToRulesOnModelError : policy.fallbackToRulesOnModelError,
    slotEnabled: slot.enabled,
    slotVersion: slot.version,
  };
}

export function listAcademicPlatformConfigs(options?: { enabledOnly?: boolean }) {
  const enabledOnly = Boolean(options?.enabledOnly);
  const rows = academicPlatforms
    .map((code) => ({
      code,
      label: getAcademicPlatformLabel(code),
      enabled: systemSettings.algorithmEngine.platformRegistry[code].enabled,
      order: systemSettings.algorithmEngine.platformRegistry[code].order,
    }))
    .sort((left, right) => (left.order === right.order ? left.code.localeCompare(right.code) : left.order - right.order));
  return enabledOnly ? rows.filter((item) => item.enabled) : rows;
}

export function getEnabledAcademicPlatforms() {
  return listAcademicPlatformConfigs({ enabledOnly: true }).map((item) => item.code);
}

export function isAcademicPlatformEnabled(platform: AcademicPlatform) {
  return Boolean(systemSettings.algorithmEngine.platformRegistry[platform]?.enabled);
}

export function replaceAcademicPlatformRegistry(items: Array<{ code: AcademicPlatform; enabled: boolean; order: number }>) {
  const nextRegistry = clonePlain(systemSettings.algorithmEngine.platformRegistry);
  for (const item of items) {
    nextRegistry[item.code] = { enabled: item.enabled, order: item.order };
  }

  const parsed = platformRegistrySchema.parse(nextRegistry);
  if (Object.values(parsed).every((item) => item.enabled === false)) {
    throw new Error("At least one platform must remain enabled.");
  }

  systemSettings.algorithmEngine.platformRegistry = parsed;
  return listAcademicPlatformConfigs();
}

function bumpVersion(currentVersion: string, explicitVersion?: string) {
  if (explicitVersion && explicitVersion.trim().length > 0) return explicitVersion.trim();
  const matched = currentVersion.match(/^(.*)-v(\d+)$/i);
  if (!matched) return `${currentVersion}-v2`;
  return `${matched[1]}-v${Number(matched[2]) + 1}`;
}

function pickDefined<T>(incoming: T | undefined, fallback: T): T {
  return incoming === undefined ? fallback : incoming;
}

function mergeRewriteSlot(existing: RewriteAlgorithmSlot, patch: unknown) {
  const parsed = rewriteSlotPatchSchema.parse(patch);
  return rewriteAlgorithmSlotSchema.parse({
    enabled: pickDefined(parsed.enabled, existing.enabled),
    version: bumpVersion(existing.version, parsed.version),
    mode: pickDefined(parsed.mode, existing.mode),
    fallbackToRulesOnModelError: pickDefined(
      parsed.fallbackToRulesOnModelError,
      existing.fallbackToRulesOnModelError,
    ),
    protectedTerms: pickDefined(parsed.protectedTerms, existing.protectedTerms),
    replacements: pickDefined(parsed.replacements, existing.replacements),
    notes: pickDefined(parsed.notes, existing.notes),
  });
}

function mergeDetectSlot(existing: DetectAlgorithmSlot, patch: unknown) {
  const parsed = detectSlotPatchSchema.parse(patch);
  return detectAlgorithmSlotSchema.parse({
    enabled: pickDefined(parsed.enabled, existing.enabled),
    version: bumpVersion(existing.version, parsed.version),
    mode: pickDefined(parsed.mode, existing.mode),
    fallbackToRulesOnModelError: pickDefined(
      parsed.fallbackToRulesOnModelError,
      existing.fallbackToRulesOnModelError,
    ),
    scoreOffset: pickDefined(parsed.scoreOffset, existing.scoreOffset),
    phraseWeights: pickDefined(parsed.phraseWeights, existing.phraseWeights),
    notes: pickDefined(parsed.notes, existing.notes),
  });
}

export function upsertAlgorithmSlotFromPackage(input: {
  taskType: AlgorithmTaskType;
  platform: AcademicPlatform;
  packageData: unknown;
}) {
  if (input.taskType === "detect") {
    const existing = systemSettings.algorithmEngine.taskMatrix.detect[input.platform];
    const next = mergeDetectSlot(existing, input.packageData);
    systemSettings.algorithmEngine.taskMatrix.detect[input.platform] = next;
    return next;
  }

  const target: "reduce-repeat" | "reduce-ai" = input.taskType === "reduce-ai" ? "reduce-ai" : "reduce-repeat";
  const existing = systemSettings.algorithmEngine.taskMatrix[target][input.platform];
  const next = mergeRewriteSlot(existing, input.packageData);
  systemSettings.algorithmEngine.taskMatrix[target][input.platform] = next;
  return next;
}

export function resetAlgorithmSlotToDefault(input: { taskType: AlgorithmTaskType; platform: AcademicPlatform }) {
  if (input.taskType === "detect") {
    const reset = createDefaultDetectSlot(input.platform);
    systemSettings.algorithmEngine.taskMatrix.detect[input.platform] = reset;
    return reset;
  }

  const target: "reduce-repeat" | "reduce-ai" = input.taskType === "reduce-ai" ? "reduce-ai" : "reduce-repeat";
  const reset = createDefaultRewriteSlot(target, input.platform);
  systemSettings.algorithmEngine.taskMatrix[target][input.platform] = reset;
  return reset;
}

export function listRulePackages(): RulePackageSummary[] {
  const rows: RulePackageSummary[] = [];
  for (const taskType of algorithmTaskTypeValues) {
    for (const platform of academicPlatforms) {
      const slot = systemSettings.algorithmEngine.taskMatrix[taskType][platform];
      if (taskType === "detect") {
        const detectSlot = slot as DetectAlgorithmSlot;
        rows.push({
          taskType,
          platform,
          platformLabel: getAcademicPlatformLabel(platform),
          enabled: detectSlot.enabled,
          mode: detectSlot.mode,
          version: detectSlot.version,
          fallbackToRulesOnModelError: detectSlot.fallbackToRulesOnModelError,
          phraseWeightCount: detectSlot.phraseWeights.length,
          noteCount: detectSlot.notes.length,
        });
      } else {
        const rewriteSlot = slot as RewriteAlgorithmSlot;
        rows.push({
          taskType,
          platform,
          platformLabel: getAcademicPlatformLabel(platform),
          enabled: rewriteSlot.enabled,
          mode: rewriteSlot.mode,
          version: rewriteSlot.version,
          fallbackToRulesOnModelError: rewriteSlot.fallbackToRulesOnModelError,
          replacementCount: rewriteSlot.replacements.length,
          protectedTermCount: rewriteSlot.protectedTerms.length,
          noteCount: rewriteSlot.notes.length,
        });
      }
    }
  }

  return rows;
}

export function replaceSystemSettings(input: SystemSettings) {
  const parsed = systemSettingsSchema.parse(clonePlain(input));
  Object.assign(systemSettings, parsed);
  systemSettings.algorithmEngine = parsed.algorithmEngine;
  return systemSettings;
}

export function exportSystemSettingsSnapshot(): SystemSettingsSnapshot {
  return clonePlain(systemSettings);
}

export function hydrateSystemSettingsSnapshot(snapshot: Partial<SystemSettingsSnapshot> | null | undefined) {
  if (!snapshot) {
    return { hydrated: false as const };
  }

  const parsed = normalizeSystemSettings(snapshot);
  if (!parsed.success) {
    return { hydrated: false as const };
  }

  replaceSystemSettings(parsed.data);
  return { hydrated: true as const };
}






