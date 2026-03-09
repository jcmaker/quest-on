/**
 * AI 응답 캐싱 레이어
 *
 * 루브릭 생성, 문제 조정 등 동일한 입력에 대해 반복 호출되는 AI 작업을 캐싱.
 * Upstash Redis 사용 가능 시 Redis, 그렇지 않으면 인메모리 Map 폴백.
 *
 * 대상: generate-rubric, adjust-question
 * 제외: 채팅(세션별 고유), 채점(정확성 중요)
 */

import { createHash } from "crypto";
import { logError } from "@/lib/logger";

const DEFAULT_TTL_MS = 30 * 60 * 1000; // 30분
const MAX_MEMORY_ENTRIES = 500;

// In-memory fallback cache
const memoryCache = new Map<string, { value: string; expiresAt: number }>();

// Lazy-loaded Redis client
let redisClient: { get: (key: string) => Promise<string | null>; set: (key: string, value: string, opts: { ex: number }) => Promise<unknown> } | null = null;
let redisAttempted = false;

async function getRedis() {
  if (redisAttempted) return redisClient;
  redisAttempted = true;

  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;

  if (!url || !token) return null;

  try {
    const { Redis } = await import("@upstash/redis");
    redisClient = new Redis({ url, token });
    return redisClient;
  } catch {
    return null;
  }
}

function generateCacheKey(prefix: string, input: unknown): string {
  const hash = createHash("sha256")
    .update(JSON.stringify(input))
    .digest("hex")
    .slice(0, 16);
  return `ai-cache:${prefix}:${hash}`;
}

function cleanMemoryCache() {
  if (memoryCache.size <= MAX_MEMORY_ENTRIES) return;
  const now = Date.now();
  // Remove expired entries first
  for (const [key, entry] of memoryCache) {
    if (now > entry.expiresAt) memoryCache.delete(key);
  }
  // If still too large, remove oldest
  if (memoryCache.size > MAX_MEMORY_ENTRIES) {
    const entries = Array.from(memoryCache.entries());
    entries.sort((a, b) => a[1].expiresAt - b[1].expiresAt);
    const toRemove = entries.slice(0, entries.length - MAX_MEMORY_ENTRIES);
    for (const [key] of toRemove) memoryCache.delete(key);
  }
}

export async function getCachedAiResponse(
  prefix: string,
  input: unknown
): Promise<string | null> {
  const key = generateCacheKey(prefix, input);

  try {
    const redis = await getRedis();
    if (redis) {
      const cached = await redis.get(key);
      if (cached) return cached;
    }
  } catch (err) {
    logError("[ai-cache] Redis get failed, falling back to memory", err);
  }

  // Memory fallback
  const memEntry = memoryCache.get(key);
  if (memEntry && Date.now() < memEntry.expiresAt) {
    return memEntry.value;
  }
  if (memEntry) memoryCache.delete(key);
  return null;
}

export async function setCachedAiResponse(
  prefix: string,
  input: unknown,
  response: string,
  ttlMs = DEFAULT_TTL_MS
): Promise<void> {
  const key = generateCacheKey(prefix, input);
  const ttlSec = Math.ceil(ttlMs / 1000);

  try {
    const redis = await getRedis();
    if (redis) {
      await redis.set(key, response, { ex: ttlSec });
      return;
    }
  } catch (err) {
    logError("[ai-cache] Redis set failed, falling back to memory", err);
  }

  // Memory fallback
  cleanMemoryCache();
  memoryCache.set(key, { value: response, expiresAt: Date.now() + ttlMs });
}

/**
 * AI 호출을 캐시 레이어로 감싸는 헬퍼
 * 캐시 히트 시 AI 호출을 생략하고 캐시된 응답 반환
 */
export async function withAiCache<T>(
  prefix: string,
  input: unknown,
  fn: () => Promise<T>,
  options?: { ttlMs?: number; serialize?: (v: T) => string; deserialize?: (s: string) => T }
): Promise<T> {
  const serialize = options?.serialize ?? JSON.stringify;
  const deserialize = options?.deserialize ?? JSON.parse;

  const cached = await getCachedAiResponse(prefix, input);
  if (cached !== null) {
    try {
      return deserialize(cached);
    } catch {
      // Corrupted cache — proceed with fresh call
    }
  }

  const result = await fn();

  // Fire-and-forget cache write
  setCachedAiResponse(prefix, input, serialize(result), options?.ttlMs).catch(() => {});

  return result;
}
