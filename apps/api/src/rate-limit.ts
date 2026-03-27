type RateLimitInput = {
  bucket: string;
  identifier: string;
  max: number;
  windowMs: number;
};

type RateLimitResult = {
  allowed: boolean;
  limit: number;
  remaining: number;
  retryAfterSeconds: number;
};

type BucketState = {
  count: number;
  resetAtMs: number;
};

const rateLimitStore = new Map<string, BucketState>();

function makeKey(input: Pick<RateLimitInput, "bucket" | "identifier">) {
  return `${input.bucket}:${input.identifier}`;
}

function cleanupExpiredStates(nowMs: number) {
  if (rateLimitStore.size < 2000) return;
  for (const [key, state] of rateLimitStore.entries()) {
    if (state.resetAtMs <= nowMs) {
      rateLimitStore.delete(key);
    }
  }
}

export function checkRateLimit(input: RateLimitInput): RateLimitResult {
  const nowMs = Date.now();
  cleanupExpiredStates(nowMs);

  const key = makeKey(input);
  const existing = rateLimitStore.get(key);

  if (!existing || existing.resetAtMs <= nowMs) {
    const resetAtMs = nowMs + input.windowMs;
    rateLimitStore.set(key, {
      count: 1,
      resetAtMs,
    });
    return {
      allowed: true,
      limit: input.max,
      remaining: Math.max(0, input.max - 1),
      retryAfterSeconds: Math.ceil(input.windowMs / 1000),
    };
  }

  if (existing.count >= input.max) {
    return {
      allowed: false,
      limit: input.max,
      remaining: 0,
      retryAfterSeconds: Math.max(1, Math.ceil((existing.resetAtMs - nowMs) / 1000)),
    };
  }

  existing.count += 1;
  return {
    allowed: true,
    limit: input.max,
    remaining: Math.max(0, input.max - existing.count),
    retryAfterSeconds: Math.max(1, Math.ceil((existing.resetAtMs - nowMs) / 1000)),
  };
}
