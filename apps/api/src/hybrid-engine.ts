// 混合模式：本地算法 + 大模型
export type ExecutionMode = "rules_only" | "llm_only" | "hybrid";

export async function executeTask(params: {
  content: string;
  platform: string;
  taskType: string;
  mode: ExecutionMode;
  modelConfig?: any;
}) {
  const { content, platform, taskType, mode, modelConfig } = params;

  // 模式1: 纯本地算法
  if (mode === "rules_only") {
    return executeLocalRules(content, platform, taskType);
  }

  // 模式2: 纯大模型
  if (mode === "llm_only") {
    if (!modelConfig) throw new Error("大模型配置缺失");
    return executeLLM(content, taskType, modelConfig);
  }

  // 模式3: 混合模式
  const localResult = await executeLocalRules(content, platform, taskType);

  if (modelConfig) {
    const llmResult = await executeLLM(localResult.content, taskType, modelConfig);
    return { ...llmResult, localScore: localResult.score };
  }

  return localResult;
}

async function executeLocalRules(content: string, platform: string, taskType: string) {
  // 简化实现：直接返回内容
  return { content, score: 0 };
}

async function executeLLM(content: string, taskType: string, config: any) {
  // 调用大模型API
  return { content: content, score: 0 };
}
