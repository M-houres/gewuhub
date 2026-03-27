import { z } from "zod";
import { defaultAcademicPlatform, type AcademicPlatform } from "./academic-platforms";

export const taskExecutionModeValues = ["rules_only", "hybrid", "llm_only"] as const;
export const taskExecutionModeSchema = z.enum(taskExecutionModeValues);

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
  execution: z.object({
    rewrite: executionPolicySchema,
    detect: executionPolicySchema,
  }),
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
export type TaskExecutionTarget = "rewrite" | "detect";

const defaultExecutionPlatformModes: Record<AcademicPlatform, TaskExecutionMode> = {
  cnki: "rules_only",
  weipu: "rules_only",
  paperpass: "rules_only",
  wanfang: "rules_only",
  daya: "rules_only",
};

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
  },
};

function clonePlain<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

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

export function getTaskExecutionSettings(taskType: string, platform?: AcademicPlatform) {
  const target: TaskExecutionTarget = taskType === "detect" ? "detect" : "rewrite";
  const resolvedPlatform = platform ?? defaultAcademicPlatform;
  const policy = systemSettings.algorithmEngine.execution[target];

  return {
    target,
    platform: resolvedPlatform,
    configuredMode: policy.platformModes[resolvedPlatform] ?? policy.defaultMode,
    fallbackToRulesOnModelError: policy.fallbackToRulesOnModelError,
  };
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
