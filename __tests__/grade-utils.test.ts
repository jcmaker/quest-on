import { describe, expect, it } from "vitest";
import {
  calculateOverallScore,
  calculateWeightedOverallScore,
  deduplicateGrades,
  isScoringGrade,
  isSuccessfulGradeType,
  type ScoreWeights,
} from "@/lib/grade-utils";

describe("grade-utils", () => {
  const scoreWeights: ScoreWeights = {
    version: 1,
    distribution: "equal_by_type",
    typeWeights: {
      "multiple-choice": 40,
      "true-false": 20,
      case: 40,
    },
  };

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

  it("combines objective raw scores and deduped case grades with configured weights", () => {
    const result = calculateWeightedOverallScore({
      questions: [
        { idx: 0, type: "multiple-choice" },
        { idx: 1, type: "true-false" },
        { idx: 2, type: "essay" },
      ],
      objectiveScores: [
        { qIdx: 0, score: 100 },
        { q_idx: 1, score: 0 },
      ],
      caseGrades: [
        { q_idx: 2, score: 0, grade_type: "ai_summary" },
        { q_idx: 2, score: 20, grade_type: "ai_failed" },
        { q_idx: 2, score: 60, grade_type: "auto" },
        { q_idx: 2, score: 90, grade_type: "manual" },
      ],
      scoreWeights,
    });

    expect(result).toMatchObject({
      mode: "weighted",
      overallScore: 76,
      gradedCount: 3,
      totalCount: 3,
      incompleteBuckets: [],
      missingBuckets: [],
      ungradedBuckets: [],
      isComplete: true,
    });
    expect(result.bucketMeta["multiple-choice"]).toMatchObject({
      averageScore: 100,
      contribution: 40,
      status: "scored",
    });
    expect(result.bucketMeta["true-false"]).toMatchObject({
      averageScore: 0,
      contribution: 0,
      status: "scored",
    });
    expect(result.bucketMeta.case).toMatchObject({
      averageScore: 90,
      contribution: 36,
      status: "scored",
    });
  });

  it("returns null overall score metadata when a weighted type has no questions", () => {
    const result = calculateWeightedOverallScore({
      questions: [
        { idx: 0, type: "multiple-choice" },
        { idx: 2, type: "case" },
      ],
      objectiveScores: [{ qIdx: 0, score: 100 }],
      caseGrades: [{ q_idx: 2, score: 80, grade_type: "manual" }],
      scoreWeights,
    });

    expect(result.overallScore).toBeNull();
    expect(result.missingBuckets).toEqual(["true-false"]);
    expect(result.ungradedBuckets).toEqual([]);
    expect(result.bucketMeta["true-false"]).toMatchObject({
      averageScore: null,
      contribution: null,
      status: "missing",
      totalCount: 0,
    });
  });

  it("returns null overall score metadata when a weighted type is ungraded", () => {
    const result = calculateWeightedOverallScore({
      questions: [
        { idx: 0, type: "multiple-choice" },
        { idx: 2, type: "case" },
      ],
      objectiveScores: [{ qIdx: 0, score: 100 }],
      scoreWeights: {
        version: 1,
        distribution: "equal_by_type",
        typeWeights: {
          "multiple-choice": 50,
          case: 50,
        },
      },
    });

    expect(result.overallScore).toBeNull();
    expect(result.missingBuckets).toEqual([]);
    expect(result.ungradedBuckets).toEqual(["case"]);
    expect(result.bucketMeta.case).toMatchObject({
      averageScore: null,
      contribution: null,
      gradedCount: 0,
      totalCount: 1,
      status: "ungraded",
    });
  });

  it("keeps legacy calculateOverallScore behavior when score weights are absent", () => {
    const result = calculateWeightedOverallScore({
      grades: [
        { q_idx: 0, score: 0, grade_type: "ai_summary" },
        { q_idx: 1, score: 0, grade_type: "ai_failed" },
        { q_idx: 2, score: 80, grade_type: "manual" },
      ],
      scoreWeights: null,
    });

    expect(result).toMatchObject({
      mode: "legacy",
      overallScore: 80,
      gradedCount: 1,
      isComplete: true,
    });
  });
});
