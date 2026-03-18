import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NextRequest } from "next/server";

const {
  currentUserMock,
  checkRateLimitAsyncMock,
  compressDataMock,
  enqueueGradingMock,
  autoGradeSessionMock,
  triggerGradingIfNeededMock,
  auditLogMock,
  logErrorMock,
  supabaseMock,
} = vi.hoisted(() => ({
  currentUserMock: vi.fn(),
  checkRateLimitAsyncMock: vi.fn(),
  compressDataMock: vi.fn(),
  enqueueGradingMock: vi.fn(),
  autoGradeSessionMock: vi.fn(),
  triggerGradingIfNeededMock: vi.fn(),
  auditLogMock: vi.fn(),
  logErrorMock: vi.fn(),
  supabaseMock: {
    from: vi.fn(),
    rpc: vi.fn(),
  },
}));

vi.mock("@/lib/get-current-user", () => ({
  currentUser: currentUserMock,
}));

vi.mock("@/lib/supabase-server", () => ({
  getSupabaseServer: () => supabaseMock,
}));

vi.mock("@/lib/rate-limit", () => ({
  checkRateLimitAsync: checkRateLimitAsyncMock,
  RATE_LIMITS: {
    submission: { limit: 5, windowSec: 60 },
  },
}));

vi.mock("@/lib/compression", () => ({
  compressData: compressDataMock,
}));

vi.mock("@/lib/openai", () => ({
  enqueueGrading: enqueueGradingMock,
}));

vi.mock("@/lib/grading", () => ({
  autoGradeSession: autoGradeSessionMock,
}));

vi.mock("@/lib/audit", () => ({
  auditLog: auditLogMock,
}));

vi.mock("@/lib/logger", () => ({
  logError: logErrorMock,
}));

vi.mock("@/lib/grading-trigger", () => ({
  triggerGradingIfNeeded: triggerGradingIfNeededMock,
}));

import { POST } from "@/app/api/feedback/route";

type QueryResult = { data: unknown; error: unknown };

function createChain(options: {
  singleResult?: QueryResult;
  maybeSingleResult?: QueryResult;
  selectResult?: QueryResult;
  awaitResult?: QueryResult;
  onInsert?: (values: unknown) => void;
  onUpdate?: (values: unknown) => void;
  onUpsert?: (values: unknown, config: unknown) => void;
  eqCalls?: Array<[string, unknown]>;
} = {}) {
  const defaultAwait = options.awaitResult ?? { data: null, error: null };
  const builder = {
    select: vi.fn(() => {
      if (options.selectResult) {
        return Promise.resolve(options.selectResult);
      }
      return builder;
    }),
    insert: vi.fn((values: unknown) => {
      options.onInsert?.(values);
      return builder;
    }),
    update: vi.fn((values: unknown) => {
      options.onUpdate?.(values);
      return builder;
    }),
    upsert: vi.fn((values: unknown, config: unknown) => {
      options.onUpsert?.(values, config);
      return builder;
    }),
    eq: vi.fn((column: string, value: unknown) => {
      options.eqCalls?.push([column, value]);
      return builder;
    }),
    is: vi.fn(() => builder),
    not: vi.fn(() => builder),
    order: vi.fn(() => builder),
    single: vi.fn().mockResolvedValue(options.singleResult ?? { data: null, error: null }),
    maybeSingle: vi.fn().mockResolvedValue(
      options.maybeSingleResult ?? { data: null, error: null }
    ),
    then: vi.fn((resolve: (value: unknown) => unknown) => Promise.resolve(resolve(defaultAwait))),
  };

  return builder;
}

function queueTableMocks(queues: Record<string, ReturnType<typeof createChain>[]>) {
  supabaseMock.from.mockImplementation((table: string) => {
    const next = queues[table]?.shift();
    if (!next) {
      throw new Error(`No mock configured for table ${table}`);
    }
    return next;
  });
}

function makeRequest(body: Record<string, unknown>) {
  return new Request("http://localhost/api/feedback", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }) as NextRequest;
}

describe("POST /api/feedback", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    currentUserMock.mockResolvedValue({ id: "student-1" });
    checkRateLimitAsyncMock.mockResolvedValue({
      allowed: true,
      remaining: 4,
      resetAt: Date.now() + 60_000,
    });
    compressDataMock.mockReturnValue({
      data: "compressed",
      metadata: { algorithm: "mock", compressedSize: 10, originalSize: 20 },
    });
    enqueueGradingMock.mockReturnValue(Promise.resolve(undefined));
    autoGradeSessionMock.mockResolvedValue(undefined);
    triggerGradingIfNeededMock.mockResolvedValue({ queued: true });
    supabaseMock.rpc.mockResolvedValue({ error: null });
    auditLogMock.mockResolvedValue(true);
  });

  it("rejects forged student ids before touching the database", async () => {
    const response = await POST(
      makeRequest({
        examCode: "EXAM01",
        answers: [{ text: "answer" }],
        studentId: "student-2",
      })
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({
      error: "FORBIDDEN",
      message: "Student ID mismatch",
    });
    expect(supabaseMock.from).not.toHaveBeenCalled();
  });

  it("rejects submissions for sessions owned by another student", async () => {
    queueTableMocks({
      exams: [
        createChain({
          singleResult: {
            data: { id: "exam-1", code: "EXAM01", status: "running", duration: 0 },
            error: null,
          },
        }),
      ],
      sessions: [
        createChain({
          singleResult: {
            data: {
              id: "session-2",
              student_id: "student-2",
              exam_id: "exam-1",
              submitted_at: null,
              created_at: "2026-03-06T00:00:00.000Z",
              attempt_timer_started_at: null,
              started_at: null,
            },
            error: null,
          },
        }),
      ],
    });

    const response = await POST(
      makeRequest({
        examCode: "EXAM01",
        examId: "exam-1",
        sessionId: "session-2",
        answers: [{ text: "answer" }],
      })
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({
      error: "FORBIDDEN",
      message: "Session access denied",
    });
  });

  it("stores submissions with the authenticated student even when studentId is omitted", async () => {
    let createdSessionPayload: unknown;
    let updatedSessionPayload: unknown;
    let submissionUpsertPayload: unknown;
    let submissionUpsertConfig: unknown;
    const updateEqCalls: Array<[string, unknown]> = [];

    queueTableMocks({
      exams: [
        createChain({
          singleResult: {
            data: { id: "exam-1", code: "EXAM01", status: "draft", duration: 0 },
            error: null,
          },
        }),
      ],
      sessions: [
        createChain({
          maybeSingleResult: { data: null, error: null },
        }),
        createChain({
          maybeSingleResult: { data: null, error: null },
        }),
        createChain({
          onUpsert: (values) => {
            createdSessionPayload = values;
          },
          maybeSingleResult: {
            data: { id: "session-1" },
            error: null,
          },
        }),
        createChain({
          onUpdate: (values) => {
            updatedSessionPayload = values;
          },
          eqCalls: updateEqCalls,
          maybeSingleResult: {
            data: { id: "session-1" },
            error: null,
          },
        }),
      ],
      submissions: [
        createChain({
          onUpsert: (values, config) => {
            submissionUpsertPayload = values;
            submissionUpsertConfig = config;
          },
          selectResult: {
            data: [{ id: "submission-1" }],
            error: null,
          },
        }),
      ],
      messages: [
        createChain({
          awaitResult: {
            data: [
              { q_idx: 0, role: "user", content: "Hello", created_at: "2026-03-06T00:00:01.000Z" },
              { q_idx: 0, role: "assistant", content: "Hi!", created_at: "2026-03-06T00:00:02.000Z" },
            ],
            error: null,
          },
        }),
      ],
    });

    const response = await POST(
      makeRequest({
        examCode: "EXAM01",
        answers: [{ text: "Answer 1" }],
        chatHistory: [],
      })
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toMatchObject({
      success: true,
      examCode: "EXAM01",
      examId: "exam-1",
      status: "submitted",
    });

    expect(createdSessionPayload).toEqual({
      exam_id: "exam-1",
      student_id: "student-1",
    });
    expect(updatedSessionPayload).toMatchObject({
      status: "submitted",
      is_active: false,
    });
    expect(updateEqCalls).toEqual(
      expect.arrayContaining([
        ["id", "session-1"],
        ["student_id", "student-1"],
        ["exam_id", "exam-1"],
      ])
    );
    expect(submissionUpsertPayload).toEqual([
      expect.objectContaining({
        session_id: "session-1",
        q_idx: 0,
        answer: "Answer 1",
      }),
    ]);
    expect(submissionUpsertConfig).toEqual({ onConflict: "session_id,q_idx" });
  });
});
