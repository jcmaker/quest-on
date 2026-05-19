import { describe, it, expect } from "vitest";
import { createExamSchema } from "@/lib/validations";

// Shared skeleton for a minimal valid exam — tests spread and override as needed
const BASE_EXAM = {
  title: "테스트 시험",
  code: "TEST01",
  duration: 60,
  status: "draft",
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
};

const MCQ_QUESTION = {
  id: "q1",
  text: "다음 중 올바른 것은?",
  type: "multiple-choice" as const,
  options: ["선택지1", "선택지2", "선택지3", "선택지4"],
  correctOptionIndex: 2,
};

const TRUE_FALSE_QUESTION = {
  id: "q2",
  text: "지구는 둥글다.",
  type: "true-false" as const,
  options: ["O", "X"],
  correctOptionIndex: 0,
};

const ESSAY_QUESTION = {
  id: "q3",
  text: "자유롭게 서술하시오.",
  type: "essay" as const,
};

describe("createExamSchema — objective question refines", () => {
  // ── MCQ happy path ──────────────────────────────────────────────────────────

  it("valid MCQ question passes", () => {
    const result = createExamSchema.safeParse({
      ...BASE_EXAM,
      questions: [MCQ_QUESTION],
    });
    expect(result.success).toBe(true);
  });

  // ── correctOptionIndex presence ─────────────────────────────────────────────

  it("MCQ missing correctOptionIndex fails", () => {
    const { correctOptionIndex: _omit, ...qWithout } = MCQ_QUESTION;
    const result = createExamSchema.safeParse({
      ...BASE_EXAM,
      questions: [qWithout],
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const paths = result.error.errors.map((e) => e.path.join("."));
      expect(paths.some((p) => p.includes("correctOptionIndex"))).toBe(true);
    }
  });

  it("true-false missing correctOptionIndex fails", () => {
    const { correctOptionIndex: _omit, ...qWithout } = TRUE_FALSE_QUESTION;
    const result = createExamSchema.safeParse({
      ...BASE_EXAM,
      questions: [qWithout],
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const paths = result.error.errors.map((e) => e.path.join("."));
      expect(paths.some((p) => p.includes("correctOptionIndex"))).toBe(true);
    }
  });

  // ── out-of-bounds correctOptionIndex ───────────────────────────────────────

  it("MCQ correctOptionIndex equal to options.length fails (out-of-bounds)", () => {
    const result = createExamSchema.safeParse({
      ...BASE_EXAM,
      questions: [{ ...MCQ_QUESTION, correctOptionIndex: 4 }], // 4 options → index 4 is OOB
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const paths = result.error.errors.map((e) => e.path.join("."));
      expect(paths.some((p) => p.includes("correctOptionIndex"))).toBe(true);
    }
  });

  it("MCQ correctOptionIndex within bounds passes", () => {
    const result = createExamSchema.safeParse({
      ...BASE_EXAM,
      questions: [{ ...MCQ_QUESTION, correctOptionIndex: 0 }],
    });
    expect(result.success).toBe(true);
  });

  it("MCQ correctOptionIndex = options.length - 1 (last valid index) passes", () => {
    const result = createExamSchema.safeParse({
      ...BASE_EXAM,
      questions: [{ ...MCQ_QUESTION, correctOptionIndex: 3 }],
    });
    expect(result.success).toBe(true);
  });

  // ── MCQ blank option ────────────────────────────────────────────────────────

  it("MCQ with a blank option fails", () => {
    const result = createExamSchema.safeParse({
      ...BASE_EXAM,
      questions: [
        { ...MCQ_QUESTION, options: ["선택지1", "  ", "선택지3", "선택지4"] },
      ],
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const paths = result.error.errors.map((e) => e.path.join("."));
      expect(paths.some((p) => p.includes("options"))).toBe(true);
    }
  });

  it("MCQ with fewer than 4 options fails", () => {
    const result = createExamSchema.safeParse({
      ...BASE_EXAM,
      questions: [
        { ...MCQ_QUESTION, options: ["선택지1", "선택지2", "선택지3"] },
      ],
    });
    expect(result.success).toBe(false);
  });

  // ── O·X (true-false) ────────────────────────────────────────────────────────

  it("valid true-false question passes", () => {
    const result = createExamSchema.safeParse({
      ...BASE_EXAM,
      questions: [TRUE_FALSE_QUESTION],
    });
    expect(result.success).toBe(true);
  });

  it("true-false with a blank option fails", () => {
    const result = createExamSchema.safeParse({
      ...BASE_EXAM,
      questions: [{ ...TRUE_FALSE_QUESTION, options: ["O", "  "] }],
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const paths = result.error.errors.map((e) => e.path.join("."));
      expect(paths.some((p) => p.includes("options"))).toBe(true);
    }
  });

  it("true-false with fewer than 2 options fails", () => {
    const result = createExamSchema.safeParse({
      ...BASE_EXAM,
      questions: [{ ...TRUE_FALSE_QUESTION, options: ["O"] }],
    });
    expect(result.success).toBe(false);
  });

  it("true-false correctOptionIndex out-of-bounds fails", () => {
    const result = createExamSchema.safeParse({
      ...BASE_EXAM,
      questions: [{ ...TRUE_FALSE_QUESTION, correctOptionIndex: 2 }], // options has 2 items → OOB
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const paths = result.error.errors.map((e) => e.path.join("."));
      expect(paths.some((p) => p.includes("correctOptionIndex"))).toBe(true);
    }
  });

  // ── Essay / open-ended — no objective constraints ───────────────────────────

  it("essay question with no options and no correctOptionIndex passes", () => {
    const result = createExamSchema.safeParse({
      ...BASE_EXAM,
      questions: [ESSAY_QUESTION],
    });
    expect(result.success).toBe(true);
  });

  it("short-answer question passes without options", () => {
    const result = createExamSchema.safeParse({
      ...BASE_EXAM,
      questions: [{ id: "q4", text: "간단히 답하시오.", type: "short-answer" as const }],
    });
    expect(result.success).toBe(true);
  });

  // ── Mixed question list ──────────────────────────────────────────────────────

  it("exam with MCQ, true-false, and essay all valid passes", () => {
    const result = createExamSchema.safeParse({
      ...BASE_EXAM,
      questions: [MCQ_QUESTION, TRUE_FALSE_QUESTION, ESSAY_QUESTION],
    });
    expect(result.success).toBe(true);
  });
});
