type MonitoringContext = {
  tags?: Record<string, string>;
  extras?: Record<string, unknown>;
};

type SentryScope = {
  setTag: (key: string, value: string) => void;
  setExtra: (key: string, value: unknown) => void;
};

type SentryLike = {
  init: (options: Record<string, unknown>) => void;
  withScope: (callback: (scope: SentryScope) => void) => void;
  captureException: (error: Error) => void;
  flush: (timeoutMs?: number) => Promise<boolean>;
};

const sentryDsn = process.env.SENTRY_DSN;
const environment = process.env.APP_ENV || process.env.NODE_ENV || "development";
const tracesSampleRate = Number(process.env.SENTRY_TRACES_SAMPLE_RATE || "0.05");

let monitoringInitialized = false;
let monitoringEnabled = false;
let sentry: SentryLike | null = null;

function loadSentryModule() {
  if (sentry) return sentry;
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const loaded = require("@sentry/node") as SentryLike;
    sentry = loaded;
    return sentry;
  } catch {
    return null;
  }
}

export function initApiMonitoring(serviceName: string) {
  if (monitoringInitialized) return monitoringEnabled;
  monitoringInitialized = true;

  if (!sentryDsn) return false;

  const loadedSentry = loadSentryModule();
  if (!loadedSentry) return false;

  loadedSentry.init({
    dsn: sentryDsn,
    environment,
    tracesSampleRate: Number.isFinite(tracesSampleRate) ? tracesSampleRate : 0.05,
    release: process.env.RELEASE_VERSION,
    serverName: serviceName,
  });

  monitoringEnabled = true;
  return true;
}

export function captureApiException(error: unknown, context?: MonitoringContext) {
  if (!monitoringEnabled || !sentry) return;

  sentry.withScope((scope) => {
    if (context?.tags) {
      for (const [key, value] of Object.entries(context.tags)) {
        scope.setTag(key, value);
      }
    }
    if (context?.extras) {
      for (const [key, value] of Object.entries(context.extras)) {
        scope.setExtra(key, value);
      }
    }
    sentry?.captureException(error instanceof Error ? error : new Error(String(error)));
  });
}

export async function flushApiMonitoring(timeoutMs = 1500) {
  if (!monitoringEnabled || !sentry) return true;
  return sentry.flush(timeoutMs);
}
