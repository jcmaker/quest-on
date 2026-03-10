import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  currentUserMock,
  compressDataMock,
  auditLogMock,
  logErrorMock,
  supabaseMock,
} = vi.hoisted(() => ({
  currentUserMock: vi.fn(),
  compressDataMock: vi.fn(),
  auditLogMock: vi.fn(),
  logErrorMock: vi.fn(),
  supabaseMock: {
    from: vi.fn(),
  },
}));

vi.mock("@/lib/get-current-user", () => ({
  currentUser: currentUserMock,
}));

vi.mock("@/lib/supabase-server", () => ({
  getSupabaseServer: () => supabaseMock,
}));

vi.mock("@/lib/compression", () => ({
  compressData: compressDataMock,
}));

vi.mock("@/lib/audit", () => ({
  auditLog: auditLogMock,
}));

vi.mock("@/lib/logger", () => ({
  logError: logErrorMock,
}));

import { submitExam } from "@/app/api/supa/handlers/session-handlers";

type QueryResult = { data: unknown; error: unknown };

function createChain(options: {
  singleResult?: QueryResult;
} = {}) {
  const builder = {
    select: vi.fn(() => builder),
    eq: vi.fn(() => builder),
    is: vi.fn(() => builder),
    update: vi.fn(() => builder),
    upsert: vi.fn(() => builder),
    single: vi.fn().mockResolvedValue(options.singleResult ?? { data: null, error: null }),
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

describe("submitExam auth checks", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    currentUserMock.mockResolvedValue({ id: "student-1" });
    compressDataMock.mockReturnValue({
      data: "compressed",
      metadata: { algorithm: "mock" },
    });
  });

  it("rejects forged student ids before any database call", async () => {
    const response = await submitExam({
      examId: "exam-1",
      studentId: "student-2",
      sessionId: "session-1",
      answers: [{ text: "Answer 1" }],
    });

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({
      error: "UNAUTHORIZED",
      message: "Student ID mismatch",
    });
    expect(supabaseMock.from).not.toHaveBeenCalled();
  });

  it("rejects sessions owned by another student", async () => {
    queueTableMocks({
      sessions: [
        createChain({
          singleResult: {
            data: {
              id: "session-2",
              student_id: "student-2",
              exam_id: "exam-1",
              submitted_at: null,
            },
            error: null,
          },
        }),
      ],
    });

    const response = await submitExam({
      examId: "exam-1",
      studentId: "student-1",
      sessionId: "session-2",
      answers: [{ text: "Answer 1" }],
    });

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({
      error: "UNAUTHORIZED",
      message: "Session access denied",
    });
  });
});
