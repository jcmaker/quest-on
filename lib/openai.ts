import OpenAI from "openai";

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
});

// Preferred: lazy + explicit failure with a clear error message.
let _openai: OpenAI | null = null;
export function getOpenAI(): OpenAI {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("Missing OPENAI_API_KEY environment variable");
  }
  if (!_openai) {
    _openai = new OpenAI({ apiKey });
  }
  return _openai;
}

// AI 모델 상수 - 여기서 변경하면 전체 코드에 적용됨
export const AI_MODEL = "gpt-5-chat-latest";
