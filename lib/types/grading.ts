export type StageKey = "chat" | "answer";

export type AiDependencyRiskLevel = "low" | "medium" | "high";

export interface AiDependencyAssessment {
  delegationRequestCount: number;
  startingPointDependencyCount: number;
  directAnswerRequestCount: number;
  directAnswerRelianceCount: number;
  recoveryObserved: boolean;
  recoveryEvidence: string[];
  triggerEvidence: string[];
  finalAnswerOverlapScore: number;
  overallRisk: AiDependencyRiskLevel;
  penaltyApplied: number;
  summary: string;
}

export interface StageGrade {
  score: number;
  comment: string;
  rubric_scores?: Record<string, number>;
  ai_dependency?: AiDependencyAssessment;
}

export interface StageGrading {
  chat?: StageGrade;
  answer?: StageGrade;
  feedback?: { score: number; comment: string };
  /** Set to true when AI returned out-of-range scores that were clamped */
  _score_clamped?: boolean;
}

export interface AiDependencySummary {
  overallRisk: AiDependencyRiskLevel;
  recoveryObserved: boolean;
  triggerCount: number;
  summary: string;
  triggerEvidence: string[];
  recoveryEvidence: string[];
  questionBreakdown: Array<{
    q_idx: number;
    overallRisk: AiDependencyRiskLevel;
    recoveryObserved: boolean;
    summary: string;
  }>;
}

export interface SummaryData {
  sentiment: "positive" | "negative" | "neutral";
  summary: string;
  strengths: string[];
  weaknesses: string[];
  keyQuotes?: string[];
  aiDependency?: AiDependencySummary | null;
}

/**
 * Per-question AI summary stored on grades.ai_summary.
 * Lighter than SummaryData — scoped to a single question.
 */
export interface QuestionSummaryData {
  sentiment: "positive" | "negative" | "neutral";
  summary: string;
  strengths: string[];
  weaknesses: string[];
  keyQuotes?: string[];
}

/**
 * Real-time grading progress stored on sessions.grading_progress.
 * Updated by autoGradeSession as each question finishes so the
 * student report page and instructor grading list can show
 * "n/m 채점 완료" progress bars instead of an opaque spinner.
 */
export type GradingProgressStatus =
  | "queued"
  | "running"
  | "completed"
  | "failed";

export interface GradingProgress {
  status: GradingProgressStatus;
  total: number;
  completed: number;
  failed: number;
  updated_at: string;
}
