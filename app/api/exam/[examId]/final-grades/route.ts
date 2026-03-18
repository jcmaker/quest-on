import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";
import { currentUser } from "@/lib/get-current-user";
import { successJson, errorJson } from "@/lib/api-response";
import { validateUUID } from "@/lib/validate-params";
import { checkRateLimitAsync, RATE_LIMITS } from "@/lib/rate-limit";
import { deduplicateGrades, calculateOverallScore } from "@/lib/grade-utils";

// P1-4: Lazy Supabase getter to avoid stale connections in serverless
function getSupabase() {
  return getSupabaseServer();
}

export async function GET(
  request: NextRequest,
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

    // P1-5: Rate limiting for expensive query
    const rl = await checkRateLimitAsync(`final-grades:${user.id}`, RATE_LIMITS.sessionRead);
    if (!rl.allowed) {
      return errorJson("RATE_LIMITED", "Too many requests. Please try again later.", 429);
    }

    // Check if user is instructor
    const userRole = user.unsafeMetadata?.role as string;
    if (userRole !== "instructor") {
      return errorJson("FORBIDDEN", "Forbidden", 403);
    }

    // Get exam and sessions in parallel (both only need examId param)
    const [examResult, sessionsResult] = await Promise.all([
      supabase.from("exams").select("instructor_id").eq("id", examId).single(),
      supabase.from("sessions").select("id").eq("exam_id", examId),
    ]);

    if (examResult.error || !examResult.data) {
      return errorJson("NOT_FOUND", "Exam not found", 404);
    }

    if (examResult.data.instructor_id !== user.id) {
      return errorJson("FORBIDDEN", "Forbidden", 403);
    }

    if (sessionsResult.error) {
      return errorJson("INTERNAL_ERROR", "Failed to fetch sessions", 500);
    }

    const sessions = sessionsResult.data;

    if (!sessions || sessions.length === 0) {
      return successJson({ grades: [] });
    }

    // Get all grades (manual + auto) for these sessions
    const sessionIds = sessions.map((s) => s.id);
    const { data: grades, error: gradesError } = await getSupabase()
      .from("grades")
      .select("session_id, score, q_idx, created_at, grade_type")
      .in("session_id", sessionIds);

    if (gradesError) {
      return errorJson("INTERNAL_ERROR", "Failed to fetch grades", 500);
    }

    if (!grades || grades.length === 0) {
      return successJson({ grades: [] });
    }

    // Group grades by session, then deduplicate (manual > auto > ai_failed)
    const gradesBySession = new Map<string, typeof grades>();
    grades.forEach((grade) => {
      if (!gradesBySession.has(grade.session_id)) {
        gradesBySession.set(grade.session_id, []);
      }
      gradesBySession.get(grade.session_id)?.push(grade);
    });

    const finalGrades: Array<{
      session_id: string;
      score: number;
      gradedCount: number;
    }> = [];

    gradesBySession.forEach((sessionGrades, sessionId) => {
      const { overallScore, gradedCount } = calculateOverallScore(sessionGrades);
      if (gradedCount > 0) {
        finalGrades.push({
          session_id: sessionId,
          score: overallScore,
          gradedCount,
        });
      }
    });

    return successJson({ grades: finalGrades });
  } catch (error) {
    return errorJson("INTERNAL_ERROR", "Internal server error", 500);
  }
}
