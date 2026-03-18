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

function mockGradesAndSession(
  gradesCount: number | null,
  gradesError: unknown,
  sessionData: { ai_summary?: unknown } | null,
  sessionError: unknown
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

  let callIdx = 0;
  supabaseMock.from.mockImplementation(() => {
    if (callIdx++ === 0) return gradesBuilder;
    return sessionBuilder;
  });
}

describe("triggerGradingIfNeeded", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    enqueueGradingMock.mockImplementation((fn: () => Promise<void>) => {
      // Don't actually call fn in tests, just resolve
      return Promise.resolve();
    });
  });

  it("skips grading when grades already exist", async () => {
    mockGradesAndSession(3, null, null, null);

    const result = await triggerGradingIfNeeded("session-1", "feedback");

    expect(result).toEqual({ queued: false, reason: "already_graded" });
    expect(enqueueGradingMock).not.toHaveBeenCalled();
  });

  it("skips grading when ai_summary has grading_status", async () => {
    mockGradesAndSession(0, null, { ai_summary: { grading_status: "completed" } }, null);

    const result = await triggerGradingIfNeeded("session-1", "feedback");

    expect(result).toEqual({ queued: false, reason: "already_marked" });
    expect(enqueueGradingMock).not.toHaveBeenCalled();
  });

  it("queues grading when no grades and no grading_status", async () => {
    mockGradesAndSession(0, null, null, null);

    const result = await triggerGradingIfNeeded("session-1", "feedback");

    expect(result).toEqual({ queued: true });
    expect(enqueueGradingMock).toHaveBeenCalledTimes(1);
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
