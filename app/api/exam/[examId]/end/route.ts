import { NextRequest, NextResponse } from "next/server";
import { currentUser } from "@/lib/get-current-user";
import { getSupabaseServer } from "@/lib/supabase-server";
import { successJson, errorJson } from "@/lib/api-response";
import { validateUUID } from "@/lib/validate-params";

const supabase = getSupabaseServer();

/**
 * POST /api/exam/[examId]/end
 *
 * Gate End 신호: 교수가 "End Exam" 버튼을 클릭하면
 * - exams.status를 "closed"로 변경
 * - 비상 강제 종료 (모든 진행 중 시험 종료)
 * - 주의: close_at은 입장 마감이므로, 이 API는 강제 종료용
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ examId: string }> }
) {
  try {
    const user = await currentUser();
    if (!user) {
      return errorJson("UNAUTHORIZED", "Unauthorized", 401);
    }

    const userRole = user.unsafeMetadata?.role as string;
    if (userRole !== "instructor") {
      return errorJson("FORBIDDEN", "Instructor access required", 403);
    }

    const resolvedParams = await params;
    const examId = resolvedParams.examId;

    const invalidId = validateUUID(examId, "examId");
    if (invalidId) return invalidId;

    // 1. 시험 정보 확인 및 권한 검증
    const { data: exam, error: examError } = await supabase
      .from("exams")
      .select("id, instructor_id, status, duration")
      .eq("id", examId)
      .single();

    if (examError || !exam) {
      return errorJson("NOT_FOUND", "Exam not found", 404);
    }

    if (exam.instructor_id !== user.id) {
      return errorJson("FORBIDDEN", "Access denied", 403);
    }

    // 2. 상태 검증: Running 또는 EntryClosed 상태에서만 End 가능
    const validStatuses = ["running", "entry_closed"];
    if (!validStatuses.includes(exam.status || "")) {
      return errorJson(
        "BAD_REQUEST",
        "Exam must be in 'running' or 'entry_closed' status to end",
        400,
        { currentStatus: exam.status }
      );
    }

    const now = new Date().toISOString();

    // 3. 시험 상태를 "closed"로 변경
    const { error: updateExamError } = await supabase
      .from("exams")
      .update({
        status: "closed",
        updated_at: now,
      })
      .eq("id", examId);

    if (updateExamError) {
      return errorJson("INTERNAL_ERROR", "Failed to end exam", 500);
    }

    // 4. (선택사항) 모든 진행 중 세션 강제 제출
    // 주의: 이는 비상 상황에서만 사용해야 함
    // 일반적으로는 개별 타이머로 자연 종료되도록 함
    const { data: activeSessions, error: sessionsError } = await supabase
      .from("sessions")
      .select("id, submitted_at")
      .eq("exam_id", examId)
      .eq("status", "in_progress")
      .is("submitted_at", null);

    if (!sessionsError && activeSessions && activeSessions.length > 0) {
      const sessionIds = activeSessions.map((s) => s.id);

      // 진행 중인 세션을 모두 제출 처리 (비상 강제 종료)
      await supabase
        .from("sessions")
        .update({
          status: "submitted",
          submitted_at: now,
          updated_at: now,
        })
        .in("id", sessionIds);
    }

    return successJson({
      examId,
      status: "closed",
      endedAt: now,
      sessionsForceSubmitted: activeSessions?.length || 0,
    });
  } catch (error) {
    return errorJson("INTERNAL_ERROR", "Failed to end exam", 500);
  }
}
