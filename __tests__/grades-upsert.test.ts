import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/logger", () => ({
  logError: vi.fn(),
}));

import { upsertGradesBySessionQuestion } from "@/lib/grades-upsert";

function createMockSupabase(options: {
  upsertResult?: { data: Array<{ q_idx: number }> | null; error: unknown };
  updateResults?: Array<{ data: Array<{ q_idx: number }> | null; error: unknown }>;
  insertResults?: Array<{ data: { q_idx: number } | null; error: unknown }>;
}) {
  let updateCallIdx = 0;
  let insertCallIdx = 0;

  return {
    from: vi.fn(() => ({
      upsert: vi.fn(() => ({
        select: vi.fn().mockResolvedValue(
          options.upsertResult ?? { data: [], error: null }
        ),
      })),
      update: vi.fn(() => ({
        eq: vi.fn(() => ({
          eq: vi.fn(() => ({
            select: vi.fn().mockResolvedValue(
              options.updateResults?.[updateCallIdx++] ?? { data: [], error: null }
            ),
          })),
        })),
      })),
      insert: vi.fn(() => ({
        select: vi.fn(() => ({
          single: vi.fn().mockResolvedValue(
            options.insertResults?.[insertCallIdx++] ?? { data: null, error: null }
          ),
        })),
      })),
    })),
  };
}

describe("upsertGradesBySessionQuestion", () => {
  it("returns empty array for empty rows", async () => {
    const supabase = createMockSupabase({});
    const result = await upsertGradesBySessionQuestion(supabase as never, [], "test");
    expect(result).toEqual([]);
    expect(supabase.from).not.toHaveBeenCalled();
  });

  it("returns q_idx array on successful upsert", async () => {
    const supabase = createMockSupabase({
      upsertResult: { data: [{ q_idx: 0 }, { q_idx: 1 }], error: null },
    });

    const rows = [
      { session_id: "s1", q_idx: 0, score: 80 },
      { session_id: "s1", q_idx: 1, score: 90 },
    ];

    const result = await upsertGradesBySessionQuestion(supabase as never, rows, "test");
    expect(result).toEqual([0, 1]);
  });

  it("throws on non-constraint upsert errors", async () => {
    const supabase = createMockSupabase({
      upsertResult: { data: null, error: { code: "23505", message: "duplicate key" } },
    });

    const rows = [{ session_id: "s1", q_idx: 0, score: 80 }];
    await expect(
      upsertGradesBySessionQuestion(supabase as never, rows, "test")
    ).rejects.toEqual({ code: "23505", message: "duplicate key" });
  });

  it("falls back to update-then-insert on missing constraint (42P10)", async () => {
    const supabase = createMockSupabase({
      upsertResult: {
        data: null,
        error: {
          code: "42P10",
          message: "no unique or exclusion constraint matching the ON CONFLICT specification",
        },
      },
      updateResults: [
        { data: [{ q_idx: 0 }], error: null },
      ],
    });

    const rows = [{ session_id: "s1", q_idx: 0, score: 85 }];
    const result = await upsertGradesBySessionQuestion(supabase as never, rows, "test");
    expect(result).toEqual([0]);
  });

  it("falls back to insert when update finds no rows", async () => {
    const supabase = createMockSupabase({
      upsertResult: {
        data: null,
        error: {
          code: "42P10",
          message: "no unique or exclusion constraint",
        },
      },
      updateResults: [{ data: [], error: null }],
      insertResults: [{ data: { q_idx: 0 }, error: null }],
    });

    const rows = [{ session_id: "s1", q_idx: 0, score: 70 }];
    const result = await upsertGradesBySessionQuestion(supabase as never, rows, "test");
    expect(result).toEqual([0]);
  });

  it("throws when fallback update fails", async () => {
    const supabase = createMockSupabase({
      upsertResult: {
        data: null,
        error: { code: "42P10", message: "no unique constraint" },
      },
      updateResults: [{ data: null, error: { code: "500", message: "db error" } }],
    });

    const rows = [{ session_id: "s1", q_idx: 0, score: 60 }];
    await expect(
      upsertGradesBySessionQuestion(supabase as never, rows, "test")
    ).rejects.toEqual({ code: "500", message: "db error" });
  });

  it("throws when fallback insert fails", async () => {
    const supabase = createMockSupabase({
      upsertResult: {
        data: null,
        error: { code: "42P10", message: "no unique constraint" },
      },
      updateResults: [{ data: [], error: null }],
      insertResults: [{ data: null, error: { code: "23505", message: "already exists" } }],
    });

    const rows = [{ session_id: "s1", q_idx: 0, score: 50 }];
    await expect(
      upsertGradesBySessionQuestion(supabase as never, rows, "test")
    ).rejects.toEqual({ code: "23505", message: "already exists" });
  });

  it("handles multiple rows in fallback path", async () => {
    const supabase = createMockSupabase({
      upsertResult: {
        data: null,
        error: { code: "42P10", message: "no unique constraint" },
      },
      updateResults: [
        { data: [{ q_idx: 0 }], error: null },
        { data: [], error: null },
      ],
      insertResults: [
        { data: { q_idx: 1 }, error: null },
      ],
    });

    const rows = [
      { session_id: "s1", q_idx: 0, score: 80 },
      { session_id: "s1", q_idx: 1, score: 90 },
    ];
    const result = await upsertGradesBySessionQuestion(supabase as never, rows, "test");
    expect(result).toEqual([0, 1]);
  });
});
