import { describe, expect, it } from "vitest";
import {
  calculateOverallScore,
  deduplicateGrades,
  isScoringGrade,
  isSuccessfulGradeType,
} from "@/lib/grade-utils";

describe("grade-utils", () => {
  it("excludes ai_summary placeholder rows before deduplicating", () => {
    const grades = deduplicateGrades([
      { q_idx: 0, score: 0, grade_type: "ai_summary" },
      { q_idx: 0, score: 100, grade_type: "auto" },
      { q_idx: 1, score: 70, grade_type: "manual" },
    ]);

    expect(grades).toHaveLength(2);
    expect(grades.find((g) => g.q_idx === 0)).toMatchObject({
      score: 100,
      grade_type: "auto",
    });
  });

  it("does not count ai_summary or ai_failed rows in overall score", () => {
    expect(
      calculateOverallScore([
        { q_idx: 0, score: 0, grade_type: "ai_summary" },
        { q_idx: 1, score: 0, grade_type: "ai_failed" },
        { q_idx: 2, score: 80, grade_type: "manual" },
      ])
    ).toEqual({ overallScore: 80, gradedCount: 1 });
  });

  it("treats only finite non-placeholder grades as scoring grades", () => {
    expect(isScoringGrade({ score: 100, grade_type: "auto" })).toBe(true);
    expect(isScoringGrade({ score: 100, grade_type: "manual" })).toBe(true);
    expect(
      isScoringGrade({ score: 100, grade_type: "ai_summary" })
    ).toBe(false);
    expect(
      isScoringGrade({ score: 100, grade_type: "ai_failed" })
    ).toBe(false);
  });

  it("treats ai_summary and ai_failed as non-success grade types", () => {
    expect(isSuccessfulGradeType("auto")).toBe(true);
    expect(isSuccessfulGradeType("manual")).toBe(true);
    expect(isSuccessfulGradeType(undefined)).toBe(true);
    expect(isSuccessfulGradeType("ai_summary")).toBe(false);
    expect(isSuccessfulGradeType("ai_failed")).toBe(false);
  });
});
