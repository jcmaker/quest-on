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

/** Deduplicate grades: keep highest-priority grade per q_idx (manual > auto > ai_failed) */
export function deduplicateGrades<T extends GradeRow>(grades: T[]): T[] {
  const bestByIdx = new Map<number, T>();
  for (const grade of grades) {
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

/** Calculate overall score from grades, excluding ai_failed entries */
export function calculateOverallScore(
  grades: GradeRow[],
  _totalQuestionCount?: number
): { overallScore: number; gradedCount: number } {
  const deduped = deduplicateGrades(grades);
  const valid = deduped.filter((g) => g.grade_type !== "ai_failed");
  if (valid.length === 0) return { overallScore: 0, gradedCount: 0 };
  const sum = valid.reduce((acc, g) => acc + g.score, 0);
  return {
    overallScore: Math.round(sum / valid.length),
    gradedCount: valid.length,
  };
}
