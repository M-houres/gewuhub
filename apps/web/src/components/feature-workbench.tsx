"use client";

import { getValidSession, toApiUrl, updateSessionUser } from "@/lib/auth";
import { Copy, Download, History, UploadCloud } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useDropzone, type FileRejection } from "react-dropzone";

type WorkbenchVariant = "reduce-ai" | "reduce-repeat" | "detect";
type InputMode = "text" | "upload";
type ClientTaskStatus = "idle" | "submitting" | "queued" | "running" | "completed" | "failed";
type HistoryItemStatus = "processing" | "completed" | "failed";
type AcademicPlatformCode = "cnki" | "weipu" | "paperpass" | "wanfang" | "daya";
type AcademicPlatformOption = { code: AcademicPlatformCode; label: string };

type FeatureWorkbenchProps = { variant: WorkbenchVariant };

type TaskCreateResponse = {
  taskId: string;
  status: "queued" | "running" | "completed" | "failed";
  pointsCost: number;
  freeDetectApplied: boolean;
  points: number;
};

type TaskDetailResponse = {
  id: string;
  status: "queued" | "running" | "completed" | "failed";
  pointsRefunded?: boolean;
  result?: { output: string; outputUrl?: string };
};

type TaskCancelResponse = { message?: string; points?: number; pointsRefunded?: boolean };
type TaskDownloadTicketResponse = { downloadPath: string };
type TaskDownloadResolveResponse = { downloadUrl?: string; message?: string };
type DocxProgressResponse = { progress: number };
type PointsSummaryResponse = { points: number; agentPoints: number; dailyDetectUsed: number; dailyDetectLimit: number };
type PlatformListResponse = {
  items: Array<{ code: AcademicPlatformCode; label: string }>;
};

type TaskListItem = {
  id: string;
  type: string;
  status: "queued" | "running" | "completed" | "failed";
  createdAt: string;
  payload: { content: string; platform?: AcademicPlatformCode };
  result?: { output: string };
};

type HistoryItem = {
  id: string;
  createdLabel: string;
  original: string;
  result: string;
  status: HistoryItemStatus;
  platform: string;
};

const defaultModel = { provider: "deepseek", modelId: "deepseek-v3" } as const;
const maxUploadSizeBytes = 10 * 1024 * 1024;
const defaultAcademicPlatform: AcademicPlatformCode = "cnki";
const genericPlatformLabel = "通用";
const fallbackAcademicPlatformOptions: AcademicPlatformOption[] = [
  { code: "cnki", label: "知网" },
  { code: "weipu", label: "维普" },
];
const defaultLanguage = "中文";

const copyMap: Record<WorkbenchVariant, { pageTitle: string; pageDesc: string; submitText: string; recordsTitle?: string }> = {
  "reduce-repeat": {
    pageTitle: "降重复率",
    pageDesc: "对原文做深度改写，降低重复表达，输出可直接复核的对照结果。",
    submitText: "开始降重",
    recordsTitle: "最近降重记录",
  },
  "reduce-ai": {
    pageTitle: "降 AIGC 率",
    pageDesc: "弱化 AI 写作痕迹与模板化表达，优先修正文风与高风险段落。",
    submitText: "开始降 AI",
    recordsTitle: "最近降 AIGC 记录",
  },
  detect: {
    pageTitle: "AIGC 检测",
    pageDesc: "提供提交前的快速预判结果，帮助你先处理高风险段落与疑似 AI 痕迹。",
    submitText: "开始检测",
  },
};

const topCards = [
  { key: "reduce-repeat", title: "降重复率", desc: "对论文段落进行深度改写，优先降低重复表达。", href: "/zh/reduce-repeat" },
  { key: "reduce-ai", title: "降 AIGC 率", desc: "弱化 AI 痕迹与模板腔，输出更自然的学术表达。", href: "/zh/reduce-ai" },
] as const;

const rewriteWarnings = [
  "建议优先处理学校检测报告中的高风险段落，不必全文反复改写。",
  "若已有官方检测报告，可一并上传作为参考，通常能得到更稳定的定向改写结果。",
];

const detectServiceItems = [
  { title: "快速风险预判", body: "基于段落特征与表达模式给出疑似比例，帮助你先定位高风险内容。" },
  { title: "适配论文场景", body: "更适合在提交前做自查，避免在整篇论文上进行无效反复修改。" },
  { title: "结果结构清晰", body: "同时展示疑似比例、风险等级和建议动作，方便你继续处理重点段落。" },
  { title: "服务端安全校验", body: "登录、积分校验、任务状态和下载访问均由服务端控制，避免前端绕过。" },
];

const sampleText =
  "人工智能正在快速重塑学术写作。学生越来越多地使用生成式系统整理文献、组织论证并起草论文初稿。这些工具虽然提升了效率，也可能带来重复表达、逻辑模板化和可检测的风格痕迹。高校需要建立清晰规范，在鼓励合理使用辅助工具的同时，确保批判思维、学科判断与原创分析不被替代。";

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function toSafeScore(value: unknown) {
  if (typeof value !== "string") return 18;
  const matched = value.match(/(\d{1,3})(?:\.\d+)?%/);
  return matched?.[1] ? Math.max(0, Math.min(100, Number(matched[1]) || 18)) : 18;
}

function getAcademicPlatformLabel(
  platform?: AcademicPlatformCode | null,
  options: AcademicPlatformOption[] = fallbackAcademicPlatformOptions,
) {
  const matched = options.find((item) => item.code === platform);
  return matched ? matched.label : genericPlatformLabel;
}

function rewriteSample(raw: string, variant: Exclude<WorkbenchVariant, "detect">) {
  const base = raw
    .replaceAll("人工智能", "学术写作生态")
    .replaceAll("学生越来越多地", "越来越多学生");

  return variant === "reduce-repeat"
    ? `${base} 因此，高校需要建立明确治理机制，保障原创分析与学科判断。`
    : `${base} 但过度依赖这类工具会产生明显且易被识别的风格信号，写作者应强化人工修订质量与过程透明性。`;
}

function buildMockUploadUrl(file: File) {
  return `https://mock-oss.gewu.local/uploads/${encodeURIComponent(file.name)}`;
}

function docxMode(variant: WorkbenchVariant) {
  if (variant === "reduce-ai") return "deai";
  if (variant === "reduce-repeat") return "rewrite";
  return "detect";
}

function historyStatusLabel(status: HistoryItemStatus) {
  if (status === "processing") return "处理中";
  if (status === "failed") return "失败";
  return "已完成";
}

function taskStatusLabel(status: ClientTaskStatus) {
  if (status === "submitting") return "正在创建任务...";
  if (status === "queued") return "任务已排队，等待处理";
  if (status === "running") return "任务处理中...";
  if (status === "completed") return "任务已完成";
  if (status === "failed") return "任务失败";
  return "等待开始";
}

function buildRiskBreakdown(score: number) {
  if (score >= 70) return { high: score, medium: 0, low: 0, none: 100 - score, label: "高风险" };
  if (score >= 40) return { high: 0, medium: score, low: 0, none: 100 - score, label: "中风险" };
  if (score > 0) return { high: 0, medium: 0, low: score, none: 100 - score, label: "低风险" };
  return { high: 0, medium: 0, low: 0, none: 100, label: "无风险" };
}

function trimPreview(text: string) {
  const normalized = text.trim().replace(/\s+/g, " ");
  if (!normalized) return "暂无内容";
  if (normalized.length <= 220) return normalized;
  return `${normalized.slice(0, 220)}...`;
}

function formatCreatedLabel(value: string) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "刚刚";
  return new Intl.DateTimeFormat("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(date);
}

function extractLineValue(content: string, label: string) {
  const matched = content.match(new RegExp(`${label}：([^\\n]+)`));
  return matched?.[1]?.trim() || "";
}

function extractOriginalPreview(content: string) {
  const normalized = content.trim();
  const sections = normalized.split("\n\n");
  const lastSection = sections[sections.length - 1]?.trim();
  if (lastSection && !lastSection.startsWith("平台：") && !lastSection.startsWith("文件：")) {
    return lastSection;
  }

  const fileName = extractLineValue(content, "文件");
  if (fileName) return `文件：${fileName}`;

  const cleaned = normalized
    .split("\n")
    .filter((line) => !["平台：", "语言：", "标题：", "作者：", "报告：", "文件："].some((prefix) => line.startsWith(prefix)))
    .join(" ")
    .trim();

  return cleaned || normalized || "暂无内容";
}

function toHistoryItem(
  task: TaskListItem,
  fallbackPlatform: string,
  platformOptions: AcademicPlatformOption[],
): HistoryItem {
  const storedPlatform = task.payload.platform
    ? getAcademicPlatformLabel(task.payload.platform, platformOptions)
    : extractLineValue(task.payload.content, "平台");
  return {
    id: task.id,
    createdLabel: formatCreatedLabel(task.createdAt),
    original: extractOriginalPreview(task.payload.content),
    result: task.result?.output || "",
    status: task.status === "completed" ? "completed" : task.status === "failed" ? "failed" : "processing",
    platform: storedPlatform || fallbackPlatform,
  };
}

async function rollbackTask(accessToken: string, taskId: string) {
  try {
    await fetch(toApiUrl(`/api/v1/tasks/${taskId}/cancel`), { method: "POST", headers: { Authorization: `Bearer ${accessToken}` } });
  } catch {
    // best effort
  }
}

async function copyText(text: string) {
  if (!text) return;
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand("copy");
    document.body.removeChild(textarea);
  }
}

function toDropzoneError(rejections: FileRejection[]) {
  const firstError = rejections[0]?.errors[0];
  if (!firstError) return "文件上传失败，请重试。";
  if (firstError.code === "file-too-large") return `文件超过限制，单文件最大 ${Math.floor(maxUploadSizeBytes / 1024 / 1024)}MB。`;
  if (firstError.code === "file-invalid-type") return "文件类型不支持，仅允许 docx、pdf、txt。";
  if (firstError.code === "too-many-files") return "一次只能上传 1 个文件。";
  return firstError.message;
}

export function FeatureWorkbench({ variant }: FeatureWorkbenchProps) {
  const router = useRouter();
  const pollingAbortRef = useRef<AbortController | null>(null);
  const copy = copyMap[variant];
  const isDetectVariant = variant === "detect";
  const requiresAcademicPlatform = variant === "reduce-repeat" || variant === "reduce-ai" || isDetectVariant;

  const historySectionId = `${variant}-history`;

  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [inputMode, setInputMode] = useState<InputMode>("text");
  const [platform, setPlatform] = useState<AcademicPlatformCode>(defaultAcademicPlatform);
  const [platformOptions, setPlatformOptions] = useState<AcademicPlatformOption[]>(fallbackAcademicPlatformOptions);
  const [sourceText, setSourceText] = useState("");
  const [paperTitle, setPaperTitle] = useState("");
  const [authorName, setAuthorName] = useState("");
  const [uploadedFiles, setUploadedFiles] = useState<File[]>([]);
  const [reportFiles, setReportFiles] = useState<File[]>([]);
  const [taskStatus, setTaskStatus] = useState<ClientTaskStatus>("idle");
  const [taskId, setTaskId] = useState<string | null>(null);
  const [taskProgress, setTaskProgress] = useState(0);
  const [resultText, setResultText] = useState("");
  const [resultDownloadUrl, setResultDownloadUrl] = useState<string | null>(null);
  const [detectScore, setDetectScore] = useState<number | null>(null);
  const [chargedPoints, setChargedPoints] = useState<number | null>(null);
  const [freeDetectApplied, setFreeDetectApplied] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [isDownloading, setIsDownloading] = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);
  const [historyEntries, setHistoryEntries] = useState<HistoryItem[]>([]);
  const [currentPoints, setCurrentPoints] = useState<number | null>(null);
  const [dailyDetectUsed, setDailyDetectUsed] = useState(0);
  const [dailyDetectLimit, setDailyDetectLimit] = useState(5);

  const isRunning = taskStatus === "submitting" || taskStatus === "queued" || taskStatus === "running";

  const estimatedPoints = useMemo(() => {
    if (inputMode === "upload" && uploadedFiles[0]) return Math.max(Math.ceil(uploadedFiles[0].size / 1024), 1);
    const chars = sourceText.trim().length;
    if (chars === 0) return 0;
    if (isDetectVariant) return Math.max(Math.ceil(chars / 10), 1);
    return chars;
  }, [inputMode, isDetectVariant, sourceText, uploadedFiles]);

  const detectBreakdown = useMemo(() => {
    if (detectScore === null) return null;
    return buildRiskBreakdown(detectScore);
  }, [detectScore]);

  const remainingFreeDetect = Math.max(dailyDetectLimit - dailyDetectUsed, 0);
  const currentPlatformLabel = requiresAcademicPlatform
    ? getAcademicPlatformLabel(platform, platformOptions)
    : genericPlatformLabel;

  const loadAccountData = useCallback(async () => {
    const session = getValidSession();
    setIsLoggedIn(Boolean(session));
    if (!session) {
      setCurrentPoints(null);
      setDailyDetectUsed(0);
      setDailyDetectLimit(5);
      if (!isDetectVariant) setHistoryEntries([]);
      return;
    }

    try {
      const headers = { Authorization: `Bearer ${session.accessToken}` };
      const requests: Promise<Response | null>[] = [fetch(toApiUrl("/api/v1/points/summary"), { method: "GET", headers }).catch(() => null)];
      if (!isDetectVariant) {
        requests.push(fetch(toApiUrl("/api/v1/tasks"), { method: "GET", headers }).catch(() => null));
      }

      const responses = await Promise.all(requests);
      const pointsResponse = responses[0];

      if (pointsResponse?.ok) {
        const pointsData = (await pointsResponse.json()) as PointsSummaryResponse;
        setCurrentPoints(pointsData.points);
        setDailyDetectUsed(pointsData.dailyDetectUsed);
        setDailyDetectLimit(pointsData.dailyDetectLimit);
        updateSessionUser({
          points: pointsData.points,
          agentPoints: pointsData.agentPoints,
        });
      }

      if (!isDetectVariant) {
        const tasksResponse = responses[1];
        if (tasksResponse?.ok) {
          const tasks = (await tasksResponse.json()) as TaskListItem[];
          const nextHistory = tasks
            .filter((item) => item.type === variant)
            .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
            .slice(0, 5)
            .map((item) => toHistoryItem(item, currentPlatformLabel, platformOptions));
          setHistoryEntries(nextHistory);
        }
      }
    } catch {
      // keep screen usable
    }
  }, [currentPlatformLabel, isDetectVariant, platformOptions, variant]);

  useEffect(() => {
    void loadAccountData();
  }, [loadAccountData]);

  useEffect(() => {
    if (!requiresAcademicPlatform) return;
    const controller = new AbortController();

    void (async () => {
      try {
        const response = await fetch(toApiUrl(`/api/v1/platforms?taskType=${encodeURIComponent(variant)}`), {
          method: "GET",
          signal: controller.signal,
        });
        if (!response.ok) return;

        const data = (await response.json()) as PlatformListResponse;
        if (!Array.isArray(data.items) || data.items.length === 0) return;

        setPlatformOptions(data.items);
        setPlatform((current) => (data.items.some((item) => item.code === current) ? current : data.items[0].code));
      } catch {
        // keep fallback options
      }
    })();

    return () => controller.abort();
  }, [requiresAcademicPlatform, variant]);

  useEffect(() => () => pollingAbortRef.current?.abort(), []);

  const sourceDropzone = useDropzone({
    maxFiles: 1,
    maxSize: maxUploadSizeBytes,
    accept: {
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document": [".docx"],
      "application/pdf": [".pdf"],
      "text/plain": [".txt"],
    },
    onDrop: (files) => {
      setUploadedFiles(files.slice(0, 1));
      setErrorMessage("");
    },
    onDropRejected: (rejections) => setErrorMessage(toDropzoneError(rejections)),
  });

  const reportDropzone = useDropzone({
    maxFiles: 1,
    maxSize: maxUploadSizeBytes,
    accept: { "application/pdf": [".pdf"], "text/plain": [".txt"] },
    onDrop: (files) => {
      setReportFiles(files.slice(0, 1));
      setErrorMessage("");
    },
    onDropRejected: (rejections) => setErrorMessage(toDropzoneError(rejections)),
  });

  const upsertHistoryEntry = (entry: HistoryItem) => {
    setHistoryEntries((previous) => [entry, ...previous.filter((item) => item.id !== entry.id)].slice(0, 5));
  };

  const patchHistoryEntry = (id: string, patch: Partial<HistoryItem>) => {
    setHistoryEntries((previous) => previous.map((item) => (item.id === id ? { ...item, ...patch } : item)));
  };

  const resetForm = () => {
    pollingAbortRef.current?.abort();
    setSourceText("");
    setPaperTitle("");
    setAuthorName("");
    setUploadedFiles([]);
    setReportFiles([]);
    setTaskStatus("idle");
    setTaskId(null);
    setTaskProgress(0);
    setResultText("");
    setResultDownloadUrl(null);
    setDetectScore(null);
    setChargedPoints(null);
    setFreeDetectApplied(false);
    setErrorMessage("");
    setIsCancelling(false);
    setIsDownloading(false);
  };

  const startProcess = async () => {
    setErrorMessage("");
    setResultText("");
    setResultDownloadUrl(null);
    setDetectScore(null);
    setChargedPoints(null);
    setFreeDetectApplied(false);
    setTaskId(null);
    setTaskProgress(8);

    if (inputMode === "text" && !sourceText.trim()) {
      setErrorMessage(isDetectVariant ? "请先输入待检测内容。" : "请先输入待处理内容。");
      return;
    }
    if (inputMode === "upload" && !uploadedFiles[0]) {
      setErrorMessage("请先上传待处理文件。");
      return;
    }

    const session = getValidSession();
    if (!session) {
      router.replace(`/auth/login?next=${encodeURIComponent(window.location.pathname)}`);
      return;
    }

    setIsLoggedIn(true);
    pollingAbortRef.current?.abort();
    const controller = new AbortController();
    pollingAbortRef.current = controller;

    const sourcePreview = inputMode === "upload" ? `文件：${uploadedFiles[0]?.name || ""}` : sourceText.trim();
    const metadataLines = [`平台：${currentPlatformLabel}`, `语言：${defaultLanguage}`];
    if (paperTitle.trim()) metadataLines.push(`标题：${paperTitle.trim()}`);
    if (authorName.trim()) metadataLines.push(`作者：${authorName.trim()}`);
    if (inputMode === "upload") metadataLines.push(`文件：${uploadedFiles[0]?.name || ""}`);
    if (variant === "reduce-ai" && reportFiles[0]) metadataLines.push(`报告：${reportFiles[0].name}`);
    const content = inputMode === "text" ? [...metadataLines, "", sourceText.trim()].join("\n") : metadataLines.join("\n");

    setTaskStatus("submitting");

    try {
      const createResponse = await fetch(toApiUrl("/api/v1/tasks"), {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.accessToken}` },
        body: JSON.stringify({
          type: variant,
          content,
          mode: "balanced",
          provider: defaultModel.provider,
          modelId: defaultModel.modelId,
          ...(requiresAcademicPlatform ? { platform } : {}),
        }),
        signal: controller.signal,
      });

      if (createResponse.status === 401) {
        router.replace(`/auth/login?next=${encodeURIComponent(window.location.pathname)}`);
        return;
      }

      if (createResponse.status === 402) {
        const data = (await createResponse.json().catch(() => null)) as { points?: number; required?: number } | null;
        setTaskStatus("failed");
        setTaskProgress(0);
        setCurrentPoints(data?.points ?? currentPoints);
        if (typeof data?.points === "number") {
          updateSessionUser({ points: data.points });
        }
        setErrorMessage(`积分不足，当前 ${data?.points ?? "N/A"}，需要 ${data?.required ?? "N/A"}。`);
        return;
      }

      if (!createResponse.ok) {
        const data = (await createResponse.json().catch(() => null)) as { message?: string } | null;
        setTaskStatus("failed");
        setTaskProgress(0);
        setErrorMessage(data?.message || "任务创建失败。");
        return;
      }

      const created = (await createResponse.json()) as TaskCreateResponse;
      const createdTaskId = created.taskId;
      setTaskId(createdTaskId);
      setChargedPoints(created.pointsCost);
      setFreeDetectApplied(created.freeDetectApplied);
      setCurrentPoints(created.points);
      updateSessionUser({ points: created.points });
      setTaskStatus(created.status === "completed" ? "completed" : created.status === "running" ? "running" : "queued");
      setTaskProgress(created.status === "completed" ? 100 : 18);

      if (!isDetectVariant) {
        upsertHistoryEntry({
          id: createdTaskId,
          createdLabel: "刚刚",
          original: sourcePreview,
          result: "",
          status: "processing",
          platform: currentPlatformLabel,
        });
      }

      if (inputMode === "upload" && uploadedFiles[0]) {
        const docxResponse = await fetch(toApiUrl("/api/v1/tasks/docx"), {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.accessToken}` },
          body: JSON.stringify({
            taskId: createdTaskId,
            sourceFileUrl: buildMockUploadUrl(uploadedFiles[0]),
            sourceFileName: uploadedFiles[0].name,
            sourceFileSizeBytes: uploadedFiles[0].size,
            mode: docxMode(variant),
          }),
          signal: controller.signal,
        });

        if (!docxResponse.ok) {
          await rollbackTask(session.accessToken, createdTaskId);
          if (!isDetectVariant) patchHistoryEntry(createdTaskId, { status: "failed" });
          const data = (await docxResponse.json().catch(() => null)) as { message?: string } | null;
          setTaskStatus("failed");
          setTaskProgress(0);
          setErrorMessage(data?.message || "文件任务提交失败。");
          void loadAccountData();
          return;
        }
      }

      for (let pollCount = 0; pollCount < 80 && !controller.signal.aborted; pollCount += 1) {
        await wait(3000);
        if (controller.signal.aborted) return;

        if (inputMode === "upload") {
          const progressResponse = await fetch(toApiUrl(`/api/v1/tasks/docx/${createdTaskId}`), {
            method: "GET",
            headers: { Authorization: `Bearer ${session.accessToken}` },
            signal: controller.signal,
          }).catch(() => null);
          if (progressResponse?.ok) {
            const progressData = (await progressResponse.json()) as DocxProgressResponse;
            setTaskProgress(progressData.progress);
          }
        }

        const taskResponse = await fetch(toApiUrl(`/api/v1/tasks/${createdTaskId}`), {
          method: "GET",
          headers: { Authorization: `Bearer ${session.accessToken}` },
          signal: controller.signal,
        }).catch(() => null);
        if (!taskResponse?.ok) continue;

        const detail = (await taskResponse.json()) as TaskDetailResponse;
        if (detail.status === "queued" || detail.status === "running") {
          setTaskStatus(detail.status);
          setTaskProgress((previous) => Math.max(previous, detail.status === "queued" ? 18 : 62));
          continue;
        }

        if (detail.status === "failed") {
          if (!isDetectVariant) patchHistoryEntry(createdTaskId, { status: "failed" });
          setTaskStatus("failed");
          setTaskProgress(100);
          setErrorMessage(detail.pointsRefunded ? "任务失败，积分已退回。" : "任务失败，退款处理中。");
          void loadAccountData();
          return;
        }

        const resolvedResult =
          detail.result?.output ||
          (isDetectVariant ? `疑似 AI 比例 ${toSafeScore(detail.result?.output)}%，建议继续修改高风险段落。` : rewriteSample(sourceText.trim() || sampleText, variant));

        setTaskStatus("completed");
        setTaskProgress(100);
        setResultDownloadUrl(detail.result?.outputUrl || null);
        if (isDetectVariant) {
          setDetectScore(toSafeScore(detail.result?.output));
          setResultText(resolvedResult);
        } else {
          setResultText(resolvedResult);
          patchHistoryEntry(createdTaskId, { status: "completed", result: resolvedResult });
        }

        void loadAccountData();
        return;
      }

      if (!controller.signal.aborted) {
        setTaskStatus("failed");
        setTaskProgress(0);
        setErrorMessage("任务轮询超时，请稍后刷新页面查看结果。");
        void loadAccountData();
      }
    } catch (error) {
      if (controller.signal.aborted) return;
      if (error instanceof Error && error.name === "AbortError") return;
      setTaskStatus("failed");
      setTaskProgress(0);
      setErrorMessage("网络异常，请稍后再试。");
    }
  };

  const cancelTask = async () => {
    if (!taskId || !isRunning) return;
    const session = getValidSession();
    if (!session) return;

    setIsCancelling(true);
    try {
      const response = await fetch(toApiUrl(`/api/v1/tasks/${taskId}/cancel`), {
        method: "POST",
        headers: { Authorization: `Bearer ${session.accessToken}` },
      });
      const payload = (await response.json().catch(() => null)) as TaskCancelResponse | null;
      if (!response.ok) {
        setErrorMessage(payload?.message || "取消任务失败。");
        return;
      }

      pollingAbortRef.current?.abort();
      if (!isDetectVariant) patchHistoryEntry(taskId, { status: "failed" });
      setTaskStatus("failed");
      setTaskProgress(0);
      setCurrentPoints(payload?.points ?? currentPoints);
      if (typeof payload?.points === "number") {
        updateSessionUser({ points: payload.points });
      }
      setErrorMessage(payload?.message || "任务已取消。");
      void loadAccountData();
    } catch {
      setErrorMessage("取消任务时出现网络异常。");
    } finally {
      setIsCancelling(false);
    }
  };

  const downloadResult = async () => {
    if (taskId && resultDownloadUrl) {
      const session = getValidSession();
      if (!session) return;

      setIsDownloading(true);
      try {
        const ticketResponse = await fetch(toApiUrl(`/api/v1/tasks/${taskId}/download-link`), {
          method: "POST",
          headers: { Authorization: `Bearer ${session.accessToken}` },
        });
        if (!ticketResponse.ok) {
          const data = (await ticketResponse.json().catch(() => null)) as { message?: string } | null;
          setErrorMessage(data?.message || "下载链接创建失败。");
          return;
        }

        const ticketData = (await ticketResponse.json()) as TaskDownloadTicketResponse;
        const resolveResponse = await fetch(toApiUrl(ticketData.downloadPath), {
          method: "GET",
          headers: { Authorization: `Bearer ${session.accessToken}` },
        });
        if (!resolveResponse.ok) {
          const data = (await resolveResponse.json().catch(() => null)) as TaskDownloadResolveResponse | null;
          setErrorMessage(data?.message || "下载地址解析失败。");
          return;
        }

        const resolved = (await resolveResponse.json()) as TaskDownloadResolveResponse;
        if (resolved.downloadUrl) {
          const finalUrl = /^https?:\/\//i.test(resolved.downloadUrl) ? resolved.downloadUrl : toApiUrl(resolved.downloadUrl);
          window.open(finalUrl, "_blank", "noopener,noreferrer");
        }
        return;
      } finally {
        setIsDownloading(false);
      }
    }

    if (!resultText) return;
    const blob = new Blob([resultText], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${variant}-结果.txt`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const scrollToHistory = () => {
    document.getElementById(historySectionId)?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const isSubmitDisabled = isRunning || (inputMode === "text" ? !sourceText.trim() : !uploadedFiles[0]);

  if (isDetectVariant) {
    return (
      <div className="space-y-5">
        <section className="dashboard-card overflow-hidden px-6 py-7">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#6f78f7]">AIGC检测</p>
              <h1 className="mt-3 text-[30px] font-semibold tracking-[-0.03em] text-[#1f2436]">{copy.pageTitle}</h1>
              <p className="mt-3 max-w-3xl text-sm leading-7 text-[#67708a]">{copy.pageDesc}</p>
            </div>
            <div className="flex flex-wrap gap-2 text-sm">
              <span className="rounded-full bg-[#f2f4ff] px-4 py-2 text-[#5d64db]">每日免费 5 次</span>
              <span className="rounded-full border border-[#e6e9f2] bg-white px-4 py-2 text-[#69718a]">
                当前积分 {currentPoints ?? "--"}
              </span>
            </div>
          </div>
        </section>

        <section className="grid gap-4 xl:grid-cols-[1.08fr_0.92fr]">
          <div className="dashboard-card overflow-hidden">
            <div className="border-b border-[#eef1f6] px-5 py-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-[22px] font-semibold text-[#23283a]">上传检测内容</h2>
                  <p className="mt-1 text-sm text-[#8a91a7]">支持文本检测和文件检测，提交后自动轮询状态。</p>
                </div>
                <span className="rounded-full border border-[#ebedf4] px-4 py-2 text-sm text-[#6f7690]">
                  剩余免费次数 {remainingFreeDetect}
                </span>
              </div>
            </div>

            <div className="space-y-4 px-5 py-5">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-medium text-[#444b61]">检测平台</span>
                {platformOptions.map((item) => (
                  <button
                    key={item.code}
                    type="button"
                    onClick={() => setPlatform(item.code)}
                    className={`${platform === item.code ? "border-[#7269ff] bg-[#7269ff] text-white" : "border-[#e2e5ef] bg-white text-[#5f667d]"} rounded-full border px-4 py-1.5 text-sm transition`}
                  >
                    {item.label}
                  </button>
                ))}
              </div>

              <div className="rounded-[14px] border border-[#eceef5] bg-[#fcfcff] p-4">
                <div className="mb-4 flex items-center gap-6 border-b border-[#eceef5] pb-3">
                  <button
                    type="button"
                    onClick={() => setInputMode("text")}
                    className={`${inputMode === "text" ? "border-[#5a67ff] text-[#20263a]" : "border-transparent text-[#8b92a7]"} border-b-2 pb-2 text-sm font-medium transition`}
                  >
                    文本检测
                  </button>
                  <button
                    type="button"
                    onClick={() => setInputMode("upload")}
                    className={`${inputMode === "upload" ? "border-[#5a67ff] text-[#20263a]" : "border-transparent text-[#8b92a7]"} border-b-2 pb-2 text-sm font-medium transition`}
                  >
                    文件检测
                  </button>
                </div>

                {inputMode === "upload" ? (
                  <div className="space-y-4">
                    <div
                      {...sourceDropzone.getRootProps({
                        className: `${sourceDropzone.isDragActive ? "border-[#6d6dff] bg-[#f4f5ff]" : "border-[#d9ddea] bg-white"} flex min-h-[220px] cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed px-6 text-center`,
                      })}
                    >
                      <input {...sourceDropzone.getInputProps()} />
                      <UploadCloud size={28} className="mb-3 text-[#7c83a1]" />
                      <p className="text-base font-medium text-[#3a4056]">上传需要检测的文件</p>
                      <p className="mt-2 text-sm text-[#8b92a7]">支持 docx / pdf / txt，单文件最大 10MB。</p>
                      {uploadedFiles[0] ? (
                        <p className="mt-4 rounded-full bg-[#f2f4ff] px-4 py-1.5 text-xs text-[#5b62dd]">{uploadedFiles[0].name}</p>
                      ) : null}
                    </div>

                    <div className="grid gap-3 md:grid-cols-2">
                      <input
                        value={paperTitle}
                        onChange={(event) => setPaperTitle(event.target.value)}
                        className="h-12 rounded-xl border border-[#e2e5ef] bg-white px-4 text-sm text-[#3d445b] outline-none transition focus:border-[#7d76ff]"
                        placeholder="论文标题（可选）"
                      />
                      <input
                        value={authorName}
                        onChange={(event) => setAuthorName(event.target.value)}
                        className="h-12 rounded-xl border border-[#e2e5ef] bg-white px-4 text-sm text-[#3d445b] outline-none transition focus:border-[#7d76ff]"
                        placeholder="作者信息（可选）"
                      />
                    </div>
                  </div>
                ) : (
                  <textarea
                    value={sourceText}
                    onChange={(event) => setSourceText(event.target.value)}
                    className="h-[260px] w-full resize-none rounded-xl border border-[#dde2ef] bg-white px-4 py-4 text-[14px] leading-7 text-[#353c55] outline-none transition focus:border-[#7d76ff]"
                    placeholder="请输入或粘贴需要检测的段落内容。建议先检测高风险段落，处理效率更高。"
                  />
                )}

                <div className="mt-4 flex flex-wrap items-center gap-3">
                  <button type="button" onClick={resetForm} className="inline-flex h-10 items-center justify-center rounded-full border border-[#d7dcf0] px-4 text-sm text-[#60667e]">
                    重新输入
                  </button>
                  <button
                    type="button"
                    onClick={() => void startProcess()}
                    disabled={isSubmitDisabled}
                    className="inline-flex h-10 items-center justify-center rounded-full bg-[linear-gradient(135deg,#6e67ff,#6871ff)] px-5 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {isRunning ? "检测中..." : copy.submitText}
                  </button>
                  <span className="text-xs text-[#8c93a7]">
                    预计消耗 {estimatedPoints || 0} 点
                    {chargedPoints !== null ? ` · 实际扣除 ${chargedPoints} 点` : ""}
                    {freeDetectApplied ? " · 本次使用免费提现次数" : ""}
                  </span>
                </div>

                {isRunning ? (
                  <div className="mt-4 rounded-xl border border-[#e6e9f4] bg-white px-4 py-3">
                    <div className="mb-2 flex items-center justify-between text-sm text-[#5b6382]">
                      <span>{taskStatusLabel(taskStatus)}</span>
                      <span>{taskProgress}%</span>
                    </div>
                    <div className="h-2 rounded-full bg-[#edf0f8]">
                      <div className="h-2 rounded-full bg-[linear-gradient(135deg,#7568ff,#5f7cff)]" style={{ width: `${taskProgress}%` }} />
                    </div>
                  </div>
                ) : null}

                <p className="text-xs leading-6 text-[#9aa0b3]">检测结果仅供提交前自查参考，最终请以学校或期刊指定平台结果为准。</p>
                {errorMessage ? <p className="text-sm text-[#c14545]">{errorMessage}</p> : null}
              </div>
            </div>
          </div>

          <div className="space-y-4">
            {detectBreakdown ? (
              <section className="dashboard-card p-5">
                <div className="flex items-center justify-between gap-3">
                  <h3 className="text-[20px] font-semibold text-[#273155]">检测结果</h3>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => void copyText(resultText)}
                      disabled={!resultText}
                      className="inline-flex h-9 items-center gap-1 rounded-full border border-[#dde2ef] px-4 text-sm text-[#5c6480] disabled:opacity-50"
                    >
                      <Copy size={14} />
                      复制
                    </button>
                    <button
                      type="button"
                      onClick={() => void downloadResult()}
                      disabled={isDownloading || !resultText}
                      className="inline-flex h-9 items-center gap-1 rounded-full bg-[#756cff] px-4 text-sm text-white disabled:opacity-50"
                    >
                      <Download size={14} />
                      {isDownloading ? "准备中..." : "下载结果"}
                    </button>
                  </div>
                </div>
                <div className="mt-6 flex flex-col items-center">
                  <div className="relative h-40 w-40 rounded-full" style={{ background: `conic-gradient(#5d9bff 0 ${detectScore}%, #edf1fa ${detectScore}% 100%)` }}>
                    <div className="absolute inset-[22px] rounded-full bg-white" />
                    <div className="absolute inset-0 flex flex-col items-center justify-center">
                      <span className="text-[34px] font-semibold text-[#20263d]">{detectScore}%</span>
                      <span className="mt-1 text-xs text-[#8b93ab]">{detectBreakdown.label}</span>
                    </div>
                  </div>
                </div>
                <div className="mt-6 grid gap-3 sm:grid-cols-2">
                  <div className="rounded-xl bg-[#f7f9ff] px-4 py-3 text-sm text-[#5e6682]"><span className="text-[#e06767]">高风险</span><span className="float-right font-medium">{detectBreakdown.high}%</span></div>
                  <div className="rounded-xl bg-[#f7f9ff] px-4 py-3 text-sm text-[#5e6682]"><span className="text-[#f2a64a]">中风险</span><span className="float-right font-medium">{detectBreakdown.medium}%</span></div>
                  <div className="rounded-xl bg-[#f7f9ff] px-4 py-3 text-sm text-[#5e6682]"><span className="text-[#4f8ff7]">低风险</span><span className="float-right font-medium">{detectBreakdown.low}%</span></div>
                  <div className="rounded-xl bg-[#f7f9ff] px-4 py-3 text-sm text-[#5e6682]"><span className="text-[#8ea0b8]">无风险</span><span className="float-right font-medium">{detectBreakdown.none}%</span></div>
                </div>
                <div className="mt-4 flex items-center justify-between text-xs text-[#8f96ab]">
                  <span>检测时间：{new Date().toLocaleDateString("zh-CN")}</span>
                  <span>字数：{sourceText.trim().length || paperTitle.length || 0}</span>
                </div>
                <div className="mt-4 rounded-xl border border-[#e6eaf5] bg-[#fcfcff] p-4 text-sm leading-7 text-[#5a617a]">{resultText}</div>
              </section>
            ) : (
              <section className="dashboard-card p-5">
                <h3 className="text-[20px] font-semibold text-[#273155]">检测服务说明</h3>
                <div className="mt-4 space-y-4">
                  {detectServiceItems.map((item) => (
                    <div key={item.title} className="rounded-xl bg-[linear-gradient(180deg,#ffffff_0%,#fafbff_100%)] px-4 py-4">
                      <p className="text-[16px] font-semibold text-[#2f3752]">{item.title}</p>
                      <p className="mt-2 text-sm leading-7 text-[#69718c]">{item.body}</p>
                    </div>
                  ))}
                </div>
              </section>
            )}
          </div>
        </section>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <section className="grid gap-4 xl:grid-cols-2">
        {topCards.map((card) => (
          <Link
            key={card.key}
            href={card.href}
            className={`${card.key === variant ? "border-[#7268ff] shadow-[0_8px_22px_rgba(96,98,219,0.08)]" : ""} dashboard-card flex min-h-[128px] flex-col justify-between px-5 py-5 transition`}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-[20px] font-semibold text-[#21273b]">{card.title}</h2>
                <p className="mt-2 text-sm leading-6 text-[#737b93]">{card.desc}</p>
              </div>
              {card.key === variant ? <span className="mt-1 h-3 w-3 rounded-full bg-[#7268ff]" /> : null}
            </div>
          </Link>
        ))}
      </section>

      <section className="dashboard-card overflow-hidden">
        <div className="border-b border-[#eef1f6] px-5 py-4">
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-medium text-[#4e556d]">{requiresAcademicPlatform ? "适配平台" : "改写策略"}</span>
              {requiresAcademicPlatform ? (
                platformOptions.map((item) => (
                  <button
                    key={item.code}
                    type="button"
                    onClick={() => setPlatform(item.code)}
                    className={`${platform === item.code ? "border-[#736bff] bg-[#7167ff] text-white" : "border-[#e2e5ef] bg-white text-[#60687e]"} rounded-full border px-4 py-1.5 text-sm transition`}
                  >
                    {item.label}
                  </button>
                ))
              ) : (
                <span className="rounded-full border border-[#e2e5ef] bg-white px-4 py-1.5 text-sm text-[#60687e]">{genericPlatformLabel}</span>
              )}
            </div>

            <span className="ml-auto rounded-full border border-[#e9ebf3] px-4 py-1.5 text-sm text-[#6d7390]">当前积分 {currentPoints ?? "--"}</span>
          </div>
        </div>

        <div className="space-y-4 px-5 py-5">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <h1 className="text-[22px] font-semibold text-[#1e2436]">{copy.pageTitle}</h1>
              <span className="rounded-full bg-[#f5f6fc] px-3 py-1 text-xs text-[#7c849f]">
                {requiresAcademicPlatform ? `${currentPlatformLabel} 定向改写` : "通用学术改写"}
              </span>
            </div>
            <button type="button" onClick={scrollToHistory} className="inline-flex items-center gap-1 text-sm text-[#7f869d]">
              <History size={15} />
              历史记录
            </button>
          </div>

          <div className="rounded-xl border border-[#eef1f6] bg-[#fff7f7] px-4 py-3 text-sm leading-7 text-[#7f5252]">
            {rewriteWarnings.map((item, index) => (
              <p key={item}>
                {index + 1}. {item}
              </p>
            ))}
          </div>

          <div className="rounded-xl border border-[#eceef5] bg-[#fcfcff] p-4">
            <div className="grid gap-4 xl:grid-cols-[1.05fr_0.95fr]">
              <div className="space-y-4">
                <div className="flex items-center gap-6 border-b border-[#eceef5] pb-3">
                  <button
                    type="button"
                    onClick={() => setInputMode("text")}
                    className={`${inputMode === "text" ? "border-[#5a67ff] text-[#1f2436]" : "border-transparent text-[#8b92a7]"} border-b-2 pb-2 text-sm font-medium transition`}
                  >
                    粘贴文本
                  </button>
                  <button
                    type="button"
                    onClick={() => setInputMode("upload")}
                    className={`${inputMode === "upload" ? "border-[#5a67ff] text-[#1f2436]" : "border-transparent text-[#8b92a7]"} border-b-2 pb-2 text-sm font-medium transition`}
                  >
                    上传文件
                  </button>
                </div>

                {inputMode === "text" ? (
                  <textarea
                    value={sourceText}
                    onChange={(event) => setSourceText(event.target.value)}
                    className="h-[280px] w-full resize-none rounded-xl border border-[#dde2ef] bg-white px-4 py-4 text-[14px] leading-7 text-[#353c55] outline-none transition focus:border-[#7d76ff]"
                    placeholder="请输入或粘贴待处理内容。建议一次处理一个完整段落，方便结果复核。"
                  />
                ) : (
                  <div className="space-y-3">
                    <div
                      {...sourceDropzone.getRootProps({
                        className: `${sourceDropzone.isDragActive ? "border-[#6d6dff] bg-[#f4f5ff]" : "border-[#d9ddea] bg-white"} flex min-h-[178px] cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed px-6 text-center`,
                      })}
                    >
                      <input {...sourceDropzone.getInputProps()} />
                      <UploadCloud size={28} className="mb-3 text-[#7c83a1]" />
                      <p className="text-base font-medium text-[#3a4056]">上传待处理文档</p>
                      <p className="mt-2 text-sm text-[#8b92a7]">支持 docx / pdf / txt，单文件最大 10MB。</p>
                      {uploadedFiles[0] ? <p className="mt-4 rounded-full bg-[#f2f4ff] px-4 py-1.5 text-xs text-[#5b62dd]">{uploadedFiles[0].name}</p> : null}
                    </div>

                    {variant === "reduce-ai" ? (
                      <div
                        {...reportDropzone.getRootProps({
                          className: `${reportDropzone.isDragActive ? "border-[#6d6dff] bg-[#f6f6ff]" : "border-[#dfe3ed] bg-[#fbfbff]"} flex min-h-[104px] cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed px-6 text-center`,
                        })}
                      >
                        <input {...reportDropzone.getInputProps()} />
                        <p className="text-sm font-medium text-[#4a526c]">上传已有检测报告（可选）</p>
                        <p className="mt-1 text-xs text-[#8b92a7]">支持 PDF / TXT，可用于更稳定的定向改写。</p>
                        {reportFiles[0] ? <p className="mt-3 rounded-full bg-white px-4 py-1.5 text-xs text-[#5b62dd]">{reportFiles[0].name}</p> : null}
                      </div>
                    ) : null}
                  </div>
                )}

                <div className="flex flex-wrap items-center gap-3">
                  <button type="button" onClick={resetForm} className="inline-flex h-10 items-center justify-center rounded-full border border-[#d7dcf0] px-4 text-sm text-[#60667e]">
                    重置
                  </button>
                  <button
                    type="button"
                    onClick={() => void startProcess()}
                    disabled={isSubmitDisabled}
                    className="inline-flex h-10 items-center justify-center rounded-full bg-[linear-gradient(135deg,#6e67ff,#6871ff)] px-5 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {isRunning ? "处理中..." : copy.submitText}
                  </button>
                  <span className="text-xs text-[#8c93a7]">
                    预计消耗 {estimatedPoints || 0} 点
                    {chargedPoints !== null ? ` · 实际扣除 ${chargedPoints} 点` : ""}
                  </span>
                </div>

                {isRunning ? (
                  <div className="rounded-xl border border-[#e6e9f4] bg-white px-4 py-3">
                    <div className="mb-2 flex items-center justify-between text-sm text-[#5b6382]">
                      <span>{taskStatusLabel(taskStatus)}</span>
                      <span>{taskProgress}%</span>
                    </div>
                    <div className="h-2 rounded-full bg-[#edf0f8]">
                      <div className="h-2 rounded-full bg-[linear-gradient(135deg,#7568ff,#5f7cff)]" style={{ width: `${taskProgress}%` }} />
                    </div>
                  </div>
                ) : null}

                <p className="text-xs leading-6 text-[#9aa0b3]">{copy.pageDesc}</p>
                {errorMessage ? <p className="text-sm text-[#c14545]">{errorMessage}</p> : null}
              </div>

              <div className="flex min-h-[390px] flex-col rounded-xl border border-[#dde2ef] bg-white">
                <div className="flex items-center justify-between border-b border-[#eceef5] px-4 py-3">
                  <span className="text-sm font-medium text-[#2c3348]">结果预览</span>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => void copyText(resultText)}
                      disabled={!resultText}
                      className="inline-flex h-8 items-center justify-center rounded-full border border-[#dde2ef] px-4 text-xs font-medium text-[#5c6480] disabled:opacity-50"
                    >
                      <Copy size={13} />
                    </button>
                    <button
                      type="button"
                      onClick={() => void downloadResult()}
                      disabled={isDownloading || !resultText}
                      className="inline-flex h-8 items-center justify-center rounded-full bg-[#847bff] px-4 text-xs font-medium text-white disabled:opacity-50"
                    >
                      {isDownloading ? "准备中..." : "下载"}
                    </button>
                  </div>
                </div>

                <div className="flex-1 px-4 py-4">
                  {isRunning ? (
                    <div className="flex h-full items-center justify-center text-sm text-[#7a8199]">
                      <span className="mr-2 h-2.5 w-2.5 animate-pulse rounded-full bg-[#7a72ff]" />
                      正在生成改写结果...
                    </div>
                  ) : resultText ? (
                    <div className="h-full rounded-lg border border-[#e6eaf5] bg-[#fcfcff] px-4 py-4 text-sm leading-7 text-[#565d76]">{resultText}</div>
                  ) : (
                    <div className="flex h-full flex-col items-center justify-center text-center text-sm text-[#8b92a7]">
                      <p>提交任务后，这里会显示改写结果。</p>
                      <p className="mt-2 text-xs text-[#a0a6b9]">文本模式支持差异对比，文件模式支持处理后结果下载。</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section id={historySectionId} className="dashboard-card p-5">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-[20px] font-semibold text-[#253054]">{copy.recordsTitle}</h3>
          <button type="button" onClick={() => void loadAccountData()} className="text-sm text-[#838aa1]">
            刷新
          </button>
        </div>

        {historyEntries.length > 0 ? (
          <div className="space-y-4">
            {historyEntries.map((item) => (
              <div key={item.id} className="rounded-xl border border-[#eceef5] bg-[#fcfcff] p-4">
                <div className="mb-4 flex flex-wrap items-center justify-between gap-3 text-xs text-[#8c93a8]">
                  <div className="flex items-center gap-2">
                    <span>{item.createdLabel}</span>
                    <span className="rounded-full bg-[#eef1ff] px-2 py-1 text-[#686ee5]">{item.platform}</span>
                    <span className={`${item.status === "failed" ? "bg-[#fff1f1] text-[#c05454]" : item.status === "processing" ? "bg-[#f5f6ff] text-[#6870e6]" : "bg-[#eff9f2] text-[#2f8f5f]"} rounded-full px-2 py-1`}>
                      {historyStatusLabel(item.status)}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => void copyText(item.result)}
                    disabled={!item.result}
                    className="inline-flex h-8 items-center justify-center rounded-full bg-[#7469ff] px-4 text-xs font-medium text-white disabled:opacity-50"
                  >
                    复制结果
                  </button>
                </div>

                <div className="grid gap-4 lg:grid-cols-2">
                  <div>
                    <p className="mb-2 text-xs font-semibold uppercase tracking-[0.08em] text-[#9aa0b3]">原文</p>
                    <div className="min-h-[120px] rounded-lg border border-[#e7eaf3] bg-white px-4 py-3 text-sm leading-7 text-[#565d76]">{trimPreview(item.original)}</div>
                  </div>
                  <div>
                    <p className="mb-2 text-xs font-semibold uppercase tracking-[0.08em] text-[#9aa0b3]">结果</p>
                    <div className="min-h-[120px] rounded-lg border border-[#e7eaf3] bg-white px-4 py-3 text-sm leading-7 text-[#565d76]">
                      {item.status === "processing" ? "任务处理中，请稍后刷新查看结果。" : item.status === "failed" ? "任务未完成，请重试。" : trimPreview(item.result)}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="flex min-h-[140px] items-center justify-center rounded-xl border border-dashed border-[#dce1ef] text-sm text-[#8a91a7]">
            {isLoggedIn ? "提交任务后，最近记录会显示在这里。" : "登录后会自动保存最近 5 条处理记录。"}
          </div>
        )}
      </section>
    </div>
  );
}



