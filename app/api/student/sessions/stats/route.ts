import { NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";
import { currentUser } from "@/lib/get-current-user";
import { successJson, errorJson } from "@/lib/api-response";
import { checkRateLimitAsync, RATE_LIMITS } from "@/lib/rate-limit";

// Initialize Supabase client
const supabase = getSupabaseServer();

export async function GET() {
  try {
    const user = await currentUser();

    if (!user) {
      return errorJson("UNAUTHORIZED", "Unauthorized", 401);
    }

    // Check if user is student
    const userRole = user.unsafeMetadata?.role as string;
    if (userRole !== "student") {
      return errorJson("STUDENT_ACCESS_REQUIRED", "Student access required", 403);
    }

    const rl = await checkRateLimitAsync(`student-sessions-stats:${user.id}`, RATE_LIMITS.sessionRead);
    if (!rl.allowed) {
      return errorJson("RATE_LIMITED", "Too many requests. Please try again later.", 429);
    }

    // Get all sessions for this student (for stats only, no pagination)
    const { data: sessions, error: sessionsError } = await supabase
      .from("sessions")
      .select("id, exam_id, submitted_at, created_at")
      .eq("student_id", user.id);

    if (sessionsError) {
      throw sessionsError;
    }

    if (!sessions || sessions.length === 0) {
      return successJson({
        totalSessions: 0,
        completedSessions: 0,
        inProgressSessions: 0,
        unsubmittedAssignments: 0,
        unsubmittedAssignmentItems: [],
        overallAverageScore: null,
      });
    }

    const completedSessions = sessions.filter((s) => s.submitted_at !== null);
    const inProgressSessions = sessions.filter((s) => s.submitted_at === null);
    const inProgressExamIds = [
      ...new Set(inProgressSessions.map((s) => s.exam_id).filter(Boolean)),
    ];

    let unsubmittedAssignments = 0;
    let unsubmittedAssignmentItems: Array<{
      sessionId: string;
      examId: string;
      examTitle: string;
      examCode: string;
      deadline: string | null;
      createdAt: string;
    }> = [];
    if (inProgressExamIds.length > 0) {
      const { data: exams, error: examsError } = await supabase
        .from("exams")
        .select("id, title, code, type, duration, deadline")
        .in("id", inProgressExamIds);

      if (examsError) {
        throw examsError;
      }

      const typeByExamId = new Map(
        (exams || []).map((exam) => [exam.id, exam.type || null])
      );
      unsubmittedAssignments = inProgressSessions.filter((session) => {
        const t = typeByExamId.get(session.exam_id);
        return t != null && t !== "exam";
      }).length;

      const assignmentExamById = new Map(
        (exams || [])
          .filter((exam) => exam.type != null && exam.type !== "exam")
          .map((exam) => [exam.id, exam])
      );
      unsubmittedAssignmentItems = inProgressSessions
        .map((session) => {
          const exam = assignmentExamById.get(session.exam_id);
          if (!exam) return null;
          return {
            sessionId: session.id,
            examId: session.exam_id,
            examTitle: exam.title || "제목 없음",
            examCode: exam.code || "",
            deadline: exam.deadline || null,
            createdAt: session.created_at,
          };
        })
        .filter((item): item is NonNullable<typeof item> => item !== null);

      // Filter out past-deadline items (auto-submitted)
      const now = new Date().toISOString();
      unsubmittedAssignmentItems = unsubmittedAssignmentItems.filter(
        (item) => !item.deadline || item.deadline > now
      );
      unsubmittedAssignments = unsubmittedAssignmentItems.length;
    }

    // Get all grades for completed sessions to calculate overall average
    const sessionIds = completedSessions.map((s) => s.id);
    
    if (sessionIds.length === 0) {
      return successJson({
        totalSessions: sessions.length,
        completedSessions: completedSessions.length,
        inProgressSessions: inProgressSessions.length,
        unsubmittedAssignments,
        unsubmittedAssignmentItems,
        overallAverageScore: null,
      });
    }

    const { data: allGrades, error: gradesError } = await supabase
      .from("grades")
      .select("session_id, score")
      .in("session_id", sessionIds);

    if (gradesError) {
      // Non-critical: grades fetch failed
    }

    // Calculate overall average score
    let overallAverageScore: number | null = null;
    if (allGrades && allGrades.length > 0) {
      // Group grades by session_id
      const gradesBySession = new Map<string, number[]>();
      allGrades.forEach((grade) => {
        if (!gradesBySession.has(grade.session_id)) {
          gradesBySession.set(grade.session_id, []);
        }
        gradesBySession.get(grade.session_id)!.push(grade.score);
      });

      // Calculate average for each session, then overall average
      const sessionAverages: number[] = [];
      gradesBySession.forEach((scores) => {
        const sessionAvg = scores.reduce((sum, score) => sum + score, 0) / scores.length;
        sessionAverages.push(sessionAvg);
      });

      if (sessionAverages.length > 0) {
        overallAverageScore = Math.round(
          sessionAverages.reduce((sum, avg) => sum + avg, 0) / sessionAverages.length
        );
      }
    }

    return successJson({
      totalSessions: sessions.length,
      completedSessions: completedSessions.length,
      inProgressSessions: inProgressSessions.length,
      unsubmittedAssignments,
      unsubmittedAssignmentItems,
      overallAverageScore,
    });
  } catch (error) {
    return errorJson("FETCH_STATS_FAILED", "Failed to get student stats", 500);
  }
}

