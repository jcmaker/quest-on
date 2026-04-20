import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const {
  triggerGradingIfNeededMock,
  listQuestionsToGradeMock,
  logErrorMock,
  supabaseMock,
} = vi.hoisted(() => ({
  triggerGradingIfNeededMock: vi.fn(),
  listQuestionsToGradeMock: vi.fn(),
  logErrorMock: vi.fn(),
  supabaseMock: { from: vi.fn() },
}));

vi.mock("@/lib/grading-trigger", () => ({
  triggerGradingIfNeeded: triggerGradingIfNeededMock,
}));

vi.mock("@/lib/grading", () => ({
  listQuestionsToGrade: listQuestionsToGradeMock,
}));

vi.mock("@/lib/logger", () => ({ logError: logErrorMock }));

vi.mock("@/lib/supabase-server", () => ({
  getSupabaseServer: () => supabaseMock,
}));

import { GET } from "@/app/api/cron/grading-sweep/route";

type SessionRow = {
  id: string;
  submitted_at: string;
  grading_progress: Record<string, unknown> | null;
};

/**
 * Wires supabase.from() for a given sweep scenario:
 *   - The initial `from("sessions").select().not().order().limit()` returns `sessionRows`.
 *   - Subsequent `from("sessions").select("ai_summary").eq().maybeSingle()` returns `aiSummaryBySession`.
 *   - `from("grades").select().eq()` returns `gradesBySession` for the current session.
 *   - `from("sessions").update().eq()` is a no-op that records the update payload.
 */
function mockSweepDb(params: {
  sessionRows: SessionRow[];
  aiSummaryBySession?: Record<string, { summary?: string } | null>;
  gradesBySession?: Record<string, Array<{ q_idx: number; grade_type: string | null }>>;
  questionIdxsBySession?: Record<string, number[]>;
}) {
  const updates: Array<{ id: string; patch: Record<string, unknown> }> = [];

  const sessionListBuilder = {
    select: vi.fn(() => sessionListBuilder),
    not: vi.fn(() => sessionListBuilder),
    order: vi.fn(() => sessionListBuilder),
    limit: vi.fn().mockResolvedValue({ data: params.sessionRows, error: null }),
  };

  function sessionReadForIdBuilder(sessionId: string) {
    const rec = params.aiSummaryBySession?.[sessionId] ?? null;
    const b: Record<string, unknown> = {};
    b.select = vi.fn(() => b);
    b.eq = vi.fn((_col: string, _val: string) => b);
    b.maybeSingle = vi.fn().mockResolvedValue({
      data: { ai_summary: rec },
      error: null,
    });
    return b;
  }

  // sessionUpdateBuilder is not used — the "sessions" branch below handles
  // both reads and updates via a dispatching builder.

  // Per-session, the sweeper issues:
  //   a) sessions.select(ai_summary).eq(id).maybeSingle()
  //   b) grades.select().eq(session_id, id)
  //   c) sessions.update(...).eq(id, id)
  // We dispatch based on the last `.eq()` value we've seen for "sessions".

  let firstSessionsCall = true;
  let lastSessionIdForRead: string | null = null;

  supabaseMock.from.mockImplementation((table: string) => {
    if (table === "grades") {
      const b: Record<string, unknown> = {};
      b.select = vi.fn(() => b);
      b.eq = vi.fn((_col: string, sessionId: string) => {
        const rows = params.gradesBySession?.[sessionId] ?? [];
        return Promise.resolve({ data: rows, error: null });
      });
      return b;
    }
    if (table === "sessions") {
      if (firstSessionsCall) {
        firstSessionsCall = false;
        return sessionListBuilder;
      }
      // Distinguish: the read path calls `.select("ai_summary").eq(...).maybeSingle()`;
      // the update path calls `.update({ grading_progress }).eq(...)`.
      const b: Record<string, unknown> = {};
      b.select = vi.fn((_cols: string) => {
        const inner: Record<string, unknown> = {};
        inner.eq = vi.fn((_col: string, val: string) => {
          lastSessionIdForRead = val;
          const real = sessionReadForIdBuilder(val);
          return real;
        });
        return inner;
      });
      b.update = vi.fn((patch: Record<string, unknown>) => {
        const inner: Record<string, unknown> = {};
        inner.eq = vi.fn((_col: string, val: string) => {
          updates.push({ id: val, patch });
          return Promise.resolve({ error: null });
        });
        return inner;
      });
      return b;
    }
    throw new Error(`Unexpected table: ${table}`);
  });

  // Wire listQuestionsToGrade (not a supabase call but another source of Qs)
  listQuestionsToGradeMock.mockImplementation(async (sessionId: string) => {
    return params.questionIdxsBySession?.[sessionId] ?? [];
  });

  void lastSessionIdForRead;
  return { updates };
}

function mkRequest(): NextRequest {
  return new NextRequest("http://localhost/api/cron/grading-sweep", {
    headers: { authorization: "Bearer test-cron-secret" },
  });
}

describe("/api/cron/grading-sweep", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.CRON_SECRET = "test-cron-secret";
    delete process.env.GRADING_SWEEP_DISABLED;
    triggerGradingIfNeededMock.mockResolvedValue({ queued: true, reason: "qstash" });
  });

  it("refuses unauthenticated calls", async () => {
    mockSweepDb({ sessionRows: [] });
    const req = new NextRequest("http://localhost/api/cron/grading-sweep");
    const res = await GET(req);
    expect(res.status).toBe(401);
  });

  it("returns disabled when GRADING_SWEEP_DISABLED=1", async () => {
    process.env.GRADING_SWEEP_DISABLED = "1";
    mockSweepDb({ sessionRows: [] });
    const res = await GET(mkRequest());
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.disabled).toBe(true);
    expect(triggerGradingIfNeededMock).not.toHaveBeenCalled();
  });

  it("auto-heals sessions whose ai_summary is complete and all questions graded", async () => {
    const staleIso = new Date(Date.now() - 30 * 60 * 1000).toISOString();
    const { updates } = mockSweepDb({
      sessionRows: [
        {
          id: "sess-heal",
          submitted_at: staleIso,
          grading_progress: {
            status: "running",
            total: 3,
            completed: 3,
            failed: 0,
            updated_at: staleIso,
          },
        },
      ],
      aiSummaryBySession: {
        "sess-heal": { summary: "전반적으로 우수한 답안입니다." },
      },
      gradesBySession: {
        "sess-heal": [
          { q_idx: 0, grade_type: "auto" },
          { q_idx: 1, grade_type: "auto" },
          { q_idx: 2, grade_type: "auto" },
        ],
      },
      questionIdxsBySession: {
        "sess-heal": [0, 1, 2],
      },
    });

    const res = await GET(mkRequest());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.results).toHaveLength(1);
    expect(body.results[0].action).toBe("heal");
    expect(triggerGradingIfNeededMock).not.toHaveBeenCalled();

    const healUpdate = updates.find((u) => u.id === "sess-heal");
    expect(healUpdate).toBeDefined();
    const patched = healUpdate!.patch.grading_progress as {
      status: string;
      phase: string;
    };
    expect(patched.status).toBe("completed");
    expect(patched.phase).toBe("done");
  });

  it("skips sessions that were swept within the cooldown window", async () => {
    const staleIso = new Date(Date.now() - 30 * 60 * 1000).toISOString();
    const recentSweep = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    mockSweepDb({
      sessionRows: [
        {
          id: "sess-cool",
          submitted_at: staleIso,
          grading_progress: {
            status: "running",
            updated_at: staleIso,
            last_swept_at: recentSweep,
            sweep_attempts: 1,
          },
        },
      ],
    });

    const res = await GET(mkRequest());
    const body = await res.json();

    expect(body.results[0].action).toBe("skip");
    expect(body.results[0].reason).toBe("cooldown_active");
    expect(triggerGradingIfNeededMock).not.toHaveBeenCalled();
  });

  it("force-marks failed when sweep_attempts exceeds limit", async () => {
    const staleIso = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
    const longAgo = new Date(Date.now() - 90 * 60 * 1000).toISOString();
    const { updates } = mockSweepDb({
      sessionRows: [
        {
          id: "sess-giveup",
          submitted_at: staleIso,
          grading_progress: {
            status: "running",
            updated_at: staleIso,
            last_swept_at: longAgo,
            sweep_attempts: 3,
          },
        },
      ],
    });

    const res = await GET(mkRequest());
    const body = await res.json();

    expect(body.results[0].action).toBe("give_up");
    const update = updates.find((u) => u.id === "sess-giveup");
    const patched = update!.patch.grading_progress as {
      status: string;
      last_error: string;
    };
    expect(patched.status).toBe("failed");
    expect(patched.last_error).toMatch(/Sweeper gave up/);
    expect(triggerGradingIfNeededMock).not.toHaveBeenCalled();
  });

  it("re-triggers stuck sessions and increments sweep_attempts", async () => {
    const staleIso = new Date(Date.now() - 30 * 60 * 1000).toISOString();
    const { updates } = mockSweepDb({
      sessionRows: [
        {
          id: "sess-retry",
          submitted_at: staleIso,
          grading_progress: {
            status: "running",
            updated_at: staleIso,
            sweep_attempts: 1,
          },
        },
      ],
      aiSummaryBySession: { "sess-retry": null },
      gradesBySession: { "sess-retry": [] },
      questionIdxsBySession: { "sess-retry": [0, 1] },
    });

    const res = await GET(mkRequest());
    const body = await res.json();

    expect(body.results[0].action).toBe("retrigger");
    expect(triggerGradingIfNeededMock).toHaveBeenCalledWith(
      "sess-retry",
      "cron_sweeper",
      { skipIdempotency: true }
    );

    const stamp = updates.find((u) => u.id === "sess-retry");
    const patched = stamp!.patch.grading_progress as {
      sweep_attempts: number;
      last_swept_at: string;
    };
    expect(patched.sweep_attempts).toBe(2);
    expect(typeof patched.last_swept_at).toBe("string");
  });
});
