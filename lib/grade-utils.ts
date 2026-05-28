/**
 * Grade deduplication and scoring utilities.
 * Used by: overview/route.ts, final-grades/route.ts, report/route.ts
 */

type GradeRow = {
  q_idx: number;
  score: number;
  grade_type?: string;
  [key: string]: unknown;
};

const GRADE_PRIORITY: Record<string, number> = {
  manual: 3,
  auto: 2,
  ai_failed: 1,
};

const EXCLUDED_GRADE_TYPES = new Set(["ai_failed", "ai_summary"]);

function isPlaceholderGrade(grade: Pick<GradeRow, "grade_type">): boolean {
  return grade.grade_type === "ai_summary";
}

export function isSuccessfulGradeType(gradeType?: string | null): boolean {
  return gradeType !== "ai_failed" && gradeType !== "ai_summary";
}

export function isScoringGrade(
  grade: { grade_type?: string | null; score?: number | null } | null | undefined
): grade is { grade_type?: string | null; score: number } {
  return (
    !!grade &&
    typeof grade.score === "number" &&
    Number.isFinite(grade.score) &&
    !EXCLUDED_GRADE_TYPES.has(grade.grade_type ?? "")
  );
}

/** Deduplicate grades: keep highest-priority grade per q_idx (manual > auto > ai_failed) */
export function deduplicateGrades<T extends GradeRow>(grades: T[]): T[] {
  const bestByIdx = new Map<number, T>();
  for (const grade of grades) {
    if (isPlaceholderGrade(grade)) continue;

    const existing = bestByIdx.get(grade.q_idx);
    const currentPriority = GRADE_PRIORITY[grade.grade_type || "auto"] ?? 2;
    const existingPriority = existing
      ? (GRADE_PRIORITY[existing.grade_type || "auto"] ?? 2)
      : 0;
    if (!existing || currentPriority > existingPriority) {
      bestByIdx.set(grade.q_idx, grade);
    }
  }
  return Array.from(bestByIdx.values());
}

/** Calculate overall score from grades, excluding non-scoring entries */
export function calculateOverallScore(
  grades: GradeRow[],
  _totalQuestionCount?: number
): { overallScore: number; gradedCount: number } {
  void _totalQuestionCount;
  const deduped = deduplicateGrades(grades);
  const valid = deduped.filter(isScoringGrade);
  if (valid.length === 0) return { overallScore: 0, gradedCount: 0 };
  const sum = valid.reduce((acc, g) => acc + g.score, 0);
  return {
    overallScore: Math.round(sum / valid.length),
    gradedCount: valid.length,
  };
}
