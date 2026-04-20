import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * These tests verify the idempotency contract of each grading phase:
 *   - If the work is already done, the phase returns `skipped: true`
 *     without calling OpenAI. This is the guarantee that prevents
 *     QStash retries from becoming cost bombs.
 *
 * We mock the DB to pre-seed "already done" rows and assert that the
 * inner AI helpers (gradeSingleQuestion / generateQuestionSummary /
 * generateSummary) are never invoked.
 */

const {
  supabaseMock,
  logErrorMock,
  gradeSingleQuestionSpy,
  generateQuestionSummarySpy,
  generateSummarySpy,
  callOpenAIWithTelemetryMock,
} = vi.hoisted(() => ({
  supabaseMock: {
    from: vi.fn(),
  },
  logErrorMock: vi.fn(),
  gradeSingleQuestionSpy: vi.fn(),
  generateQuestionSummarySpy: vi.fn(),
  generateSummarySpy: vi.fn(),
  callOpenAIWithTelemetryMock: vi.fn(),
}));

vi.mock("@/lib/supabase-server", () => ({
  getSupabaseServer: () => supabaseMock,
}));

vi.mock("@/lib/logger", () => ({
  logError: logErrorMock,
}));

// Mock OpenAI so any accidental call is detectable (we assert 0 calls).
vi.mock("@/lib/openai", async (original) => {
  const actual = (await original()) as Record<string, unknown>;
  return {
    ...actual,
    callOpenAIWithTelemetry: callOpenAIWithTelemetryMock,
    callOpenAI: callOpenAIWithTelemetryMock,
    getOpenAI: () => ({
      chat: { completions: { create: callOpenAIWithTelemetryMock } },
    }),
  };
});

import {
  gradeOneQuestion,
  generateOneQuestionSummary,
  generateSessionSummaryPhase,
} from "@/lib/grading";

function makeChain(value: { data?: unknown; error?: unknown } = {}) {
  const chain: Record<string, unknown> = {};
  const returnSelf = () => chain;
  const resolvedSingle = () => Promise.resolve({ data: value.data ?? null, error: value.error ?? null });
  Object.assign(chain, {
    select: vi.fn(returnSelf),
    eq: vi.fn(returnSelf),
    maybeSingle: vi.fn(resolvedSingle),
    single: vi.fn(resolvedSingle),
    update: vi.fn(returnSelf),
    insert: vi.fn(returnSelf),
    upsert: vi.fn(returnSelf),
    order: vi.fn(returnSelf),
    not: vi.fn(returnSelf),
    limit: vi.fn(returnSelf),
    then: (resolve: (v: unknown) => unknown) =>
      Promise.resolve(resolve({ data: value.data ?? null, error: value.error ?? null })),
  });
  return chain;
}

beforeEach(() => {
  vi.clearAllMocks();
  gradeSingleQuestionSpy.mockReset();
  generateQuestionSummarySpy.mockReset();
  generateSummarySpy.mockReset();
});

describe("gradeOneQuestion idempotency", () => {
  it("skips when a non-ai_failed grade already exists (no OpenAI call)", async () => {
    supabaseMock.from.mockImplementation((table: string) => {
      if (table === "grades") {
        return makeChain({ data: { id: "g1", grade_type: "auto" } });
      }
      throw new Error(`Unexpected table ${table}`);
    });

    const result = await gradeOneQuestion(
      "550e8400-e29b-41d4-a716-446655440000",
      0
    );

    expect(result).toEqual({ skipped: true, graded: true });
    expect(callOpenAIWithTelemetryMock).not.toHaveBeenCalled();
  });
});

describe("generateOneQuestionSummary idempotency", () => {
  it("skips when grade.ai_summary is already set", async () => {
    supabaseMock.from.mockImplementation((table: string) => {
      if (table === "grades") {
        return makeChain({
          data: {
            id: "g1",
            q_idx: 0,
            score: 80,
            comment: "good",
            stage_grading: null,
            ai_summary: { summary: "already done" },
            grade_type: "auto",
          },
        });
      }
      throw new Error(`Unexpected table ${table}`);
    });

    const result = await generateOneQuestionSummary(
      "550e8400-e29b-41d4-a716-446655440000",
      0
    );

    expect(result).toEqual({ skipped: true, generated: false });
    expect(callOpenAIWithTelemetryMock).not.toHaveBeenCalled();
  });

  it("skips when grade is ai_failed", async () => {
    supabaseMock.from.mockImplementation((table: string) => {
      if (table === "grades") {
        return makeChain({
          data: {
            id: "g1",
            q_idx: 0,
            score: 0,
            comment: null,
            stage_grading: null,
            ai_summary: null,
            grade_type: "ai_failed",
          },
        });
      }
      throw new Error(`Unexpected table ${table}`);
    });

    const result = await generateOneQuestionSummary(
      "550e8400-e29b-41d4-a716-446655440000",
      0
    );

    expect(result).toEqual({ skipped: true, generated: false });
    expect(callOpenAIWithTelemetryMock).not.toHaveBeenCalled();
  });
});

describe("generateSessionSummaryPhase idempotency", () => {
  it("skips when sessions.ai_summary.summary is a non-empty string", async () => {
    supabaseMock.from.mockImplementation((table: string) => {
      if (table === "sessions") {
        return makeChain({
          data: {
            id: "550e8400-e29b-41d4-a716-446655440000",
            exam_id: "e1",
            student_id: "s1",
            ai_summary: {
              summary: "이미 전반적인 평가가 완료되었습니다.",
            },
          },
        });
      }
      // Fallback for any other table query — return empty
      return makeChain({ data: [] });
    });

    const result = await generateSessionSummaryPhase(
      "550e8400-e29b-41d4-a716-446655440000"
    );

    expect(result).toEqual({ skipped: true, generated: false });
    expect(callOpenAIWithTelemetryMock).not.toHaveBeenCalled();
  });

  it("does NOT skip when ai_summary.summary is empty string", async () => {
    // First call returns empty summary — expect it to proceed (and ultimately
    // fail because we didn't stub the rest of the pipeline). Just verify
    // that the skip guard did not fire.
    let callCount = 0;
    supabaseMock.from.mockImplementation((table: string) => {
      if (table === "sessions" && callCount === 0) {
        callCount++;
        return makeChain({
          data: {
            id: "550e8400-e29b-41d4-a716-446655440000",
            exam_id: "e1",
            student_id: "s1",
            ai_summary: { summary: "   " },
          },
        });
      }
      // Subsequent calls: return something that causes progress update to
      // succeed but loadPhaseContext to fail → thrown error.
      return makeChain({ data: null, error: { message: "no exam" } });
    });

    await expect(
      generateSessionSummaryPhase("550e8400-e29b-41d4-a716-446655440000")
    ).rejects.toThrow();
  });
});
