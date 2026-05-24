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
