/**
 * Simple in-memory rate limiter.
 *
 * NOTE: This works for single-server deployments. For Vercel serverless
 * or multi-instance deployments, replace with @upstash/ratelimit + Redis.
 */

type RateLimitEntry = {
  count: number;
  resetAt: number;
};

const store = new Map<string, RateLimitEntry>();

// Cleanup stale entries every 60 seconds
let cleanupInterval: ReturnType<typeof setInterval> | null = null;

function ensureCleanup() {
  if (cleanupInterval) return;
  cleanupInterval = setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of store) {
      if (now > entry.resetAt) {
        store.delete(key);
      }
    }
  }, 60_000);
  // Don't prevent Node from exiting
  if (typeof cleanupInterval === "object" && "unref" in cleanupInterval) {
    cleanupInterval.unref();
  }
}

export type RateLimitConfig = {
  /** Maximum number of requests in the window */
  limit: number;
  /** Time window in seconds */
  windowSec: number;
};

export type RateLimitResult = {
  allowed: boolean;
  remaining: number;
  resetAt: number;
};

/**
 * Check rate limit for a given key.
 * Returns whether the request is allowed and remaining quota.
 */
export function checkRateLimit(
  key: string,
  config: RateLimitConfig
): RateLimitResult {
  ensureCleanup();

  const now = Date.now();
  const entry = store.get(key);

  if (!entry || now > entry.resetAt) {
    // New window
    const resetAt = now + config.windowSec * 1000;
    store.set(key, { count: 1, resetAt });
    return { allowed: true, remaining: config.limit - 1, resetAt };
  }

  if (entry.count >= config.limit) {
    return { allowed: false, remaining: 0, resetAt: entry.resetAt };
  }

  entry.count++;
  return {
    allowed: true,
    remaining: config.limit - entry.count,
    resetAt: entry.resetAt,
  };
}

// Predefined rate limit configs
export const RATE_LIMITS = {
  /** Chat API: 30 requests per minute per user */
  chat: { limit: 30, windowSec: 60 } satisfies RateLimitConfig,
  /** Admin login: 5 attempts per minute per IP */
  adminLogin: { limit: 5, windowSec: 60 } satisfies RateLimitConfig,
  /** General API: 60 requests per minute per user */
  general: { limit: 60, windowSec: 60 } satisfies RateLimitConfig,
  /** Upload: 10 requests per minute per user */
  upload: { limit: 10, windowSec: 60 } satisfies RateLimitConfig,
  /** AI endpoints (expensive): 20 requests per minute per user */
  ai: { limit: 20, windowSec: 60 } satisfies RateLimitConfig,
} as const;
