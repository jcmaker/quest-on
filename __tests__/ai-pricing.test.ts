import { describe, expect, it } from "vitest";
import {
  calculateEstimatedCostUsdMicros,
  resolveModelPricing,
} from "@/lib/ai-pricing";

describe("ai-pricing", () => {
  it("resolves configured pricing for known models", () => {
    expect(resolveModelPricing("gpt-5.4")).toMatchObject({
      inputUsdPer1M: 1.25,
      outputUsdPer1M: 10,
    });
  });

  it("returns zero cost for unknown models", () => {
    expect(
      calculateEstimatedCostUsdMicros("unknown-model", {
        inputTokens: 1000,
        outputTokens: 500,
        cachedInputTokens: 0,
        reasoningTokens: 0,
        totalTokens: 1500,
      })
    ).toBe(0);
  });

  it("calculates input, cached input, and output costs", () => {
    const cost = calculateEstimatedCostUsdMicros("gpt-5.4", {
      inputTokens: 1_000_000,
      outputTokens: 500_000,
      cachedInputTokens: 200_000,
      reasoningTokens: 0,
      totalTokens: 1_500_000,
    });

    expect(cost).toBe(6_025_000);
  });
});
