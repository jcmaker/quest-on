/** Shared exam-related type definitions */

export interface ExamQuestion {
  id: string;
  text: string;
  type: string;
  points?: number;
  title?: string;
  idx?: number;
  prompt?: string;
  ai_context?: string | null;
  options?: string[];
  correctAnswer?: string;
}

export interface Exam {
  id: string;
  title: string;
  code: string;
  description: string;
  duration: number;
  questions: ExamQuestion[];
  status: string;
  startTime?: string;
  endTime?: string;
  rubric?: Array<{
    id?: string;
    evaluationArea: string;
    detailedCriteria: string;
  }>;
  rubric_public?: boolean;
  allow_draft_in_waiting?: boolean;
  allow_chat_in_waiting?: boolean;
}

export interface DraftAnswer {
  questionId: string;
  text: string;
  lastSaved?: string;
}

export interface ExamSession {
  id: string;
  examCode: string;
  examTitle: string;
  status: "completed" | "in-progress" | "pending";
  score: number | null;
  maxScore: number | null;
  questionCount: number;
  submittedAt: string | null;
  createdAt: string;
  examId: string;
}
