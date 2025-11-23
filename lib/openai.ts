import OpenAI from "openai";

const apiKey = process.env.OPENAI_API_KEY;

if (!apiKey) {
  throw new Error("Missing OPENAI_API_KEY environment variable");
}

export const openai = new OpenAI({
  apiKey: apiKey,
});

// AI 모델 상수 - 여기서 변경하면 전체 코드에 적용됨
export const AI_MODEL = "gpt-5-mini";
