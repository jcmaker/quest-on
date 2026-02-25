import OpenAI from "openai";
import pLimit from "p-limit";
import { logError } from "@/lib/logger";

/**
 * IMPORTANT:
 * Do NOT throw at module import time.
 * If a required env var is missing in production, throwing here can prevent
 * Next.js route handlers from being registered and lead to confusing 404/405/500
 * behavior (often returning HTML error pages).
 */

// Backward compatible client (may have a placeholder key if env is missing).
// Routes should still handle OpenAI errors at call time.
export const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY ?? "MISSING_OPENAI_API_KEY",
  ...(process.env.OPENAI_BASE_URL && { baseURL: process.env.OPENAI_BASE_URL }),
});

// Preferred: lazy + explicit failure with a clear error message.
let _openai: OpenAI | null = null;
export function getOpenAI(): OpenAI {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("Missing OPENAI_API_KEY environment variable");
  }
  if (!_openai) {
    _openai = new OpenAI({
      apiKey,
      ...(process.env.OPENAI_BASE_URL && { baseURL: process.env.OPENAI_BASE_URL }),
    });
  }
  return _openai;
}

// AI 모델 상수 - 여기서 변경하면 전체 코드에 적용됨
export const AI_MODEL = "gpt5.2-chat-latest";

// ============================================================
// Global concurrency limiter for OpenAI API calls
// Max 30 concurrent requests for 100-user scale
// ============================================================
const openaiLimiter = pLimit(30);

const OPENAI_TIMEOUT_MS = 25_000;

class OpenAITimeoutError extends Error {
  constructor() {
    super(`OpenAI call timed out after ${OPENAI_TIMEOUT_MS}ms`);
    this.name = "OpenAITimeoutError";
  }
}

/**
 * Wraps an OpenAI API call with:
 * 1. Global concurrency limit (max 15 simultaneous calls)
 * 2. Exponential backoff retry on 429 errors (max 3 attempts)
 * 3. 25-second timeout to prevent connection pool exhaustion
 */
export async function callOpenAI<T>(fn: () => Promise<T>): Promise<T> {
  return openaiLimiter(async () => {
    const maxRetries = 3;
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        const result = await Promise.race([
          fn(),
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new OpenAITimeoutError()), OPENAI_TIMEOUT_MS)
          ),
        ]);
        return result;
      } catch (error) {
        const isRateLimit =
          error instanceof OpenAI.APIError && error.status === 429;
        const isLastAttempt = attempt === maxRetries - 1;

        if (!isRateLimit || isLastAttempt) {
          throw error;
        }

        // Exponential backoff: 1s, 2s, 4s
        const delay = Math.pow(2, attempt) * 1000;
        logError(
          `[callOpenAI] 429 rate limit, retrying in ${delay}ms (attempt ${attempt + 1}/${maxRetries})`,
          error
        );
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
    // TypeScript: unreachable, but satisfies return type
    throw new Error("callOpenAI: unexpected retry loop exit");
  });
}

export { OpenAITimeoutError };

// ============================================================
// Grading queue: max 10 concurrent autoGradeSession executions
// ============================================================
const gradingLimiter = pLimit(10);

/**
 * Wraps a grading job so at most 3 run concurrently.
 * Combines with callOpenAI for double-throttling.
 */
export function enqueueGrading<T>(fn: () => Promise<T>): Promise<T> {
  return gradingLimiter(fn);
}
