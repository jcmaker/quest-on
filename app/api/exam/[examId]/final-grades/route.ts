import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";
import { currentUser } from "@/lib/get-current-user";
import { successJson, errorJson } from "@/lib/api-response";
import { validateUUID } from "@/lib/validate-params";
import { checkRateLimitAsync, RATE_LIMITS } from "@/lib/rate-limit";
import { calculateOverallScore } from "@/lib/grade-utils";

type GradeStatus = "ai_graded" | "manually_graded" | "pending";

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
    const userRole = user.role;
    if (userRole !== "instructor") {
      return errorJson("FORBIDDEN", "Forbidden", 403);
    }

    // Get exam and sessions in parallel (both only need examId param)
    const [examResult, sessionsResult] = await Promise.all([
      getSupabase().from("exams").select("instructor_id").eq("id", examId).single(),
      getSupabase().from("sessions").select("id").eq("exam_id", examId),
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
      .select("session_id, score, q_idx, created_at, grade_type, comment, stage_grading")
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
      gradeStatus: GradeStatus;
      aiComment: string | null;
    }> = [];

    gradesBySession.forEach((sessionGrades, sessionId) => {
      const { overallScore, gradedCount } = calculateOverallScore(sessionGrades);
      if (gradedCount > 0) {
        // Determine grading status from grade_type values
        const hasManual = sessionGrades.some((g) => g.grade_type === "manual");
        const hasFailed = sessionGrades.some((g) => g.grade_type === "ai_failed");
        let gradeStatus: GradeStatus = "pending";
        if (hasManual) {
          gradeStatus = "manually_graded";
        } else if (!hasFailed) {
          gradeStatus = "ai_graded";
        }

        // Extract AI comment preview from first grade with a comment
        const gradeWithComment = sessionGrades.find((g) => g.comment?.trim());
        let aiComment: string | null = null;
        if (gradeWithComment?.comment) {
          aiComment = gradeWithComment.comment.length > 200
            ? gradeWithComment.comment.slice(0, 200) + "..."
            : gradeWithComment.comment;
        } else {
          // Try stage_grading overall comment
          const gradeWithStage = sessionGrades.find((g) => {
            const sg = g.stage_grading as Record<string, unknown> | null;
            return sg?.answer && typeof (sg.answer as Record<string, unknown>).comment === "string";
          });
          if (gradeWithStage) {
            const sg = gradeWithStage.stage_grading as Record<string, unknown>;
            const comment = ((sg.answer as Record<string, unknown>)?.comment as string) || "";
            aiComment = comment.length > 200 ? comment.slice(0, 200) + "..." : comment || null;
          }
        }

        finalGrades.push({
          session_id: sessionId,
          score: overallScore,
          gradedCount,
          gradeStatus,
          aiComment,
        });
      }
    });

    return successJson({ grades: finalGrades });
  } catch (error) {
    return errorJson("INTERNAL_ERROR", "Internal server error", 500);
  }
}
