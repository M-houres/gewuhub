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

type InternalModelRouteInput = ModelRouteInput & {
  modelApiKey?: string;
};

export type ModelRouteResult = {
  provider: ModelProvider;
  modelId: string;
  output: string;
  tokensUsed: number;
  traceId: string;
  source?: "remote" | "fallback_local";
  fallbackReason?: string;
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

const providerApiKeyEnv: Record<ModelProvider, string> = {
  deepseek: "DEEPSEEK_API_KEY",
  qwen: "QWEN_API_KEY",
  ernie: "ERNIE_API_KEY",
  glm: "GLM_API_KEY",
  spark: "SPARK_API_KEY",
  openai: "OPENAI_API_KEY",
  anthropic: "ANTHROPIC_API_KEY",
  gemini: "GEMINI_API_KEY",
};

const providerBaseUrlEnv: Partial<Record<ModelProvider, string>> = {
  deepseek: "DEEPSEEK_BASE_URL",
  qwen: "QWEN_BASE_URL",
  ernie: "ERNIE_BASE_URL",
  glm: "GLM_BASE_URL",
  spark: "SPARK_BASE_URL",
  openai: "OPENAI_BASE_URL",
};

const defaultProviderBaseUrl: Partial<Record<ModelProvider, string>> = {
  deepseek: "https://api.deepseek.com",
  openai: "https://api.openai.com",
};

function makeTraceId() {
  return `trace_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function resolveApiKey(input: InternalModelRouteInput) {
  if (typeof input.modelApiKey === "string" && input.modelApiKey.trim().length > 0) {
    return input.modelApiKey.trim();
  }
  const envName = providerApiKeyEnv[input.provider];
  const envValue = process.env[envName];
  return typeof envValue === "string" ? envValue.trim() : "";
}

function resolveOpenAiCompatibleEndpoint(provider: ModelProvider) {
  const envName = providerBaseUrlEnv[provider];
  const fromEnv = envName ? process.env[envName] : undefined;
  const rawBase = typeof fromEnv === "string" && fromEnv.trim().length > 0 ? fromEnv.trim() : defaultProviderBaseUrl[provider] || "";
  if (!rawBase) return "";

  const base = rawBase.replace(/\/+$/, "");
  if (base.endsWith("/chat/completions")) return base;
  if (base.endsWith("/v1")) return `${base}/chat/completions`;
  return `${base}/v1/chat/completions`;
}

function extractOpenAiLikeOutput(payload: unknown): string {
  if (!payload || typeof payload !== "object") return "";
  const choices = (payload as { choices?: Array<{ message?: { content?: unknown }; text?: unknown }> }).choices;
  if (!Array.isArray(choices) || choices.length === 0) return "";

  const first = choices[0];
  if (typeof first?.message?.content === "string") return first.message.content.trim();
  if (typeof first?.text === "string") return first.text.trim();
  return "";
}

function extractTokenUsage(payload: unknown): number | undefined {
  if (!payload || typeof payload !== "object") return undefined;
  const usage = (payload as { usage?: { total_tokens?: unknown; totalTokenCount?: unknown } }).usage;
  if (!usage || typeof usage !== "object") return undefined;

  const value = typeof usage.total_tokens === "number" ? usage.total_tokens : usage.totalTokenCount;
  if (typeof value === "number" && Number.isFinite(value) && value > 0) return Math.ceil(value);
  return undefined;
}

function estimateTokens(prompt: string, output: string) {
  return Math.max(32, Math.ceil((prompt.length + output.length) / 2));
}

async function callOpenAiCompatible(input: InternalModelRouteInput, apiKey: string) {
  const endpoint = resolveOpenAiCompatibleEndpoint(input.provider);
  if (!endpoint) throw new Error("provider endpoint is not configured");

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 45_000);
  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: input.modelId,
        messages: [{ role: "user", content: input.prompt }],
        temperature: input.temperature,
        stream: false,
      }),
      signal: controller.signal,
    });

    const bodyText = await response.text();
    if (!response.ok) throw new Error(`provider request failed: ${response.status} ${response.statusText}`);

    const payload = JSON.parse(bodyText) as unknown;
    const output = extractOpenAiLikeOutput(payload);
    if (!output) throw new Error("provider response has no text output");

    return {
      output,
      tokensUsed: extractTokenUsage(payload),
    };
  } finally {
    clearTimeout(timeout);
  }
}

function buildFallbackOutput(input: InternalModelRouteInput): string {
  return generateModelOutput({
    provider: input.provider,
    modelId: input.modelId,
    prompt: input.prompt,
    taskType: input.taskType,
  });
}

/**
 * Real-adapter first, safe fallback second.
 * When key/adapter is unavailable, this route keeps business flow alive via local generation.
 */
export async function routeModel(input: InternalModelRouteInput): Promise<ModelRouteResult> {
  const traceId = makeTraceId();

  const fallback = (reason: string): ModelRouteResult => {
    const output = buildFallbackOutput(input);
    return {
      provider: input.provider,
      modelId: input.modelId,
      output,
      tokensUsed: estimateTokens(input.prompt, output),
      traceId,
      source: "fallback_local",
      fallbackReason: reason,
    };
  };

  const apiKey = resolveApiKey(input);
  if (!apiKey) return fallback("model api key is missing");

  if (input.provider === "anthropic" || input.provider === "gemini") {
    return fallback(`${input.provider} adapter is not connected yet`);
  }

  try {
    const remote = await callOpenAiCompatible(input, apiKey);
    return {
      provider: input.provider,
      modelId: input.modelId,
      output: remote.output,
      tokensUsed: typeof remote.tokensUsed === "number" ? remote.tokensUsed : estimateTokens(input.prompt, remote.output),
      traceId,
      source: "remote",
    };
  } catch (error) {
    return fallback(error instanceof Error && error.message ? error.message : "remote adapter failed");
  }
}
