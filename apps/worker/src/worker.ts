import "dotenv/config";
import { Worker } from "bullmq";
import IORedis from "ioredis";
import { resolveDocumentText } from "./document-source";
import { captureWorkerException, initWorkerMonitoring } from "./monitoring";

const redisUrl = process.env.REDIS_URL || "redis://localhost:6379";
const enableQueue = process.env.ENABLE_QUEUE === "true";
const apiInternalBaseUrl = (process.env.API_INTERNAL_BASE_URL || "http://127.0.0.1:4000").replace(/\/+$/, "");
const docxWorkerSecret = process.env.DOCX_WORKER_SECRET || "dev-docx-worker-secret";

const monitoringEnabled = initWorkerMonitoring("gewu-worker");

function normalizeError(error: unknown) {
  if (error instanceof Error) return error;
  return new Error(typeof error === "string" ? error : JSON.stringify(error));
}

function getErrorCode(error: unknown) {
  if (typeof error === "object" && error && "code" in error) {
    const value = (error as { code?: unknown }).code;
    return typeof value === "string" ? value : undefined;
  }
  return undefined;
}

function getErrorCause(error: unknown) {
  if (typeof error === "object" && error && "cause" in error) {
    const value = (error as { cause?: unknown }).cause;
    if (!value) return undefined;
    if (value instanceof Error) {
      return {
        name: value.name,
        message: value.message,
        stack: value.stack,
      };
    }
    return String(value);
  }
  return undefined;
}

function logWorkerError(label: string, error: unknown, extras?: Record<string, unknown>) {
  const normalized = normalizeError(error);
  const code = getErrorCode(error);
  const cause = getErrorCause(error);

  captureWorkerException(normalized, {
    ...extras,
    code,
    cause,
    name: normalized.name,
    message: normalized.message,
  });

  // eslint-disable-next-line no-console
  console.error(`[worker] ${label}`, {
    name: normalized.name,
    message: normalized.message,
    code,
    stack: normalized.stack,
    cause,
    ...extras,
  });
}

process.on("unhandledRejection", (reason) => {
  logWorkerError("unhandledRejection", reason, {
    hook: "process.unhandledRejection",
    queue: "docx-processing",
  });
});

process.on("uncaughtException", (error) => {
  logWorkerError("uncaughtException", error, {
    hook: "process.uncaughtException",
    queue: "docx-processing",
  });
});

function buildWorkerOutputUrl(taskId: string, mode: "deai" | "rewrite" | "detect") {
  const extension = mode === "detect" ? "txt" : "docx";
  return `https://oss-example.gewu.local/results/${taskId}.${extension}`;
}

async function postWorkerCallback(
  path: string,
  payload: Record<string, unknown>,
  options?: {
    tolerateStatuses?: number[];
  },
) {
  const response = await fetch(`${apiInternalBaseUrl}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-docx-worker-secret": docxWorkerSecret,
    },
    body: JSON.stringify(payload),
  });

  if (response.ok) return;

  const tolerated = options?.tolerateStatuses || [];
  if (tolerated.includes(response.status)) return;

  const responseText = await response.text().catch(() => "");
  throw new Error(`worker callback ${path} failed (${response.status}): ${responseText || response.statusText}`);
}

if (!enableQueue) {
  // eslint-disable-next-line no-console
  console.log("[worker] queue disabled (set ENABLE_QUEUE=true to enable Redis-backed docx jobs)");
  // eslint-disable-next-line no-console
  console.log(`[worker] monitoring ${monitoringEnabled ? "enabled" : "disabled"}`);
} else {
  const connection = new IORedis(redisUrl, {
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
    lazyConnect: true,
  });
  connection.on("error", () => {
    // Keep local/dev logs readable when Redis is temporarily unavailable.
  });

  let lastRuntimeErrorLogAt = 0;

  const worker = new Worker(
    "docx-processing",
    async (job) => {
      const workerJobId = String(job.id);

      await job.updateProgress(15);
      await postWorkerCallback("/api/internal/docx/progress", {
        taskId: job.data.taskId,
        workerJobId,
        progress: 15,
      });
      await new Promise((resolve) => setTimeout(resolve, 600));
      await job.updateProgress(55);
      await postWorkerCallback("/api/internal/docx/progress", {
        taskId: job.data.taskId,
        workerJobId,
        progress: 55,
      });
      await new Promise((resolve) => setTimeout(resolve, 600));
      await job.updateProgress(90);
      await postWorkerCallback("/api/internal/docx/progress", {
        taskId: job.data.taskId,
        workerJobId,
        progress: 90,
      });
      await new Promise((resolve) => setTimeout(resolve, 500));

      const outputUrl = buildWorkerOutputUrl(job.data.taskId, job.data.mode);
      const documentText =
        typeof job.data.documentText === "string" && job.data.documentText.trim().length > 0
          ? job.data.documentText
          : await resolveDocumentText({
              sourceFileUrl: job.data.sourceFileUrl,
              sourceExtension: job.data.sourceExtension,
              sourceFileBase64: job.data.sourceFileBase64,
            });
      const completePayload: Record<string, unknown> = {
        taskId: job.data.taskId,
        workerJobId,
        outputUrl,
      };
      if (documentText) {
        completePayload.documentText = documentText;
      }
      await postWorkerCallback("/api/internal/docx/complete", {
        ...completePayload,
      });

      return {
        taskId: job.data.taskId,
        status: "completed",
        outputUrl,
      };
    },
    { connection },
  );

  worker.on("completed", (job) => {
    // eslint-disable-next-line no-console
    console.log(`[worker] completed job ${job.id}`);
  });

  worker.on("failed", (job, error) => {
    if (job) {
      void postWorkerCallback(
        "/api/internal/docx/fail",
        {
          taskId: job.data.taskId,
          workerJobId: String(job.id),
          message: error.message || "Docx worker execution failed",
        },
        {
          tolerateStatuses: [404],
        },
      ).catch((callbackError) => {
        logWorkerError("failed callback", callbackError, {
          hook: "worker.failed.callback",
          jobId: job.id,
          queue: "docx-processing",
        });
      });
    }

    logWorkerError("failed job", error, {
      hook: "worker.failed",
      jobId: job?.id,
      queue: "docx-processing",
    });
  });

  worker.on("error", (error) => {
    const now = Date.now();
    if (now - lastRuntimeErrorLogAt >= 30_000) {
      lastRuntimeErrorLogAt = now;
      logWorkerError("runtime error", error, {
        hook: "worker.error",
        queue: "docx-processing",
      });
    }
  });

  // eslint-disable-next-line no-console
  console.log("[worker] Gewu docx-processing worker started");
  // eslint-disable-next-line no-console
  console.log(`[worker] monitoring ${monitoringEnabled ? "enabled" : "disabled"}`);
  // eslint-disable-next-line no-console
  console.log(`[worker] api callbacks -> ${apiInternalBaseUrl}`);
}
