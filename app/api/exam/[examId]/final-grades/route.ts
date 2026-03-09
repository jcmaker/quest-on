import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";
import { currentUser } from "@/lib/get-current-user";
import { successJson, errorJson } from "@/lib/api-response";
import { validateUUID } from "@/lib/validate-params";
import { checkRateLimitAsync, RATE_LIMITS } from "@/lib/rate-limit";

const supabase = getSupabaseServer();

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

    // Get exam to verify instructor owns it
    const { data: exam, error: examError } = await supabase
      .from("exams")
      .select("instructor_id")
      .eq("id", examId)
      .single();

    if (examError || !exam) {
      return errorJson("NOT_FOUND", "Exam not found", 404);
    }

    if (exam.instructor_id !== user.id) {
      return errorJson("FORBIDDEN", "Forbidden", 403);
    }

    // Get all sessions for this exam
    const { data: sessions, error: sessionsError } = await supabase
      .from("sessions")
      .select("id")
      .eq("exam_id", examId);

    if (sessionsError) {
      return errorJson("INTERNAL_ERROR", "Failed to fetch sessions", 500);
    }

    if (!sessions || sessions.length === 0) {
      return successJson({ grades: [] });
    }

    // Get manual grades only (grade_type='manual') for these sessions
    const sessionIds = sessions.map((s) => s.id);
    const { data: grades, error: gradesError } = await supabase
      .from("grades")
      .select("session_id, score, q_idx, created_at, grade_type")
      .in("session_id", sessionIds)
      .eq("grade_type", "manual");

    if (gradesError) {
      return errorJson("INTERNAL_ERROR", "Failed to fetch grades", 500);
    }

    if (!grades || grades.length === 0) {
      return successJson({ grades: [] });
    }

    // 세션별로 수동 채점 grades 그룹화 후 평균 점수 계산
    const gradesBySession = new Map<string, typeof grades>();
    grades.forEach((grade) => {
      if (!gradesBySession.has(grade.session_id)) {
        gradesBySession.set(grade.session_id, []);
      }
      gradesBySession.get(grade.session_id)?.push(grade);
    });

    const finalGrades: Array<{ session_id: string; score: number }> = [];

    gradesBySession.forEach((sessionGrades, sessionId) => {
      const averageScore =
        sessionGrades.length > 0
          ? Math.round(
              sessionGrades.reduce((sum, g) => sum + g.score, 0) /
                sessionGrades.length
            )
          : 0;
      finalGrades.push({
        session_id: sessionId,
        score: averageScore,
      });
    });

    return successJson({ grades: finalGrades });
  } catch (error) {
    return errorJson("INTERNAL_ERROR", "Internal server error", 500);
  }
}
