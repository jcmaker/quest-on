/** Per-student progress on the instructor exam dashboard. */

export type ExamStudentSessionStatus = "not-started" | "in-progress" | "submitted";

export type ExamStudentOverallStatus =
  | "not-started"
  | "in-progress"
  | "pending"
  | "grading"
  | "ai_graded"
  | "manually_graded"
  | "failed";

export interface QuestionCountPair {
  correct: number;
  total: number;
}

export interface CaseProgress {
  graded: number;
  total: number;
}

export interface ExamStudentSummary {
  sessionId: string;
  studentId: string;
  name: string;
  studentNumber?: string;
  school?: string;
  email?: string;
  status: ExamStudentSessionStatus;
  submittedAt?: string;
  mcq: QuestionCountPair;
  ox: QuestionCountPair;
  caseProgress: CaseProgress;
  overallStatus: ExamStudentOverallStatus;
}

export type ExamStudentSummarySortOption =
  | "name"
  | "studentNumber"
  | "submittedAt"
  | "overallStatus";

/** 채점 현황 카드/행의 "서술" 칸에 표시할 상태 텍스트. */
export function caseStatusLabel(
  status: ExamStudentSessionStatus,
  caseProgress: CaseProgress,
): string {
  if (status !== "submitted" || caseProgress.total === 0) return "—";
  if (caseProgress.graded === 0) return `제출됨 0/${caseProgress.total}`;
  if (caseProgress.graded >= caseProgress.total)
    return `채점 완료 ${caseProgress.total}/${caseProgress.total}`;
  return `제출됨 ${caseProgress.graded}/${caseProgress.total}`;
}
