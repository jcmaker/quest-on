import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  autoGradeSessionMock,
  listQuestionsToGradeMock,
  enqueueGradingPhaseMock,
  isQStashEnabledMock,
  logErrorMock,
  supabaseMock,
} = vi.hoisted(() => ({
  autoGradeSessionMock: vi.fn(),
  listQuestionsToGradeMock: vi.fn(),
  enqueueGradingPhaseMock: vi.fn(),
  isQStashEnabledMock: vi.fn(),
  logErrorMock: vi.fn(),
  supabaseMock: {
    from: vi.fn(),
  },
}));

vi.mock("@/lib/grading", () => ({
  autoGradeSession: autoGradeSessionMock,
  listQuestionsToGrade: listQuestionsToGradeMock,
}));

vi.mock("@/lib/qstash", () => ({
  enqueueGradingPhase: enqueueGradingPhaseMock,
  isQStashEnabled: isQStashEnabledMock,
}));

vi.mock("@/lib/logger", () => ({
  logError: logErrorMock,
}));

vi.mock("@/lib/supabase-server", () => ({
  getSupabaseServer: () => supabaseMock,
}));

import { triggerGradingIfNeeded } from "@/lib/grading-trigger";

type GradeRow = { grade_type: string };
type SessionMeta = {
  ai_summary: unknown;
  grading_progress: unknown;
};

function mockDb(params: {
  gradeRows?: GradeRow[] | null;
  gradeError?: unknown;
  sessionMeta?: SessionMeta | null;
  sessionError?: unknown;
}) {
  // Called sequence (see trigger source):
  //   1. from("grades").select().eq() → Promise<{ data, error }>
  //   2. from("sessions").select().eq().maybeSingle() → Promise<...>
  //   3. from("sessions").update(...).eq(...)  // markGradingQueued

  const gradesBuilder = {
    select: vi.fn(() => gradesBuilder),
    eq: vi.fn(() => gradesBuilder),
    then: vi.fn((resolve: (v: unknown) => unknown) =>
      Promise.resolve(
        resolve({
          data: params.gradeRows ?? [],
          error: params.gradeError ?? null,
        })
      )
    ),
  };

  const sessionReadBuilder = {
    select: vi.fn(() => sessionReadBuilder),
    eq: vi.fn(() => sessionReadBuilder),
    maybeSingle: vi.fn().mockResolvedValue({
      data: params.sessionMeta ?? null,
      error: params.sessionError ?? null,
    }),
  };

  const sessionUpdateBuilder = {
    update: vi.fn(() => sessionUpdateBuilder),
    eq: vi.fn().mockResolvedValue({ error: null }),
  };

  let call = 0;
  supabaseMock.from.mockImplementation((table: string) => {
    if (table === "grades") return gradesBuilder;
    if (table === "sessions") {
      call += 1;
      return call === 1 ? sessionReadBuilder : sessionUpdateBuilder;
    }
    throw new Error(`Unexpected table: ${table}`);
  });
}

describe("triggerGradingIfNeeded (phase-chained)", () => {
  const prevVercel = process.env.VERCEL;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.VERCEL = prevVercel;

    isQStashEnabledMock.mockReturnValue(true);
    enqueueGradingPhaseMock.mockResolvedValue({
      ok: true,
      dedupId: "x",
      messageId: "m1",
    });
    listQuestionsToGradeMock.mockResolvedValue([0]);
  });

  it("skips when successful grades exist AND a real session summary is already saved", async () => {
    mockDb({
      gradeRows: [{ grade_type: "auto" }, { grade_type: "manual" }],
      sessionMeta: {
        ai_summary: { summary: "전반적으로 우수한 답안입니다." },
        grading_progress: null,
      },
    });

    const result = await triggerGradingIfNeeded("550e8400-e29b-41d4-a716-446655440000", "feedback");

    expect(result).toEqual({ queued: false, reason: "already_graded" });
    expect(enqueueGradingPhaseMock).not.toHaveBeenCalled();
  });

  it("re-enqueues when all existing grades are ai_failed", async () => {
    mockDb({
      gradeRows: [{ grade_type: "ai_failed" }, { grade_type: "ai_failed" }],
      sessionMeta: { ai_summary: null, grading_progress: null },
    });

    const result = await triggerGradingIfNeeded("550e8400-e29b-41d4-a716-446655440000", "feedback");

    expect(result).toEqual({ queued: true, reason: "qstash" });
    expect(enqueueGradingPhaseMock).toHaveBeenCalledTimes(1);
    expect(enqueueGradingPhaseMock).toHaveBeenCalledWith(
      expect.objectContaining({ phase: "grade_question", qIdx: 0 })
    );
  });

  it("re-enqueues when grades are successful but session summary is still missing", async () => {
    mockDb({
      gradeRows: [{ grade_type: "auto" }],
      sessionMeta: { ai_summary: null, grading_progress: null },
    });

    const result = await triggerGradingIfNeeded("550e8400-e29b-41d4-a716-446655440000", "feedback");

    expect(result).toEqual({ queued: true, reason: "qstash" });
    expect(enqueueGradingPhaseMock).toHaveBeenCalled();
  });

  it("skips when grading_progress is actively running and fresh", async () => {
    mockDb({
      gradeRows: [],
      sessionMeta: {
        ai_summary: null,
        grading_progress: {
          status: "running",
          updated_at: new Date().toISOString(),
        },
      },
    });

    const result = await triggerGradingIfNeeded("550e8400-e29b-41d4-a716-446655440000", "heartbeat");

    expect(result).toEqual({ queued: false, reason: "already_in_progress" });
  });

  it("re-triggers when grading_progress is stale (> 10min)", async () => {
    const oldTs = new Date(Date.now() - 11 * 60 * 1000).toISOString();
    mockDb({
      gradeRows: [],
      sessionMeta: {
        ai_summary: null,
        grading_progress: { status: "running", updated_at: oldTs },
      },
    });

    const result = await triggerGradingIfNeeded("550e8400-e29b-41d4-a716-446655440000", "cron_sweeper");

    expect(result).toEqual({ queued: true, reason: "qstash" });
    expect(enqueueGradingPhaseMock).toHaveBeenCalled();
  });

  it("falls back to session_summary phase when no questions have submissions", async () => {
    listQuestionsToGradeMock.mockResolvedValue([]);
    mockDb({
      gradeRows: [],
      sessionMeta: { ai_summary: null, grading_progress: null },
    });

    const result = await triggerGradingIfNeeded("550e8400-e29b-41d4-a716-446655440000", "submit_exam");

    expect(result).toEqual({ queued: true, reason: "qstash" });
    expect(enqueueGradingPhaseMock).toHaveBeenCalledWith(
      expect.objectContaining({ phase: "session_summary" })
    );
  });

  it("returns qstash_not_configured on Vercel when QStash is disabled", async () => {
    process.env.VERCEL = "1";
    isQStashEnabledMock.mockReturnValue(false);
    mockDb({
      gradeRows: [],
      sessionMeta: { ai_summary: null, grading_progress: null },
    });

    const result = await triggerGradingIfNeeded("550e8400-e29b-41d4-a716-446655440000", "submit_exam");

    expect(result).toEqual({ queued: false, reason: "qstash_not_configured" });
    expect(autoGradeSessionMock).not.toHaveBeenCalled();
  });

  it("uses dev inline fallback when QStash disabled AND not on Vercel", async () => {
    process.env.VERCEL = "";
    isQStashEnabledMock.mockReturnValue(false);
    autoGradeSessionMock.mockResolvedValue({
      grades: [],
      summary: null,
      failedQuestions: [],
      timedOut: false,
    });
    mockDb({
      gradeRows: [],
      sessionMeta: { ai_summary: null, grading_progress: null },
    });

    const result = await triggerGradingIfNeeded("550e8400-e29b-41d4-a716-446655440000", "submit_exam");

    expect(result).toEqual({ queued: true, reason: "dev_inline" });
    expect(autoGradeSessionMock).toHaveBeenCalledWith("550e8400-e29b-41d4-a716-446655440000");
  });

  it("surfaces QStash publish failure (e.g. missing worker URL) on Vercel", async () => {
    process.env.VERCEL = "1";
    isQStashEnabledMock.mockReturnValue(true);
    enqueueGradingPhaseMock.mockResolvedValue({ ok: false, reason: "no_base_url" });
    mockDb({
      gradeRows: [],
      sessionMeta: { ai_summary: null, grading_progress: null },
    });

    const result = await triggerGradingIfNeeded("550e8400-e29b-41d4-a716-446655440000", "submit_exam");

    expect(result).toEqual({ queued: false, reason: "qstash_no_base_url" });
  });
});
