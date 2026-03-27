"use client";

import { getValidSession, toApiUrl } from "@/lib/auth";
import { ChevronDown, ChevronRight, CircleHelp, Copy, Download, History } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";

type LongformTaskType = "literature" | "proposal" | "article" | "format" | "ppt" | "review";
type ClientTaskStatus = "idle" | "submitting" | "queued" | "running" | "completed" | "failed";
type TemplateMode = "none" | "format" | "full";

type LongformGeneratorProps = {
  title: string;
  subtitle: string;
  placeholder: string;
  submitText: string;
  taskType: LongformTaskType;
};

type ModelOption = {
  id: string;
  provider: string;
  modelId: string;
  displayName: string;
  pointMultiplier: number;
};

type TaskCancelResponse = {
  message?: string;
  pointsRefunded?: boolean;
};

type StreamMetaPayload = {
  taskId?: string;
  status?: "queued" | "running" | "completed" | "failed";
  pointsCost?: number;
};

type StreamChunkPayload = {
  taskId?: string;
  chunk?: string;
};

type StreamCompletePayload = {
  taskId?: string;
  output?: string;
};

const fallbackModels: ModelOption[] = [
  {
    id: "mdl-fallback-1",
    provider: "deepseek",
    modelId: "deepseek-v3",
    displayName: "DeepSeek-V3",
    pointMultiplier: 1,
  },
  {
    id: "mdl-fallback-2",
    provider: "qwen",
    modelId: "qwen-max",
    displayName: "Qwen-Max",
    pointMultiplier: 1.1,
  },
];

const defaultMode = "balanced";

const subjectOptions = ["教育学", "计算机科学", "管理学", "经济学", "法学"];
const disciplineOptions = ["课程与教学论", "机器学习", "信息系统", "产业经济学", "知识产权法"];
const wordCountOptions = [
  { value: 3000, label: "3000字" },
  { value: 5000, label: "5000字" },
  { value: 8000, label: "8000字" },
  { value: 12000, label: "12000字" },
];

const stepItems = [
  { label: "基本信息", hint: "填写基本信息" },
  { label: "详细补充", hint: "针对性高效工作" },
  { label: "修改大纲", hint: "修改长文大纲" },
  { label: "文献筛选", hint: "选择相关文献" },
  { label: "生成报告", hint: "生成最终报告" },
] as const;

const templateCards: Array<{
  key: TemplateMode;
  title: string;
  description: string;
}> = [
  {
    key: "none",
    title: "无模板",
    description: "不提供参考模板文件，生成完成后可自定义导出特定格式 Word。",
  },
  {
    key: "format",
    title: "格式模板",
    description: "使用学校提供的格式模板文件，系统将根据格式要求生成内容。",
  },
  {
    key: "full",
    title: "全文模板",
    description: "参考完整范文结构，在保持章节顺序的同时生成你的内容。",
  },
];

const taskThemes: Record<
  LongformTaskType,
  {
    ribbonClass: string;
    actionLabel: string;
    helperLink: string;
  }
> = {
  literature: {
    ribbonClass: "bg-[linear-gradient(90deg,#e7bff5_0%,#efb2ec_100%)]",
    actionLabel: "AI拟题",
    helperLink: "回到旧版",
  },
  proposal: {
    ribbonClass: "bg-[linear-gradient(90deg,#c8f5c9_0%,#9be6ff_100%)]",
    actionLabel: "AI拟题",
    helperLink: "回到旧版",
  },
  article: {
    ribbonClass: "bg-[linear-gradient(90deg,#c9defe_0%,#c8c0ff_100%)]",
    actionLabel: "AI拟题",
    helperLink: "回到旧版",
  },
  format: {
    ribbonClass: "bg-[linear-gradient(90deg,#dce5ff_0%,#d7c6ff_100%)]",
    actionLabel: "AI建议",
    helperLink: "查看示例",
  },
  ppt: {
    ribbonClass: "bg-[linear-gradient(90deg,#ffe5b8_0%,#ffd0ec_100%)]",
    actionLabel: "AI拟题",
    helperLink: "查看示例",
  },
  review: {
    ribbonClass: "bg-[linear-gradient(90deg,#d9f3ff_0%,#c7e0ff_100%)]",
    actionLabel: "AI建议",
    helperLink: "查看示例",
  },
};

function statusLabel(status: ClientTaskStatus) {
  if (status === "submitting") return "正在创建任务...";
  if (status === "queued") return "任务已排队，等待生成...";
  if (status === "running") return "内容生成中...";
  if (status === "failed") return "任务失败";
  if (status === "completed") return "任务完成";
  return "待开始";
}

function parseSseFrames(buffer: string) {
  const parsed: Array<{ event: string; data: unknown }> = [];
  let rest = buffer;

  while (true) {
    const frameEnd = rest.indexOf("\n\n");
    if (frameEnd < 0) break;

    const frame = rest.slice(0, frameEnd);
    rest = rest.slice(frameEnd + 2);
    if (!frame.trim()) continue;

    const lines = frame.split("\n");
    let eventName = "message";
    const dataLines: string[] = [];

    for (const line of lines) {
      if (line.startsWith("event:")) {
        eventName = line.slice("event:".length).trim();
      } else if (line.startsWith("data:")) {
        dataLines.push(line.slice("data:".length).trim());
      }
    }

    if (dataLines.length === 0) continue;
    const rawData = dataLines.join("\n");
    let payload: unknown = rawData;
    try {
      payload = JSON.parse(rawData);
    } catch {
      payload = rawData;
    }
    parsed.push({ event: eventName, data: payload });
  }

  return {
    events: parsed,
    rest,
  };
}

function buildSuggestedTitle(taskType: LongformTaskType, input: string) {
  const normalized = input.trim().replace(/\s+/g, " ");
  const seed = normalized.slice(0, 18) || "学术研究";
  if (taskType === "literature") return `${seed}相关文献综述`;
  if (taskType === "proposal") return `${seed}开题报告`;
  if (taskType === "article") return `${seed}论文初稿`;
  return `${seed}任务草稿`;
}

export function LongformGenerator({ title, subtitle, placeholder, submitText, taskType }: LongformGeneratorProps) {
  const router = useRouter();
  const streamAbortRef = useRef<AbortController | null>(null);

  const [subject, setSubject] = useState(subjectOptions[0]);
  const [discipline, setDiscipline] = useState(disciplineOptions[0]);
  const [paperTitle, setPaperTitle] = useState("");
  const [detail, setDetail] = useState("");
  const [wordCount, setWordCount] = useState(wordCountOptions[1].value);
  const [autoExecute, setAutoExecute] = useState(false);
  const [templateMode, setTemplateMode] = useState<TemplateMode>("none");
  const [referencesOpen, setReferencesOpen] = useState(false);
  const [references, setReferences] = useState("");
  const [agreed, setAgreed] = useState(false);
  const [models, setModels] = useState<ModelOption[]>(fallbackModels);
  const [taskStatus, setTaskStatus] = useState<ClientTaskStatus>("idle");
  const [taskId, setTaskId] = useState<string | null>(null);
  const [output, setOutput] = useState("");
  const [streamingOutput, setStreamingOutput] = useState("");
  const [chargedPoints, setChargedPoints] = useState<number | null>(null);
  const [errorMessage, setErrorMessage] = useState("");
  const [isCancelling, setIsCancelling] = useState(false);

  const selectedModel = models[0] ?? fallbackModels[0];
  const theme = taskThemes[taskType] ?? taskThemes.literature;
  const isRunning = taskStatus === "submitting" || taskStatus === "queued" || taskStatus === "running";

  const estimatedPoints = useMemo(() => {
    return Math.ceil(wordCount * (selectedModel?.pointMultiplier ?? 1));
  }, [selectedModel, wordCount]);

  const currentStep = useMemo(() => {
    if (taskStatus === "completed") return 4;
    if (taskStatus === "queued" || taskStatus === "running") return 3;
    if (paperTitle.trim() || detail.trim()) return 1;
    return 0;
  }, [detail, paperTitle, taskStatus]);

  const compiledPrompt = useMemo(() => {
    return [
      `任务类型：${title}`,
      `学科：${subject}`,
      `一级学科：${discipline}`,
      `标题：${paperTitle.trim() || buildSuggestedTitle(taskType, detail || title)}`,
      `补充说明：${detail.trim() || placeholder}`,
      `字数要求：${wordCount}字`,
      `自动执行：${autoExecute ? "开启" : "关闭"}`,
      `模板模式：${templateCards.find((item) => item.key === templateMode)?.title || "无模板"}`,
      references.trim() ? `自定义参考资料：${references.trim()}` : "",
    ]
      .filter(Boolean)
      .join("\n");
  }, [autoExecute, detail, discipline, paperTitle, placeholder, references, subject, taskType, templateMode, title, wordCount]);

  useEffect(() => {
    let cancelled = false;

    const loadModels = async () => {
      try {
        const response = await fetch(toApiUrl("/api/v1/models"), { method: "GET" });
        if (!response.ok) return;
        const data = (await response.json()) as ModelOption[];
        if (!cancelled && Array.isArray(data) && data.length > 0) {
          setModels(data);
        }
      } catch {
        // Keep fallback models when API is unavailable.
      }
    };

    void loadModels();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    return () => {
      streamAbortRef.current?.abort();
    };
  }, []);

  const submitTask = async () => {
    setErrorMessage("");
    setTaskId(null);
    setTaskStatus("submitting");
    setOutput("");
    setStreamingOutput("");
    setChargedPoints(null);

    if (!agreed) {
      setTaskStatus("failed");
      setErrorMessage("请先勾选说明后再提交任务。");
      return;
    }

    if (!paperTitle.trim() && !detail.trim()) {
      setTaskStatus("failed");
      setErrorMessage("请至少填写标题或补充说明。");
      return;
    }

    const session = getValidSession();
    if (!session) {
      router.replace(`/auth/login?next=${encodeURIComponent(window.location.pathname)}`);
      return;
    }

    if (!selectedModel) {
      setTaskStatus("failed");
      setErrorMessage("当前没有可用模型，请稍后重试。");
      return;
    }

    streamAbortRef.current?.abort();
    const controller = new AbortController();
    streamAbortRef.current = controller;

    try {
      const response = await fetch(toApiUrl("/api/v1/tasks/stream"), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.accessToken}`,
        },
        body: JSON.stringify({
          type: taskType,
          content: compiledPrompt,
          mode: defaultMode,
          provider: selectedModel.provider,
          modelId: selectedModel.modelId,
        }),
        signal: controller.signal,
      });

      if (response.status === 401) {
        router.replace(`/auth/login?next=${encodeURIComponent(window.location.pathname)}`);
        return;
      }

      if (response.status === 402) {
        const data = (await response.json().catch(() => null)) as { points?: number; required?: number } | null;
        setTaskStatus("failed");
        setErrorMessage(`积分不足，当前 ${data?.points ?? "N/A"}，需要 ${data?.required ?? "N/A"}。`);
        return;
      }

      if (!response.ok) {
        const data = (await response.json().catch(() => null)) as { message?: string } | null;
        setTaskStatus("failed");
        setErrorMessage(data?.message || "流式生成启动失败，请稍后再试。");
        return;
      }

      if (!response.body) {
        setTaskStatus("failed");
        setErrorMessage("生成通道不可用。");
        return;
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let completed = false;
      let lastOutput = "";

      setTaskStatus("queued");

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const parsedFrames = parseSseFrames(buffer);
        buffer = parsedFrames.rest;

        for (const frame of parsedFrames.events) {
          if (frame.event === "meta" && frame.data && typeof frame.data === "object") {
            const payload = frame.data as StreamMetaPayload;
            if (typeof payload.taskId === "string") setTaskId(payload.taskId);
            if (typeof payload.pointsCost === "number") setChargedPoints(payload.pointsCost);
            if (payload.status === "queued" || payload.status === "running") {
              setTaskStatus(payload.status);
            }
            continue;
          }

          if (frame.event === "chunk" && frame.data && typeof frame.data === "object") {
            const payload = frame.data as StreamChunkPayload;
            if (typeof payload.taskId === "string") setTaskId(payload.taskId);
            if (typeof payload.chunk === "string") {
              setTaskStatus("running");
              setStreamingOutput((previous) => {
                const merged = previous + payload.chunk;
                lastOutput = merged;
                return merged;
              });
            }
            continue;
          }

          if (frame.event === "complete" && frame.data && typeof frame.data === "object") {
            const payload = frame.data as StreamCompletePayload;
            if (typeof payload.taskId === "string") setTaskId(payload.taskId);
            if (typeof payload.output === "string") {
              lastOutput = payload.output;
              setOutput(payload.output);
              setStreamingOutput(payload.output);
            } else if (lastOutput) {
              setOutput(lastOutput);
            }
            setTaskStatus("completed");
            completed = true;
            continue;
          }

          if (frame.event === "error" && frame.data && typeof frame.data === "object") {
            const payload = frame.data as { message?: string; taskId?: string };
            if (typeof payload.taskId === "string") setTaskId(payload.taskId);
            setTaskStatus("failed");
            setErrorMessage(payload.message || "生成失败，请稍后重试。");
            completed = true;
          }
        }
      }

      if (!completed && !controller.signal.aborted) {
        if (lastOutput) {
          setOutput(lastOutput);
          setTaskStatus("completed");
        } else {
          setTaskStatus("failed");
          setErrorMessage("生成过程意外中断，请稍后重试。");
        }
      }
    } catch (error) {
      if (controller.signal.aborted) return;
      if (error instanceof Error && error.name === "AbortError") return;
      setTaskStatus("failed");
      setErrorMessage("网络异常，请稍后再试。");
    }
  };

  const cancelTask = async () => {
    if (!isRunning) return;

    const session = getValidSession();
    if (!session) {
      router.replace(`/auth/login?next=${encodeURIComponent(window.location.pathname)}`);
      return;
    }

    setIsCancelling(true);
    try {
      streamAbortRef.current?.abort();

      if (!taskId) {
        setTaskStatus("failed");
        setErrorMessage("任务已取消。");
        return;
      }

      const response = await fetch(toApiUrl(`/api/v1/tasks/${taskId}/cancel`), {
        method: "POST",
        headers: {
          Authorization: `Bearer ${session.accessToken}`,
        },
      });

      if (response.status === 401) {
        router.replace(`/auth/login?next=${encodeURIComponent(window.location.pathname)}`);
        return;
      }

      const payload = (await response.json().catch(() => null)) as TaskCancelResponse | null;
      if (!response.ok) {
        setErrorMessage(payload?.message || "取消任务失败。");
        return;
      }

      setTaskStatus("failed");
      setErrorMessage(payload?.message || "任务已取消。");
    } catch {
      setErrorMessage("取消任务时出现网络异常。");
    } finally {
      setIsCancelling(false);
    }
  };

  const copyResult = async () => {
    const text = (output || streamingOutput).trim();
    if (!text) return;
    await navigator.clipboard.writeText(text);
  };

  const downloadResult = () => {
    const text = (output || streamingOutput).trim();
    if (!text) return;
    const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${taskType}-${taskId || "result"}.txt`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const canSubmit = agreed && Boolean(paperTitle.trim() || detail.trim()) && !isRunning;

  return (
    <div className="space-y-5">
      <section className="dashboard-card px-5 py-5">
        <div className="grid gap-4 md:grid-cols-5">
          {stepItems.map((step, index) => {
            const active = index <= currentStep;
            return (
              <div key={step.label} className="relative flex gap-3 md:flex-col md:items-center md:text-center">
                {index > 0 ? <span className="absolute left-5 top-5 hidden h-px w-[calc(100%-2.5rem)] -translate-x-full bg-[#ececf3] md:block" /> : null}
                <span
                  className={`flex h-10 w-10 items-center justify-center rounded-full border text-sm font-semibold ${
                    active ? "border-[#d394ff] bg-[#d79eff] text-white shadow-[0_10px_24px_rgba(205,145,255,0.24)]" : "border-[#ececf3] bg-[#f8f8fb] text-[#9aa0b3]"
                  }`}
                >
                  {index + 1}
                </span>
                <div>
                  <p className={`text-[15px] font-semibold ${active ? "text-[#ca79ea]" : "text-[#2b3045]"}`}>{step.label}</p>
                  <p className="mt-1 text-xs text-[#8a90a5]">{step.hint}</p>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <section className="dashboard-card overflow-hidden">
        <div className={`flex items-center justify-between px-6 py-4 ${theme.ribbonClass}`}>
          <div className="flex items-center gap-2">
            <h2 className="text-[18px] font-semibold text-[#5a477a]">{title}</h2>
            <CircleHelp size={18} className="text-[#8168a5]" />
          </div>
          <div className="flex items-center gap-4 text-sm text-[#765d9a]">
            <button type="button" className="inline-flex items-center gap-1">
              <History size={16} />
              历史
            </button>
            <button type="button">{theme.helperLink}</button>
          </div>
        </div>

        <div className="space-y-5 px-6 py-5">
          <div className="grid gap-4 md:grid-cols-[88px_minmax(0,1fr)_88px_minmax(0,1fr)] md:items-center">
            <label className="text-sm font-medium text-[#4b5168]">学科 *</label>
            <select
              value={subject}
              onChange={(event) => setSubject(event.target.value)}
              className="h-11 rounded-xl border border-[#e4e7f3] bg-white px-4 text-sm text-[#40465f] outline-none transition focus:border-[#8f88ff]"
            >
              {subjectOptions.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>

            <label className="text-sm font-medium text-[#4b5168]">一级学科 *</label>
            <select
              value={discipline}
              onChange={(event) => setDiscipline(event.target.value)}
              className="h-11 rounded-xl border border-[#e4e7f3] bg-white px-4 text-sm text-[#40465f] outline-none transition focus:border-[#8f88ff]"
            >
              {disciplineOptions.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </div>

          <div className="grid gap-4 md:grid-cols-[88px_minmax(0,1fr)_112px] md:items-center">
            <label className="text-sm font-medium text-[#4b5168]">标题 *</label>
            <input
              value={paperTitle}
              onChange={(event) => setPaperTitle(event.target.value)}
              className="h-11 rounded-xl border border-[#e4e7f3] bg-white px-4 text-sm text-[#40465f] outline-none transition focus:border-[#8f88ff]"
              placeholder={placeholder}
            />
            <button
              type="button"
              onClick={() => setPaperTitle(buildSuggestedTitle(taskType, detail || placeholder))}
              className="h-11 rounded-xl bg-[linear-gradient(135deg,#efb0e8,#b98cff)] text-sm font-semibold text-white shadow-[0_10px_24px_rgba(191,142,255,0.24)]"
            >
              {theme.actionLabel}
            </button>
          </div>

          <div className="grid gap-4 md:grid-cols-[88px_minmax(0,1fr)]">
            <label className="pt-3 text-sm font-medium text-[#4b5168]">补充说明</label>
            <textarea
              value={detail}
              onChange={(event) => setDetail(event.target.value)}
              className="h-32 resize-none rounded-2xl border border-[#e4e7f3] bg-white px-4 py-3 text-sm leading-6 text-[#40465f] outline-none transition focus:border-[#8f88ff]"
              placeholder={subtitle}
            />
          </div>

          <div className="grid gap-4 md:grid-cols-[88px_180px_88px_220px] md:items-center">
            <label className="text-sm font-medium text-[#4b5168]">字数要求</label>
            <div>
              <select
                value={wordCount}
                onChange={(event) => setWordCount(Number(event.target.value))}
                className="h-11 w-full rounded-xl border border-[#e4e7f3] bg-white px-4 text-sm text-[#40465f] outline-none transition focus:border-[#8f88ff]"
              >
                {wordCountOptions.map((item) => (
                  <option key={item.value} value={item.value}>
                    {item.label}
                  </option>
                ))}
              </select>
              <p className="mt-2 text-xs text-[#8b91a9]">预计消耗 {estimatedPoints} 点数</p>
            </div>

            <label className="text-sm font-medium text-[#4b5168]">自动执行</label>
            <button
              type="button"
              onClick={() => setAutoExecute((previous) => !previous)}
              className="flex h-11 items-center justify-between rounded-xl border border-[#e4e7f3] bg-white px-4 text-sm text-[#40465f]"
            >
              <span>{autoExecute ? "开启" : "关闭"}</span>
              <span className={`relative h-6 w-11 rounded-full transition ${autoExecute ? "bg-[#bfd8ff]" : "bg-[#d9dde8]"}`}>
                <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow-sm transition ${autoExecute ? "left-[22px]" : "left-0.5"}`} />
              </span>
            </button>
          </div>

          <div className="grid gap-4 md:grid-cols-[88px_minmax(0,1fr)]">
            <label className="pt-3 text-sm font-medium text-[#4b5168]">上传模板</label>
            <div className="grid gap-3 md:grid-cols-3">
              {templateCards.map((card) => {
                const active = card.key === templateMode;
                return (
                  <button
                    key={card.key}
                    type="button"
                    onClick={() => setTemplateMode(card.key)}
                    className={`rounded-2xl border p-4 text-left transition ${
                      active ? "border-[#6974ff] bg-white shadow-[0_14px_24px_rgba(99,102,241,0.1)]" : "border-[#e5e7ef] bg-white"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className={`text-base font-semibold ${active ? "text-[#5862e1]" : "text-[#2b3046]"}`}>{card.title}</p>
                        <p className="mt-2 text-xs leading-6 text-[#6d738c]">{card.description}</p>
                      </div>
                      <span className={`mt-1 h-4 w-4 rounded-full border ${active ? "border-[#6974ff] bg-[#6974ff]" : "border-[#ced3e4] bg-white"}`} />
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="border-t border-[#eef0f6] pt-4">
            <button
              type="button"
              onClick={() => setReferencesOpen((previous) => !previous)}
              className="inline-flex items-center gap-1 text-sm font-medium text-[#4a4f67]"
            >
              {referencesOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
              自定义参考资料
            </button>
            {referencesOpen ? (
              <div className="mt-3 grid gap-4 md:grid-cols-[88px_minmax(0,1fr)]">
                <span className="text-sm text-[#8b91a9]">参考资料</span>
                <textarea
                  value={references}
                  onChange={(event) => setReferences(event.target.value)}
                  className="h-24 resize-none rounded-2xl border border-[#e4e7f3] bg-white px-4 py-3 text-sm leading-6 text-[#40465f] outline-none transition focus:border-[#8f88ff]"
                  placeholder="可粘贴参考文献、已有提纲或院系规范要求。"
                />
              </div>
            ) : null}
          </div>

          <div className="border-t border-[#eef0f6] pt-5">
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <label className="inline-flex items-center gap-2 text-sm text-[#7d8298]">
                <input
                  type="checkbox"
                  checked={agreed}
                  onChange={(event) => setAgreed(event.target.checked)}
                  className="h-4 w-4 rounded border-[#ccd3e4]"
                />
                我已阅读并同意：生成内容仅供参考使用，不作为学术不端用途。
              </label>

              <button
                type="button"
                onClick={() => void submitTask()}
                disabled={!canSubmit}
                className="h-11 min-w-[148px] rounded-full bg-[linear-gradient(135deg,#e9d3ff,#bfdefd)] px-6 text-sm font-semibold text-white shadow-[0_14px_30px_rgba(176,166,255,0.24)] disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isRunning ? statusLabel(taskStatus) : submitText}
              </button>
            </div>
          </div>

          {taskId ? <p className="text-xs text-[#8790ab]">任务编号：{taskId}</p> : null}
          {errorMessage ? <p className="text-sm text-[#c14545]">{errorMessage}</p> : null}
        </div>
      </section>

      {taskStatus !== "idle" || output || streamingOutput ? (
        <section className="dashboard-card p-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h3 className="text-xl font-semibold text-[#263052]">生成结果</h3>
              <p className="mt-1 text-sm text-[#7b8198]">{statusLabel(taskStatus)}</p>
            </div>
            <div className="flex items-center gap-2">
              <button type="button" onClick={() => void copyResult()} className="inline-flex items-center gap-1 rounded-xl border border-[#d9def4] bg-white px-3 py-2 text-sm text-[#5660a5]">
                <Copy size={14} />
                复制
              </button>
              <button type="button" onClick={downloadResult} className="inline-flex items-center gap-1 rounded-xl border border-[#d9def4] bg-white px-3 py-2 text-sm text-[#5660a5]">
                <Download size={14} />
                下载
              </button>
            </div>
          </div>

          <div className="mt-4 whitespace-pre-wrap rounded-2xl border border-[#e4e7f3] bg-[#fcfcff] p-4 text-sm leading-7 text-[#3b4262]">
            {isRunning && !streamingOutput ? "正在生成，请稍候..." : streamingOutput || output || "任务执行中。"}
          </div>

          {isRunning && taskId ? (
            <div className="mt-4 flex justify-end">
              <button
                type="button"
                onClick={() => void cancelTask()}
                disabled={isCancelling}
                className="rounded-xl border border-[#f1c7c7] bg-[#fff7f7] px-4 py-2 text-sm font-medium text-[#b94a4a] disabled:opacity-60"
              >
                {isCancelling ? "取消中..." : "取消任务"}
              </button>
            </div>
          ) : null}

          {chargedPoints !== null ? <p className="mt-4 text-xs text-[#8790ab]">本次实际扣除积分：{chargedPoints}</p> : null}
        </section>
      ) : null}
    </div>
  );
}
