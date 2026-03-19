import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  autoGradeSessionMock,
  enqueueGradingMock,
  logErrorMock,
  supabaseMock,
} = vi.hoisted(() => ({
  autoGradeSessionMock: vi.fn(),
  enqueueGradingMock: vi.fn(),
  logErrorMock: vi.fn(),
  supabaseMock: {
    from: vi.fn(),
  },
}));

vi.mock("@/lib/grading", () => ({
  autoGradeSession: autoGradeSessionMock,
}));

vi.mock("@/lib/openai", () => ({
  enqueueGrading: enqueueGradingMock,
}));

vi.mock("@/lib/logger", () => ({
  logError: logErrorMock,
}));

vi.mock("@/lib/supabase-server", () => ({
  getSupabaseServer: () => supabaseMock,
}));

import { triggerGradingIfNeeded } from "@/lib/grading-trigger";

/**
 * Build a chainable mock builder that resolves to the given result.
 * Supports: .from().select().eq().or().update().maybeSingle()
 */
function chainBuilder(resolveValue: unknown) {
  const builder: Record<string, unknown> = {};
  const methods = ["select", "eq", "or", "update", "maybeSingle", "single"];
  for (const m of methods) {
    builder[m] = vi.fn(() => builder);
  }
  // maybeSingle resolves
  (builder.maybeSingle as ReturnType<typeof vi.fn>).mockResolvedValue(resolveValue);
  // Also make it thenable for Promise.all with count-based queries
  builder.then = undefined;
  return builder;
}

function mockGradesAndSession(
  gradesCount: number | null,
  gradesError: unknown,
  sessionData: { ai_summary?: unknown } | null,
  sessionError: unknown,
  casResult: { id: string } | null = { id: "session-1" },
  casError: unknown = null
) {
  const gradesBuilder = {
    select: vi.fn(() => gradesBuilder),
    eq: vi.fn(() => gradesBuilder),
    then: vi.fn((resolve: (v: unknown) => unknown) =>
      Promise.resolve(resolve({ count: gradesCount, error: gradesError }))
    ),
  };

  const sessionBuilder = {
    select: vi.fn(() => sessionBuilder),
    eq: vi.fn(() => sessionBuilder),
    maybeSingle: vi.fn().mockResolvedValue({ data: sessionData, error: sessionError }),
    then: undefined as unknown,
  };

  // CAS update builder
  const casBuilder: Record<string, unknown> = {};
  for (const m of ["update", "eq", "or", "select", "maybeSingle"]) {
    casBuilder[m] = vi.fn(() => casBuilder);
  }
  (casBuilder.maybeSingle as ReturnType<typeof vi.fn>).mockResolvedValue({
    data: casResult,
    error: casError,
  });

  let callIdx = 0;
  supabaseMock.from.mockImplementation(() => {
    const idx = callIdx++;
    if (idx === 0) return gradesBuilder;  // grades check
    if (idx === 1) return sessionBuilder; // session meta check
    return casBuilder;                     // CAS update (and any subsequent calls)
  });
}

describe("triggerGradingIfNeeded", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    enqueueGradingMock.mockImplementation((fn: () => Promise<void>) => {
      return Promise.resolve();
    });
  });

  it("skips grading when grades already exist", async () => {
    mockGradesAndSession(3, null, null, null);

    const result = await triggerGradingIfNeeded("session-1", "feedback");

    expect(result).toEqual({ queued: false, reason: "already_graded" });
    expect(enqueueGradingMock).not.toHaveBeenCalled();
  });

  it("skips grading when ai_summary has grading_status (non-failed)", async () => {
    mockGradesAndSession(0, null, { ai_summary: { grading_status: "completed" } }, null);

    const result = await triggerGradingIfNeeded("session-1", "feedback");

    expect(result).toEqual({ queued: false, reason: "already_marked" });
    expect(enqueueGradingMock).not.toHaveBeenCalled();
  });

  it("skips grading when grading_status is 'queued'", async () => {
    mockGradesAndSession(0, null, { ai_summary: { grading_status: "queued" } }, null);

    const result = await triggerGradingIfNeeded("session-1", "feedback");

    expect(result).toEqual({ queued: false, reason: "already_marked" });
    expect(enqueueGradingMock).not.toHaveBeenCalled();
  });

  it("allows re-trigger when grading_status is 'failed'", async () => {
    mockGradesAndSession(
      0, null,
      { ai_summary: { grading_status: "failed" } }, null,
      { id: "session-1" }, null
    );

    const result = await triggerGradingIfNeeded("session-1", "feedback");

    expect(result).toEqual({ queued: true });
    expect(enqueueGradingMock).toHaveBeenCalledTimes(1);
  });

  it("queues grading when no grades and no grading_status", async () => {
    mockGradesAndSession(0, null, null, null);

    const result = await triggerGradingIfNeeded("session-1", "feedback");

    expect(result).toEqual({ queued: true });
    expect(enqueueGradingMock).toHaveBeenCalledTimes(1);
  });

  it("returns cas_conflict when CAS update fails (another trigger claimed)", async () => {
    mockGradesAndSession(
      0, null, null, null,
      null, null // CAS returns null data (no row matched)
    );

    const result = await triggerGradingIfNeeded("session-1", "feedback");

    expect(result).toEqual({ queued: false, reason: "cas_conflict" });
    expect(enqueueGradingMock).not.toHaveBeenCalled();
  });

  it("proceeds even if CAS has error (worst case: duplicate grading is safe)", async () => {
    mockGradesAndSession(
      0, null, null, null,
      null, { message: "CAS error" } // CAS error but non-null
    );

    const result = await triggerGradingIfNeeded("session-1", "feedback");

    expect(result).toEqual({ queued: true });
    expect(logErrorMock).toHaveBeenCalledWith(
      expect.stringContaining("CAS update failed"),
      expect.anything(),
      expect.anything()
    );
  });

  it("queues grading when ai_summary exists but has no grading_status", async () => {
    mockGradesAndSession(0, null, { ai_summary: { some_other_field: true } }, null);

    const result = await triggerGradingIfNeeded("session-1", "heartbeat");

    expect(result).toEqual({ queued: true });
    expect(enqueueGradingMock).toHaveBeenCalledTimes(1);
  });

  it("logs error but continues when grades check fails", async () => {
    mockGradesAndSession(null, { message: "db error" }, null, null);

    const result = await triggerGradingIfNeeded("session-1", "feedback");

    expect(logErrorMock).toHaveBeenCalledWith(
      expect.stringContaining("Failed to check existing grades"),
      expect.anything(),
      expect.anything()
    );
    // count is null → (null || 0) === 0 → proceeds to grading
    expect(result).toEqual({ queued: true });
  });

  it("logs error but continues when session check fails", async () => {
    mockGradesAndSession(0, null, null, { message: "session error" });

    const result = await triggerGradingIfNeeded("session-1", "force_end");

    expect(logErrorMock).toHaveBeenCalledWith(
      expect.stringContaining("Failed to check session grading metadata"),
      expect.anything(),
      expect.anything()
    );
    expect(result).toEqual({ queued: true });
  });

  it("enqueues a retry function that calls autoGradeSession", async () => {
    mockGradesAndSession(0, null, null, null);

    let capturedFn: (() => Promise<void>) | null = null;
    enqueueGradingMock.mockImplementation((fn: () => Promise<void>) => {
      capturedFn = fn;
      return Promise.resolve();
    });
    autoGradeSessionMock.mockResolvedValue(undefined);

    await triggerGradingIfNeeded("session-1", "feedback");

    expect(capturedFn).not.toBeNull();
    await capturedFn!();
    expect(autoGradeSessionMock).toHaveBeenCalledWith("session-1");
  });

  it("treats null grades count as zero (proceeds to grade)", async () => {
    mockGradesAndSession(null, null, null, null);

    const result = await triggerGradingIfNeeded("session-1", "submit_exam");

    expect(result).toEqual({ queued: true });
  });
});
