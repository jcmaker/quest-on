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
