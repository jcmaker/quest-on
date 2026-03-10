import { describe, expect, it } from "vitest";
import {
  buildAiTextMetadata,
  extractUsageFromOpenAIResult,
} from "@/lib/ai-tracking";

describe("ai-tracking helpers", () => {
  it("extracts chat completion usage", () => {
    const usage = extractUsageFromOpenAIResult("chat.completions", {
      usage: {
        prompt_tokens: 120,
        completion_tokens: 45,
        total_tokens: 165,
        prompt_tokens_details: { cached_tokens: 20 },
        completion_tokens_details: { reasoning_tokens: 5 },
      },
    });

    expect(usage).toEqual({
      inputTokens: 120,
      outputTokens: 45,
      cachedInputTokens: 20,
      reasoningTokens: 5,
      totalTokens: 165,
    });
  });

  it("extracts responses usage", () => {
    const usage = extractUsageFromOpenAIResult("responses", {
      usage: {
        input_tokens: 90,
        output_tokens: 30,
        total_tokens: 120,
        input_tokens_details: { cached_tokens: 10 },
        output_tokens_details: { reasoning_tokens: 4 },
      },
    });

    expect(usage).toEqual({
      inputTokens: 90,
      outputTokens: 30,
      cachedInputTokens: 10,
      reasoningTokens: 4,
      totalTokens: 120,
    });
  });

  it("extracts embedding usage", () => {
    const usage = extractUsageFromOpenAIResult("embeddings", {
      usage: {
        prompt_tokens: 33,
        total_tokens: 33,
      },
    });

    expect(usage).toEqual({
      inputTokens: 33,
      outputTokens: 0,
      cachedInputTokens: 0,
      reasoningTokens: 0,
      totalTokens: 33,
    });
  });

  it("builds prompt metadata without storing raw text", () => {
    const metadata = buildAiTextMetadata({
      inputText: ["system prompt", "user prompt"],
      outputText: "response text",
      extra: { source: "unit-test" },
    });

    expect(metadata).toMatchObject({
      source: "unit-test",
      input_chars: 26,
      output_chars: 13,
    });
    expect(metadata.prompt_hash).toHaveLength(64);
    expect(Object.values(metadata)).not.toContain("system prompt");
  });
});
