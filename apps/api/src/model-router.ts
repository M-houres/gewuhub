import { z } from "zod";
import { generateModelOutput } from "./task-engine";

export const modelProviders = [
  "deepseek",
  "qwen",
  "ernie",
  "glm",
  "spark",
  "openai",
  "anthropic",
  "gemini",
] as const;

export type ModelProvider = (typeof modelProviders)[number];

export const modelRouteInputSchema = z.object({
  provider: z.enum(modelProviders),
  modelId: z.string().min(1),
  prompt: z.string().min(1),
  taskType: z.string().min(1).optional(),
  temperature: z.number().min(0).max(2).default(0.7),
});

export type ModelRouteInput = z.infer<typeof modelRouteInputSchema>;

export type ModelRouteResult = {
  provider: ModelProvider;
  modelId: string;
  output: string;
  tokensUsed: number;
  traceId: string;
};

export type ModelRegistryItem = {
  id: string;
  provider: ModelProvider;
  modelId: string;
  displayName: string;
  enabled: boolean;
  pointMultiplier: number;
  hasApiKey: boolean;
  apiKey?: string;
  keyUpdatedAt?: string;
};

export const defaultModelRegistry: ModelRegistryItem[] = [
  { id: "mdl-1", provider: "deepseek", modelId: "deepseek-v3", displayName: "DeepSeek-V3", enabled: true, pointMultiplier: 1, hasApiKey: false },
  { id: "mdl-2", provider: "deepseek", modelId: "deepseek-r1", displayName: "DeepSeek-R1", enabled: true, pointMultiplier: 1.1, hasApiKey: false },
  { id: "mdl-3", provider: "qwen", modelId: "qwen-max", displayName: "Qwen-Max", enabled: true, pointMultiplier: 1.1, hasApiKey: false },
  { id: "mdl-4", provider: "ernie", modelId: "ernie-4.0", displayName: "ERNIE-4.0", enabled: true, pointMultiplier: 1.2, hasApiKey: false },
  { id: "mdl-5", provider: "glm", modelId: "glm-4", displayName: "GLM-4", enabled: true, pointMultiplier: 1, hasApiKey: false },
  { id: "mdl-6", provider: "spark", modelId: "spark-4.0", displayName: "Spark-4.0", enabled: true, pointMultiplier: 1, hasApiKey: false },
  { id: "mdl-7", provider: "openai", modelId: "gpt-4o", displayName: "GPT-4o", enabled: true, pointMultiplier: 1.6, hasApiKey: false },
  { id: "mdl-8", provider: "openai", modelId: "gpt-4o-mini", displayName: "GPT-4o-mini", enabled: true, pointMultiplier: 1.2, hasApiKey: false },
  { id: "mdl-9", provider: "anthropic", modelId: "claude-3-5-sonnet", displayName: "Claude 3.5 Sonnet", enabled: true, pointMultiplier: 1.5, hasApiKey: false },
  { id: "mdl-10", provider: "gemini", modelId: "gemini-1.5-pro", displayName: "Gemini 1.5 Pro", enabled: true, pointMultiplier: 1.4, hasApiKey: false },
];

function makeTraceId() {
  return `trace_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Phase-2 model router placeholder.
 * Real provider adapters are intentionally isolated behind this boundary.
 */
export async function routeModel(input: ModelRouteInput): Promise<ModelRouteResult> {
  const output = generateModelOutput({
    provider: input.provider,
    modelId: input.modelId,
    prompt: input.prompt,
    taskType: input.taskType,
  });

  return {
    provider: input.provider,
    modelId: input.modelId,
    output,
    tokensUsed: Math.max(32, Math.ceil((input.prompt.length + output.length) / 2)),
    traceId: makeTraceId(),
  };
}
