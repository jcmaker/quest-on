import { describe, expect, it } from "vitest";
import { deduplicateGrades, calculateOverallScore } from "@/lib/grade-utils";

describe("deduplicateGrades", () => {
  it("returns single grade per q_idx when no duplicates", () => {
    const grades = [
      { q_idx: 0, score: 80, grade_type: "auto" },
      { q_idx: 1, score: 90, grade_type: "auto" },
    ];
    const result = deduplicateGrades(grades);
    expect(result.size).toBe(2);
    expect(result.get(0)?.score).toBe(80);
    expect(result.get(1)?.score).toBe(90);
  });

  it("prefers manual over auto for same q_idx", () => {
    const grades = [
      { q_idx: 0, score: 70, grade_type: "auto" },
      { q_idx: 0, score: 85, grade_type: "manual" },
    ];
    const result = deduplicateGrades(grades);
    expect(result.size).toBe(1);
    expect(result.get(0)?.score).toBe(85);
    expect(result.get(0)?.grade_type).toBe("manual");
  });

  it("prefers auto over ai_failed for same q_idx", () => {
    const grades = [
      { q_idx: 0, score: 0, grade_type: "ai_failed" },
      { q_idx: 0, score: 75, grade_type: "auto" },
    ];
    const result = deduplicateGrades(grades);
    expect(result.size).toBe(1);
    expect(result.get(0)?.score).toBe(75);
    expect(result.get(0)?.grade_type).toBe("auto");
  });

  it("prefers manual over ai_failed for same q_idx", () => {
    const grades = [
      { q_idx: 0, score: 0, grade_type: "ai_failed" },
      { q_idx: 0, score: 90, grade_type: "manual" },
    ];
    const result = deduplicateGrades(grades);
    expect(result.get(0)?.score).toBe(90);
    expect(result.get(0)?.grade_type).toBe("manual");
  });

  it("handles mixed q_idxs with duplicates", () => {
    const grades = [
      { q_idx: 0, score: 70, grade_type: "auto" },
      { q_idx: 0, score: 85, grade_type: "manual" },
      { q_idx: 1, score: 60, grade_type: "auto" },
      { q_idx: 1, score: 0, grade_type: "ai_failed" },
      { q_idx: 2, score: 0, grade_type: "ai_failed" },
    ];
    const result = deduplicateGrades(grades);
    expect(result.size).toBe(3);
    expect(result.get(0)?.grade_type).toBe("manual");
    expect(result.get(1)?.grade_type).toBe("auto");
    expect(result.get(2)?.grade_type).toBe("ai_failed");
  });

  it("treats missing grade_type as auto", () => {
    const grades = [
      { q_idx: 0, score: 70 },
      { q_idx: 0, score: 85, grade_type: "manual" },
    ];
    const result = deduplicateGrades(grades);
    expect(result.get(0)?.grade_type).toBe("manual");
  });

  it("returns empty map for empty input", () => {
    expect(deduplicateGrades([]).size).toBe(0);
  });
});

describe("calculateOverallScore", () => {
  it("calculates average across graded questions", () => {
    const grades = [
      { q_idx: 0, score: 80, grade_type: "auto" },
      { q_idx: 1, score: 60, grade_type: "auto" },
    ];
    const result = calculateOverallScore(grades);
    expect(result.overallScore).toBe(70);
    expect(result.gradedCount).toBe(2);
  });

  it("excludes ai_failed from score calculation", () => {
    const grades = [
      { q_idx: 0, score: 80, grade_type: "auto" },
      { q_idx: 1, score: 0, grade_type: "ai_failed" },
    ];
    const result = calculateOverallScore(grades);
    expect(result.overallScore).toBe(80);
    expect(result.gradedCount).toBe(1);
  });

  it("deduplicates before calculating (manual wins over auto)", () => {
    const grades = [
      { q_idx: 0, score: 70, grade_type: "auto" },
      { q_idx: 0, score: 90, grade_type: "manual" },
      { q_idx: 1, score: 80, grade_type: "auto" },
    ];
    const result = calculateOverallScore(grades);
    // manual(90) + auto(80) = 170 / 2 = 85
    expect(result.overallScore).toBe(85);
    expect(result.gradedCount).toBe(2);
  });

  it("returns 0 when only ai_failed grades exist", () => {
    const grades = [
      { q_idx: 0, score: 0, grade_type: "ai_failed" },
      { q_idx: 1, score: 0, grade_type: "ai_failed" },
    ];
    const result = calculateOverallScore(grades);
    expect(result.overallScore).toBe(0);
    expect(result.gradedCount).toBe(0);
  });

  it("returns 0 for empty grades", () => {
    const result = calculateOverallScore([]);
    expect(result.overallScore).toBe(0);
    expect(result.gradedCount).toBe(0);
  });

  it("passes through totalQuestionCount", () => {
    const grades = [{ q_idx: 0, score: 90, grade_type: "auto" }];
    const result = calculateOverallScore(grades, 5);
    expect(result.totalQuestionCount).toBe(5);
    expect(result.gradedCount).toBe(1);
  });

  it("rounds score to nearest integer", () => {
    const grades = [
      { q_idx: 0, score: 83, grade_type: "auto" },
      { q_idx: 1, score: 77, grade_type: "auto" },
      { q_idx: 2, score: 91, grade_type: "auto" },
    ];
    const result = calculateOverallScore(grades);
    // (83 + 77 + 91) / 3 = 83.666... → 84
    expect(result.overallScore).toBe(84);
  });
});
