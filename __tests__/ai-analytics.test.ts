import { describe, expect, it } from "vitest";
import {
  buildAiUsageBreakdown,
  parseAiUsageFilters,
  summarizeAiEvents,
  type AiEventRecord,
} from "@/lib/ai-analytics";

const rows: AiEventRecord[] = [
  {
    id: "1",
    provider: "openai",
    endpoint: "responses",
    feature: "student_chat",
    route: "/api/chat",
    model: "gpt-5.4",
    userId: "user-1",
    examId: "exam-1",
    examTitle: "자료구조",
    sessionId: "session-1",
    qIdx: 0,
    status: "success",
    attemptCount: 1,
    latencyMs: 1000,
    inputTokens: 100,
    outputTokens: 20,
    cachedInputTokens: 10,
    reasoningTokens: 0,
    totalTokens: 120,
    estimatedCostUsdMicros: 1_000_000,
    pricingVersion: "v1",
    requestId: "req_1",
    responseId: "resp_1",
    errorCode: null,
    metadata: {},
    createdAt: "2026-03-06T12:00:00.000Z",
  },
  {
    id: "2",
    provider: "openai",
    endpoint: "chat.completions",
    feature: "generate_rubric",
    route: "/api/ai/generate-rubric",
    model: "gpt-5.4",
    userId: "user-2",
    examId: "exam-1",
    examTitle: "자료구조",
    sessionId: null,
    qIdx: null,
    status: "error",
    attemptCount: 2,
    latencyMs: 2000,
    inputTokens: null,
    outputTokens: null,
    cachedInputTokens: null,
    reasoningTokens: null,
    totalTokens: null,
    estimatedCostUsdMicros: 0,
    pricingVersion: "v1",
    requestId: null,
    responseId: null,
    errorCode: "timeout",
    metadata: {},
    createdAt: "2026-03-07T12:00:00.000Z",
  },
];

describe("ai-analytics", () => {
  it("parses query filters", () => {
    const filters = parseAiUsageFilters(
      new URLSearchParams({
        range: "30d",
        feature: "student_chat",
        model: "gpt-5.4",
        examId: "exam-1",
        status: "success",
      })
    );

    expect(filters).toEqual({
      range: "30d",
      feature: "student_chat",
      model: "gpt-5.4",
      examId: "exam-1",
      sessionId: undefined,
      status: "success",
    });
  });

  it("summarizes totals and daily series", () => {
    const summary = summarizeAiEvents(rows, "7d");

    expect(summary.totals.requests).toBe(2);
    expect(summary.totals.successRequests).toBe(1);
    expect(summary.totals.failedRequests).toBe(1);
    expect(summary.totals.totalTokens).toBe(120);
    expect(summary.totals.estimatedCostUsdMicros).toBe(1_000_000);
    expect(summary.daily).toHaveLength(7);
  });

  it("builds feature, model, exam, and session breakdowns", () => {
    const breakdown = buildAiUsageBreakdown(rows);

    expect(breakdown.byFeature[0]).toMatchObject({
      key: "student_chat",
      requests: 1,
    });
    expect(breakdown.byModel[0]).toMatchObject({
      key: "gpt-5.4",
      requests: 2,
    });
    expect(breakdown.byExam[0]).toMatchObject({
      key: "exam-1",
      label: "자료구조",
    });
    expect(breakdown.bySession?.[0]).toMatchObject({
      key: "session-1",
    });
  });
});
