import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";
import { currentUser } from "@/lib/get-current-user";
import { successJson, errorJson } from "@/lib/api-response";
import { validateUUID } from "@/lib/validate-params";
import { checkRateLimitAsync, RATE_LIMITS } from "@/lib/rate-limit";
import { batchGetUserInfo } from "@/lib/app-users";
import {
  gradeObjectiveAnswer,
  normalizeQuestions,
  selectBestSubmission,
} from "@/lib/grading-helpers";
import { deduplicateGrades } from "@/lib/grade-utils";
import { logError } from "@/lib/logger";
import type {
  ExamStudentOverallStatus,
  ExamStudentSessionStatus,
  ExamStudentSummary,
} from "@/lib/types/student-summary";
import type { GradingProgress } from "@/lib/types/grading";

function getSupabase() {
  return getSupabaseServer();
}

function isCaseQuestion(type?: string): boolean {
  return type === "essay" || type === "short-answer";
}

function isCaseGraded(gradeType?: string): boolean {
  return gradeType === "manual" || gradeType === "auto";
}

/** Session statuses that should appear on the instructor dashboard. */
const VISIBLE_SESSION_STATUSES = new Set([
  "joined",
  "waiting",
  "in_progress",
  "submitted",
  "auto_submitted",
  "locked",
  "closed", // waiting room closed when exam ends
  "late_pending",
  "denied",
]);

const EXCLUDED_SESSION_STATUSES = new Set(["not_joined"]);

type SessionRow = {
  id: string;
  student_id: string;
  submitted_at: string | null;
  created_at: string | null;
  status: string | null;
  grading_progress: GradingProgress | null;
};

function pickSessionForStudent(sessions: SessionRow[]): SessionRow | null {
  if (sessions.length === 0) return null;

  const submitted = sessions
    .filter((s) => s.submitted_at != null)
    .sort(
      (a, b) =>
        new Date(b.submitted_at!).getTime() - new Date(a.submitted_at!).getTime()
    );

  const inProgress = sessions
    .filter((s) => s.submitted_at == null)
    .sort(
      (a, b) =>
        new Date(b.created_at ?? 0).getTime() -
        new Date(a.created_at ?? 0).getTime()
    );

  return submitted[0] ?? inProgress[0] ?? sessions[0];
}

function deriveSessionStatus(session: SessionRow | null): ExamStudentSessionStatus {
  if (!session) return "not-started";
  if (session.submitted_at) return "submitted";
  const status = session.status ?? "";
  if (
    status === "in_progress" ||
    status === "joined" ||
    status === "waiting" ||
    status === "late_pending"
  ) {
    return "in-progress";
  }
  if (VISIBLE_SESSION_STATUSES.has(status)) {
    return "in-progress";
  }
  return "in-progress";
}

function isVisibleSession(session: SessionRow): boolean {
  const status = session.status ?? "";
  if (EXCLUDED_SESSION_STATUSES.has(status)) return false;
  if (session.submitted_at != null) return true;
  if (VISIBLE_SESSION_STATUSES.has(status)) return true;
  // Legacy rows with empty status but an existing session row
  return status === "";
}

function deriveOverallStatus(params: {
  sessionStatus: ExamStudentSessionStatus;
  caseTotal: number;
  caseGraded: number;
  hasManualCase: boolean;
  hasFailed: boolean;
  gradingProgress: GradingProgress | null;
}): ExamStudentOverallStatus {
  const { sessionStatus, caseTotal, caseGraded, hasManualCase, hasFailed, gradingProgress } =
    params;

  if (sessionStatus === "not-started") return "not-started";
  if (sessionStatus === "in-progress") return "in-progress";
  if (hasFailed) return "failed";

  const gpStatus = gradingProgress?.status;
  if (gpStatus === "running" || gpStatus === "queued") {
    return "grading";
  }

  if (caseTotal > 0 && caseGraded < caseTotal) {
    return gpStatus === "failed" ? "failed" : "grading";
  }

  if (hasManualCase) return "manually_graded";
  if (caseTotal > 0 && caseGraded === caseTotal) return "ai_graded";
  if (caseTotal === 0) return "ai_graded";

  return "pending";
}

function isObjectiveCorrect(params: {
  qIdx: number;
  gradeScore: number | undefined;
  rawAnswer: string;
  options?: string[];
  correctOptionIndex?: number;
}): boolean {
  if (params.gradeScore === 100) return true;
  if (params.gradeScore !== undefined && params.gradeScore !== 100) return false;

  const result = gradeObjectiveAnswer({
    rawAnswer: params.rawAnswer,
    options: params.options,
    correctOptionIndex: params.correctOptionIndex,
  });
  return result?.score === 100;
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ examId: string }> }
) {
  try {
    const { examId } = await params;

    const invalidId = validateUUID(examId, "examId");
    if (invalidId) return invalidId;

    const user = await currentUser();
    if (!user) {
      return errorJson("UNAUTHORIZED", "Unauthorized", 401);
    }

    const rl = await checkRateLimitAsync(
      `student-summaries:${user.id}`,
      RATE_LIMITS.sessionRead
    );
    if (!rl.allowed) {
      return errorJson("RATE_LIMITED", "Too many requests. Please try again later.", 429);
    }

    if (user.role !== "instructor") {
      return errorJson("FORBIDDEN", "Forbidden", 403);
    }

    const supabase = getSupabase();

    const { data: exam, error: examError } = await supabase
      .from("exams")
      .select("id, instructor_id, questions")
      .eq("id", examId)
      .single();

    if (examError || !exam) {
      return errorJson("NOT_FOUND", "Exam not found", 404);
    }

    if (exam.instructor_id !== user.id) {
      return errorJson("FORBIDDEN", "Forbidden", 403);
    }

    const questions = normalizeQuestions(exam.questions);
    const mcqIndices = questions
      .filter((q) => q.type === "multiple-choice")
      .map((q) => q.idx);
    const oxIndices = questions.filter((q) => q.type === "true-false").map((q) => q.idx);
    const caseIndices = questions.filter((q) => isCaseQuestion(q.type)).map((q) => q.idx);

    const questionByIdx = new Map(questions.map((q) => [q.idx, q]));

    const { data: sessions, error: sessionsError } = await supabase
      .from("sessions")
      .select("id, student_id, submitted_at, created_at, status, grading_progress")
      .eq("exam_id", examId);

    if (sessionsError) {
      return errorJson("INTERNAL_ERROR", "Failed to fetch sessions", 500);
    }

    const activeSessions = (sessions ?? []).filter((s) =>
      isVisibleSession(s as SessionRow)
    ) as SessionRow[];

    const sessionsByStudent = new Map<string, SessionRow[]>();
    for (const session of activeSessions) {
      const list = sessionsByStudent.get(session.student_id) ?? [];
      list.push(session);
      sessionsByStudent.set(session.student_id, list);
    }

    const selectedSessions: SessionRow[] = [];
    const sessionIds: string[] = [];

    sessionsByStudent.forEach((studentSessions) => {
      const picked = pickSessionForStudent(studentSessions);
      if (picked) {
        selectedSessions.push(picked);
        sessionIds.push(picked.id);
      }
    });

    if (sessionIds.length === 0) {
      return successJson({ students: [] as ExamStudentSummary[] });
    }

    const studentIds = [...new Set(selectedSessions.map((s) => s.student_id))];

    const [submissionsResult, gradesResult, profilesResult, clerkMap] =
      await Promise.all([
        supabase
          .from("submissions")
          .select("session_id, q_idx, answer, created_at")
          .in("session_id", sessionIds),
        supabase
          .from("grades")
          .select("session_id, q_idx, score, grade_type")
          .in("session_id", sessionIds),
        supabase
          .from("student_profiles")
          .select("student_id, name, student_number, school")
          .in("student_id", studentIds),
        batchGetUserInfo(studentIds),
      ]);

    if (submissionsResult.error) {
      return errorJson("INTERNAL_ERROR", "Failed to fetch submissions", 500);
    }
    if (gradesResult.error) {
      return errorJson("INTERNAL_ERROR", "Failed to fetch grades", 500);
    }

    const profileMap = new Map<
      string,
      { name?: string; student_number?: string; school?: string }
    >();
    for (const profile of profilesResult.data ?? []) {
      profileMap.set(profile.student_id, {
        name: profile.name ?? undefined,
        student_number: profile.student_number ?? undefined,
        school: profile.school ?? undefined,
      });
    }

    const submissionsBySession = new Map<string, Map<number, Record<string, unknown>>>();
    for (const sub of submissionsResult.data ?? []) {
      if (!submissionsBySession.has(sub.session_id)) {
        submissionsBySession.set(sub.session_id, new Map());
      }
      const byQ = submissionsBySession.get(sub.session_id)!;
      const qIdx = sub.q_idx as number;
      const existing = byQ.get(qIdx);
      if (!existing) {
        byQ.set(qIdx, sub);
      } else {
        byQ.set(qIdx, selectBestSubmission([existing, sub]));
      }
    }

    const gradesBySession = new Map<string, ReturnType<typeof deduplicateGrades>>();
    const rawGradesBySession = new Map<string, typeof gradesResult.data>();
    for (const grade of gradesResult.data ?? []) {
      if (!rawGradesBySession.has(grade.session_id)) {
        rawGradesBySession.set(grade.session_id, []);
      }
      rawGradesBySession.get(grade.session_id)!.push(grade);
    }
    rawGradesBySession.forEach((grades, sessionId) => {
      gradesBySession.set(sessionId, deduplicateGrades(grades));
    });

    const students: ExamStudentSummary[] = selectedSessions.map((session) => {
      const studentId = session.student_id;
      const profile = profileMap.get(studentId);
      const clerk = clerkMap.get(studentId);
      const name =
        profile?.name || clerk?.name || `Student ${studentId.slice(0, 8)}`;
      const email = clerk?.email;

      const sessionStatus = deriveSessionStatus(session);
      const dedupedGrades = gradesBySession.get(session.id) ?? [];
      const gradeByQ = new Map(dedupedGrades.map((g) => [g.q_idx, g]));
      const rawGrades = rawGradesBySession.get(session.id) ?? [];
      const subsByQ = submissionsBySession.get(session.id) ?? new Map();

      let mcqCorrect = 0;
      for (const qIdx of mcqIndices) {
        const q = questionByIdx.get(qIdx);
        const grade = gradeByQ.get(qIdx);
        const sub = subsByQ.get(qIdx);
        const rawAnswer = (sub?.answer as string) ?? "";
        if (
          isObjectiveCorrect({
            qIdx,
            gradeScore: grade?.score,
            rawAnswer,
            options: q?.options,
            correctOptionIndex: q?.correctOptionIndex,
          })
        ) {
          mcqCorrect += 1;
        }
      }

      let oxCorrect = 0;
      for (const qIdx of oxIndices) {
        const q = questionByIdx.get(qIdx);
        const grade = gradeByQ.get(qIdx);
        const sub = subsByQ.get(qIdx);
        const rawAnswer = (sub?.answer as string) ?? "";
        if (
          isObjectiveCorrect({
            qIdx,
            gradeScore: grade?.score,
            rawAnswer,
            options: q?.options,
            correctOptionIndex: q?.correctOptionIndex,
          })
        ) {
          oxCorrect += 1;
        }
      }

      let caseGraded = 0;
      let hasManualCase = false;
      let hasFailed = false;

      for (const qIdx of caseIndices) {
        const caseGrades = rawGrades.filter((g) => g.q_idx === qIdx);
        const best = caseGrades.sort((a, b) => {
          const prio = (t?: string) =>
            t === "manual" ? 3 : t === "auto" ? 2 : t === "ai_failed" ? 1 : 0;
          return prio(b.grade_type) - prio(a.grade_type);
        })[0];

        if (best?.grade_type === "ai_failed") {
          hasFailed = true;
        }
        if (isCaseGraded(best?.grade_type)) {
          caseGraded += 1;
          if (best.grade_type === "manual") {
            hasManualCase = true;
          }
        }
      }

      const overallStatus = deriveOverallStatus({
        sessionStatus,
        caseTotal: caseIndices.length,
        caseGraded,
        hasManualCase,
        hasFailed,
        gradingProgress: session.grading_progress,
      });

      return {
        sessionId: session.id,
        studentId,
        name,
        studentNumber: profile?.student_number,
        school: profile?.school,
        email,
        status: sessionStatus,
        submittedAt: session.submitted_at ?? undefined,
        mcq: { correct: mcqCorrect, total: mcqIndices.length },
        ox: { correct: oxCorrect, total: oxIndices.length },
        caseProgress: { graded: caseGraded, total: caseIndices.length },
        overallStatus,
      };
    });

    return successJson({ students });
  } catch (error) {
    logError("student-summaries GET handler error", error, {
      path: "/api/exam/[examId]/student-summaries",
    });
    return errorJson("INTERNAL_ERROR", "Internal server error", 500);
  }
}
