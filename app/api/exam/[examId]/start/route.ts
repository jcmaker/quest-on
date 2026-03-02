import { NextRequest, NextResponse } from "next/server";
import { currentUser } from "@/lib/get-current-user";
import { getSupabaseServer } from "@/lib/supabase-server";
import { successJson, errorJson } from "@/lib/api-response";
import { validateUUID } from "@/lib/validate-params";

const supabase = getSupabaseServer();

/**
 * POST /api/exam/[examId]/start
 *
 * Gate Start 신호: 교수가 "Start Exam" 버튼을 클릭하면
 * - exams.started_at 설정
 * - exams.status를 "running"으로 변경
 * - 모든 Waiting 세션을 InProgress로 전환
 * - 각 세션의 started_at, attempt_timer_started_at 설정
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

    // 요청 본문에서 close_at 가져오기
    const body = await request.json().catch(() => ({}));
    const closeAt = body.close_at || null;

    // 1. 시험 정보 확인 및 권한 검증
    const { data: exam, error: examError } = await supabase
      .from("exams")
      .select("id, instructor_id, status, started_at")
      .eq("id", examId)
      .single();

    if (examError || !exam) {
      return errorJson("NOT_FOUND", "Exam not found", 404);
    }

    if (exam.instructor_id !== user.id) {
      return errorJson("FORBIDDEN", "Access denied", 403);
    }

    // 2. 상태 검증: Running이 아닌 모든 상태에서 Start 가능 (기본적으로 항상 시작 가능)
    // Closed 상태는 제외 (이미 종료된 시험)
    const invalidStatuses = ["running", "closed"];
    if (invalidStatuses.includes(exam.status || "")) {
      return errorJson(
        "BAD_REQUEST",
        exam.status === "running"
          ? "Exam is already running"
          : "Exam is already closed",
        400,
        { currentStatus: exam.status }
      );
    }

    // 3. 이미 시작된 경우 체크
    if (exam.started_at) {
      return errorJson("BAD_REQUEST", "Exam already started", 400, {
        startedAt: exam.started_at,
      });
    }

    const now = new Date().toISOString();

    // 4. 시험 상태 업데이트: started_at 설정, status를 "running"으로 변경, close_at 설정
    const updateData: {
      started_at: string;
      status: string;
      updated_at: string;
      close_at?: string | null;
    } = {
      started_at: now,
      status: "running",
      updated_at: now,
    };

    // close_at이 제공된 경우에만 업데이트
    if (closeAt) {
      // datetime-local 형식을 ISO 형식으로 변환
      const closeAtISO = new Date(closeAt).toISOString();
      updateData.close_at = closeAtISO;
    }

    // 4-5. 시험 상태 + 세션 전환을 원자적으로 처리
    // 시험 상태 업데이트 먼저 수행
    const { data: updatedExam, error: updateExamError } = await supabase
      .from("exams")
      .update(updateData)
      .eq("id", examId)
      .eq("status", exam.status) // 낙관적 잠금: 상태가 변하지 않았을 때만 업데이트
      .select("id")
      .single();

    if (updateExamError || !updatedExam) {
      return errorJson(
        "CONFLICT",
        "Exam state changed concurrently, please retry",
        409
      );
    }

    // 5. 모든 Waiting 세션을 InProgress로 전환
    const { data: updatedSessions, error: sessionsError } = await supabase
      .from("sessions")
      .update({
        status: "in_progress",
        started_at: now,
        attempt_timer_started_at: now,
      })
      .eq("exam_id", examId)
      .eq("status", "waiting")
      .select("id");

    if (sessionsError) {
      // 세션 전환 실패 시 시험 상태 롤백
      await supabase
        .from("exams")
        .update({
          started_at: exam.started_at,
          status: exam.status || "draft",
          updated_at: now,
          close_at: null,
        })
        .eq("id", examId);

      return errorJson("INTERNAL_ERROR", "Failed to update sessions, exam state rolled back", 500);
    }

    return successJson({
      examId,
      startedAt: now,
      status: "running",
      sessionsUpdated: updatedSessions?.length || 0,
    });
  } catch (error) {
    return errorJson("INTERNAL_ERROR", "Failed to start exam", 500);
  }
}
