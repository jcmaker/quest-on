import { describe, expect, it } from "vitest";
import {
  calculateOverallScore,
  calculateScoreFromItems,
  calculateWeightedOverallScore,
  deduplicateGrades,
  isScoringGrade,
  isSuccessfulGradeType,
  normalizeScoreWeights,
  rebalanceScoreWeightsForBucket,
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

  it("withholds legacy final score when any case question is ungraded", () => {
    const result = calculateScoreFromItems(
      [
        { qIdx: 0, type: "multiple-choice", score: 100 },
        { qIdx: 1, type: "essay", score: null },
      ],
      null
    );

    expect(result).toMatchObject({
      mode: "legacy",
      overallScore: null,
      gradedCount: 1,
      totalCount: 2,
      incompleteBuckets: ["case"],
      ungradedBuckets: ["case"],
      isComplete: false,
    });
  });

  it("uses deterministic objective raw score over stale manual objective grade", () => {
    const result = calculateWeightedOverallScore({
      questions: [{ idx: 0, type: "multiple-choice" }],
      objectiveScores: [{ qIdx: 0, score: 100 }],
      grades: [{ q_idx: 0, score: 0, grade_type: "manual" }],
      scoreWeights: {
        version: 1,
        distribution: "equal_by_type",
        typeWeights: { "multiple-choice": 100 },
      },
    });

    expect(result.overallScore).toBe(100);
  });

  it("rejects malformed runtime score weights instead of silently normalizing them", () => {
    expect(
      normalizeScoreWeights({
        version: 2,
        distribution: "equal_by_type",
        typeWeights: { "multiple-choice": 100 },
      })
    ).toBeNull();
    expect(
      normalizeScoreWeights({
        version: 1,
        distribution: "equal_by_type",
        typeWeights: { "multiple-choice": 60 },
      })
    ).toBeNull();
  });

  it("rebalances score weights around the edited bucket while keeping total 100", () => {
    const result = rebalanceScoreWeightsForBucket(
      {
        version: 1,
        distribution: "equal_by_type",
        typeWeights: {
          "multiple-choice": 34,
          "true-false": 33,
          case: 33,
        },
      },
      ["multiple-choice", "true-false", "case"],
      "multiple-choice",
      50
    );

    expect(result.typeWeights).toEqual({
      "multiple-choice": 50,
      "true-false": 25,
      case: 25,
    });
    expect(
      Object.values(result.typeWeights).reduce(
        (sum, weight) => sum + (weight ?? 0),
        0
      )
    ).toBe(100);
  });

  it("clamps edited score weight so every present type keeps at least one point", () => {
    const result = rebalanceScoreWeightsForBucket(
      {
        version: 1,
        distribution: "equal_by_type",
        typeWeights: {
          "multiple-choice": 34,
          "true-false": 33,
          case: 33,
        },
      },
      ["multiple-choice", "true-false", "case"],
      "multiple-choice",
      100
    );

    expect(result.typeWeights).toEqual({
      "multiple-choice": 98,
      "true-false": 1,
      case: 1,
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
