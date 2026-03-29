import { createAccessToken, hashPassword } from "./auth";
import { defaultAcademicPlatform, type AcademicPlatform } from "./academic-platforms";
import { defaultModelRegistry, type ModelProvider, type ModelRegistryItem } from "./model-router";
import {
  exportSystemSettingsSnapshot,
  hydrateSystemSettingsSnapshot,
  type SystemSettingsSnapshot,
} from "./system-settings";
import { buildTaskResult } from "./task-engine";

export type WorkbenchNavKey =
  | "ai-search"
  | "reduce-repeat"
  | "reduce-ai"
  | "detect"
  | "literature"
  | "proposal"
  | "article"
  | "format"
  | "editor"
  | "ppt"
  | "review"
  | "assets"
  | "points";

export type WorkbenchNavItem = {
  key: WorkbenchNavKey;
  href: string;
  label: string;
  visible: boolean;
  order: number;
};

export type StoreUser = {
  id: string;
  email: string;
  passwordHash: string;
  emailVerified: boolean;
  emailVerifiedAt?: string;
  banned: boolean;
  bannedAt?: string;
  banReason?: string;
  points: number;
  agentPoints: number;
  inviteCode?: string;
  role: "USER" | "ADMIN";
  dailyDetectUsed: number;
  lastCheckinAt?: string;
  createdAt: string;
};

export type StoreTask = {
  id: string;
  userId: string;
  type: string;
  status: "queued" | "running" | "completed" | "failed";
  payload: {
    content: string;
    mode: string;
    provider: ModelProvider;
    modelId: string;
    modelHasApiKey?: boolean;
    pointMultiplier?: number;
    platform?: AcademicPlatform;
    executionManaged?: boolean;
  };
  result?: {
    output: string;
    outputUrl?: string; 
    report?: unknown; 
    execution?: unknown;
    traceId?: string;
    tokensUsed?: number;
    modelSource?: "remote" | "fallback_local";
    fallbackReason?: string;
  };
  pointsCost: number;
  pointsRefunded?: boolean;
  createdAt: string;
  updatedAt: string;
};

export type DocxProcessingMode = "deai" | "rewrite" | "detect";
export type DocxProcessingStatus = "queued" | "running" | "completed" | "failed" | "fallback-local";

export type DocxProcessingJob = {
  taskId: string;
  userId: string;
  sourceFileUrl: string;
  sourceFileName?: string;
  sourceFileSizeBytes?: number;
  sourceExtension?: string; 
  sourceFileBase64?: string; 
  mode: DocxProcessingMode;
  queueStrategy: "bullmq" | "local";
  status: DocxProcessingStatus;
  progress: number;
  submittedAt: string;
  startedAt?: string;
  completedAt?: string;
  updatedAt: string;
  errorMessage?: string;
  workerJobId?: string;
};

export type PointRecord = {
  id: string;
  userId: string;
  change: number;
  reason: string;
  createdAt: string;
};

export type Plan = {
  id: string;
  name: string;
  monthlyPrice: number;
  yearlyPrice: number;
  quota: number;
  features: string[];
};

export type TutorialStatus = "draft" | "published";

export type TutorialArticle = {
  id: string;
  slug: string;
  title: string;
  tag: string;
  summary: string;
  content: string;
  status: TutorialStatus;
  createdAt: string;
  updatedAt: string;
};

export type PaymentChannel = "alipay" | "wechat" | "stripe" | "mock";
export type OrderType = "plan" | "topup";
export type OrderStatus = "pending" | "paid" | "failed" | "refunded";

export type Order = {
  id: string;
  userId: string;
  orderType: OrderType;
  planName?: string;
  pointsAmount: number;
  creditedPoints?: number;
  availablePoints?: number;
  amount: number;
  currency: "CNY";
  channel: PaymentChannel;
  outTradeNo: string;
  transactionId?: string;
  status: OrderStatus;
  callbackCount: number;
  paidAt?: string;
  refundedAt?: string;
  refundedPoints?: number;
  refundedAmount?: number;
  refundReason?: string;
  partialRefund?: boolean;
  failureReason?: string;
  createdAt: string;
  updatedAt: string;
};

export type PaymentCallbackLog = {
  id: string;
  outTradeNo: string;
  orderId?: string;
  channel: PaymentChannel;
  transactionId?: string;
  payload: string;
  verified: boolean;
  accepted: boolean;
  reason: string;
  createdAt: string;
};

export type DownloadTicket = {
  id: string;
  userId: string;
  taskId: string;
  expiresAt: string;
  createdAt: string;
  consumedAt?: string;
};

export type AuthSession = {
  token: string;
  userId: string;
  expiresAt: string;
  createdAt: string;
};

export type EmailVerificationToken = {
  id: string;
  userId: string;
  email: string;
  token: string;
  expiresAt: string;
  createdAt: string;
  consumedAt?: string;
};

export type PasswordResetToken = {
  id: string;
  userId: string;
  email: string;
  token: string;
  expiresAt: string;
  createdAt: string;
  consumedAt?: string;
};

export type EmailDeliveryLog = {
  id: string;
  userId?: string;
  to: string;
  subject: string;
  category: string;
  status: "sent" | "failed";
  provider: "smtp" | "dev-log";
  messageId?: string;
  error?: string;
  meta?: string;
  createdAt: string;
};

export type AdminActionLog = {
  id: string
  actor: string
  action: string
  targetType: string
  targetId?: string
  summary: string
  detail?: string
  createdAt: string
}
function uid(prefix: string) {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
}

function createOutTradeNo() {
  const now = new Date();
  const pad = (value: number, length = 2) => value.toString().padStart(length, "0");
  const datePart = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}${pad(now.getHours())}${pad(
    now.getMinutes(),
  )}${pad(now.getSeconds())}`;
  const randomPart = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `GW${datePart}${randomPart}`;
}

function normalizeSlug(input: string) {
  const normalized = input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 100);
  if (normalized) return normalized;
  return `tutorial-${Math.random().toString(36).slice(2, 8)}`;
}

const now = new Date().toISOString();

const users: StoreUser[] = [
  {
    id: "u_admin",
    email: "admin@gewu.local",
    passwordHash: hashPassword("admin123"),
    emailVerified: true,
    emailVerifiedAt: now,
    banned: false,
    points: 0,
    agentPoints: 0,
    role: "ADMIN",
    dailyDetectUsed: 0,
    createdAt: now,
  },
  {
    id: "u_demo",
    email: "demo@gewu.local",
    passwordHash: hashPassword("demo123"),
    emailVerified: true,
    emailVerifiedAt: now,
    banned: false,
    points: 12618,
    agentPoints: 2100,
    role: "USER",
    dailyDetectUsed: 2,
    inviteCode: "GEWU2026",
    createdAt: now,
  },
];

const pointRecords: PointRecord[] = [
  { id: uid("pt"), userId: "u_demo", change: 5, reason: "签到奖励", createdAt: now },
  { id: uid("pt"), userId: "u_demo", change: -102, reason: "reduce-ai task cost", createdAt: now },
];

const tasks: StoreTask[] = [
  {
    id: "tsk_seed_1",
    userId: "u_demo",
    type: "reduce-ai",
    status: "running",
      payload: {
        content: "seed task content",
        mode: "balanced",
        provider: "deepseek",
        modelId: "deepseek-v3",
        platform: defaultAcademicPlatform,
      },
    pointsCost: 102,
    createdAt: new Date(Date.now() - 5000).toISOString(),
    updatedAt: now,
  },
  {
    id: "tsk_seed_2",
    userId: "u_demo",
    type: "detect",
    status: "completed",
      payload: {
        content: "seed detect content",
        mode: "balanced",
        provider: "qwen",
        modelId: "qwen-max",
        platform: defaultAcademicPlatform,
      },
    pointsCost: 0,
    createdAt: new Date(Date.now() - 15000).toISOString(),
    updatedAt: now,
    result: {
      output: "seed detect completed",
      outputUrl: "https://oss-example.gewu.local/results/tsk_seed_2.docx",
    },
  },
];

const models: ModelRegistryItem[] = [...defaultModelRegistry];

const plans: Plan[] = [
  {
    id: "plan_free",
    name: "Free",
    monthlyPrice: 0,
    yearlyPrice: 0,
    quota: 0,
    features: ["5 daily AIGC checks", "basic detect report", "tutorial access"],
  },
  {
    id: "plan_basic",
    name: "Basic",
    monthlyPrice: 39,
    yearlyPrice: 368,
    quota: 30000,
    features: ["rewrite + de-AIGC", "literature template", "task history"],
  },
  {
    id: "plan_pro",
    name: "Professional",
    monthlyPrice: 129,
    yearlyPrice: 1299,
    quota: 150000,
    features: ["full academic suite", "AI editor + assets", "priority queue"],
  },
  {
    id: "plan_team",
    name: "Enterprise",
    monthlyPrice: 699,
    yearlyPrice: 6999,
    quota: 99999999,
    features: ["multi-seat collaboration", "team management", "dedicated model policy"],
  },
];

const tutorialArticles: TutorialArticle[] = [
  {
    id: "tut_1",
    slug: "reduce-ai-cnki",
    title: "How to reduce AIGC ratio in CNKI-sensitive submissions",
    tag: "de-AIGC",
    summary: "A practical checklist for reducing AI fingerprints while preserving thesis meaning.",
    content:
      "1. Keep argument structure stable.\n2. Rewrite sentence rhythm and connector patterns.\n3. Add domain-specific citations and concrete evidence.\n4. Re-run detection and fix only high-risk paragraphs.",
    status: "published",
    createdAt: new Date(Date.now() - 6 * 24 * 60 * 60 * 1000).toISOString(),
    updatedAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(),
  },
  {
    id: "tut_2",
    slug: "rewrite-order",
    title: "Best order for de-duplication and de-AIGC rewriting",
    tag: "writing",
    summary: "A safe processing order to avoid repeated edits and unnecessary point cost.",
    content:
      "Recommended flow: clean structure -> de-duplication -> de-AIGC rewrite -> final detection.\nThis avoids over-rewriting and helps keep references consistent.",
    status: "published",
    createdAt: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString(),
    updatedAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
  },
  {
    id: "tut_3",
    slug: "detection-strategy",
    title: "How to interpret AIGC detection reports",
    tag: "detection",
    summary: "Understand high-risk paragraphs and avoid meaningless full-document rewrites.",
    content:
      "Focus on highlighted segments with unusually generic patterns.\nDo not rewrite references and formula-heavy paragraphs unless flagged.\nAlways validate with a second pass.",
    status: "published",
    createdAt: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString(),
    updatedAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString(),
  },
];

const orders: Order[] = [
  {
    id: "ord_seed_plan_1",
    userId: "u_demo",
    orderType: "plan",
    planName: "Professional",
    pointsAmount: 0,
    amount: 129,
    currency: "CNY",
    channel: "alipay",
    outTradeNo: "GW20260326101010PLAN1",
    transactionId: "txn_demo_plan_1",
    status: "paid",
    callbackCount: 1,
    paidAt: new Date(Date.now() - 86400000).toISOString(),
    createdAt: new Date(Date.now() - 86400000).toISOString(),
    updatedAt: new Date(Date.now() - 86400000).toISOString(),
  },
  {
    id: "ord_seed_topup_1",
    userId: "u_demo",
    orderType: "topup",
    planName: "Professional",
    pointsAmount: 500,
    amount: 19,
    currency: "CNY",
    channel: "alipay",
    outTradeNo: "GW20260325101010TP001",
    transactionId: "txn_demo_topup_1",
    status: "refunded",
    callbackCount: 1,
    creditedPoints: 500,
    availablePoints: 0,
    refundedPoints: 500,
    refundedAmount: 19,
    partialRefund: false,
    refundReason: "refunded by admin",
    refundedAt: new Date(Date.now() - 86400000).toISOString(),
    paidAt: new Date(Date.now() - 172800000).toISOString(),
    failureReason: "refunded by admin",
    createdAt: new Date(Date.now() - 172800000).toISOString(),
    updatedAt: new Date(Date.now() - 86400000).toISOString(),
  },
];

const seedDemoDataEnabled =
  process.env.SEED_DEMO_DATA === "true" ||
  ((process.env.APP_ENV || "development").toLowerCase() !== "production" && process.env.SEED_DEMO_DATA !== "false");

if (!seedDemoDataEnabled) {
  for (let index = users.length - 1; index >= 0; index -= 1) {
    const user = users[index];
    if (user.email.endsWith("@gewu.local")) {
      users.splice(index, 1);
    }
  }

  const activeUserIds = new Set(users.map((item) => item.id));

  for (let index = pointRecords.length - 1; index >= 0; index -= 1) {
    if (!activeUserIds.has(pointRecords[index].userId)) {
      pointRecords.splice(index, 1);
    }
  }

  for (let index = tasks.length - 1; index >= 0; index -= 1) {
    if (!activeUserIds.has(tasks[index].userId)) {
      tasks.splice(index, 1);
    }
  }

  for (let index = orders.length - 1; index >= 0; index -= 1) {
    if (!activeUserIds.has(orders[index].userId)) {
      orders.splice(index, 1);
    }
  }
}
const paymentCallbackLogs: PaymentCallbackLog[] = [];
const downloadTickets: DownloadTicket[] = [];
const emailVerificationTokens: EmailVerificationToken[] = [];
const passwordResetTokens: PasswordResetToken[] = [];
const emailDeliveryLogs: EmailDeliveryLog[] = [];
const docxJobs: DocxProcessingJob[] = [];

const workbenchNav: WorkbenchNavItem[] = [
  { key: "ai-search", href: "/zh/AI-search", label: "AI Search", visible: false, order: 1 },
  { key: "reduce-repeat", href: "/zh/reduce-repeat", label: "Reduce Repeat", visible: true, order: 2 },
  { key: "reduce-ai", href: "/zh/reduce-ai", label: "Reduce AIGC", visible: true, order: 3 },
  { key: "detect", href: "/zh/detect", label: "AIGC Detect", visible: true, order: 4 },
  { key: "literature", href: "/zh/literature", label: "Literature", visible: true, order: 5 },
  { key: "proposal", href: "/zh/proposal", label: "Proposal", visible: false, order: 6 },
  { key: "article", href: "/zh/article", label: "Article", visible: false, order: 7 },
  { key: "format", href: "/zh/format", label: "Format", visible: false, order: 8 },
  { key: "editor", href: "/zh/editor", label: "AI Editor", visible: false, order: 9 },
  { key: "ppt", href: "/zh/ppt", label: "AI PPT", visible: false, order: 10 },
  { key: "review", href: "/zh/review", label: "AI Review", visible: false, order: 11 },
  { key: "assets", href: "/zh/assets", label: "Assets", visible: false, order: 12 },
  { key: "points", href: "/zh/points", label: "Points", visible: true, order: 13 },
];

const sessions = new Map<string, AuthSession>();

function getUser(userId: string) {
  return users.find((user) => user.id === userId);
}

function getSortedWorkbenchNav() {
  return [...workbenchNav].sort((a, b) => a.order - b.order);
}

function removeExpiredSessions() {
  const nowMs = Date.now();
  for (const [token, session] of sessions.entries()) {
    if (new Date(session.expiresAt).getTime() <= nowMs) {
      sessions.delete(token);
    }
  }
}

function listTutorialsSorted(items: TutorialArticle[]) {
  return [...items].sort((a, b) => {
    const aTime = new Date(a.updatedAt).getTime();
    const bTime = new Date(b.updatedAt).getTime();
    return bTime - aTime;
  });
}

function buildUniqueTutorialSlug(base: string, excludeId?: string) {
  const normalized = normalizeSlug(base);
  let candidate = normalized;
  let index = 2;
  const exists = (slug: string) =>
    tutorialArticles.some((item) => item.slug === slug && (!excludeId || item.id !== excludeId));

  while (exists(candidate)) {
    candidate = `${normalized}-${index}`;
    index += 1;
  }
  return candidate;
}

function listPlansSorted(items: Plan[]) {
  return [...items].sort((a, b) => {
    if (a.monthlyPrice !== b.monthlyPrice) return a.monthlyPrice - b.monthlyPrice;
    return a.name.localeCompare(b.name);
  });
}

function normalizePlanFeatures(features: string[]) {
  const normalized: string[] = [];
  const seen = new Set<string>();
  for (const item of features) {
    const value = item.trim();
    if (!value) continue;
    if (seen.has(value)) continue;
    seen.add(value);
    normalized.push(value);
  }
  if (normalized.length > 0) return normalized;
  return ["姒涙鍔熻兘"];
}

export const store = {
  users,
  pointRecords,
  tasks,
  models,
  plans,
  tutorialArticles,
  orders,
  paymentCallbackLogs,
  downloadTickets,
  emailVerificationTokens,
  passwordResetTokens,
  emailDeliveryLogs,
  docxJobs,
  workbenchNav,

  findUserByEmail(email: string) {
    return users.find((user) => user.email === email.toLowerCase());
  },

  getUserById(userId: string) {
    return getUser(userId);
  },

  listPlans() {
    return listPlansSorted(plans);
  },

  createPlan(input: {
    name: string;
    monthlyPrice: number;
    yearlyPrice: number;
    quota: number;
    features: string[];
  }) {
    const plan: Plan = {
      id: uid("plan"),
      name: input.name.trim(),
      monthlyPrice: Math.max(0, Math.floor(input.monthlyPrice)),
      yearlyPrice: Math.max(0, Math.floor(input.yearlyPrice)),
      quota: Math.max(0, Math.floor(input.quota)),
      features: normalizePlanFeatures(input.features),
    };
    plans.push(plan);
    return plan;
  },

  updatePlan(input: {
    id: string;
    name?: string;
    monthlyPrice?: number;
    yearlyPrice?: number;
    quota?: number;
    features?: string[];
  }) {
    const plan = plans.find((item) => item.id === input.id);
    if (!plan) return null;

    if (typeof input.name === "string") plan.name = input.name.trim();
    if (typeof input.monthlyPrice === "number") plan.monthlyPrice = Math.max(0, Math.floor(input.monthlyPrice));
    if (typeof input.yearlyPrice === "number") plan.yearlyPrice = Math.max(0, Math.floor(input.yearlyPrice));
    if (typeof input.quota === "number") plan.quota = Math.max(0, Math.floor(input.quota));
    if (Array.isArray(input.features)) plan.features = normalizePlanFeatures(input.features);

    return plan;
  },

  deletePlan(planId: string) {
    const index = plans.findIndex((item) => item.id === planId);
    if (index < 0) return null;
    const [removed] = plans.splice(index, 1);
    return removed ?? null;
  },

  listTutorialsAdmin() {
    return listTutorialsSorted(tutorialArticles);
  },

  listPublishedTutorials(input?: { tag?: string; q?: string }) {
    const tag = input?.tag?.trim().toLowerCase();
    const keyword = input?.q?.trim().toLowerCase();

    return listTutorialsSorted(tutorialArticles).filter((item) => {
      if (item.status !== "published") return false;
      if (tag && item.tag.toLowerCase() !== tag) return false;
      if (!keyword) return true;
      const text = `${item.title}\n${item.summary}\n${item.content}`.toLowerCase();
      return text.includes(keyword);
    });
  },

  getTutorialBySlug(slug: string, options?: { includeDraft?: boolean }) {
    const target = tutorialArticles.find((item) => item.slug === slug) ?? null;
    if (!target) return null;
    if (options?.includeDraft) return target;
    if (target.status !== "published") return null;
    return target;
  },

  createTutorial(input: {
    title: string;
    tag: string;
    summary: string;
    content: string;
    status: TutorialStatus;
    slug?: string;
  }) {
    const nowIso = new Date().toISOString();
    const slug = buildUniqueTutorialSlug(input.slug || input.title);
    const article: TutorialArticle = {
      id: uid("tut"),
      slug,
      title: input.title,
      tag: input.tag,
      summary: input.summary,
      content: input.content,
      status: input.status,
      createdAt: nowIso,
      updatedAt: nowIso,
    };
    tutorialArticles.unshift(article);
    return article;
  },

  updateTutorial(
    input: {
      id: string;
      title?: string;
      tag?: string;
      summary?: string;
      content?: string;
      status?: TutorialStatus;
      slug?: string;
    },
  ) {
    const article = tutorialArticles.find((item) => item.id === input.id);
    if (!article) return null;

    if (typeof input.title === "string") article.title = input.title;
    if (typeof input.tag === "string") article.tag = input.tag;
    if (typeof input.summary === "string") article.summary = input.summary;
    if (typeof input.content === "string") article.content = input.content;
    if (input.status === "draft" || input.status === "published") article.status = input.status;
    if (typeof input.slug === "string") {
      article.slug = buildUniqueTutorialSlug(input.slug || article.title, article.id);
    }

    article.updatedAt = new Date().toISOString();
    return article;
  },

  deleteTutorial(id: string) {
    const index = tutorialArticles.findIndex((item) => item.id === id);
    if (index < 0) return null;
    const [removed] = tutorialArticles.splice(index, 1);
    return removed ?? null;
  },

  createUser(input: { email: string; password: string; inviteCode?: string }) {
    const user: StoreUser = {
      id: uid("u"),
      email: input.email.toLowerCase(),
      passwordHash: hashPassword(input.password),
      emailVerified: false,
      banned: false,
      inviteCode: input.inviteCode,
      points: 600,
      agentPoints: 0,
      role: "USER",
      dailyDetectUsed: 0,
      createdAt: new Date().toISOString(),
    };
    users.unshift(user);
    pointRecords.unshift({
      id: uid("pt"),
      userId: user.id,
      change: 600,
      reason: "new user welcome bonus",
      createdAt: new Date().toISOString(),
    });
    return user;
  },

  cleanupExpiredAuthTokens(referenceMs = Date.now()) {
    for (let index = emailVerificationTokens.length - 1; index >= 0; index -= 1) {
      const token = emailVerificationTokens[index];
      const expiresAtMs = new Date(token.expiresAt).getTime();
      if (!Number.isFinite(expiresAtMs) || expiresAtMs <= referenceMs) {
        emailVerificationTokens.splice(index, 1);
      }
    }
    for (let index = passwordResetTokens.length - 1; index >= 0; index -= 1) {
      const token = passwordResetTokens[index];
      const expiresAtMs = new Date(token.expiresAt).getTime();
      if (!Number.isFinite(expiresAtMs) || expiresAtMs <= referenceMs) {
        passwordResetTokens.splice(index, 1);
      }
    }
  },

  createEmailVerificationToken(input: { userId: string; ttlSeconds: number }) {
    const user = getUser(input.userId);
    if (!user) return null;

    const ttlSeconds = Math.max(60, Math.floor(input.ttlSeconds));
    const nowMs = Date.now();
    this.cleanupExpiredAuthTokens(nowMs);

    // Keep only the latest active token for each user.
    for (const item of emailVerificationTokens) {
      if (item.userId === input.userId && !item.consumedAt) {
        item.consumedAt = new Date(nowMs).toISOString();
      }
    }

    const record: EmailVerificationToken = {
      id: uid("evt"),
      userId: user.id,
      email: user.email,
      token: createAccessToken(),
      createdAt: new Date(nowMs).toISOString(),
      expiresAt: new Date(nowMs + ttlSeconds * 1000).toISOString(),
    };
    emailVerificationTokens.unshift(record);
    return record;
  },

  consumeEmailVerificationToken(tokenValue: string) {
    this.cleanupExpiredAuthTokens();
    const record = emailVerificationTokens.find((item) => item.token === tokenValue);
    if (!record) {
      return { ok: false as const, reason: "NOT_FOUND" as const };
    }

    const expiresAtMs = new Date(record.expiresAt).getTime();
    if (!Number.isFinite(expiresAtMs) || expiresAtMs <= Date.now()) {
      return { ok: false as const, reason: "EXPIRED" as const };
    }

    if (record.consumedAt) {
      return { ok: false as const, reason: "ALREADY_USED" as const, record };
    }

    record.consumedAt = new Date().toISOString();
    return { ok: true as const, record };
  },

  markUserEmailVerified(userId: string) {
    const user = getUser(userId);
    if (!user) return null;
    user.emailVerified = true;
    if (!user.emailVerifiedAt) {
      user.emailVerifiedAt = new Date().toISOString();
    }
    return user;
  },

  createPasswordResetToken(input: { userId: string; ttlSeconds: number }) {
    const user = getUser(input.userId);
    if (!user) return null;

    const ttlSeconds = Math.max(60, Math.floor(input.ttlSeconds));
    const nowMs = Date.now();
    this.cleanupExpiredAuthTokens(nowMs);

    for (const item of passwordResetTokens) {
      if (item.userId === input.userId && !item.consumedAt) {
        item.consumedAt = new Date(nowMs).toISOString();
      }
    }

    const record: PasswordResetToken = {
      id: uid("prt"),
      userId: user.id,
      email: user.email,
      token: createAccessToken(),
      createdAt: new Date(nowMs).toISOString(),
      expiresAt: new Date(nowMs + ttlSeconds * 1000).toISOString(),
    };
    passwordResetTokens.unshift(record);
    return record;
  },

  consumePasswordResetToken(tokenValue: string) {
    this.cleanupExpiredAuthTokens();
    const record = passwordResetTokens.find((item) => item.token === tokenValue);
    if (!record) {
      return { ok: false as const, reason: "NOT_FOUND" as const };
    }

    const expiresAtMs = new Date(record.expiresAt).getTime();
    if (!Number.isFinite(expiresAtMs) || expiresAtMs <= Date.now()) {
      return { ok: false as const, reason: "EXPIRED" as const };
    }

    if (record.consumedAt) {
      return { ok: false as const, reason: "ALREADY_USED" as const, record };
    }

    record.consumedAt = new Date().toISOString();
    return { ok: true as const, record };
  },

  updateUserPassword(input: { userId: string; password: string }) {
    const user = getUser(input.userId);
    if (!user) return null;
    user.passwordHash = hashPassword(input.password);
    return user;
  },

  setUserBanStatus(input: { userId: string; banned: boolean; reason?: string }) {
    const user = getUser(input.userId);
    if (!user) return { ok: false as const, reason: "USER_NOT_FOUND" as const };
    if (user.role === "ADMIN") return { ok: false as const, reason: "ADMIN_IMMUTABLE" as const };

    user.banned = input.banned;
    if (input.banned) {
      user.bannedAt = new Date().toISOString();
      user.banReason = input.reason || "banned by admin";
    } else {
      user.bannedAt = undefined;
      user.banReason = undefined;
    }

    return { ok: true as const, user };
  },

  listPaidTopupOrdersByTime(userId: string) {
    return orders
      .filter((order) => order.userId === userId && order.orderType === "topup" && (order.status === "paid" || order.status === "refunded"))
      .sort((a, b) => {
        const aTime = new Date(a.paidAt || a.createdAt).getTime();
        const bTime = new Date(b.paidAt || b.createdAt).getTime();
        return aTime - bTime;
      });
  },

  ensureTopupCreditState(order: Order) {
    if (order.orderType !== "topup") return;
    const creditedPoints = Math.max(0, Math.floor(order.creditedPoints ?? order.pointsAmount));
    const refundedPoints = Math.max(0, Math.floor(order.refundedPoints ?? 0));
    const fallbackAvailable = Math.max(0, creditedPoints - refundedPoints);
    const availablePoints = Math.max(0, Math.floor(order.availablePoints ?? fallbackAvailable));
    order.creditedPoints = creditedPoints;
    order.refundedPoints = refundedPoints;
    order.availablePoints = availablePoints;
  },

  consumeTopupCredits(userId: string, pointsToConsume: number) {
    let remaining = Math.max(0, Math.floor(pointsToConsume));
    if (remaining <= 0) return;

    const userOrders = this.listPaidTopupOrdersByTime(userId);
    for (const order of userOrders) {
      if (order.status !== "paid") continue;
      this.ensureTopupCreditState(order);
      const available = Math.max(0, order.availablePoints ?? 0);
      if (available <= 0) continue;
      const consumed = Math.min(available, remaining);
      order.availablePoints = available - consumed;
      order.updatedAt = new Date().toISOString();
      remaining -= consumed;
      if (remaining <= 0) break;
    }
  },

  restoreTopupCredits(userId: string, pointsToRestore: number) {
    let remaining = Math.max(0, Math.floor(pointsToRestore));
    if (remaining <= 0) return;

    const userOrders = this.listPaidTopupOrdersByTime(userId);
    for (const order of userOrders) {
      if (order.status !== "paid") continue;
      this.ensureTopupCreditState(order);
      const creditedPoints = Math.max(0, order.creditedPoints ?? order.pointsAmount);
      const available = Math.max(0, order.availablePoints ?? 0);
      const room = Math.max(0, creditedPoints - available);
      if (room <= 0) continue;
      const restored = Math.min(room, remaining);
      order.availablePoints = available + restored;
      order.updatedAt = new Date().toISOString();
      remaining -= restored;
      if (remaining <= 0) break;
    }
  },

  shouldRestoreTopupCreditsByReason(reason: string) {
    const normalized = reason.toLowerCase();
    return (
      normalized.includes("task failed refund") ||
      normalized.includes("task cancelled refund") ||
      normalized.includes("task repricing refund")
    );
  },

  addPoints(input: { userId: string; change: number; reason: string }, options?: { skipTopupTracking?: boolean }) {
    const user = getUser(input.userId);
    if (!user) return null;

    if (!options?.skipTopupTracking) {
      if (input.change < 0) {
        this.consumeTopupCredits(user.id, Math.abs(input.change));
      } else if (input.change > 0 && this.shouldRestoreTopupCreditsByReason(input.reason)) {
        this.restoreTopupCredits(user.id, input.change);
      }
    }

    user.points += input.change;
    pointRecords.unshift({
      id: uid("pt"),
      userId: user.id,
      change: input.change,
      reason: input.reason,
      createdAt: new Date().toISOString(),
    });
    return user;
  },

  checkin(userId: string, reward = 5) {
    const user = getUser(userId);
    if (!user) return { ok: false as const, reason: "USER_NOT_FOUND" };
    const today = new Date().toISOString().slice(0, 10);
    const last = user.lastCheckinAt?.slice(0, 10);
    if (last === today) return { ok: false as const, reason: "ALREADY_CHECKED_IN" };
    user.lastCheckinAt = new Date().toISOString();
    user.points += reward;
    pointRecords.unshift({
      id: uid("pt"),
      userId: user.id,
      change: reward,
      reason: "daily check-in",
      createdAt: new Date().toISOString(),
    });
    return { ok: true as const, points: user.points };
  },

  createTask(input: {
    userId: string;
    type: string;
    content: string;
    mode: string;
    provider: ModelProvider;
    modelId: string;
    modelHasApiKey?: boolean;
    pointsCost: number;
    pointMultiplier?: number;
    platform?: AcademicPlatform;
    executionManaged?: boolean;
  }) {
    const nowIso = new Date().toISOString();
    const task: StoreTask = {
      id: uid("tsk"),
      userId: input.userId,
      type: input.type,
      status: "queued",
      payload: {
        content: input.content,
        mode: input.mode,
        provider: input.provider,
        modelId: input.modelId,
        modelHasApiKey: input.modelHasApiKey,
        pointMultiplier: input.pointMultiplier,
        platform: input.platform,
        executionManaged: input.executionManaged,
      },
      pointsCost: input.pointsCost,
      pointsRefunded: false,
      createdAt: nowIso,
      updatedAt: nowIso,
    };
    tasks.unshift(task);
    return task;
  },

  getTask(taskId: string) {
    const task = tasks.find((item) => item.id === taskId);
    if (!task) return null;

    const docxJob = docxJobs.find((item) => item.taskId === taskId);
    const elapsed = Date.now() - new Date(task.createdAt).getTime();
    const executionManaged = Boolean(task.payload.executionManaged);
    if (!docxJob && !executionManaged && task.status !== "completed" && task.status !== "failed") {
      if (elapsed > 8000) {
        const shouldFail = task.payload.content.toLowerCase().includes("[force_fail]");
        if (shouldFail) {
          task.status = "failed";
          task.result = {
            output: `Task ${task.id} failed by simulated model timeout.`,
          };
        } else {
          task.status = "completed";
          task.result = buildTaskResult({
            taskId: task.id,
            taskType: task.type,
            content: task.payload.content,
            mode: task.payload.mode,
            provider: task.payload.provider,
            modelId: task.payload.modelId,
            modelHasApiKey: task.payload.modelHasApiKey,
            platform: task.payload.platform,
          });
        }
      } else if (elapsed > 3000) {
        task.status = "running";
      } else {
        task.status = "queued";
      }
      task.updatedAt = new Date().toISOString();
    }

    return task;
  },

  listTasks() {
    return tasks.map((item) => this.getTask(item.id) ?? item);
  },

  registerDocxJob(input: {
    taskId: string;
    userId: string;
    sourceFileUrl: string;
    sourceFileName?: string;
    sourceFileSizeBytes?: number;
    sourceExtension?: string; 
    sourceFileBase64?: string; 
    mode: DocxProcessingMode;
    queueStrategy: "bullmq" | "local";
    status: DocxProcessingStatus;
    progress: number;
    workerJobId?: string;
  }) {
    const nowIso = new Date().toISOString();
    const existing = docxJobs.find((item) => item.taskId === input.taskId);
    const nextProgress = Math.max(0, Math.min(100, Math.floor(input.progress)));

    if (existing) {
      existing.userId = input.userId;
      existing.sourceFileUrl = input.sourceFileUrl;
      existing.sourceFileName = input.sourceFileName;
      existing.sourceFileSizeBytes = input.sourceFileSizeBytes;
      existing.sourceExtension = input.sourceExtension; 
      existing.sourceFileBase64 = input.sourceFileBase64; 
      existing.mode = input.mode;
      existing.queueStrategy = input.queueStrategy;
      existing.status = input.status;
      existing.progress = nextProgress;
      existing.workerJobId = input.workerJobId;
      existing.errorMessage = undefined;
      existing.updatedAt = nowIso;
      if (input.status === "running" || input.status === "fallback-local") {
        existing.startedAt = existing.startedAt || nowIso;
      }
      if (input.status === "completed") {
        existing.startedAt = existing.startedAt || nowIso;
        existing.completedAt = nowIso;
      } else {
        existing.completedAt = undefined;
      }
      return existing;
    }

    const job: DocxProcessingJob = {
      taskId: input.taskId,
      userId: input.userId,
      sourceFileUrl: input.sourceFileUrl,
      sourceFileName: input.sourceFileName,
      sourceFileSizeBytes: input.sourceFileSizeBytes,
      sourceExtension: input.sourceExtension,
      sourceFileBase64: input.sourceFileBase64,
      mode: input.mode,
      queueStrategy: input.queueStrategy,
      status: input.status,
      progress: nextProgress,
      submittedAt: nowIso,
      updatedAt: nowIso,
      workerJobId: input.workerJobId,
    };

    if (input.status === "running" || input.status === "fallback-local" || input.status === "completed") {
      job.startedAt = nowIso;
    }
    if (input.status === "completed") {
      job.completedAt = nowIso;
    }

    docxJobs.unshift(job);
    return job;
  },

  getDocxJob(taskId: string) {
    return docxJobs.find((item) => item.taskId === taskId) ?? null;
  },

  updateDocxJob(input: {
    taskId: string;
    status?: DocxProcessingStatus;
    progress?: number;
    errorMessage?: string;
    outputCompleted?: boolean;
    workerJobId?: string;
  }) {
    const job = docxJobs.find((item) => item.taskId === input.taskId);
    if (!job) return null;

    const nowIso = new Date().toISOString();
    if (typeof input.status === "string") {
      job.status = input.status;
      if ((input.status === "running" || input.status === "fallback-local") && !job.startedAt) {
        job.startedAt = nowIso;
      }
      if (input.status === "completed" || input.outputCompleted) {
        job.completedAt = nowIso;
      }
    }
    if (typeof input.progress === "number") {
      job.progress = Math.max(0, Math.min(100, Math.floor(input.progress)));
    }
    if (typeof input.errorMessage === "string") {
      job.errorMessage = input.errorMessage;
    } else if (input.status && input.status !== "failed") {
      job.errorMessage = undefined;
    }
    if (typeof input.workerJobId === "string") {
      job.workerJobId = input.workerJobId;
    }
    job.updatedAt = nowIso;
    return job;
  },

  markTaskPointsRefunded(taskId: string) {
    const task = tasks.find((item) => item.id === taskId);
    if (!task) return null;
    task.pointsRefunded = true;
    task.updatedAt = new Date().toISOString();
    return task;
  },

  markTaskRunning(taskId: string) {
    const task = tasks.find((item) => item.id === taskId);
    if (!task) return null;
    if (task.status === "completed" || task.status === "failed") return task;
    task.status = "running";
    task.updatedAt = new Date().toISOString();
    return task;
  },

  completeTask(input: {
    taskId: string;
    output: string;
    outputUrl?: string;
    report?: unknown;
    execution?: unknown;
    traceId?: string;
    tokensUsed?: number;
    modelSource?: "remote" | "fallback_local";
    fallbackReason?: string;
  }) {
    const task = tasks.find((item) => item.id === input.taskId);
    if (!task) return null;
    task.status = "completed";
    task.result = {
      output: input.output,
      outputUrl: input.outputUrl, 
      report: input.report,
      execution: input.execution,
      traceId: input.traceId,
      tokensUsed: input.tokensUsed,
      modelSource: input.modelSource,
      fallbackReason: input.fallbackReason,
    };
    task.updatedAt = new Date().toISOString();
    return task;
  },

  markTaskFailed(input: { taskId: string; message: string }) {
    const task = tasks.find((item) => item.id === input.taskId);
    if (!task) return null;
    task.status = "failed";
    task.result = {
      output: input.message,
    };
    task.updatedAt = new Date().toISOString();
    return task;
  },

  listUserTasks(userId: string) {
    return this.listTasks().filter((item) => item.userId === userId);
  },

  cleanupExpiredDownloadTickets(referenceMs = Date.now()) {
    for (let index = downloadTickets.length - 1; index >= 0; index -= 1) {
      const ticket = downloadTickets[index];
      const expiresAtMs = new Date(ticket.expiresAt).getTime();
      if (!Number.isFinite(expiresAtMs) || expiresAtMs <= referenceMs) {
        downloadTickets.splice(index, 1);
        continue;
      }

      if (ticket.consumedAt) {
        const consumedAtMs = new Date(ticket.consumedAt).getTime();
        if (Number.isFinite(consumedAtMs) && referenceMs - consumedAtMs > 60 * 60 * 1000) {
          downloadTickets.splice(index, 1);
        }
      }
    }
  },

  createDownloadTicket(input: { userId: string; taskId: string; ttlSeconds: number }) {
    const ttlSeconds = Math.max(10, Math.floor(input.ttlSeconds));
    const nowMs = Date.now();
    this.cleanupExpiredDownloadTickets(nowMs);

    const ticket: DownloadTicket = {
      id: uid("dlt"),
      userId: input.userId,
      taskId: input.taskId,
      createdAt: new Date(nowMs).toISOString(),
      expiresAt: new Date(nowMs + ttlSeconds * 1000).toISOString(),
    };
    downloadTickets.unshift(ticket);
    return ticket;
  },

  getDownloadTicket(ticketId: string) {
    this.cleanupExpiredDownloadTickets();
    return downloadTickets.find((item) => item.id === ticketId) ?? null;
  },

  consumeDownloadTicket(ticketId: string) {
    this.cleanupExpiredDownloadTickets();
    const ticket = downloadTickets.find((item) => item.id === ticketId);
    if (!ticket) {
      return { ok: false as const, reason: "NOT_FOUND" as const };
    }

    if (ticket.consumedAt) {
      return { ok: false as const, reason: "ALREADY_USED" as const };
    }

    const expiresAtMs = new Date(ticket.expiresAt).getTime();
    if (!Number.isFinite(expiresAtMs) || expiresAtMs <= Date.now()) {
      return { ok: false as const, reason: "EXPIRED" as const };
    }

    ticket.consumedAt = new Date().toISOString();
    return { ok: true as const, ticket };
  },

  updateModel(input: {
    id: string;
    enabled?: boolean;
    pointMultiplier?: number;
    hasApiKey?: boolean;
  }) {
    const model = models.find((item) => item.id === input.id);
    if (!model) return null;
    if (typeof input.enabled === "boolean") model.enabled = input.enabled;
    if (typeof input.pointMultiplier === "number") model.pointMultiplier = input.pointMultiplier;
    if (typeof input.hasApiKey === "boolean") {
      model.hasApiKey = input.hasApiKey;
      if (!input.hasApiKey) {
        model.apiKey = undefined;
      }
      model.keyUpdatedAt = new Date().toISOString();
    }
    return model;
  },

  setModelApiKey(input: { id: string; apiKey?: string; clear?: boolean }) {
    const model = models.find((item) => item.id === input.id);
    if (!model) return null;

    if (input.clear || !input.apiKey) {
      model.apiKey = undefined;
      model.hasApiKey = false;
      model.keyUpdatedAt = new Date().toISOString();
      return model;
    }

    model.apiKey = input.apiKey;
    model.hasApiKey = true;
    model.keyUpdatedAt = new Date().toISOString();
    return model;
  },

  listWorkbenchNav() {
    return getSortedWorkbenchNav();
  },

  listVisibleWorkbenchNav() {
    return getSortedWorkbenchNav().filter((item) => item.visible);
  },

  updateWorkbenchNav(input: { key: WorkbenchNavKey; visible: boolean }) {
    const item = workbenchNav.find((nav) => nav.key === input.key);
    if (!item) return null;
    item.visible = input.visible;
    return item;
  },

  createTopupOrder(input: {
    userId: string;
    pointsAmount: number;
    amount: number;
    channel: Exclude<PaymentChannel, "mock">;
  }) {
    const nowIso = new Date().toISOString();
    const order: Order = {
      id: uid("ord"),
      userId: input.userId,
      orderType: "topup",
      planName: "Professional",
      pointsAmount: input.pointsAmount,
      creditedPoints: 0,
      availablePoints: 0,
      refundedPoints: 0,
      refundedAmount: 0,
      partialRefund: false,
      amount: input.amount,
      currency: "CNY",
      channel: input.channel,
      outTradeNo: createOutTradeNo(),
      status: "pending",
      callbackCount: 0,
      createdAt: nowIso,
      updatedAt: nowIso,
    };
    orders.unshift(order);
    return order;
  },

  getOrderById(orderId: string) {
    return orders.find((order) => order.id === orderId) ?? null;
  },

  getOrderByOutTradeNo(outTradeNo: string) {
    return orders.find((order) => order.outTradeNo === outTradeNo) ?? null;
  },

  listOrdersByUser(userId: string) {
    const userOrders = orders.filter((order) => order.userId === userId);
    for (const order of userOrders) {
      this.ensureTopupCreditState(order);
    }
    return userOrders;
  },

  listOrders() {
    for (const order of orders) {
      this.ensureTopupCreditState(order);
    }
    return orders;
  },

  bumpOrderCallbackCount(orderId: string) {
    const order = orders.find((item) => item.id === orderId);
    if (!order) return null;
    order.callbackCount += 1;
    order.updatedAt = new Date().toISOString();
    return order;
  },

  markOrderPaid(input: {
    orderId: string;
    amount: number;
    channel: PaymentChannel;
    transactionId: string;
  }) {
    const order = orders.find((item) => item.id === input.orderId);
    if (!order) return { ok: false as const, reason: "ORDER_NOT_FOUND" as const };
    if (order.status === "paid") return { ok: true as const, alreadyPaid: true as const, order };
    if (order.status === "refunded") return { ok: false as const, reason: "ORDER_REFUNDED" as const };
    if (Math.abs(order.amount - input.amount) > 0.000001) {
      return { ok: false as const, reason: "AMOUNT_MISMATCH" as const };
    }

    order.status = "paid";
    order.channel = input.channel;
    order.transactionId = input.transactionId;
    order.failureReason = undefined;
    if (order.orderType === "topup") {
      order.creditedPoints = Math.max(0, Math.floor(order.pointsAmount));
      order.availablePoints = Math.max(0, Math.floor(order.pointsAmount));
      order.refundedPoints = 0;
      order.refundedAmount = 0;
      order.partialRefund = false;
      order.refundedAt = undefined;
      order.refundReason = undefined;
    }
    order.paidAt = new Date().toISOString();
    order.updatedAt = new Date().toISOString();
    return { ok: true as const, alreadyPaid: false as const, order };
  },

  markOrderFailed(input: {
    orderId: string;
    reason: string;
    channel: PaymentChannel;
    transactionId?: string;
  }) {
    const order = orders.find((item) => item.id === input.orderId);
    if (!order) return { ok: false as const, reason: "ORDER_NOT_FOUND" as const };
    if (order.status === "paid") return { ok: false as const, reason: "ORDER_ALREADY_PAID" as const };
    if (order.status === "refunded") return { ok: false as const, reason: "ORDER_REFUNDED" as const };

    order.status = "failed";
    order.channel = input.channel;
    order.transactionId = input.transactionId;
    order.failureReason = input.reason;
    order.updatedAt = new Date().toISOString();
    return { ok: true as const, order };
  },

  refundTopupOrder(input: { orderId: string; reason: string }) {
    const order = orders.find((item) => item.id === input.orderId);
    if (!order) return { ok: false as const, reason: "ORDER_NOT_FOUND" as const };
    if (order.orderType !== "topup") return { ok: false as const, reason: "ORDER_TYPE_NOT_REFUNDABLE" as const };

    this.ensureTopupCreditState(order);

    if (order.status === "refunded") {
      return {
        ok: true as const,
        idempotent: true as const,
        order,
        refundedPoints: Math.max(0, Math.floor(order.refundedPoints ?? 0)),
        refundedAmount: Math.max(0, order.refundedAmount ?? 0),
        partialRefund: Boolean(order.partialRefund),
      };
    }
    if (order.status !== "paid") return { ok: false as const, reason: "ORDER_NOT_PAID" as const, order };

    const user = getUser(order.userId);
    if (!user) return { ok: false as const, reason: "USER_NOT_FOUND" as const };

    const availablePoints = Math.max(0, Math.floor(order.availablePoints ?? 0));
    const refundablePoints = Math.min(availablePoints, Math.max(0, Math.floor(user.points)));
    if (refundablePoints <= 0) {
      return {
        ok: false as const,
        reason: "NO_REFUNDABLE_POINTS" as const,
        order,
        availablePoints,
        userPoints: user.points,
      };
    }

    const refundedAmountRaw = order.pointsAmount > 0 ? (order.amount * refundablePoints) / order.pointsAmount : 0;
    const refundedAmount = Math.round(refundedAmountRaw * 100) / 100;

    this.addPoints(
      {
        userId: user.id,
        change: -refundablePoints,
        reason: `order refund reclaim (${order.outTradeNo})`,
      },
      { skipTopupTracking: true },
    );

    const nowIso = new Date().toISOString();
    const refundedPointsTotal = Math.max(0, Math.floor(order.refundedPoints ?? 0)) + refundablePoints;
    const refundedAmountTotal = Math.min(order.amount, Math.round(((order.refundedAmount ?? 0) + refundedAmount) * 100) / 100);
    const creditedPoints = Math.max(0, Math.floor(order.creditedPoints ?? order.pointsAmount));
    const nextAvailablePoints = Math.max(0, availablePoints - refundablePoints);

    order.status = "refunded";
    order.refundedPoints = refundedPointsTotal;
    order.refundedAmount = refundedAmountTotal;
    order.availablePoints = nextAvailablePoints;
    order.partialRefund = refundedPointsTotal < creditedPoints;
    order.refundReason = input.reason;
    order.refundedAt = nowIso;
    order.failureReason = order.partialRefund
      ? `partial refund: ${refundedPointsTotal}/${creditedPoints} points`
      : undefined;
    order.updatedAt = nowIso;

    return {
      ok: true as const,
      idempotent: false as const,
      order,
      refundedPoints: refundablePoints,
      refundedAmount,
      partialRefund: Boolean(order.partialRefund),
      userPoints: user.points,
    };
  },

  appendPaymentCallbackLog(input: Omit<PaymentCallbackLog, "id" | "createdAt">) {
    const log: PaymentCallbackLog = {
      id: uid("pcb"),
      createdAt: new Date().toISOString(),
      ...input,
    };
    paymentCallbackLogs.unshift(log);
    return log;
  },

  appendEmailDeliveryLog(input: Omit<EmailDeliveryLog, "id" | "createdAt">) {
    const log: EmailDeliveryLog = {
      id: uid("eml"),
      createdAt: new Date().toISOString(),
      ...input,
    };
    emailDeliveryLogs.unshift(log);
    if (emailDeliveryLogs.length > 1000) {
      emailDeliveryLogs.splice(1000);
    }
    return log;
  },

  createSession(input: { token: string; userId: string; expiresAt: string }) {
    removeExpiredSessions();
    const session: AuthSession = {
      token: input.token,
      userId: input.userId,
      expiresAt: input.expiresAt,
      createdAt: new Date().toISOString(),
    };
    sessions.set(session.token, session);
    return session;
  },

  getSession(token: string) {
    removeExpiredSessions();
    return sessions.get(token) ?? null;
  },

  revokeSession(token: string) {
    sessions.delete(token);
  },

  revokeUserSessions(userId: string) {
    for (const [token, session] of sessions.entries()) {
      if (session.userId === userId) {
        sessions.delete(token);
      }
    }
  },
};

export type StoreSnapshot = {
  users: StoreUser[];
  pointRecords: PointRecord[];
  tasks: StoreTask[];
  docxJobs: DocxProcessingJob[];
  models: ModelRegistryItem[];
  plans: Plan[];
  tutorialArticles: TutorialArticle[];
  orders: Order[];
  paymentCallbackLogs: PaymentCallbackLog[];
  downloadTickets: DownloadTicket[];
  emailVerificationTokens: EmailVerificationToken[];
  passwordResetTokens: PasswordResetToken[];
  emailDeliveryLogs: EmailDeliveryLog[];
  workbenchNav: WorkbenchNavItem[];
  systemSettings: SystemSettingsSnapshot;
};

function cloneSnapshotArray<T>(items: T[]): T[] {
  return JSON.parse(JSON.stringify(items)) as T[];
}

function replaceArrayContents<T>(target: T[], source: T[]) {
  target.splice(0, target.length, ...source);
}

export function exportStoreSnapshot(): StoreSnapshot {
  return {
    users: cloneSnapshotArray(users),
    pointRecords: cloneSnapshotArray(pointRecords),
    tasks: cloneSnapshotArray(tasks),
    docxJobs: cloneSnapshotArray(docxJobs),
    models: cloneSnapshotArray(models),
    plans: cloneSnapshotArray(plans),
    tutorialArticles: cloneSnapshotArray(tutorialArticles),
    orders: cloneSnapshotArray(orders),
    paymentCallbackLogs: cloneSnapshotArray(paymentCallbackLogs),
    downloadTickets: cloneSnapshotArray(downloadTickets),
    emailVerificationTokens: cloneSnapshotArray(emailVerificationTokens),
    passwordResetTokens: cloneSnapshotArray(passwordResetTokens),
    emailDeliveryLogs: cloneSnapshotArray(emailDeliveryLogs),
    workbenchNav: cloneSnapshotArray(workbenchNav),
    systemSettings: exportSystemSettingsSnapshot(),
  };
}

export function hydrateStoreSnapshot(snapshot: Partial<StoreSnapshot> | null | undefined) {
  if (!snapshot) {
    return { hydrated: false as const, changedCollections: [] as string[] };
  }

  const changedCollections: string[] = [];

  const hydrateArray = <T>(key: keyof StoreSnapshot, target: T[]) => {
    const value = snapshot[key];
    if (!Array.isArray(value)) return;
    replaceArrayContents(target, cloneSnapshotArray(value as T[]));
    changedCollections.push(String(key));
  };

  hydrateArray("users", users);
  hydrateArray("pointRecords", pointRecords);
  hydrateArray("tasks", tasks);
  hydrateArray("docxJobs", docxJobs);
  hydrateArray("models", models);
  hydrateArray("plans", plans);
  hydrateArray("tutorialArticles", tutorialArticles);
  hydrateArray("orders", orders);
  hydrateArray("paymentCallbackLogs", paymentCallbackLogs);
  hydrateArray("downloadTickets", downloadTickets);
  hydrateArray("emailVerificationTokens", emailVerificationTokens);
  hydrateArray("passwordResetTokens", passwordResetTokens);
  hydrateArray("emailDeliveryLogs", emailDeliveryLogs);
  hydrateArray("workbenchNav", workbenchNav);

  const settingsHydrated = hydrateSystemSettingsSnapshot(snapshot.systemSettings);
  if (settingsHydrated.hydrated) {
    changedCollections.push("systemSettings");
  }

  return {
    hydrated: changedCollections.length > 0,
    changedCollections,
  };
}
