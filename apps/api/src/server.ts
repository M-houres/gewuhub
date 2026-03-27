import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import cors from "@fastify/cors";
import type { FastifyReply, FastifyRequest } from "fastify";
import Fastify from "fastify";
import "dotenv/config";
import { z } from "zod";
import { academicPlatforms, taskRequiresAcademicPlatform } from "./academic-platforms";
import { createAccessToken, verifyPassword } from "./auth";
import { createDetectReportPdfBuffer } from "./detect-report-pdf";
import type { DetectReportModel } from "./detect-report-model";
import { getEmailTransportStatus, sendTransactionalEmail } from "./email";
import { captureApiException, flushApiMonitoring, initApiMonitoring } from "./monitoring";
import { resolveDocumentText } from "./document-source";
import { modelProviders, modelRouteInputSchema, routeModel } from "./model-router";
import { enqueueDocxProcessing, shutdownDocxProcessingQueue } from "./queues";
import { checkRateLimit } from "./rate-limit";
import { appendAdminAudit, listAdminAudit } from "./admin-audit";
import { createStoreStatePersistence } from "./state-persistence";
import { exportStoreSnapshot, hydrateStoreSnapshot, store, type StoreTask, type StoreUser, type WorkbenchNavKey } from "./store";
import { replaceSystemSettings, systemSettings, systemSettingsSchema } from "./system-settings";
import { buildTaskResult, estimateTaskPoints } from "./task-engine";

function toPositiveNumber(rawValue: string | number | undefined, fallback: number) {
  const parsed = Number(rawValue);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return parsed;
}

const port = Number(process.env.API_PORT || 4000);
const host = process.env.API_HOST || "0.0.0.0";
const adminToken = process.env.ADMIN_TOKEN || "dev-admin-token";
const adminUsername = process.env.ADMIN_USERNAME || "admin";
const adminPassword = process.env.ADMIN_PASSWORD || "dev-admin-password";
const paymentCallbackSecret = process.env.PAYMENT_CALLBACK_SECRET || "dev-payment-secret";
const generatedFileSecret = process.env.GENERATED_FILE_SECRET || "dev-generated-file-secret";
const docxWorkerSecret = process.env.DOCX_WORKER_SECRET || "dev-docx-worker-secret";
const enableMockPayment = process.env.ENABLE_MOCK_PAYMENT !== "false";
const appWebBaseUrl = process.env.APP_WEB_BASE_URL || "http://127.0.0.1:3000";
const parsedAccessTokenTtlSeconds = toPositiveNumber(process.env.ACCESS_TOKEN_TTL_SECONDS, 60 * 60 * 24 * 7);
const accessTokenTtlSeconds =
  Number.isFinite(parsedAccessTokenTtlSeconds) && parsedAccessTokenTtlSeconds > 0
    ? Math.floor(parsedAccessTokenTtlSeconds)
    : 60 * 60 * 24 * 7;
const parsedAdminAccessTokenTtlSeconds = toPositiveNumber(process.env.ADMIN_ACCESS_TOKEN_TTL_SECONDS, 60 * 60 * 12);
const adminAccessTokenTtlSeconds =
  Number.isFinite(parsedAdminAccessTokenTtlSeconds) && parsedAdminAccessTokenTtlSeconds > 0
    ? Math.floor(parsedAdminAccessTokenTtlSeconds)
    : 60 * 60 * 12;

const paymentChannels = ["alipay", "wechat", "stripe", "mock"] as const;
const paymentOrderChannels = ["alipay", "wechat", "stripe"] as const;
const allowedUploadExtensions = [".docx", ".pdf", ".txt"] as const;
const maxUploadSizeBytes = Math.floor(toPositiveNumber(process.env.MAX_UPLOAD_SIZE_BYTES, 10 * 1024 * 1024));
const maxTaskContentChars = Math.floor(toPositiveNumber(process.env.MAX_TASK_CONTENT_CHARS, 20000));
const maxModelPromptChars = Math.floor(toPositiveNumber(process.env.MAX_MODEL_PROMPT_CHARS, 20000));
const authLimitPerMinute = Math.floor(toPositiveNumber(process.env.RATE_LIMIT_AUTH_PER_MINUTE, 20));
const taskLimitPerMinute = Math.floor(toPositiveNumber(process.env.RATE_LIMIT_TASKS_PER_MINUTE, 20));
const modelRouteLimitPerMinute = Math.floor(toPositiveNumber(process.env.RATE_LIMIT_MODEL_ROUTE_PER_MINUTE, 30));
const paymentCreateLimitPerMinute = Math.floor(toPositiveNumber(process.env.RATE_LIMIT_PAYMENTS_PER_MINUTE, 10));
const paymentCallbackLimitPerMinute = Math.floor(toPositiveNumber(process.env.RATE_LIMIT_PAYMENT_NOTIFY_PER_MINUTE, 120));
const checkinLimitPerMinute = Math.floor(toPositiveNumber(process.env.RATE_LIMIT_CHECKIN_PER_MINUTE, 5));
const clientErrorLimitPerMinute = Math.floor(toPositiveNumber(process.env.RATE_LIMIT_CLIENT_ERROR_PER_MINUTE, 30));
const downloadTicketTtlSeconds = Math.floor(toPositiveNumber(process.env.DOWNLOAD_TICKET_TTL_SECONDS, 120));
const emailVerifyTokenTtlSeconds = Math.floor(toPositiveNumber(process.env.EMAIL_VERIFY_TOKEN_TTL_SECONDS, 30 * 60));
const passwordResetTokenTtlSeconds = Math.floor(toPositiveNumber(process.env.PASSWORD_RESET_TOKEN_TTL_SECONDS, 30 * 60));
const appEnv = (process.env.APP_ENV || "development").toLowerCase();
const exposeAuthDebugTokens =
  typeof process.env.EXPOSE_AUTH_DEBUG_TOKENS === "string"
    ? process.env.EXPOSE_AUTH_DEBUG_TOKENS === "true"
    : appEnv !== "production";

const uploadHostAllowlist = (process.env.OSS_ALLOWED_HOSTS || "")
  .split(",")
  .map((item) => item.trim().toLowerCase())
  .filter(Boolean);

const app = Fastify({
  logger: true,
});

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
  inviteCode: z.string().optional(),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

const adminLoginSchema = z.object({
  username: z.string().min(1).max(120),
  password: z.string().min(1).max(200),
});

const verifyEmailSchema = z.object({
  token: z.string().min(1),
});

const resendVerificationSchema = z.object({
  email: z.string().email(),
});

const forgotPasswordSchema = z.object({
  email: z.string().email(),
});

const resetPasswordSchema = z.object({
  token: z.string().min(1),
  password: z.string().min(6),
});

const tutorialStatusValues = ["draft", "published"] as const;
const publicTutorialListQuerySchema = z.object({
  tag: z.string().min(1).max(60).optional(),
  q: z.string().min(1).max(120).optional(),
});

const adminCreateTutorialSchema = z.object({
  slug: z.string().min(1).max(120).optional(),
  title: z.string().min(1).max(200),
  tag: z.string().min(1).max(60),
  summary: z.string().min(1).max(500),
  content: z.string().min(1).max(20000),
  status: z.enum(tutorialStatusValues).default("draft"),
});

const adminUpdateTutorialSchema = z
  .object({
    slug: z.string().min(1).max(120).optional(),
    title: z.string().min(1).max(200).optional(),
    tag: z.string().min(1).max(60).optional(),
    summary: z.string().min(1).max(500).optional(),
    content: z.string().min(1).max(20000).optional(),
    status: z.enum(tutorialStatusValues).optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one field is required",
  });

const planFeatureSchema = z.string().min(1).max(120);

const adminCreatePlanSchema = z.object({
  name: z.string().min(1).max(80),
  monthlyPrice: z.number().int().min(0).max(1_000_000),
  yearlyPrice: z.number().int().min(0).max(10_000_000),
  quota: z.number().int().min(0).max(1_000_000_000),
  features: z.array(planFeatureSchema).min(1).max(20),
});

const adminUpdatePlanSchema = z
  .object({
    name: z.string().min(1).max(80).optional(),
    monthlyPrice: z.number().int().min(0).max(1_000_000).optional(),
    yearlyPrice: z.number().int().min(0).max(10_000_000).optional(),
    quota: z.number().int().min(0).max(1_000_000_000).optional(),
    features: z.array(planFeatureSchema).min(1).max(20).optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one field is required",
  });

const taskCreateSchemaBase = z.object({
  type: z.string().min(1),
  content: z.string().min(1),
  mode: z.string().default("balanced"),
  provider: z.enum(modelProviders),
  modelId: z.string().min(1),
  platform: z.enum(academicPlatforms).optional(),
});

const taskCreateSchema = taskCreateSchemaBase.superRefine((value, context) => {
  if (taskRequiresAcademicPlatform(value.type) && !value.platform) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["platform"],
      message: "Platform is required for this task type.",
    });
  }
});

const longformTaskTypes = ["literature", "proposal", "article", "format", "ppt", "review"] as const;
const longformTaskStreamSchema = taskCreateSchemaBase.extend({
  type: z.enum(longformTaskTypes),
});

const docxSubmitSchema = z.object({
  taskId: z.string().min(1),
  sourceFileUrl: z.string().url(),
  sourceFileName: z.string().min(1).optional(),
  sourceFileSizeBytes: z.number().int().positive().optional(),
  mode: z.enum(["deai", "rewrite", "detect"]),
});
const docxWorkerProgressSchema = z.object({
  taskId: z.string().min(1),
  workerJobId: z.string().min(1).optional(),
  progress: z.number().min(0).max(100),
});
const docxWorkerCompleteSchema = z.object({
  taskId: z.string().min(1),
  workerJobId: z.string().min(1).optional(),
  outputUrl: z.string().url().optional(),
  documentText: z.string().min(1).max(500000).optional(),
});
const docxWorkerFailSchema = z.object({
  taskId: z.string().min(1),
  workerJobId: z.string().min(1).optional(),
  message: z.string().min(1).max(1000),
});

const createPaymentOrderSchema = z.object({
  pointsAmount: z.number().int().positive().max(1000000),
  amount: z.number().positive().max(50000),
  channel: z.enum(paymentOrderChannels).default("alipay"),
});

const paymentNotifySchema = z.object({
  outTradeNo: z.string().min(8),
  transactionId: z.string().min(1),
  amount: z.number().positive(),
  status: z.enum(["SUCCESS", "FAILED"]),
  channel: z.enum(paymentChannels),
  timestamp: z.string().min(1),
  sign: z.string().min(1),
});

const mockPaySchema = z.object({
  status: z.enum(["SUCCESS", "FAILED"]).default("SUCCESS"),
});

const adminRefundOrderSchema = z.object({
  reason: z.string().min(1).max(200).default("admin manual refund"),
});

const clientErrorSchema = z.object({
  message: z.string().min(1).max(2000),
  stack: z.string().max(10000).optional(),
  page: z.string().max(300).optional(),
  userAgent: z.string().max(800).optional(),
  source: z.string().max(100).optional(),
  createdAt: z.string().max(80).optional(),
});

const adjustPointsSchema = z.object({
  change: z.number().int(),
  reason: z.string().min(1),
});

const setUserBanSchema = z.object({
  banned: z.boolean(),
  reason: z.string().min(1).max(200).optional(),
});

const updateModelSchema = z.object({
  enabled: z.boolean().optional(),
  pointMultiplier: z.number().positive().optional(),
  hasApiKey: z.boolean().optional(),
});

const setModelApiKeySchema = z
  .object({
    apiKey: z.string().min(10).max(500).optional(),
    clear: z.boolean().optional(),
  })
  .refine((value) => value.clear || Boolean(value.apiKey), {
    message: "Either apiKey or clear=true is required",
  });

const updateWorkbenchNavSchema = z.object({
  visible: z.boolean(),
});

type UserAuthContext = {
  token: string;
  user: StoreUser;
  expiresAt: string;
};

type TaskCreateResult =
  | {
      status: "ok";
      taskId: string;
      taskStatus: "queued" | "running" | "completed" | "failed";
      pointsCost: number;
      freeDetectApplied: boolean;
      points: number;
    }
  | {
      status: "insufficient-points";
      points: number;
      required: number;
    }
  | {
      status: "user-not-found";
    };

type TaskCreateInput = z.infer<typeof taskCreateSchema>;

type PaymentNotifyInput = z.infer<typeof paymentNotifySchema>;
type PaymentNotifyCore = Omit<PaymentNotifyInput, "sign">;

type PaymentProcessResult = {
  statusCode: number;
  body: Record<string, unknown>;
};

type DocxMode = z.infer<typeof docxSubmitSchema>["mode"];

type AdminSessionRecord = {
  token: string;
  username: string;
  expiresAtMs: number;
};

type AdminAuthContext = {
  kind: "legacy-token" | "session";
  token: string;
  username: string;
  expiresAt: string | null;
};

const userLocks = new Map<string, Promise<void>>();
const adminSessions = new Map<string, AdminSessionRecord>();

function readBearerToken(request: FastifyRequest) {
  const rawHeader = request.headers.authorization;
  const headerValue = Array.isArray(rawHeader) ? rawHeader[0] : rawHeader;
  if (!headerValue) return null;

  const matched = headerValue.match(/^Bearer\s+(.+)$/i);
  if (!matched?.[1]) return null;
  return matched[1].trim();
}

function issueSession(user: StoreUser) {
  const token = createAccessToken();
  const expiresAt = new Date(Date.now() + accessTokenTtlSeconds * 1000).toISOString();
  store.createSession({ token, userId: user.id, expiresAt });
  return { token, expiresAt };
}

function issueAdminSession(username: string) {
  removeExpiredAdminSessions();
  const token = `adm_${randomBytes(24).toString("hex")}`;
  const expiresAtMs = Date.now() + adminAccessTokenTtlSeconds * 1000;
  adminSessions.set(token, {
    token,
    username,
    expiresAtMs,
  });
  return {
    token,
    expiresAt: new Date(expiresAtMs).toISOString(),
    username,
  };
}

function removeExpiredAdminSessions() {
  if (adminSessions.size === 0) return;
  const now = Date.now();
  for (const [token, session] of adminSessions.entries()) {
    if (session.expiresAtMs <= now) {
      adminSessions.delete(token);
    }
  }
}

function readLegacyAdminHeaderToken(request: FastifyRequest) {
  const rawToken = request.headers["x-admin-token"];
  return Array.isArray(rawToken) ? rawToken[0] : rawToken;
}

function safeEqualString(left: string, right: string) {
  const leftBytes = Buffer.from(left);
  const rightBytes = Buffer.from(right);
  if (leftBytes.length !== rightBytes.length) return false;
  return timingSafeEqual(leftBytes, rightBytes);
}

function readSingleHeader(request: FastifyRequest, headerName: string) {
  const rawValue = request.headers[headerName];
  return Array.isArray(rawValue) ? rawValue[0] : rawValue;
}

function verifyAdminCredentials(input: z.infer<typeof adminLoginSchema>) {
  return safeEqualString(input.username, adminUsername) && safeEqualString(input.password, adminPassword);
}

async function withUserLock<T>(userId: string, operation: () => Promise<T>) {
  const previousLock = userLocks.get(userId) ?? Promise.resolve();
  let releaseLock = () => {};
  const currentLock = new Promise<void>((resolve) => {
    releaseLock = resolve;
  });
  const lockRef = previousLock.then(() => currentLock);
  userLocks.set(userId, lockRef);

  await previousLock;
  try {
    return await operation();
  } finally {
    releaseLock();
    if (userLocks.get(userId) === lockRef) {
      userLocks.delete(userId);
    }
  }
}

function getClientIp(request: FastifyRequest) {
  const forwardedFor = request.headers["x-forwarded-for"];
  const forwardedValue = Array.isArray(forwardedFor) ? forwardedFor[0] : forwardedFor;
  if (forwardedValue) {
    const first = forwardedValue.split(",")[0]?.trim();
    if (first) return first;
  }
  return request.ip || "unknown";
}

async function enforceRateLimit(input: {
  reply: FastifyReply;
  bucket: string;
  identifier: string;
  max: number;
  windowMs: number;
  message: string;
}) {
  const max = Math.max(1, Math.floor(input.max));
  const windowMs = Math.max(1000, Math.floor(input.windowMs));
  const result = checkRateLimit({
    bucket: input.bucket,
    identifier: input.identifier,
    max,
    windowMs,
  });

  input.reply.header("X-RateLimit-Limit", String(result.limit));
  input.reply.header("X-RateLimit-Remaining", String(result.remaining));
  input.reply.header("Retry-After", String(result.retryAfterSeconds));

  if (!result.allowed) {
    await input.reply.status(429).send({
      message: input.message,
      retryAfterSeconds: result.retryAfterSeconds,
    });
    return false;
  }

  return true;
}

function hasMeaningfulContent(value: string) {
  return /[\p{L}\p{N}]/u.test(value);
}

function resolveFileExtension(sourceFileUrl: string, sourceFileName?: string) {
  const source = (sourceFileName || new URL(sourceFileUrl).pathname).toLowerCase();
  const lastDot = source.lastIndexOf(".");
  if (lastDot < 0) return "";
  return source.slice(lastDot);
}

function isAllowedUploadHost(sourceFileUrl: string) {
  if (uploadHostAllowlist.length === 0) return true;
  const hostname = new URL(sourceFileUrl).hostname.toLowerCase();
  return uploadHostAllowlist.includes(hostname);
}

function expectedTaskTypeForDocxMode(mode: DocxMode) {
  if (mode === "rewrite") return "reduce-repeat";
  if (mode === "deai") return "reduce-ai";
  return "detect";
}

function isDocxModeCompatible(taskType: string, mode: DocxMode) {
  return expectedTaskTypeForDocxMode(mode) === taskType;
}

function resolveTaskPointMultiplier(task: StoreTask) {
  const payloadMultiplier = task.payload.pointMultiplier;
  if (typeof payloadMultiplier === "number" && Number.isFinite(payloadMultiplier) && payloadMultiplier > 0) {
    return payloadMultiplier;
  }

  const model = store.models.find(
    (item) => item.provider === task.payload.provider && item.modelId === task.payload.modelId,
  );
  if (typeof model?.pointMultiplier === "number" && Number.isFinite(model.pointMultiplier) && model.pointMultiplier > 0) {
    return model.pointMultiplier;
  }

  return 1;
}

function estimateFinalTaskCost(task: StoreTask, content: string) {
  const estimated = estimateTaskPoints({
    taskType: task.type,
    content,
    mode: task.payload.mode,
  });

  if (task.type === "detect" && task.pointsCost === 0) {
    return 0;
  }

  return Math.ceil(estimated * resolveTaskPointMultiplier(task));
}

function getOptionalUserFromToken(request: FastifyRequest) {
  const token = readBearerToken(request);
  if (!token) return null;
  const session = store.getSession(token);
  if (!session) return null;
  return store.getUserById(session.userId) ?? null;
}

function toPublicUser(user: StoreUser) {
  return {
    id: user.id,
    email: user.email,
    emailVerified: user.emailVerified,
    role: user.role,
    points: user.points,
    agentPoints: user.agentPoints,
  };
}

function toSignSource(payload: PaymentNotifyCore) {
  return `${payload.outTradeNo}|${payload.transactionId}|${payload.amount.toFixed(2)}|${payload.status}|${payload.channel}|${payload.timestamp}`;
}

function signPaymentPayload(payload: PaymentNotifyCore) {
  return createHmac("sha256", paymentCallbackSecret).update(toSignSource(payload)).digest("hex");
}

function toGeneratedDetectReportSignSource(taskId: string, expiresAtMs: number) {
  return `${taskId}|${expiresAtMs}`;
}

function signGeneratedDetectReport(taskId: string, expiresAtMs: number) {
  return createHmac("sha256", generatedFileSecret).update(toGeneratedDetectReportSignSource(taskId, expiresAtMs)).digest("hex");
}

function verifyGeneratedDetectReportSignature(taskId: string, expiresAtMs: number, providedSignature: string) {
  const expected = signGeneratedDetectReport(taskId, expiresAtMs);
  if (expected.length !== providedSignature.length) return false;
  return timingSafeEqual(Buffer.from(expected), Buffer.from(providedSignature));
}

function getTaskDetectReport(task: StoreTask | null | undefined) {
  return ((task?.result as { report?: DetectReportModel } | undefined)?.report ?? null) as DetectReportModel | null;
}

function verifyPaymentSignature(payload: PaymentNotifyInput) {
  const provided = payload.sign.toLowerCase();
  const expected = signPaymentPayload({
    outTradeNo: payload.outTradeNo,
    transactionId: payload.transactionId,
    amount: payload.amount,
    status: payload.status,
    channel: payload.channel,
    timestamp: payload.timestamp,
  }).toLowerCase();

  if (provided.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(provided), Buffer.from(expected));
}

function safeJson(value: unknown) {
  try {
    return JSON.stringify(value);
  } catch {
    return "[unserializable]";
  }
}

function buildMockTransactionId() {
  return `mock_txn_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function toAppLink(path: string, query?: Record<string, string>) {
  const base = appWebBaseUrl.endsWith("/") ? appWebBaseUrl : `${appWebBaseUrl}/`;
  const normalizedPath = path.startsWith("/") ? path.slice(1) : path;
  const url = new URL(normalizedPath, base);
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      url.searchParams.set(key, value);
    }
  }
  return url.toString();
}

async function sendAndLogEmail(input: {
  userId?: string;
  to: string;
  subject: string;
  text: string;
  html?: string;
  category: "auth.verify-email" | "auth.reset-password" | "payment.success";
  meta?: Record<string, unknown>;
}) {
  const emailResult = await sendTransactionalEmail({
    to: input.to,
    subject: input.subject,
    text: input.text,
    html: input.html,
  });

  store.appendEmailDeliveryLog({
    userId: input.userId,
    to: input.to,
    subject: input.subject,
    category: input.category,
    status: emailResult.ok ? "sent" : "failed",
    provider: emailResult.provider,
    messageId: emailResult.messageId,
    error: emailResult.error,
    meta: input.meta ? safeJson(input.meta) : undefined,
  });

  return emailResult;
}

async function handlePaymentNotification(payload: PaymentNotifyInput, rawPayload: unknown): Promise<PaymentProcessResult> {
  const verified = verifyPaymentSignature(payload);
  if (!verified) {
    store.appendPaymentCallbackLog({
      outTradeNo: payload.outTradeNo,
      channel: payload.channel,
      transactionId: payload.transactionId,
      payload: safeJson(rawPayload),
      verified: false,
      accepted: false,
      reason: "INVALID_SIGNATURE",
    });
    return {
      statusCode: 401,
      body: { message: "Invalid callback signature" },
    };
  }

  const targetOrder = store.getOrderByOutTradeNo(payload.outTradeNo);
  if (!targetOrder) {
    store.appendPaymentCallbackLog({
      outTradeNo: payload.outTradeNo,
      channel: payload.channel,
      transactionId: payload.transactionId,
      payload: safeJson(rawPayload),
      verified: true,
      accepted: false,
      reason: "ORDER_NOT_FOUND",
    });
    return {
      statusCode: 404,
      body: { message: "Order not found" },
    };
  }

  const processResult = await withUserLock(targetOrder.userId, async () => {
    const order = store.getOrderById(targetOrder.id);
    if (!order) {
      return {
        statusCode: 404,
        body: { message: "Order not found" },
        accepted: false,
        reason: "ORDER_NOT_FOUND",
      };
    }

    store.bumpOrderCallbackCount(order.id);

    if (payload.status === "FAILED") {
      const failed = store.markOrderFailed({
        orderId: order.id,
        reason: "gateway failed",
        channel: payload.channel,
        transactionId: payload.transactionId,
      });
      if (!failed.ok && failed.reason === "ORDER_ALREADY_PAID") {
        return {
          statusCode: 200,
          body: {
            message: "Order already paid, callback accepted",
            orderId: order.id,
            outTradeNo: order.outTradeNo,
            idempotent: true,
          },
          accepted: true,
          reason: "ALREADY_PAID",
        };
      }
      if (!failed.ok && failed.reason === "ORDER_REFUNDED") {
        return {
          statusCode: 409,
          body: { message: "Order already refunded" },
          accepted: false,
          reason: "ORDER_REFUNDED",
        };
      }

      return {
        statusCode: 200,
        body: {
          message: "Payment failed callback accepted",
          orderId: order.id,
          outTradeNo: order.outTradeNo,
          status: "failed",
        },
        accepted: true,
        reason: "MARKED_FAILED",
      };
    }

    const marked = store.markOrderPaid({
      orderId: order.id,
      amount: payload.amount,
      channel: payload.channel,
      transactionId: payload.transactionId,
    });

    if (!marked.ok) {
      if (marked.reason === "AMOUNT_MISMATCH") {
        return {
          statusCode: 409,
          body: { message: "Amount mismatch" },
          accepted: false,
          reason: "AMOUNT_MISMATCH",
        };
      }
      if (marked.reason === "ORDER_REFUNDED") {
        return {
          statusCode: 409,
          body: { message: "Order already refunded" },
          accepted: false,
          reason: "ORDER_REFUNDED",
        };
      }
      return {
        statusCode: 404,
        body: { message: "Order not found" },
        accepted: false,
        reason: "ORDER_NOT_FOUND",
      };
    }

    let currentPoints = store.getUserById(order.userId)?.points ?? null;
    if (!marked.alreadyPaid && marked.order.orderType === "topup" && marked.order.pointsAmount > 0) {
      const updatedUser = store.addPoints({
        userId: marked.order.userId,
        change: marked.order.pointsAmount,
        reason: `recharge order ${marked.order.outTradeNo}`,
      });
      currentPoints = updatedUser?.points ?? currentPoints;
    }

    return {
      statusCode: 200,
      body: {
        message: marked.alreadyPaid ? "Callback accepted (idempotent)" : "Payment confirmed",
        idempotent: marked.alreadyPaid,
        orderId: marked.order.id,
        outTradeNo: marked.order.outTradeNo,
        status: marked.order.status,
        pointsBalance: currentPoints,
      },
      accepted: true,
      reason: marked.alreadyPaid ? "ALREADY_PAID" : "PAID_SUCCESS",
    };
  });

  store.appendPaymentCallbackLog({
    outTradeNo: payload.outTradeNo,
    orderId: targetOrder.id,
    channel: payload.channel,
    transactionId: payload.transactionId,
    payload: safeJson(rawPayload),
    verified: true,
    accepted: processResult.accepted,
    reason: processResult.reason,
  });

  if (processResult.reason === "PAID_SUCCESS") {
    const latestOrder = store.getOrderById(targetOrder.id);
    const targetUser = latestOrder ? store.getUserById(latestOrder.userId) : null;
    if (latestOrder && targetUser) {
      const pointsBalanceRaw =
        processResult.body && typeof processResult.body.pointsBalance === "number" ? processResult.body.pointsBalance : targetUser.points;
      const pointsBalance = Number(pointsBalanceRaw);

      await sendAndLogEmail({
        userId: targetUser.id,
        to: targetUser.email,
        subject: "Gewu Recharge Successful",
        text:
          `Hello,\n\nYour recharge order has been paid successfully.\n\n` +
          `Order: ${latestOrder.outTradeNo}\n` +
          `Amount: CNY ${latestOrder.amount}\n` +
          `Points credited: ${latestOrder.pointsAmount}\n` +
          `Current points: ${Number.isFinite(pointsBalance) ? pointsBalance : targetUser.points}\n\n` +
          `You can view details in: ${toAppLink("/zh/points")}\n\n` +
          `- Gewu Team`,
        category: "payment.success",
        meta: {
          outTradeNo: latestOrder.outTradeNo,
          amount: latestOrder.amount,
          pointsAmount: latestOrder.pointsAmount,
          pointsBalance: Number.isFinite(pointsBalance) ? pointsBalance : targetUser.points,
        },
      });
    }
  }

  return {
    statusCode: processResult.statusCode,
    body: processResult.body,
  };
}

async function requireAdmin(request: FastifyRequest, reply: FastifyReply) {
  const requestWithAdmin = request as FastifyRequest & { adminAuth?: AdminAuthContext };
  const legacyToken = readLegacyAdminHeaderToken(request);
  if (legacyToken && safeEqualString(legacyToken, adminToken)) {
    requestWithAdmin.adminAuth = {
      kind: "legacy-token",
      token: legacyToken,
      username: adminUsername,
      expiresAt: null,
    };
    return;
  }

  const token = readBearerToken(request);
  if (!token) {
    return reply.status(401).send({ message: "Admin authorization required" });
  }

  removeExpiredAdminSessions();
  const session = adminSessions.get(token);
  if (!session) {
    return reply.status(401).send({ message: "Admin authorization required" });
  }

  requestWithAdmin.adminAuth = {
    kind: "session",
    token: session.token,
    username: session.username,
    expiresAt: new Date(session.expiresAtMs).toISOString(),
  };
}

function getAdminActorFromRequest(request: FastifyRequest) {
  const auth = (request as FastifyRequest & { adminAuth?: AdminAuthContext }).adminAuth;
  return auth?.username || adminUsername;
}

function writeAdminActionLog(
  request: FastifyRequest,
  input: {
    action: string;
    targetType: string;
    targetId?: string;
    summary: string;
    detail?: Record<string, unknown>;
  },
) {
  return appendAdminAudit({
    actor: getAdminActorFromRequest(request),
    action: input.action,
    targetType: input.targetType,
    targetId: input.targetId,
    summary: input.summary,
    detail: input.detail,
  });
}

async function requireUser(request: FastifyRequest, reply: FastifyReply): Promise<UserAuthContext | null> {
  const token = readBearerToken(request);
  if (!token) {
    await reply.status(401).send({ message: "User authorization required" });
    return null;
  }

  const session = store.getSession(token);
  if (!session) {
    await reply.status(401).send({ message: "Session expired or invalid" });
    return null;
  }

  const user = store.getUserById(session.userId);
  if (!user) {
    store.revokeSession(token);
    await reply.status(401).send({ message: "Session expired or invalid" });
    return null;
  }

  if (user.banned) {
    store.revokeSession(token);
    await reply.status(403).send({
      message: user.banReason ? `Account is banned: ${user.banReason}` : "Account is banned",
      code: "ACCOUNT_BANNED",
    });
    return null;
  }

  if (!user.emailVerified) {
    store.revokeSession(token);
    await reply.status(403).send({ message: "Email not verified", code: "EMAIL_NOT_VERIFIED" });
    return null;
  }

  return {
    token,
    user,
    expiresAt: session.expiresAt,
  };
}

async function requireDocxWorker(request: FastifyRequest, reply: FastifyReply) {
  const providedSecret = readSingleHeader(request, "x-docx-worker-secret");
  if (!providedSecret || !safeEqualString(providedSecret, docxWorkerSecret)) {
    await reply.status(401).send({ message: "Worker authorization required" });
    return false;
  }
  return true;
}

async function createTaskForUser(userId: string, input: TaskCreateInput, modelPointMultiplier: number): Promise<TaskCreateResult> {
  return withUserLock<TaskCreateResult>(userId, async () => {
    const currentUser = store.getUserById(userId);
    if (!currentUser) {
      return { status: "user-not-found" };
    }

    const freeDetect =
      input.type === "detect" && currentUser.dailyDetectUsed < systemSettings.algorithmEngine.detect.dailyFreeLimit;
    const estimated = estimateTaskPoints({
      taskType: input.type,
      content: input.content,
      mode: input.mode,
    });
    const finalCost = freeDetect ? 0 : Math.ceil(estimated * modelPointMultiplier);

    if (currentUser.points < finalCost) {
      return {
        status: "insufficient-points",
        points: currentUser.points,
        required: finalCost,
      };
    }

    if (finalCost > 0) {
      store.addPoints({
        userId: currentUser.id,
        change: -finalCost,
        reason: `${input.type} task cost`,
      });
    }

    if (input.type === "detect") {
      currentUser.dailyDetectUsed += 1;
    }

    const task = store.createTask({
      userId: currentUser.id,
      type: input.type,
      content: input.content,
      mode: input.mode,
      provider: input.provider,
      modelId: input.modelId,
      pointsCost: finalCost,
      pointMultiplier: modelPointMultiplier,
      platform: input.platform,
    });

    return {
      status: "ok",
      taskId: task.id,
      taskStatus: task.status,
      pointsCost: finalCost,
      freeDetectApplied: freeDetect,
      points: currentUser.points,
    };
  });
}

function markTaskFailedAndRefundLocked(userId: string, taskId: string, message: string) {
  const task = store.getTask(taskId);
  if (!task || task.userId !== userId) return null;
  if (task.status === "completed") return task;

  const failedTask =
    task.status === "failed"
      ? task
      : store.markTaskFailed({
          taskId: task.id,
          message,
        });
  if (!failedTask) return null;

  if (failedTask.pointsCost > 0 && !failedTask.pointsRefunded) {
    store.addPoints({
      userId,
      change: failedTask.pointsCost,
      reason: `${failedTask.type} task failed refund (${failedTask.id})`,
    });
    store.markTaskPointsRefunded(failedTask.id);
  }

  return failedTask;
}

async function markTaskFailedAndRefund(userId: string, taskId: string, message: string) {
  return withUserLock(userId, async () => markTaskFailedAndRefundLocked(userId, taskId, message));
}

function writeSseEvent(reply: FastifyReply, event: string, data: Record<string, unknown>) {
  reply.raw.write(`event: ${event}\n`);
  reply.raw.write(`data: ${JSON.stringify(data)}\n\n`);
}

function toChunkList(text: string, chunkSize: number) {
  const normalized = text || "";
  const list: string[] = [];
  for (let cursor = 0; cursor < normalized.length; cursor += chunkSize) {
    list.push(normalized.slice(cursor, cursor + chunkSize));
  }
  return list.length > 0 ? list : [""];
}

async function bootstrap() {
  const monitoringEnabled = initApiMonitoring("gewu-api");
  const statePersistence = createStoreStatePersistence({
    databaseUrl: process.env.STORE_PERSISTENCE_ENABLED === "false" ? undefined : process.env.DATABASE_URL,
    logger: app.log,
  });
  let persistenceReady = statePersistence.enabled;
  if (persistenceReady) {
    try {
      await statePersistence.init();
      const persistedSnapshot = await statePersistence.loadSnapshot();
      const hydrateResult = hydrateStoreSnapshot(persistedSnapshot);
      if (hydrateResult.hydrated) {
        app.log.info(
          {
            collectionCount: hydrateResult.changedCollections.length,
            collections: hydrateResult.changedCollections,
          },
          "Loaded persisted API store snapshot from PostgreSQL.",
        );
      } else {
        app.log.info("No valid persisted API snapshot found; using default in-memory seed state.");
      }
    } catch (error) {
      persistenceReady = false;
      captureApiException(error, {
        tags: { scope: "state-persistence.init" },
      });
      app.log.error({ error }, "State persistence init failed; fallback to in-memory mode.");
    }
  }

  let lastSnapshotHash = "";
  let persistTimer: NodeJS.Timeout | null = null;
  let persistChain: Promise<void> = Promise.resolve();

  const persistSnapshotNow = async (reason: string) => {
    if (!persistenceReady) return;
    const snapshot = exportStoreSnapshot();
    const nextHash = JSON.stringify(snapshot);
    if (nextHash === lastSnapshotHash) return;

    try {
      await statePersistence.saveSnapshot(snapshot);
      lastSnapshotHash = nextHash;
      app.log.debug({ reason }, "Persisted API store snapshot.");
    } catch (error) {
      captureApiException(error, {
        tags: { scope: "state-persistence.save" },
        extras: { reason },
      });
      app.log.error({ error, reason }, "Failed to persist API store snapshot.");
    }
  };

  const scheduleSnapshotPersist = (reason: string, delayMs = 400) => {
    if (!persistenceReady) return;
    if (persistTimer) return;

    persistTimer = setTimeout(() => {
      persistTimer = null;
      persistChain = persistChain.then(() => persistSnapshotNow(reason));
    }, Math.max(0, Math.floor(delayMs)));

    if (typeof persistTimer.unref === "function") {
      persistTimer.unref();
    }
  };

  const localDocxTimers = new Map<string, NodeJS.Timeout[]>();

  const clearLocalDocxTimers = (taskId: string) => {
    const timers = localDocxTimers.get(taskId);
    if (!timers) return;
    for (const timer of timers) {
      clearTimeout(timer);
    }
    localDocxTimers.delete(taskId);
  };

  const markDocxJobFailed = (taskId: string, message: string, workerJobId?: string) => {
    clearLocalDocxTimers(taskId);
    store.updateDocxJob({
      taskId,
      status: "failed",
      progress: 100,
      errorMessage: message,
      workerJobId,
    });
    scheduleSnapshotPersist(`docx-failed:${taskId}`, 0);
  };

  const ensureDocxWorkerBinding = (taskId: string, workerJobId?: string) => {
    const docxJob = store.getDocxJob(taskId);
    if (!docxJob) {
      return {
        ok: false as const,
        reason: "DOCX_JOB_NOT_FOUND" as const,
      };
    }

    if (!workerJobId) {
      return {
        ok: true as const,
        job: docxJob,
      };
    }

    if (docxJob.workerJobId && docxJob.workerJobId !== workerJobId) {
      return {
        ok: false as const,
        reason: "WORKER_JOB_MISMATCH" as const,
        job: docxJob,
      };
    }

    if (!docxJob.workerJobId) {
      const updated = store.updateDocxJob({
        taskId,
        workerJobId,
      });
      return {
        ok: true as const,
        job: updated ?? docxJob,
      };
    }

    return {
      ok: true as const,
      job: docxJob,
    };
  };

  const finalizeDocxJobFromTask = (taskId: string) => {
    const task = store.getTask(taskId);
    const docxJob = store.getDocxJob(taskId);
    if (!task || !docxJob) return null;

    if (task.status === "completed") {
      clearLocalDocxTimers(taskId);
      return store.updateDocxJob({
        taskId,
        status: "completed",
        progress: 100,
        outputCompleted: true,
      });
    }

    if (task.status === "failed") {
      markDocxJobFailed(taskId, task.result?.output || `Task ${taskId} failed during document processing.`);
      return store.getDocxJob(taskId);
    }

    return docxJob;
  };

  const reconcileTaskPointsForContentLocked = (task: StoreTask, nextContent: string) => {
    const normalizedContent = nextContent.trim();
    if (!normalizedContent) {
      return {
        ok: true as const,
        pointsCost: task.pointsCost,
      };
    }

    const nextPointsCost = estimateFinalTaskCost(task, normalizedContent);
    const pointsDelta = nextPointsCost - task.pointsCost;
    const user = store.getUserById(task.userId);

    if (!user) {
      store.markTaskFailed({
        taskId: task.id,
        message: `Task ${task.id} cannot be completed because the task owner no longer exists.`,
      });
      markDocxJobFailed(task.id, `Task ${task.id} cannot be completed because the task owner no longer exists.`);
      return {
        ok: false as const,
        reason: "USER_NOT_FOUND" as const,
      };
    }

    if (pointsDelta > 0) {
      if (user.points < pointsDelta) {
        markTaskFailedAndRefundLocked(
          task.userId,
          task.id,
          `Task ${task.id} requires ${pointsDelta} additional points after document extraction.`,
        );
        markDocxJobFailed(task.id, `Insufficient points after document extraction. ${pointsDelta} more points required.`);
        return {
          ok: false as const,
          reason: "INSUFFICIENT_POINTS" as const,
          required: pointsDelta,
          points: user.points,
        };
      }

      store.addPoints({
        userId: user.id,
        change: -pointsDelta,
        reason: `${task.type} docx repricing surcharge (${task.id})`,
      });
    } else if (pointsDelta < 0) {
      store.addPoints({
        userId: user.id,
        change: Math.abs(pointsDelta),
        reason: `${task.type} task repricing refund (${task.id})`,
      });
    }

    task.payload.content = normalizedContent;
    task.pointsCost = nextPointsCost;
    task.updatedAt = new Date().toISOString();

    return {
      ok: true as const,
      pointsCost: nextPointsCost,
    };
  };

  const completeDocxTask = (taskId: string, input?: { outputUrl?: string; workerJobId?: string; content?: string }) => {
    const task = store.getTask(taskId);
    if (!task) return null;
    if (task.status === "completed") {
      if (typeof input?.workerJobId === "string") {
        store.updateDocxJob({
          taskId,
          workerJobId: input.workerJobId,
        });
      }
      return finalizeDocxJobFromTask(taskId);
    }
    if (task.status === "failed") {
      markDocxJobFailed(taskId, task.result?.output || `Task ${taskId} failed during document processing.`, input?.workerJobId);
      return null;
    }

    if (typeof input?.content === "string" && input.content.trim().length > 0) {
      const repricing = reconcileTaskPointsForContentLocked(task, input.content);
      if (!repricing.ok) {
        return null;
      }
    }

    const result = buildTaskResult({
      taskId: task.id,
      taskType: task.type,
      content: task.payload.content,
      mode: task.payload.mode,
      provider: task.payload.provider,
      modelId: task.payload.modelId,
      platform: task.payload.platform,
    });

    store.completeTask({
      taskId: task.id,
      output: result.output,
      outputUrl: input?.outputUrl || result.outputUrl,
    });
    store.updateDocxJob({
      taskId: task.id,
      status: "completed",
      progress: 100,
      outputCompleted: true,
      workerJobId: input?.workerJobId,
    });
    clearLocalDocxTimers(taskId);
    scheduleSnapshotPersist(`docx-completed:${taskId}`, 0);
    return store.getDocxJob(taskId);
  };

  const scheduleLocalDocxFallback = (input: {
    taskId: string;
    userId: string;
    sourceFileUrl: string;
    sourceFileName?: string;
    sourceFileSizeBytes?: number;
    sourceExtension?: string;
    mode: DocxMode;
  }) => {
    clearLocalDocxTimers(input.taskId);

    store.registerDocxJob({
      taskId: input.taskId,
      userId: input.userId,
      sourceFileUrl: input.sourceFileUrl,
      sourceFileName: input.sourceFileName,
      sourceFileSizeBytes: input.sourceFileSizeBytes,
      sourceExtension: input.sourceExtension,
      mode: input.mode,
      queueStrategy: "local",
      status: "fallback-local",
      progress: 15,
    });
    scheduleSnapshotPersist(`docx-fallback-registered:${input.taskId}`, 0);

    const runningTimer = setTimeout(() => {
      const task = store.getTask(input.taskId);
      const docxJob = store.getDocxJob(input.taskId);
      if (!task || !docxJob) {
        clearLocalDocxTimers(input.taskId);
        return;
      }
      if (task.status === "failed") {
        markDocxJobFailed(input.taskId, task.result?.output || `Task ${input.taskId} failed during document processing.`);
        return;
      }
      if (task.status === "completed") {
        finalizeDocxJobFromTask(input.taskId);
        return;
      }

      store.markTaskRunning(input.taskId);
      store.updateDocxJob({
        taskId: input.taskId,
        status: "running",
        progress: 55,
      });
      scheduleSnapshotPersist(`docx-running:${input.taskId}`, 0);
    }, 3000);

    const completedTimer = setTimeout(() => {
      void (async () => {
        const task = store.getTask(input.taskId);
        if (!task) return;

        const documentText = await resolveDocumentText({
          sourceFileUrl: input.sourceFileUrl,
          sourceExtension: input.sourceExtension,
          fallbackText: task.payload.content,
        });

        await withUserLock(input.userId, async () => {
          const latestTask = store.getTask(input.taskId);
          if (!latestTask) return;

          if (latestTask.status === "failed") {
            markDocxJobFailed(input.taskId, latestTask.result?.output || `Task ${input.taskId} failed during document processing.`);
            return;
          }

          if (latestTask.status === "completed") {
            finalizeDocxJobFromTask(input.taskId);
            return;
          }

          completeDocxTask(input.taskId, {
            content: documentText,
          });
        });
      })();
    }, 8000);

    if (typeof runningTimer.unref === "function") runningTimer.unref();
    if (typeof completedTimer.unref === "function") completedTimer.unref();

    localDocxTimers.set(input.taskId, [runningTimer, completedTimer]);
  };

  scheduleSnapshotPersist("bootstrap", 50);

  await app.register(cors, {
    origin: true,
    credentials: true,
  });

  app.addHook("onResponse", async (request) => {
    if (request.url === "/health") return;
    scheduleSnapshotPersist(`response:${request.method}:${request.routeOptions.url ?? request.url}`);
  });

  const periodicPersistHandle = setInterval(() => {
    scheduleSnapshotPersist("periodic", 0);
  }, 15_000);
  if (typeof periodicPersistHandle.unref === "function") {
    periodicPersistHandle.unref();
  }

  app.addHook("onClose", async () => {
    clearInterval(periodicPersistHandle);
    if (persistTimer) {
      clearTimeout(persistTimer);
      persistTimer = null;
    }

    await persistChain;
    await persistSnapshotNow("shutdown");
    await shutdownDocxProcessingQueue();
    if (persistenceReady) {
      await statePersistence.disconnect();
    }
  });

  app.setErrorHandler((error, request, reply) => {
    const statusCode =
      typeof (error as { statusCode?: unknown }).statusCode === "number"
        ? Math.max(400, Math.floor((error as { statusCode: number }).statusCode))
        : 500;

    if (statusCode >= 500) {
      captureApiException(error, {
        tags: {
          scope: "fastify-error-handler",
          method: request.method,
        },
        extras: {
          url: request.url,
          ip: getClientIp(request),
        },
      });
    }

    if (reply.sent) return;
    if (statusCode >= 500) {
      reply.status(500).send({ message: "Internal server error" });
      return;
    }

    const message = error instanceof Error && error.message ? error.message : "Bad request";
    reply.status(statusCode).send({ message });
  });

  app.setNotFoundHandler((request, reply) => {
    reply.status(404).send({
      message: "API endpoint not found",
      path: request.url,
    });
  });

  app.get("/health", async () => ({
    service: "api",
    name: "Gewu API",
    status: "ok",
    monitoringEnabled,
    now: new Date().toISOString(),
  }));

  app.post("/api/v1/admin/auth/login", async (request, reply) => {
    const ip = getClientIp(request);
    const authAllowed = await enforceRateLimit({
      reply,
      bucket: "admin.auth.login.ip",
      identifier: ip,
      max: authLimitPerMinute,
      windowMs: 60_000,
      message: "Too many admin login attempts, please retry later.",
    });
    if (!authAllowed) return;

    const parsed = adminLoginSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ message: "Invalid admin login payload", issues: parsed.error.issues });
    }

    if (!verifyAdminCredentials(parsed.data)) {
      return reply.status(401).send({ message: "Invalid admin credentials" });
    }

    const session = issueAdminSession(adminUsername);
    return {
      token: session.token,
      expiresAt: session.expiresAt,
      username: session.username,
    };
  });

  app.get("/api/v1/admin/auth/me", { preHandler: requireAdmin }, async (request) => {
    const auth = (request as FastifyRequest & { adminAuth?: AdminAuthContext }).adminAuth;
    return {
      username: auth?.username ?? adminUsername,
      expiresAt: auth?.expiresAt,
      authType: auth?.kind ?? "legacy-token",
    };
  });

  app.post("/api/v1/admin/auth/logout", { preHandler: requireAdmin }, async (request) => {
    const auth = (request as FastifyRequest & { adminAuth?: AdminAuthContext }).adminAuth;
    if (auth?.kind === "session") {
      adminSessions.delete(auth.token);
    }

    return { success: true };
  });

  app.post("/api/v1/auth/register", async (request, reply) => {
    const ip = getClientIp(request);
    const authAllowed = await enforceRateLimit({
      reply,
      bucket: "auth.register.ip",
      identifier: ip,
      max: authLimitPerMinute,
      windowMs: 60_000,
      message: "Too many register attempts, please retry later.",
    });
    if (!authAllowed) return;

    const parsed = registerSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ message: "Invalid register payload", issues: parsed.error.issues });
    }
    if (store.findUserByEmail(parsed.data.email)) {
      return reply.status(409).send({ message: "Email already exists" });
    }

    const user = store.createUser(parsed.data);
    const verification = store.createEmailVerificationToken({
      userId: user.id,
      ttlSeconds: emailVerifyTokenTtlSeconds,
    });
    if (!verification) {
      return reply.status(500).send({ message: "Failed to create email verification token" });
    }

    const verifyLink = toAppLink("/verify-email", {
      token: verification.token,
      email: user.email,
    });
    const verificationEmail = await sendAndLogEmail({
      userId: user.id,
      to: user.email,
      subject: "Verify your Gewu email",
      text:
        `Welcome to Gewu.\n\n` +
        `Please verify your email to activate your account.\n\n` +
        `Verification link: ${verifyLink}\n` +
        `Verification token: ${verification.token}\n` +
        `Expires at: ${verification.expiresAt}\n\n` +
        `- Gewu Team`,
      category: "auth.verify-email",
      meta: {
        tokenExpiresAt: verification.expiresAt,
        source: "register",
      },
    });

    return reply.status(201).send({
      message: "Registration successful. Please verify your email before login.",
      email: user.email,
      verificationRequired: true,
      verificationExpiresAt: verification.expiresAt,
      emailDeliveryStatus: verificationEmail.ok ? "sent" : "failed",
      ...(exposeAuthDebugTokens ? { debugVerificationToken: verification.token } : {}),
    });
  });

  app.post("/api/v1/auth/login", async (request, reply) => {
    const ip = getClientIp(request);
    const authAllowed = await enforceRateLimit({
      reply,
      bucket: "auth.login.ip",
      identifier: ip,
      max: authLimitPerMinute,
      windowMs: 60_000,
      message: "Too many login attempts, please retry later.",
    });
    if (!authAllowed) return;

    const parsed = loginSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ message: "Invalid login payload", issues: parsed.error.issues });
    }
    const user = store.findUserByEmail(parsed.data.email);
    if (!user || !verifyPassword(parsed.data.password, user.passwordHash)) {
      return reply.status(401).send({ message: "Invalid credentials" });
    }
    if (user.banned) {
      return reply.status(403).send({
        message: user.banReason ? `Account is banned: ${user.banReason}` : "Account is banned",
        code: "ACCOUNT_BANNED",
      });
    }
    if (!user.emailVerified) {
      return reply.status(403).send({
        message: "Email not verified. Please verify your email before login.",
        code: "EMAIL_NOT_VERIFIED",
      });
    }

    const session = issueSession(user);
    return {
      token: session.token,
      expiresAt: session.expiresAt,
      user: toPublicUser(user),
    };
  });

  app.post("/api/v1/auth/verify-email", async (request, reply) => {
    const ip = getClientIp(request);
    const verifyAllowed = await enforceRateLimit({
      reply,
      bucket: "auth.verify-email.ip",
      identifier: ip,
      max: authLimitPerMinute,
      windowMs: 60_000,
      message: "Too many email verification attempts, please retry later.",
    });
    if (!verifyAllowed) return;

    const parsed = verifyEmailSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ message: "Invalid verify email payload", issues: parsed.error.issues });
    }

    const consumeResult = store.consumeEmailVerificationToken(parsed.data.token);
    if (!consumeResult.ok) {
      if (consumeResult.reason === "ALREADY_USED") {
        const alreadyUser = store.getUserById(consumeResult.record.userId);
        return reply.status(200).send({
          message: "Email already verified.",
          email: alreadyUser?.email ?? consumeResult.record.email,
          idempotent: true,
        });
      }
      if (consumeResult.reason === "EXPIRED") {
        return reply.status(410).send({ message: "Verification token expired. Please request a new one." });
      }
      return reply.status(404).send({ message: "Invalid verification token" });
    }

    const verifiedUser = store.markUserEmailVerified(consumeResult.record.userId);
    if (!verifiedUser) return reply.status(404).send({ message: "User not found" });

    return {
      message: "Email verified successfully.",
      email: verifiedUser.email,
      verifiedAt: verifiedUser.emailVerifiedAt,
    };
  });

  app.post("/api/v1/auth/resend-verification", async (request, reply) => {
    const ip = getClientIp(request);
    const resendAllowed = await enforceRateLimit({
      reply,
      bucket: "auth.resend-verification.ip",
      identifier: ip,
      max: authLimitPerMinute,
      windowMs: 60_000,
      message: "Too many resend requests, please retry later.",
    });
    if (!resendAllowed) return;

    const parsed = resendVerificationSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ message: "Invalid resend verification payload", issues: parsed.error.issues });
    }

    const user = store.findUserByEmail(parsed.data.email);
    if (!user || user.emailVerified) {
      return {
        message: "If the email is eligible, a verification email has been sent.",
      };
    }

    const verification = store.createEmailVerificationToken({
      userId: user.id,
      ttlSeconds: emailVerifyTokenTtlSeconds,
    });

    if (verification) {
      const verifyLink = toAppLink("/verify-email", {
        token: verification.token,
        email: user.email,
      });
      await sendAndLogEmail({
        userId: user.id,
        to: user.email,
        subject: "Verify your Gewu email",
        text:
          `Your email verification request has been received.\n\n` +
          `Verification link: ${verifyLink}\n` +
          `Verification token: ${verification.token}\n` +
          `Expires at: ${verification.expiresAt}\n\n` +
          `- Gewu Team`,
        category: "auth.verify-email",
        meta: {
          tokenExpiresAt: verification.expiresAt,
          source: "resend",
        },
      });
    }

    return {
      message: "If the email is eligible, a verification email has been sent.",
      ...(verification && exposeAuthDebugTokens ? { debugVerificationToken: verification.token } : {}),
    };
  });

  app.post("/api/v1/auth/forgot-password", async (request, reply) => {
    const ip = getClientIp(request);
    const forgotAllowed = await enforceRateLimit({
      reply,
      bucket: "auth.forgot-password.ip",
      identifier: ip,
      max: authLimitPerMinute,
      windowMs: 60_000,
      message: "Too many password reset requests, please retry later.",
    });
    if (!forgotAllowed) return;

    const parsed = forgotPasswordSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ message: "Invalid forgot password payload", issues: parsed.error.issues });
    }

    const user = store.findUserByEmail(parsed.data.email);
    if (!user || !user.emailVerified) {
      return {
        message: "If this email exists, password reset instructions have been sent.",
      };
    }

    const token = store.createPasswordResetToken({
      userId: user.id,
      ttlSeconds: passwordResetTokenTtlSeconds,
    });

    if (token) {
      const resetLink = toAppLink("/reset-password", {
        token: token.token,
      });
      await sendAndLogEmail({
        userId: user.id,
        to: user.email,
        subject: "Reset your Gewu password",
        text:
          `We received a password reset request for your Gewu account.\n\n` +
          `Reset link: ${resetLink}\n` +
          `Reset token: ${token.token}\n` +
          `Expires at: ${token.expiresAt}\n\n` +
          `If this was not you, please ignore this email.\n\n` +
          `- Gewu Team`,
        category: "auth.reset-password",
        meta: {
          tokenExpiresAt: token.expiresAt,
        },
      });
    }

    return {
      message: "If this email exists, password reset instructions have been sent.",
      ...(token && exposeAuthDebugTokens ? { debugResetToken: token.token } : {}),
    };
  });

  app.post("/api/v1/auth/reset-password", async (request, reply) => {
    const ip = getClientIp(request);
    const resetAllowed = await enforceRateLimit({
      reply,
      bucket: "auth.reset-password.ip",
      identifier: ip,
      max: authLimitPerMinute,
      windowMs: 60_000,
      message: "Too many password reset attempts, please retry later.",
    });
    if (!resetAllowed) return;

    const parsed = resetPasswordSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ message: "Invalid reset password payload", issues: parsed.error.issues });
    }

    const consumeResult = store.consumePasswordResetToken(parsed.data.token);
    if (!consumeResult.ok) {
      if (consumeResult.reason === "ALREADY_USED") {
        return reply.status(409).send({ message: "Reset token already used" });
      }
      if (consumeResult.reason === "EXPIRED") {
        return reply.status(410).send({ message: "Reset token expired. Please request a new one." });
      }
      return reply.status(404).send({ message: "Invalid reset token" });
    }

    const updatedUser = store.updateUserPassword({
      userId: consumeResult.record.userId,
      password: parsed.data.password,
    });
    if (!updatedUser) return reply.status(404).send({ message: "User not found" });

    store.revokeUserSessions(updatedUser.id);
    return {
      message: "Password has been reset successfully. Please login again.",
    };
  });

  app.get("/api/v1/auth/me", async (request, reply) => {
    const auth = await requireUser(request, reply);
    if (!auth) return;

    return {
      user: toPublicUser(auth.user),
      expiresAt: auth.expiresAt,
    };
  });

  app.post("/api/v1/auth/logout", async (request, reply) => {
    const auth = await requireUser(request, reply);
    if (!auth) return;

    store.revokeSession(auth.token);
    return reply.status(204).send();
  });

  app.post("/api/v1/model/route", async (request, reply) => {
    const auth = await requireUser(request, reply);
    if (!auth) return;

    const modelRouteAllowed = await enforceRateLimit({
      reply,
      bucket: "model.route.user",
      identifier: auth.user.id,
      max: modelRouteLimitPerMinute,
      windowMs: 60_000,
      message: "Model route limit exceeded, please retry later.",
    });
    if (!modelRouteAllowed) return;

    const parsed = modelRouteInputSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ message: "Invalid model route payload", issues: parsed.error.issues });
    }
    if (parsed.data.prompt.length > maxModelPromptChars) {
      return reply
        .status(400)
        .send({ message: `Prompt too long. Max allowed length is ${maxModelPromptChars} characters.` });
    }
    if (!hasMeaningfulContent(parsed.data.prompt)) {
      return reply.status(400).send({ message: "Prompt is empty or invalid." });
    }
    const result = await routeModel(parsed.data);
    return result;
  });

  app.get("/api/v1/models", async () => {
    return store.models
      .filter((item) => item.enabled)
      .map((item) => ({
        id: item.id,
        provider: item.provider,
        modelId: item.modelId,
        displayName: item.displayName,
        pointMultiplier: item.pointMultiplier,
      }));
  });

  app.get("/api/v1/plans", async () => {
    return store.listPlans();
  });

  app.get("/api/v1/tutorials", async (request, reply) => {
    const parsed = publicTutorialListQuerySchema.safeParse(request.query ?? {});
    if (!parsed.success) {
      return reply.status(400).send({ message: "Invalid tutorials query", issues: parsed.error.issues });
    }
    return store.listPublishedTutorials({
      tag: parsed.data.tag,
      q: parsed.data.q,
    });
  });

  app.get("/api/v1/tutorials/:slug", async (request, reply) => {
    const params = request.params as { slug: string };
    const tutorial = store.getTutorialBySlug(params.slug);
    if (!tutorial) return reply.status(404).send({ message: "Tutorial not found" });
    return tutorial;
  });

  app.get("/api/v1/workbench/nav", async () => {
    return {
      items: store.listWorkbenchNav().map((item) => ({
        key: item.key,
        href: item.href,
        label: item.label,
        visible: item.visible,
      })),
    };
  });

  app.get("/api/v1/points/summary", async (request, reply) => {
    const auth = await requireUser(request, reply);
    if (!auth) return;

    return {
      userId: auth.user.id,
      points: auth.user.points,
      agentPoints: auth.user.agentPoints,
      dailyDetectUsed: auth.user.dailyDetectUsed,
      dailyDetectLimit: systemSettings.algorithmEngine.detect.dailyFreeLimit,
    };
  });

  app.post("/api/v1/points/checkin", async (request, reply) => {
    const auth = await requireUser(request, reply);
    if (!auth) return;

    const checkinAllowed = await enforceRateLimit({
      reply,
      bucket: "points.checkin.user",
      identifier: auth.user.id,
      max: checkinLimitPerMinute,
      windowMs: 60_000,
      message: "Check-in too frequent, please retry later.",
    });
    if (!checkinAllowed) return;

    const result = await withUserLock(auth.user.id, async () => store.checkin(auth.user.id, systemSettings.checkinPoints));
    if (!result.ok) {
      if (result.reason === "ALREADY_CHECKED_IN") {
        return reply.status(409).send({ message: "Already checked in today" });
      }
      return reply.status(404).send({ message: "User not found" });
    }
    return { points: result.points, reward: systemSettings.checkinPoints };
  });

  app.get("/api/v1/points/records", async (request, reply) => {
    const auth = await requireUser(request, reply);
    if (!auth) return;

    return store.pointRecords.filter((item) => item.userId === auth.user.id);
  });

  app.post("/api/v1/monitoring/client-error", async (request, reply) => {
    const ip = getClientIp(request);
    const monitoringAllowed = await enforceRateLimit({
      reply,
      bucket: "monitoring.client-error.ip",
      identifier: ip,
      max: clientErrorLimitPerMinute,
      windowMs: 60_000,
      message: "Too many client error reports.",
    });
    if (!monitoringAllowed) return;

    const parsed = clientErrorSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ message: "Invalid client error payload", issues: parsed.error.issues });
    }

    const user = getOptionalUserFromToken(request);
    const payload = parsed.data;
    const error = new Error(`[client-error] ${payload.message}`);

    captureApiException(error, {
      tags: {
        source: payload.source || "web-client",
        page: payload.page || "unknown",
      },
      extras: {
        stack: payload.stack,
        userAgent: payload.userAgent,
        createdAt: payload.createdAt,
        userId: user?.id,
        ip,
      },
    });

    return reply.status(202).send({ accepted: true });
  });

  app.get("/api/v1/payments/orders", async (request, reply) => {
    const auth = await requireUser(request, reply);
    if (!auth) return;

    return store.listOrdersByUser(auth.user.id);
  });

  app.post("/api/v1/payments/orders", async (request, reply) => {
    const auth = await requireUser(request, reply);
    if (!auth) return;

    const createPaymentAllowed = await enforceRateLimit({
      reply,
      bucket: "payments.create.user",
      identifier: auth.user.id,
      max: paymentCreateLimitPerMinute,
      windowMs: 60_000,
      message: "Too many payment order requests.",
    });
    if (!createPaymentAllowed) return;

    const parsed = createPaymentOrderSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ message: "Invalid payment order payload", issues: parsed.error.issues });
    }

    const order = store.createTopupOrder({
      userId: auth.user.id,
      pointsAmount: parsed.data.pointsAmount,
      amount: parsed.data.amount,
      channel: parsed.data.channel,
    });

    return reply.status(201).send({
      orderId: order.id,
      outTradeNo: order.outTradeNo,
      status: order.status,
      amount: order.amount,
      pointsAmount: order.pointsAmount,
      channel: order.channel,
      message: "Order created. Waiting for payment callback.",
    });
  });

  app.post("/api/v1/payments/mock/notify", async (request, reply) => {
    if (!enableMockPayment) {
      return reply.status(403).send({ message: "Mock payment is disabled" });
    }

    const ip = getClientIp(request);
    const notifyAllowed = await enforceRateLimit({
      reply,
      bucket: "payments.notify.ip",
      identifier: ip,
      max: paymentCallbackLimitPerMinute,
      windowMs: 60_000,
      message: "Too many payment callback requests.",
    });
    if (!notifyAllowed) return;

    const parsed = paymentNotifySchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ message: "Invalid payment callback payload", issues: parsed.error.issues });
    }

    const result = await handlePaymentNotification(parsed.data, request.body);
    return reply.status(result.statusCode).send(result.body);
  });

  app.post("/api/v1/payments/orders/:orderId/mock-pay", async (request, reply) => {
    if (!enableMockPayment) {
      return reply.status(403).send({ message: "Mock payment is disabled" });
    }

    const auth = await requireUser(request, reply);
    if (!auth) return;

    const mockPayAllowed = await enforceRateLimit({
      reply,
      bucket: "payments.mock-pay.user",
      identifier: auth.user.id,
      max: paymentCreateLimitPerMinute,
      windowMs: 60_000,
      message: "Too many mock payment attempts.",
    });
    if (!mockPayAllowed) return;

    const params = request.params as { orderId: string };
    const parsed = mockPaySchema.safeParse(request.body ?? {});
    if (!parsed.success) {
      return reply.status(400).send({ message: "Invalid mock pay payload", issues: parsed.error.issues });
    }

    const order = store.getOrderById(params.orderId);
    if (!order) return reply.status(404).send({ message: "Order not found" });
    if (order.userId !== auth.user.id) return reply.status(403).send({ message: "Forbidden" });

    const payloadCore: PaymentNotifyCore = {
      outTradeNo: order.outTradeNo,
      transactionId: buildMockTransactionId(),
      amount: order.amount,
      status: parsed.data.status,
      channel: "mock",
      timestamp: new Date().toISOString(),
    };
    const callbackPayload: PaymentNotifyInput = {
      ...payloadCore,
      sign: signPaymentPayload(payloadCore),
    };

    const result = await handlePaymentNotification(callbackPayload, {
      source: "mock-pay-endpoint",
      orderId: order.id,
      callbackPayload: {
        ...callbackPayload,
        sign: "***masked***",
      },
    });
    return reply.status(result.statusCode).send(result.body);
  });

  app.post("/api/internal/docx/progress", async (request, reply) => {
    const authorized = await requireDocxWorker(request, reply);
    if (!authorized) return;

    const parsed = docxWorkerProgressSchema.safeParse(request.body ?? {});
    if (!parsed.success) {
      return reply.status(400).send({ message: "Invalid docx worker progress payload", issues: parsed.error.issues });
    }

    const task = store.getTask(parsed.data.taskId);
    const docxJob = store.getDocxJob(parsed.data.taskId);
    if (!task || !docxJob) {
      return reply.status(404).send({ message: "Docx task not found" });
    }

    const result = await withUserLock(task.userId, async () => {
      const latestTask = store.getTask(parsed.data.taskId);
      if (!latestTask) return { status: "not-found" as const };

      const binding = ensureDocxWorkerBinding(parsed.data.taskId, parsed.data.workerJobId);
      if (!binding.ok) {
        return {
          status: "worker-job-mismatch" as const,
          expectedWorkerJobId: binding.job?.workerJobId ?? null,
        };
      }

      if (latestTask.status === "completed") {
        const finalized = finalizeDocxJobFromTask(parsed.data.taskId) ?? binding.job;
        return {
          status: "already-completed" as const,
          docxJob: finalized,
        };
      }

      if (latestTask.status === "failed") {
        markDocxJobFailed(
          parsed.data.taskId,
          latestTask.result?.output || `Task ${parsed.data.taskId} failed during document processing.`,
          parsed.data.workerJobId,
        );
        return {
          status: "already-failed" as const,
          docxJob: store.getDocxJob(parsed.data.taskId),
        };
      }

      const nextProgress = Math.max(binding.job.progress, Math.floor(parsed.data.progress));
      const nextStatus = nextProgress > 15 ? "running" : binding.job.status === "fallback-local" ? "fallback-local" : "queued";

      store.markTaskRunning(parsed.data.taskId);
      const updated = store.updateDocxJob({
        taskId: parsed.data.taskId,
        status: nextStatus,
        progress: nextProgress,
        workerJobId: parsed.data.workerJobId,
      });
      scheduleSnapshotPersist(`docx-worker-progress:${parsed.data.taskId}`, 0);

      return {
        status: "updated" as const,
        docxJob: updated,
      };
    });

    if (result.status === "not-found") {
      return reply.status(404).send({ message: "Docx task not found" });
    }
    if (result.status === "worker-job-mismatch") {
      return reply.status(409).send({
        message: "Worker job id mismatch",
        expectedWorkerJobId: result.expectedWorkerJobId,
      });
    }

    return {
      taskId: parsed.data.taskId,
      status: result.docxJob?.status ?? (result.status === "already-completed" ? "completed" : "failed"),
      progress: result.docxJob?.progress ?? 100,
      idempotent: result.status !== "updated",
    };
  });

  app.post("/api/internal/docx/complete", async (request, reply) => {
    const authorized = await requireDocxWorker(request, reply);
    if (!authorized) return;

    const parsed = docxWorkerCompleteSchema.safeParse(request.body ?? {});
    if (!parsed.success) {
      return reply.status(400).send({ message: "Invalid docx worker complete payload", issues: parsed.error.issues });
    }

    const task = store.getTask(parsed.data.taskId);
    const docxJob = store.getDocxJob(parsed.data.taskId);
    if (!task || !docxJob) {
      return reply.status(404).send({ message: "Docx task not found" });
    }

    const result = await withUserLock(task.userId, async () => {
      const latestTask = store.getTask(parsed.data.taskId);
      if (!latestTask) return { status: "not-found" as const };

      const binding = ensureDocxWorkerBinding(parsed.data.taskId, parsed.data.workerJobId);
      if (!binding.ok) {
        return {
          status: "worker-job-mismatch" as const,
          expectedWorkerJobId: binding.job?.workerJobId ?? null,
        };
      }

      if (latestTask.status === "failed") {
        markDocxJobFailed(
          parsed.data.taskId,
          latestTask.result?.output || `Task ${parsed.data.taskId} failed during document processing.`,
          parsed.data.workerJobId,
        );
        return {
          status: "already-failed" as const,
          task: latestTask,
          docxJob: store.getDocxJob(parsed.data.taskId),
        };
      }

      const completedDocxJob = completeDocxTask(parsed.data.taskId, {
        outputUrl: parsed.data.outputUrl,
        workerJobId: parsed.data.workerJobId,
        content: parsed.data.documentText,
      });
      const completedTask = store.getTask(parsed.data.taskId);
      if (!completedTask) return { status: "not-found" as const };

      return {
        status: latestTask.status === "completed" ? "already-completed" as const : "completed" as const,
        task: completedTask,
        docxJob: completedDocxJob ?? store.getDocxJob(parsed.data.taskId),
      };
    });

    if (result.status === "not-found") {
      return reply.status(404).send({ message: "Docx task not found" });
    }
    if (result.status === "worker-job-mismatch") {
      return reply.status(409).send({
        message: "Worker job id mismatch",
        expectedWorkerJobId: result.expectedWorkerJobId,
      });
    }

    return {
      taskId: parsed.data.taskId,
      status: result.task?.status ?? "completed",
      outputUrl: result.task?.result?.outputUrl ?? parsed.data.outputUrl ?? null,
      idempotent: result.status !== "completed",
    };
  });

  app.post("/api/internal/docx/fail", async (request, reply) => {
    const authorized = await requireDocxWorker(request, reply);
    if (!authorized) return;

    const parsed = docxWorkerFailSchema.safeParse(request.body ?? {});
    if (!parsed.success) {
      return reply.status(400).send({ message: "Invalid docx worker fail payload", issues: parsed.error.issues });
    }

    const task = store.getTask(parsed.data.taskId);
    const docxJob = store.getDocxJob(parsed.data.taskId);
    if (!task || !docxJob) {
      return reply.status(404).send({ message: "Docx task not found" });
    }

    const result = await withUserLock(task.userId, async () => {
      const latestTask = store.getTask(parsed.data.taskId);
      if (!latestTask) return { status: "not-found" as const };

      const binding = ensureDocxWorkerBinding(parsed.data.taskId, parsed.data.workerJobId);
      if (!binding.ok) {
        return {
          status: "worker-job-mismatch" as const,
          expectedWorkerJobId: binding.job?.workerJobId ?? null,
        };
      }

      if (latestTask.status === "completed") {
        finalizeDocxJobFromTask(parsed.data.taskId);
        return {
          status: "already-completed" as const,
          task: latestTask,
          docxJob: store.getDocxJob(parsed.data.taskId),
        };
      }

      const failedTask = markTaskFailedAndRefundLocked(task.userId, parsed.data.taskId, parsed.data.message);
      markDocxJobFailed(parsed.data.taskId, parsed.data.message, parsed.data.workerJobId);
      scheduleSnapshotPersist(`docx-worker-failed:${parsed.data.taskId}`, 0);

      return {
        status: failedTask?.status === "failed" ? "failed" as const : "already-failed" as const,
        task: store.getTask(parsed.data.taskId),
        docxJob: store.getDocxJob(parsed.data.taskId),
      };
    });

    if (result.status === "not-found") {
      return reply.status(404).send({ message: "Docx task not found" });
    }
    if (result.status === "worker-job-mismatch") {
      return reply.status(409).send({
        message: "Worker job id mismatch",
        expectedWorkerJobId: result.expectedWorkerJobId,
      });
    }

    return {
      taskId: parsed.data.taskId,
      status: result.task?.status ?? "failed",
      progress: result.docxJob?.progress ?? 100,
      pointsRefunded: Boolean(result.task?.pointsRefunded),
      idempotent: result.status !== "failed",
    };
  });

  app.post("/api/v1/tasks", async (request, reply) => {
    const auth = await requireUser(request, reply);
    if (!auth) return;

    const taskAllowed = await enforceRateLimit({
      reply,
      bucket: "tasks.create.user",
      identifier: auth.user.id,
      max: taskLimitPerMinute,
      windowMs: 60_000,
      message: "Too many task requests, please retry later.",
    });
    if (!taskAllowed) return;

    const parsed = taskCreateSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ message: "Invalid task payload", issues: parsed.error.issues });
    }
    if (parsed.data.content.length > maxTaskContentChars) {
      return reply
        .status(400)
        .send({ message: `Task content too long. Max allowed length is ${maxTaskContentChars} characters.` });
    }
    if (!hasMeaningfulContent(parsed.data.content)) {
      return reply.status(400).send({ message: "Task content is empty or invalid." });
    }

    const model = store.models.find(
      (item) => item.provider === parsed.data.provider && item.modelId === parsed.data.modelId && item.enabled,
    );
    if (!model) return reply.status(400).send({ message: "Model is not available" });

    const createResult = await createTaskForUser(auth.user.id, parsed.data, model.pointMultiplier);

    if (createResult.status === "user-not-found") {
      return reply.status(404).send({ message: "User not found" });
    }

    if (createResult.status === "insufficient-points") {
      return reply
        .status(402)
        .send({ message: "Insufficient points", points: createResult.points, required: createResult.required });
    }

    return reply.status(202).send({
      taskId: createResult.taskId,
      status: createResult.taskStatus,
      pointsCost: createResult.pointsCost,
      freeDetectApplied: createResult.freeDetectApplied,
      points: createResult.points,
    });
  });

  app.post("/api/v1/tasks/stream", async (request, reply) => {
    const auth = await requireUser(request, reply);
    if (!auth) return;

    const streamTaskAllowed = await enforceRateLimit({
      reply,
      bucket: "tasks.stream.user",
      identifier: auth.user.id,
      max: taskLimitPerMinute,
      windowMs: 60_000,
      message: "Too many streaming task requests, please retry later.",
    });
    if (!streamTaskAllowed) return;

    const parsed = longformTaskStreamSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ message: "Invalid streaming task payload", issues: parsed.error.issues });
    }
    if (parsed.data.content.length > maxTaskContentChars) {
      return reply
        .status(400)
        .send({ message: `Task content too long. Max allowed length is ${maxTaskContentChars} characters.` });
    }
    if (!hasMeaningfulContent(parsed.data.content)) {
      return reply.status(400).send({ message: "Task content is empty or invalid." });
    }

    const model = store.models.find(
      (item) => item.provider === parsed.data.provider && item.modelId === parsed.data.modelId && item.enabled,
    );
    if (!model) return reply.status(400).send({ message: "Model is not available" });

    const createResult = await createTaskForUser(auth.user.id, parsed.data, model.pointMultiplier);
    if (createResult.status === "user-not-found") {
      return reply.status(404).send({ message: "User not found" });
    }
    if (createResult.status === "insufficient-points") {
      return reply
        .status(402)
        .send({ message: "Insufficient points", points: createResult.points, required: createResult.required });
    }

    const taskId = createResult.taskId;
    store.markTaskRunning(taskId);

    reply.hijack();
    reply.raw.statusCode = 200;
    const requestOrigin = Array.isArray(request.headers.origin) ? request.headers.origin[0] : request.headers.origin;
    if (requestOrigin) {
      const previousVary = reply.raw.getHeader("Vary");
      const varyValue =
        typeof previousVary === "string" && previousVary.length > 0
          ? previousVary.includes("Origin")
            ? previousVary
            : `${previousVary}, Origin`
          : "Origin";
      reply.raw.setHeader("Access-Control-Allow-Origin", requestOrigin);
      reply.raw.setHeader("Access-Control-Allow-Credentials", "true");
      reply.raw.setHeader("Vary", varyValue);
    }
    reply.raw.setHeader("Content-Type", "text/event-stream; charset=utf-8");
    reply.raw.setHeader("Cache-Control", "no-cache, no-transform");
    reply.raw.setHeader("Connection", "keep-alive");
    reply.raw.setHeader("X-Accel-Buffering", "no");
    reply.raw.flushHeaders?.();

    let connectionClosed = false;
    request.raw.on("close", () => {
      connectionClosed = true;
    });

    writeSseEvent(reply, "meta", {
      taskId,
      status: createResult.taskStatus,
      pointsCost: createResult.pointsCost,
      freeDetectApplied: createResult.freeDetectApplied,
      points: createResult.points,
    });

    try {
      const routed = await routeModel({
        provider: parsed.data.provider,
        modelId: parsed.data.modelId,
        prompt: parsed.data.content,
        taskType: parsed.data.type,
        temperature: parsed.data.mode === "deep" ? 0.85 : parsed.data.mode === "light" ? 0.45 : 0.7,
      });

      const heading = `# ${parsed.data.type.toUpperCase()} Draft`;
      const finalOutputParts = [heading, routed.output];
      if (systemSettings.algorithmEngine.longform.includeModelAttribution) {
        finalOutputParts.push(`Generated by ${routed.provider}/${routed.modelId}`);
      }
      finalOutputParts.push(`Trace: ${routed.traceId}`);
      const finalOutput = finalOutputParts.join("\n\n");
      const chunks = toChunkList(finalOutput, 90);

      for (let index = 0; index < chunks.length; index += 1) {
        if (connectionClosed) {
          await markTaskFailedAndRefund(auth.user.id, taskId, `Task ${taskId} cancelled because stream disconnected.`);
          return;
        }
        writeSseEvent(reply, "chunk", {
          taskId,
          index,
          total: chunks.length,
          chunk: chunks[index],
        });
        await new Promise((resolve) => setTimeout(resolve, 45));
      }

      const completed = store.completeTask({
        taskId,
        output: finalOutput,
      });
      if (!completed) {
        writeSseEvent(reply, "error", {
          taskId,
          message: "Failed to finalize streamed task.",
        });
        reply.raw.end();
        return;
      }

      writeSseEvent(reply, "complete", {
        taskId,
        output: finalOutput,
        tokensUsed: routed.tokensUsed,
        traceId: routed.traceId,
      });
      reply.raw.end();
    } catch (error) {
      captureApiException(error, {
        tags: {
          scope: "tasks.stream",
          taskType: parsed.data.type,
          provider: parsed.data.provider,
          modelId: parsed.data.modelId,
        },
        extras: {
          taskId,
          userId: auth.user.id,
        },
      });
      await markTaskFailedAndRefund(auth.user.id, taskId, `Task ${taskId} failed during streaming generation.`);
      if (!connectionClosed) {
        writeSseEvent(reply, "error", {
          taskId,
          message: error instanceof Error ? error.message : "Streaming generation failed",
        });
        reply.raw.end();
      }
    }
  });

  app.get("/api/v1/tasks", async (request, reply) => {
    const auth = await requireUser(request, reply);
    if (!auth) return;

    return store.listUserTasks(auth.user.id);
  });

  app.get("/api/v1/tasks/:taskId", async (request, reply) => {
    const auth = await requireUser(request, reply);
    if (!auth) return;

    const params = request.params as { taskId: string };
    const task = store.getTask(params.taskId);
    if (!task) return reply.status(404).send({ message: "Task not found" });
    if (task.userId !== auth.user.id) return reply.status(403).send({ message: "Forbidden" });

    if (task.status === "failed" && task.pointsCost > 0 && !task.pointsRefunded) {
      await withUserLock(auth.user.id, async () => {
        const latestTask = store.getTask(params.taskId);
        if (!latestTask) return;
        if (latestTask.userId !== auth.user.id) return;
        if (latestTask.status !== "failed" || latestTask.pointsCost <= 0 || latestTask.pointsRefunded) return;

        store.addPoints({
          userId: auth.user.id,
          change: latestTask.pointsCost,
          reason: `${latestTask.type} task failed refund (${latestTask.id})`,
        });
        store.markTaskPointsRefunded(latestTask.id);
      });
    }

    const finalTask = store.getTask(params.taskId);
    if (!finalTask) return reply.status(404).send({ message: "Task not found" });
    return finalTask;
  });

  app.post("/api/v1/tasks/:taskId/cancel", async (request, reply) => {
    const auth = await requireUser(request, reply);
    if (!auth) return;

    const cancelAllowed = await enforceRateLimit({
      reply,
      bucket: "tasks.cancel.user",
      identifier: auth.user.id,
      max: taskLimitPerMinute,
      windowMs: 60_000,
      message: "Too many cancel requests, please retry later.",
    });
    if (!cancelAllowed) return;

    const params = request.params as { taskId: string };

    const result = await withUserLock(auth.user.id, async () => {
      const latestTask = store.getTask(params.taskId);
      if (!latestTask) {
        return { status: "not-found" as const };
      }
      if (latestTask.userId !== auth.user.id) {
        return { status: "forbidden" as const };
      }

      if (latestTask.status === "completed") {
        return { status: "already-completed" as const, taskId: latestTask.id };
      }

      if (latestTask.status === "failed") {
        return {
          status: "already-failed" as const,
          taskId: latestTask.id,
          pointsRefunded: Boolean(latestTask.pointsRefunded),
          points: store.getUserById(auth.user.id)?.points ?? 0,
        };
      }

      const cancelled = store.markTaskFailed({
        taskId: latestTask.id,
        message: `Task ${latestTask.id} cancelled by user.`,
      });
      if (!cancelled) {
        return { status: "not-found" as const };
      }

      let pointsRefunded = false;
      if (cancelled.pointsCost > 0 && !cancelled.pointsRefunded) {
        store.addPoints({
          userId: auth.user.id,
          change: cancelled.pointsCost,
          reason: `${cancelled.type} task cancelled refund (${cancelled.id})`,
        });
        store.markTaskPointsRefunded(cancelled.id);
        pointsRefunded = true;
      }

      if (store.getDocxJob(cancelled.id)) {
        markDocxJobFailed(cancelled.id, `Task ${cancelled.id} cancelled by user.`);
      }

      return {
        status: "cancelled" as const,
        taskId: cancelled.id,
        pointsRefunded,
        points: store.getUserById(auth.user.id)?.points ?? 0,
      };
    });

    if (result.status === "not-found") {
      return reply.status(404).send({ message: "Task not found" });
    }
    if (result.status === "forbidden") {
      return reply.status(403).send({ message: "Forbidden" });
    }
    if (result.status === "already-completed") {
      return reply.status(409).send({ message: "Task already completed and cannot be cancelled", taskId: result.taskId });
    }
    if (result.status === "already-failed") {
      return {
        taskId: result.taskId,
        status: "failed",
        cancelled: false,
        idempotent: true,
        pointsRefunded: result.pointsRefunded,
        points: result.points,
        message: "Task already failed.",
      };
    }

    return {
      taskId: result.taskId,
      status: "failed",
      cancelled: true,
      pointsRefunded: result.pointsRefunded,
      points: result.points,
      message: result.pointsRefunded ? "Task cancelled and points refunded." : "Task cancelled.",
    };
  });

  app.post("/api/v1/tasks/:taskId/download-link", async (request, reply) => {
    const auth = await requireUser(request, reply);
    if (!auth) return;

    const downloadLinkAllowed = await enforceRateLimit({
      reply,
      bucket: "tasks.download-link.user",
      identifier: auth.user.id,
      max: taskLimitPerMinute,
      windowMs: 60_000,
      message: "Too many download link requests, please retry later.",
    });
    if (!downloadLinkAllowed) return;

    const params = request.params as { taskId: string };
    const task = store.getTask(params.taskId);
    if (!task) return reply.status(404).send({ message: "Task not found" });
    if (task.userId !== auth.user.id) return reply.status(403).send({ message: "Forbidden" });
    if (task.status !== "completed") {
      return reply.status(409).send({ message: "Task is not completed yet" });
    }
    if (!task.result?.outputUrl) {
      return reply.status(409).send({ message: "Task has no downloadable file" });
    }

    const ticket = store.createDownloadTicket({
      userId: auth.user.id,
      taskId: task.id,
      ttlSeconds: downloadTicketTtlSeconds,
    });
    const expiresInSeconds = Math.max(
      0,
      Math.ceil((new Date(ticket.expiresAt).getTime() - new Date(ticket.createdAt).getTime()) / 1000),
    );

    return {
      ticketId: ticket.id,
      taskId: task.id,
      downloadPath: `/api/v1/files/download/${ticket.id}`,
      expiresAt: ticket.expiresAt,
      expiresInSeconds,
    };
  });

  app.get("/api/v1/files/download/:ticketId", async (request, reply) => {
    const auth = await requireUser(request, reply);
    if (!auth) return;

    const downloadAllowed = await enforceRateLimit({
      reply,
      bucket: "files.download.user",
      identifier: auth.user.id,
      max: taskLimitPerMinute * 2,
      windowMs: 60_000,
      message: "Too many download requests, please retry later.",
    });
    if (!downloadAllowed) return;

    const params = request.params as { ticketId: string };
    const ticket = store.getDownloadTicket(params.ticketId);
    if (!ticket) {
      return reply.status(404).send({ message: "Download ticket not found" });
    }
    if (ticket.userId !== auth.user.id) {
      return reply.status(403).send({ message: "Forbidden" });
    }

    const consumeResult = store.consumeDownloadTicket(params.ticketId);
    if (!consumeResult.ok) {
      if (consumeResult.reason === "NOT_FOUND") {
        return reply.status(404).send({ message: "Download ticket not found" });
      }
      return reply.status(410).send({ message: "Download ticket expired or already used" });
    }

    const task = store.getTask(consumeResult.ticket.taskId);
    if (!task) return reply.status(404).send({ message: "Task not found" });
    if (task.userId !== auth.user.id) return reply.status(403).send({ message: "Forbidden" });
    if (task.status !== "completed" || !task.result?.outputUrl) {
      return reply.status(410).send({ message: "Task output is no longer available" });
    }

    const defaultExtension = task.type === "detect" ? "pdf" : "docx";
    const detectReport = getTaskDetectReport(task);
    if (task.type === "detect" && detectReport) {
      const expiresAtMs = Date.now() + downloadTicketTtlSeconds * 1000;
      const signature = signGeneratedDetectReport(task.id, expiresAtMs);
      return {
        taskId: task.id,
        fileName: `${task.type}-${task.id}.${defaultExtension}`,
        downloadUrl: `/api/v1/generated-files/detect/${task.id}.pdf?expires=${expiresAtMs}&sig=${signature}`,
      };
    }

    return {
      taskId: task.id,
      fileName: `${task.type}-${task.id}.${defaultExtension}`,
      downloadUrl: task.result.outputUrl,
    };
  });

  app.get("/api/v1/generated-files/detect/:taskId.pdf", async (request, reply) => {
    const params = request.params as { taskId: string };
    const querySchema = z.object({
      expires: z.coerce.number().int().positive(),
      sig: z.string().min(1),
    });
    const parsed = querySchema.safeParse(request.query);
    if (!parsed.success) {
      return reply.status(400).send({ message: "Invalid detect report URL" });
    }

    if (Date.now() > parsed.data.expires) {
      return reply.status(410).send({ message: "Detect report URL expired" });
    }
    if (!verifyGeneratedDetectReportSignature(params.taskId, parsed.data.expires, parsed.data.sig)) {
      return reply.status(403).send({ message: "Invalid detect report signature" });
    }

    const task = store.getTask(params.taskId);
    const detectReport = getTaskDetectReport(task);
    if (!task || task.type !== "detect" || task.status !== "completed" || !detectReport) {
      return reply.status(404).send({ message: "Detect report not found" });
    }

    try {
      const buffer = await createDetectReportPdfBuffer(detectReport);
      reply.header("Content-Type", "application/pdf");
      reply.header("Content-Disposition", `attachment; filename="detect-${task.id}.pdf"`);
      reply.header("Cache-Control", "private, max-age=60");
      return reply.send(buffer);
    } catch (error) {
      captureApiException(error, {
        tags: { scope: "detect-report.pdf" },
        extras: { taskId: task.id, platform: detectReport.platform },
      });
      return reply.status(500).send({ message: "Failed to generate detect report PDF" });
    }
  });

  app.post("/api/v1/tasks/docx", async (request, reply) => {
    const auth = await requireUser(request, reply);
    if (!auth) return;

    const docxTaskAllowed = await enforceRateLimit({
      reply,
      bucket: "tasks.docx.user",
      identifier: auth.user.id,
      max: taskLimitPerMinute,
      windowMs: 60_000,
      message: "Too many docx task requests, please retry later.",
    });
    if (!docxTaskAllowed) return;

    const parsed = docxSubmitSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ message: "Invalid docx task payload", issues: parsed.error.issues });
    }

    const extension = resolveFileExtension(parsed.data.sourceFileUrl, parsed.data.sourceFileName);
    if (!allowedUploadExtensions.includes(extension as (typeof allowedUploadExtensions)[number])) {
      return reply.status(400).send({
        message: `Unsupported file type. Allowed: ${allowedUploadExtensions.join(", ")}`,
      });
    }

    if (parsed.data.sourceFileSizeBytes && parsed.data.sourceFileSizeBytes > maxUploadSizeBytes) {
      return reply.status(413).send({
        message: `File too large. Max allowed size is ${maxUploadSizeBytes} bytes.`,
      });
    }

    if (!isAllowedUploadHost(parsed.data.sourceFileUrl)) {
      return reply.status(403).send({
        message: "Source file host is not in allowed OSS host list.",
      });
    }

    const task = store.getTask(parsed.data.taskId);
    if (!task) return reply.status(404).send({ message: "Task not found" });
    if (task.userId !== auth.user.id) return reply.status(403).send({ message: "Forbidden" });
    if (!isDocxModeCompatible(task.type, parsed.data.mode)) {
      return reply.status(409).send({
        message: `Docx mode ${parsed.data.mode} is incompatible with task type ${task.type}.`,
      });
    }

    const existingDocxJob = finalizeDocxJobFromTask(parsed.data.taskId) ?? store.getDocxJob(parsed.data.taskId);
    if (existingDocxJob) {
      if (existingDocxJob.status === "completed") {
        return reply.status(200).send({
          status: "completed",
          taskId: parsed.data.taskId,
          idempotent: true,
        });
      }
      if (existingDocxJob.status !== "failed") {
        return reply.status(202).send({
          status: existingDocxJob.status,
          taskId: parsed.data.taskId,
          idempotent: true,
        });
      }
    }
    if (task.status === "completed") {
      return reply.status(409).send({ message: "Task already completed and cannot accept document processing." });
    }
    if (task.status === "failed") {
      return reply.status(409).send({ message: "Task already failed and cannot accept document processing." });
    }

    const enqueueResult = await enqueueDocxProcessing({
      taskId: parsed.data.taskId,
      userId: auth.user.id,
      sourceFileUrl: parsed.data.sourceFileUrl,
      sourceFileName: parsed.data.sourceFileName,
      sourceFileSizeBytes: parsed.data.sourceFileSizeBytes,
      sourceExtension: extension,
      mode: parsed.data.mode,
    });

    if (enqueueResult.accepted) {
      store.registerDocxJob({
        taskId: parsed.data.taskId,
        userId: auth.user.id,
        sourceFileUrl: parsed.data.sourceFileUrl,
        sourceFileName: parsed.data.sourceFileName,
        sourceFileSizeBytes: parsed.data.sourceFileSizeBytes,
        sourceExtension: extension,
        mode: parsed.data.mode,
        queueStrategy: "bullmq",
        status: "queued",
        progress: 15,
        workerJobId: enqueueResult.jobId,
      });
      scheduleSnapshotPersist(`docx-queued:${parsed.data.taskId}`, 0);
    } else {
      scheduleLocalDocxFallback({
        taskId: parsed.data.taskId,
        userId: auth.user.id,
        sourceFileUrl: parsed.data.sourceFileUrl,
        sourceFileName: parsed.data.sourceFileName,
        sourceFileSizeBytes: parsed.data.sourceFileSizeBytes,
        sourceExtension: extension,
        mode: parsed.data.mode,
      });
    }

    return reply.status(202).send({
      status: enqueueResult.accepted ? "queued" : "fallback-local",
      taskId: parsed.data.taskId,
    });
  });

  app.get("/api/v1/tasks/docx/:taskId", async (request, reply) => {
    const auth = await requireUser(request, reply);
    if (!auth) return;

    const params = request.params as { taskId: string };
    const task = store.getTask(params.taskId);
    if (!task) return reply.status(404).send({ message: "Task not found" });
    if (task.userId !== auth.user.id) return reply.status(403).send({ message: "Forbidden" });

    const docxJob = finalizeDocxJobFromTask(params.taskId) ?? store.getDocxJob(params.taskId);
    if (docxJob) {
      return {
        taskId: params.taskId,
        status: docxJob.status,
        progress: docxJob.progress,
        mode: docxJob.mode,
        queueStrategy: docxJob.queueStrategy,
        sourceFileName: docxJob.sourceFileName,
        sourceExtension: docxJob.sourceExtension,
        errorMessage: docxJob.errorMessage,
      };
    }

    return {
      taskId: params.taskId,
      status: task.status,
      progress: task.status === "queued" ? 15 : task.status === "running" ? 55 : 100,
    };
  });

  app.get("/api/v1/admin/dashboard", { preHandler: requireAdmin }, async () => {
    const todayKey = new Date().toISOString().slice(0, 10);
    const trendDays = 7;
    const pointsToCnyRate = toPositiveNumber(process.env.POINTS_TO_CNY_RATE, 0.01);

    const dateBuckets: string[] = [];
    for (let index = trendDays - 1; index >= 0; index -= 1) {
      const target = new Date(Date.now() - index * 24 * 60 * 60 * 1000);
      dateBuckets.push(target.toISOString().slice(0, 10));
    }
    const taskTrendMap = new Map<string, number>(dateBuckets.map((day) => [day, 0]));
    const costTrendMap = new Map<string, number>(dateBuckets.map((day) => [day, 0]));

    const taskStatusBreakdown: Record<"queued" | "running" | "completed" | "failed", number> = {
      queued: 0,
      running: 0,
      completed: 0,
      failed: 0,
    };
    const modelUsageMap = new Map<
      string,
      {
        model: string;
        count: number;
        pointsCost: number;
      }
    >();
    const todayActiveUsers = new Set<string>();
    const tasks = store.listTasks();

    for (const task of tasks) {
      const dayKey = task.createdAt.slice(0, 10);
      if (dayKey === todayKey) {
        todayActiveUsers.add(task.userId);
      }
      taskStatusBreakdown[task.status] += 1;

      if (taskTrendMap.has(dayKey)) {
        taskTrendMap.set(dayKey, (taskTrendMap.get(dayKey) ?? 0) + 1);
        costTrendMap.set(dayKey, (costTrendMap.get(dayKey) ?? 0) + Math.max(0, task.pointsCost));
      }

      const modelKey = `${task.payload.provider}/${task.payload.modelId}`;
      const usage = modelUsageMap.get(modelKey);
      if (usage) {
        usage.count += 1;
        usage.pointsCost += Math.max(0, task.pointsCost);
      } else {
        modelUsageMap.set(modelKey, {
          model: modelKey,
          count: 1,
          pointsCost: Math.max(0, task.pointsCost),
        });
      }
    }

    const paidOrders = store.orders.filter((item) => item.status === "paid");
    const totalIncomeRaw = paidOrders.reduce((sum, item) => sum + item.amount, 0);
    const incomeTodayRaw = paidOrders
      .filter((item) => item.paidAt?.slice(0, 10) === todayKey)
      .reduce((sum, item) => sum + item.amount, 0);

    const taskCountToday = tasks.filter((item) => item.createdAt.slice(0, 10) === todayKey).length;
    const newUsersToday = store.users.filter((item) => item.createdAt.slice(0, 10) === todayKey).length;

    const taskTrend = dateBuckets.map((day) => ({
      day: day.slice(5),
      count: taskTrendMap.get(day) ?? 0,
    }));
    const costTrend = dateBuckets.map((day) => {
      const points = costTrendMap.get(day) ?? 0;
      return {
        day: day.slice(5),
        points,
        cny: Math.round(points * pointsToCnyRate * 100) / 100,
      };
    });

    const modelUsage = Array.from(modelUsageMap.values())
      .sort((a, b) => b.count - a.count)
      .slice(0, 8)
      .map((item) => ({
        ...item,
        cny: Math.round(item.pointsCost * pointsToCnyRate * 100) / 100,
      }));

    const recentTasks = tasks.slice(0, 8).map((task) => ({
      id: task.id,
      userId: task.userId,
      status: task.status,
      model: `${task.payload.provider}/${task.payload.modelId}`,
      pointsCost: task.pointsCost,
      createdAt: task.createdAt,
    }));

    return {
      newUsersToday,
      taskCount: taskCountToday,
      income: Math.round(incomeTodayRaw * 100) / 100,
      modelCalls: taskCountToday,
      totalIncome: Math.round(totalIncomeRaw * 100) / 100,
      activeUsers: todayActiveUsers.size,
      taskStatusBreakdown,
      taskTrend,
      costTrend,
      modelUsage,
      recentTasks,
    };
  });

  app.get("/api/v1/admin/users", { preHandler: requireAdmin }, async () => {
    return store.users.map((user) => ({
      id: user.id,
      email: user.email,
      emailVerified: user.emailVerified,
      banned: user.banned,
      bannedAt: user.bannedAt,
      banReason: user.banReason,
      role: user.role,
      points: user.points,
      agentPoints: user.agentPoints,
      createdAt: user.createdAt,
    }));
  });

  app.post("/api/v1/admin/users/:id/points", { preHandler: requireAdmin }, async (request, reply) => {
    const params = request.params as { id: string };
    const parsed = adjustPointsSchema.safeParse(request.body);
    if (!parsed.success) return reply.status(400).send({ message: "Invalid payload", issues: parsed.error.issues });
    const updated = store.addPoints({ userId: params.id, change: parsed.data.change, reason: parsed.data.reason });
    if (!updated) return reply.status(404).send({ message: "User not found" });

    writeAdminActionLog(request, {
      action: "admin.user.points.adjust",
      targetType: "user",
      targetId: updated.id,
      summary: "Adjusted user points",
      detail: {
        change: parsed.data.change,
        reason: parsed.data.reason,
        points: updated.points,
        agentPoints: updated.agentPoints,
      },
    });

    return {
      userId: updated.id,
      points: updated.points,
      agentPoints: updated.agentPoints,
    };
  });

  app.post("/api/v1/admin/users/:id/ban", { preHandler: requireAdmin }, async (request, reply) => {
    const params = request.params as { id: string };
    const parsed = setUserBanSchema.safeParse(request.body ?? {});
    if (!parsed.success) return reply.status(400).send({ message: "Invalid payload", issues: parsed.error.issues });

    const result = store.setUserBanStatus({
      userId: params.id,
      banned: parsed.data.banned,
      reason: parsed.data.reason,
    });

    if (!result.ok) {
      if (result.reason === "USER_NOT_FOUND") return reply.status(404).send({ message: "User not found" });
      if (result.reason === "ADMIN_IMMUTABLE") return reply.status(409).send({ message: "Admin user cannot be banned" });
      return reply.status(409).send({ message: "Unable to update user status" });
    }

    if (result.user.banned) {
      store.revokeUserSessions(result.user.id);
    }

    writeAdminActionLog(request, {
      action: "admin.user.ban.toggle",
      targetType: "user",
      targetId: result.user.id,
      summary: result.user.banned ? "Banned user account" : "Unbanned user account",
      detail: {
        banned: result.user.banned,
        banReason: result.user.banReason,
      },
    });

    return {
      userId: result.user.id,
      banned: result.user.banned,
      bannedAt: result.user.bannedAt,
      banReason: result.user.banReason,
    };
  });

  app.get("/api/v1/admin/tasks", { preHandler: requireAdmin }, async () => {
    return store.listTasks();
  });

  app.get("/api/v1/admin/points", { preHandler: requireAdmin }, async (request) => {
    const querySchema = z.object({ userId: z.string().optional() });
    const parsed = querySchema.safeParse(request.query);
    if (!parsed.success) return store.pointRecords;
    if (!parsed.data.userId) return store.pointRecords;
    return store.pointRecords.filter((item) => item.userId === parsed.data.userId);
  });

  app.get("/api/v1/admin/orders", { preHandler: requireAdmin }, async () => {
    return store.listOrders();
  });

  app.post("/api/v1/admin/orders/:orderId/refund", { preHandler: requireAdmin }, async (request, reply) => {
    const params = request.params as { orderId: string };
    const parsed = adminRefundOrderSchema.safeParse(request.body ?? {});
    if (!parsed.success) {
      return reply.status(400).send({ message: "Invalid refund payload", issues: parsed.error.issues });
    }

    const target = store.getOrderById(params.orderId);
    if (!target) return reply.status(404).send({ message: "Order not found" });

    const result = await withUserLock(target.userId, async () =>
      store.refundTopupOrder({
        orderId: params.orderId,
        reason: parsed.data.reason,
      }),
    );

    if (!result.ok) {
      if (result.reason === "ORDER_NOT_FOUND") {
        return reply.status(404).send({ message: "Order not found" });
      }
      if (result.reason === "USER_NOT_FOUND") {
        return reply.status(404).send({ message: "User not found" });
      }
      if (result.reason === "ORDER_TYPE_NOT_REFUNDABLE") {
        return reply.status(409).send({ message: "Only topup orders are refundable" });
      }
      if (result.reason === "ORDER_NOT_PAID") {
        return reply.status(409).send({ message: "Only paid orders can be refunded" });
      }
      if (result.reason === "NO_REFUNDABLE_POINTS") {
        return reply.status(409).send({
          message: "No refundable points remain for this order",
          availablePoints: result.availablePoints,
          userPoints: result.userPoints,
        });
      }
      return reply.status(409).send({ message: "Refund rejected" });
    }

    writeAdminActionLog(request, {
      action: "admin.order.refund",
      targetType: "order",
      targetId: result.order.id,
      summary: result.idempotent ? "Refund already processed" : "Processed order refund",
      detail: {
        outTradeNo: result.order.outTradeNo,
        refundedPoints: result.refundedPoints,
        refundedAmount: result.refundedAmount,
        partialRefund: result.partialRefund,
        idempotent: result.idempotent,
      },
    });

    return {
      message: result.idempotent
        ? "Refund already processed (idempotent)"
        : result.partialRefund
          ? "Partial refund completed (consumed points excluded)"
          : "Refund completed",
      idempotent: result.idempotent,
      orderId: result.order.id,
      outTradeNo: result.order.outTradeNo,
      refundedPoints: result.refundedPoints,
      refundedAmount: result.refundedAmount,
      partialRefund: result.partialRefund,
      status: result.order.status,
      userPoints: result.userPoints ?? store.getUserById(result.order.userId)?.points ?? null,
    };
  });

  app.get("/api/v1/admin/payment-callback-logs", { preHandler: requireAdmin }, async () => {
    return store.paymentCallbackLogs;
  });

  app.get("/api/v1/admin/action-logs", { preHandler: requireAdmin }, async (request) => {
    const querySchema = z.object({
      limit: z.coerce.number().int().positive().max(500).optional(),
    });
    const parsed = querySchema.safeParse(request.query);
    const limit = parsed.success && typeof parsed.data.limit === "number" ? parsed.data.limit : 100;
    return listAdminAudit(limit);
  });

  app.get("/api/v1/admin/email-logs", { preHandler: requireAdmin }, async (request) => {
    const querySchema = z.object({
      userId: z.string().optional(),
      category: z.string().optional(),
      limit: z.coerce.number().int().positive().max(200).optional(),
    });
    const parsed = querySchema.safeParse(request.query);

    const rawLogs = store.emailDeliveryLogs;
    const limit = parsed.success ? parsed.data.limit ?? 100 : 100;
    const userId = parsed.success ? parsed.data.userId : undefined;
    const category = parsed.success ? parsed.data.category : undefined;

    return rawLogs
      .filter((item) => {
        if (userId && item.userId !== userId) return false;
        if (category && item.category !== category) return false;
        return true;
      })
      .slice(0, limit);
  });

  app.get("/api/v1/admin/plans", { preHandler: requireAdmin }, async () => {
    return store.listPlans();
  });

  app.post("/api/v1/admin/plans", { preHandler: requireAdmin }, async (request, reply) => {
    const parsed = adminCreatePlanSchema.safeParse(request.body ?? {});
    if (!parsed.success) {
      return reply.status(400).send({ message: "Invalid plan payload", issues: parsed.error.issues });
    }

    const created = store.createPlan({
      name: parsed.data.name,
      monthlyPrice: parsed.data.monthlyPrice,
      yearlyPrice: parsed.data.yearlyPrice,
      quota: parsed.data.quota,
      features: parsed.data.features,
    });

    writeAdminActionLog(request, {
      action: "admin.plan.create",
      targetType: "plan",
      targetId: created.id,
      summary: "Created pricing plan",
      detail: {
        name: created.name,
        monthlyPrice: created.monthlyPrice,
        yearlyPrice: created.yearlyPrice,
        quota: created.quota,
      },
    });

    return reply.status(201).send(created);
  });

  app.put("/api/v1/admin/plans/:id", { preHandler: requireAdmin }, async (request, reply) => {
    const params = request.params as { id: string };
    const parsed = adminUpdatePlanSchema.safeParse(request.body ?? {});
    if (!parsed.success) {
      return reply.status(400).send({ message: "Invalid plan payload", issues: parsed.error.issues });
    }

    const updated = store.updatePlan({
      id: params.id,
      name: parsed.data.name,
      monthlyPrice: parsed.data.monthlyPrice,
      yearlyPrice: parsed.data.yearlyPrice,
      quota: parsed.data.quota,
      features: parsed.data.features,
    });
    if (!updated) return reply.status(404).send({ message: "Plan not found" });

    writeAdminActionLog(request, {
      action: "admin.plan.update",
      targetType: "plan",
      targetId: updated.id,
      summary: "Updated pricing plan",
      detail: {
        name: updated.name,
        monthlyPrice: updated.monthlyPrice,
        yearlyPrice: updated.yearlyPrice,
        quota: updated.quota,
      },
    });

    return updated;
  });

  app.delete("/api/v1/admin/plans/:id", { preHandler: requireAdmin }, async (request, reply) => {
    const params = request.params as { id: string };
    const removed = store.deletePlan(params.id);
    if (!removed) return reply.status(404).send({ message: "Plan not found" });

    writeAdminActionLog(request, {
      action: "admin.plan.delete",
      targetType: "plan",
      targetId: removed.id,
      summary: "Deleted pricing plan",
      detail: {
        name: removed.name,
      },
    });

    return { success: true, id: removed.id };
  });

  app.get("/api/v1/admin/content/tutorials", { preHandler: requireAdmin }, async () => {
    return store.listTutorialsAdmin();
  });

  app.post("/api/v1/admin/content/tutorials", { preHandler: requireAdmin }, async (request, reply) => {
    const parsed = adminCreateTutorialSchema.safeParse(request.body ?? {});
    if (!parsed.success) {
      return reply.status(400).send({ message: "Invalid tutorial payload", issues: parsed.error.issues });
    }
    const created = store.createTutorial({
      slug: parsed.data.slug,
      title: parsed.data.title,
      tag: parsed.data.tag,
      summary: parsed.data.summary,
      content: parsed.data.content,
      status: parsed.data.status,
    });

    writeAdminActionLog(request, {
      action: "admin.tutorial.create",
      targetType: "tutorial",
      targetId: created.id,
      summary: "Created tutorial content",
      detail: {
        title: created.title,
        status: created.status,
      },
    });

    return reply.status(201).send(created);
  });

  app.put("/api/v1/admin/content/tutorials/:id", { preHandler: requireAdmin }, async (request, reply) => {
    const params = request.params as { id: string };
    const parsed = adminUpdateTutorialSchema.safeParse(request.body ?? {});
    if (!parsed.success) {
      return reply.status(400).send({ message: "Invalid tutorial payload", issues: parsed.error.issues });
    }

    const updated = store.updateTutorial({
      id: params.id,
      slug: parsed.data.slug,
      title: parsed.data.title,
      tag: parsed.data.tag,
      summary: parsed.data.summary,
      content: parsed.data.content,
      status: parsed.data.status,
    });
    if (!updated) return reply.status(404).send({ message: "Tutorial not found" });

    writeAdminActionLog(request, {
      action: "admin.tutorial.update",
      targetType: "tutorial",
      targetId: updated.id,
      summary: "Updated tutorial content",
      detail: {
        title: updated.title,
        status: updated.status,
      },
    });

    return updated;
  });

  app.delete("/api/v1/admin/content/tutorials/:id", { preHandler: requireAdmin }, async (request, reply) => {
    const params = request.params as { id: string };
    const removed = store.deleteTutorial(params.id);
    if (!removed) return reply.status(404).send({ message: "Tutorial not found" });

    writeAdminActionLog(request, {
      action: "admin.tutorial.delete",
      targetType: "tutorial",
      targetId: removed.id,
      summary: "Deleted tutorial content",
      detail: {
        title: removed.title,
      },
    });

    return {
      deleted: true,
      id: removed.id,
    };
  });

  app.get("/api/v1/admin/models", { preHandler: requireAdmin }, async () => {
    return store.models.map((item) => ({
      id: item.id,
      provider: item.provider,
      modelId: item.modelId,
      displayName: item.displayName,
      enabled: item.enabled,
      pointMultiplier: item.pointMultiplier,
      hasApiKey: item.hasApiKey,
      keyUpdatedAt: item.keyUpdatedAt,
    }));
  });

  app.patch("/api/v1/admin/models/:id", { preHandler: requireAdmin }, async (request, reply) => {
    const params = request.params as { id: string };
    const parsed = updateModelSchema.safeParse(request.body);
    if (!parsed.success) return reply.status(400).send({ message: "Invalid model update payload", issues: parsed.error.issues });
    const updated = store.updateModel({ id: params.id, ...parsed.data });
    if (!updated) return reply.status(404).send({ message: "Model not found" });

    writeAdminActionLog(request, {
      action: "admin.model.update",
      targetType: "model",
      targetId: updated.id,
      summary: "Updated model config",
      detail: {
        enabled: updated.enabled,
        pointMultiplier: updated.pointMultiplier,
      },
    });

    return {
      id: updated.id,
      provider: updated.provider,
      modelId: updated.modelId,
      displayName: updated.displayName,
      enabled: updated.enabled,
      pointMultiplier: updated.pointMultiplier,
      hasApiKey: updated.hasApiKey,
      keyUpdatedAt: updated.keyUpdatedAt,
    };
  });

  app.post("/api/v1/admin/models/:id/api-key", { preHandler: requireAdmin }, async (request, reply) => {
    const params = request.params as { id: string };
    const parsed = setModelApiKeySchema.safeParse(request.body ?? {});
    if (!parsed.success) {
      return reply.status(400).send({ message: "Invalid model api-key payload", issues: parsed.error.issues });
    }
    const updated = store.setModelApiKey({
      id: params.id,
      apiKey: parsed.data.apiKey,
      clear: parsed.data.clear,
    });
    if (!updated) return reply.status(404).send({ message: "Model not found" });

    writeAdminActionLog(request, {
      action: "admin.model.api_key",
      targetType: "model",
      targetId: updated.id,
      summary: parsed.data.clear ? "Cleared model API key" : "Updated model API key",
      detail: {
        hasApiKey: updated.hasApiKey,
      },
    });

    return {
      id: updated.id,
      hasApiKey: updated.hasApiKey,
      keyUpdatedAt: updated.keyUpdatedAt,
    };
  });

  app.get("/api/v1/admin/workbench-nav", { preHandler: requireAdmin }, async () => {
    return store.listWorkbenchNav();
  });

  app.patch("/api/v1/admin/workbench-nav/:key", { preHandler: requireAdmin }, async (request, reply) => {
    const params = request.params as { key: string };
    const parsed = updateWorkbenchNavSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ message: "Invalid workbench nav update payload", issues: parsed.error.issues });
    }
    const updated = store.updateWorkbenchNav({
      key: params.key as WorkbenchNavKey,
      visible: parsed.data.visible,
    });
    if (!updated) return reply.status(404).send({ message: "Workbench nav item not found" });

    writeAdminActionLog(request, {
      action: "admin.workbench_nav.update",
      targetType: "workbench_nav",
      targetId: updated.key,
      summary: "Updated workbench nav visibility",
      detail: {
        visible: updated.visible,
      },
    });

    return updated;
  });

  app.get("/api/v1/admin/settings", { preHandler: requireAdmin }, async () => {
    return {
      ...systemSettings,
      emailTransport: getEmailTransportStatus(),
    };
  });

  app.put("/api/v1/admin/settings", { preHandler: requireAdmin }, async (request, reply) => {
    const parsed = systemSettingsSchema.safeParse(request.body);
    if (!parsed.success) return reply.status(400).send({ message: "Invalid settings payload", issues: parsed.error.issues });
    replaceSystemSettings(parsed.data);

    writeAdminActionLog(request, {
      action: "admin.settings.update",
      targetType: "system_settings",
      summary: "Updated system settings",
      detail: {
        siteName: systemSettings.siteName,
        smtpHost: systemSettings.smtpHost,
        checkinPoints: systemSettings.checkinPoints,
      },
    });

    return systemSettings;
  });

  try {
    await app.listen({ port, host });
    app.log.info(`API listening at http://${host}:${port}`);
  } catch (error) {
    captureApiException(error, {
      tags: { scope: "bootstrap.listen" },
      extras: { host, port },
    });
    await flushApiMonitoring();
    app.log.error(error);
    process.exit(1);
  }
}

void bootstrap();

































