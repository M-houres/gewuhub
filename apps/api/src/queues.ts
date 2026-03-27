import { Queue } from "bullmq";
import IORedis from "ioredis";

const redisUrl = process.env.REDIS_URL || "redis://localhost:6379";
const enableQueue = process.env.ENABLE_QUEUE === "true";
const queueRetryCooldownMs = 30_000;

let connection: IORedis | null = null;
let docxProcessingQueue: Queue | null = null;
let queueRetryBlockedUntil = 0;

export type DocxProcessingJobPayload = {
  taskId: string;
  userId: string;
  sourceFileUrl: string;
  sourceFileName?: string;
  sourceFileSizeBytes?: number;
  sourceExtension?: string;
  mode: "deai" | "rewrite" | "detect";
};

export type EnqueueDocxProcessingResult =
  | {
      accepted: true;
      jobId: string;
    }
  | {
      accepted: false;
    };

function getQueue() {
  if (!connection) {
    connection = new IORedis(redisUrl, {
      maxRetriesPerRequest: null,
      enableReadyCheck: false,
      lazyConnect: true,
    });
    connection.on("error", () => {
      // Silence eager connection noise and allow local fallback mode to handle unavailable Redis.
    });
  }

  if (!docxProcessingQueue) {
    docxProcessingQueue = new Queue("docx-processing", {
      connection,
    });
  }

  return docxProcessingQueue;
}

async function disposeQueueClients() {
  const queue = docxProcessingQueue;
  const redisConnection = connection;
  docxProcessingQueue = null;
  connection = null;

  if (queue) {
    await queue.close().catch(() => undefined);
  }
  if (redisConnection) {
    redisConnection.disconnect(false);
  }
}

export async function enqueueDocxProcessing(payload: DocxProcessingJobPayload): Promise<EnqueueDocxProcessingResult> {
  if (!enableQueue) return { accepted: false };
  if (queueRetryBlockedUntil > Date.now()) return { accepted: false };

  try {
    const queue = getQueue();
    const job = await queue.add("docx-job", payload, {
      removeOnComplete: 100,
      removeOnFail: 100,
    });
    return {
      accepted: true,
      jobId: String(job.id),
    };
  } catch {
    queueRetryBlockedUntil = Date.now() + queueRetryCooldownMs;
    await disposeQueueClients();
    return { accepted: false };
  }
}

export async function shutdownDocxProcessingQueue() {
  queueRetryBlockedUntil = 0;
  await disposeQueueClients();
}
