import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  isMissingGradesConflictConstraint,
  persistGrades,
  type GradeWriteRecord,
} from "@/lib/grade-persistence";

const logErrorMock = vi.fn();

vi.mock("@/lib/logger", () => ({
  logError: (...args: unknown[]) => logErrorMock(...args),
}));

interface MockResult {
  data?: Array<Record<string, unknown>> | null;
  error?: unknown;
}

function createSupabaseMock(config: {
  upsertResult: MockResult;
  existingResult?: MockResult;
  deleteResult?: MockResult;
  updateResults?: MockResult[];
  insertResult?: MockResult;
}) {
  const calls: Array<Record<string, unknown>> = [];
  const updateResults = [...(config.updateResults ?? [])];

  const supabase = {
    from: vi.fn((_table: string) => ({
      upsert: vi.fn((records: GradeWriteRecord[], options: Record<string, unknown>) => ({
        select: vi.fn(async (selectClause: string) => {
          calls.push({ op: "upsert", records, options, selectClause });
          return config.upsertResult;
        }),
      })),
      select: vi.fn((selectClause: string) => ({
        eq: vi.fn((field: string, value: unknown) => ({
          in: vi.fn(async (inField: string, values: unknown[]) => {
            calls.push({
              op: "select-existing",
              selectClause,
              eq: [field, value],
              in: [inField, values],
            });
            return config.existingResult ?? { data: [], error: null };
          }),
        })),
      })),
      delete: vi.fn(() => ({
        in: vi.fn(async (field: string, values: unknown[]) => {
          calls.push({ op: "delete-duplicates", field, values });
          return config.deleteResult ?? { data: null, error: null };
        }),
      })),
      update: vi.fn((record: GradeWriteRecord) => ({
        eq: vi.fn((field: string, value: unknown) => ({
          select: vi.fn(async (selectClause: string) => {
            calls.push({ op: "update", record, eq: [field, value], selectClause });
            return updateResults.shift() ?? { data: [], error: null };
          }),
        })),
      })),
      insert: vi.fn((records: GradeWriteRecord[]) => ({
        select: vi.fn(async (selectClause: string) => {
          calls.push({ op: "insert", records, selectClause });
          return config.insertResult ?? { data: [], error: null };
        }),
      })),
    })),
  };

  return {
    calls,
    supabase,
  };
}

describe("grade-persistence", () => {
  beforeEach(() => {
    logErrorMock.mockReset();
    logErrorMock.mockResolvedValue(true);
  });

  it("detects missing ON CONFLICT constraint errors", () => {
    expect(
      isMissingGradesConflictConstraint({
        code: "42P10",
        message:
          "there is no unique or exclusion constraint matching the ON CONFLICT specification",
      })
    ).toBe(true);
    expect(isMissingGradesConflictConstraint({ code: "23505" })).toBe(false);
  });

  it("uses direct upsert when the unique constraint exists", async () => {
    const { supabase, calls } = createSupabaseMock({
      upsertResult: {
        data: [{ id: "grade-1", q_idx: 0, score: 95 }],
        error: null,
      },
    });

    const rows = await persistGrades(
      supabase as never,
      [
        {
          session_id: "session-1",
          q_idx: 0,
          score: 95,
          comment: "Great work",
          grade_type: "manual",
        },
      ],
      { select: "id, q_idx, score" }
    );

    expect(rows).toEqual([{ id: "grade-1", q_idx: 0, score: 95 }]);
    expect(calls).toEqual([
      {
        op: "upsert",
        records: [
          {
            session_id: "session-1",
            q_idx: 0,
            score: 95,
            comment: "Great work",
            grade_type: "manual",
          },
        ],
        options: { onConflict: "session_id,q_idx" },
        selectClause: "id, q_idx, score",
      },
    ]);
    expect(logErrorMock).not.toHaveBeenCalled();
  });

  it("falls back to select/update/insert and keeps manual grades when the DB constraint is missing", async () => {
    const { supabase, calls } = createSupabaseMock({
      upsertResult: {
        data: null,
        error: {
          code: "42P10",
          message:
            "there is no unique or exclusion constraint matching the ON CONFLICT specification",
        },
      },
      existingResult: {
        data: [
          {
            id: "manual-grade",
            q_idx: 0,
            created_at: "2026-03-01T00:00:00.000Z",
            grade_type: "manual",
          },
          {
            id: "duplicate-auto-grade",
            q_idx: 0,
            created_at: "2026-03-02T00:00:00.000Z",
            grade_type: "auto",
          },
          {
            id: "existing-q1",
            q_idx: 1,
            created_at: "2026-03-03T00:00:00.000Z",
            grade_type: "auto",
          },
        ],
        error: null,
      },
      updateResults: [
        { data: [{ id: "manual-grade", q_idx: 0, score: 91 }], error: null },
        { data: [{ id: "existing-q1", q_idx: 1, score: 84 }], error: null },
      ],
      insertResult: {
        data: [{ id: "inserted-q2", q_idx: 2, score: 77 }],
        error: null,
      },
    });

    const rows = await persistGrades(
      supabase as never,
      [
        {
          session_id: "session-1",
          q_idx: 0,
          score: 91,
          comment: "Updated manual score",
          grade_type: "manual",
        },
        {
          session_id: "session-1",
          q_idx: 1,
          score: 84,
          comment: "Update existing auto score",
          grade_type: "auto",
        },
        {
          session_id: "session-1",
          q_idx: 2,
          score: 77,
          comment: "Insert new score",
          grade_type: "ai_failed",
        },
      ],
      { select: "id, q_idx, score" }
    );

    expect(rows).toEqual([
      { id: "manual-grade", q_idx: 0, score: 91 },
      { id: "existing-q1", q_idx: 1, score: 84 },
      { id: "inserted-q2", q_idx: 2, score: 77 },
    ]);

    expect(calls).toEqual([
      {
        op: "upsert",
        records: [
          {
            session_id: "session-1",
            q_idx: 0,
            score: 91,
            comment: "Updated manual score",
            grade_type: "manual",
          },
          {
            session_id: "session-1",
            q_idx: 1,
            score: 84,
            comment: "Update existing auto score",
            grade_type: "auto",
          },
          {
            session_id: "session-1",
            q_idx: 2,
            score: 77,
            comment: "Insert new score",
            grade_type: "ai_failed",
          },
        ],
        options: { onConflict: "session_id,q_idx" },
        selectClause: "id, q_idx, score",
      },
      {
        op: "select-existing",
        selectClause: "id, q_idx, created_at, grade_type",
        eq: ["session_id", "session-1"],
        in: ["q_idx", [0, 1, 2]],
      },
      {
        op: "delete-duplicates",
        field: "id",
        values: ["duplicate-auto-grade"],
      },
      {
        op: "update",
        record: {
          session_id: "session-1",
          q_idx: 0,
          score: 91,
          comment: "Updated manual score",
          grade_type: "manual",
        },
        eq: ["id", "manual-grade"],
        selectClause: "id, q_idx, score",
      },
      {
        op: "update",
        record: {
          session_id: "session-1",
          q_idx: 1,
          score: 84,
          comment: "Update existing auto score",
          grade_type: "auto",
        },
        eq: ["id", "existing-q1"],
        selectClause: "id, q_idx, score",
      },
      {
        op: "insert",
        records: [
          {
            session_id: "session-1",
            q_idx: 2,
            score: 77,
            comment: "Insert new score",
            grade_type: "ai_failed",
          },
        ],
        selectClause: "id, q_idx, score",
      },
    ]);

    expect(logErrorMock).toHaveBeenCalledTimes(1);
  });
});
