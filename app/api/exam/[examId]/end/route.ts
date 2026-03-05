import { NextRequest, NextResponse } from "next/server";
import { currentUser } from "@/lib/get-current-user";
import { getSupabaseServer } from "@/lib/supabase-server";
import { successJson, errorJson } from "@/lib/api-response";
import { validateUUID } from "@/lib/validate-params";
import { logError } from "@/lib/logger";

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

    // 4. 모든 진행 중 세션 강제 제출 + 대기 중 세션 정리 (재시도 로직 포함)
    // Also close "waiting" sessions that never started
    const { error: waitingCloseError } = await supabase
      .from("sessions")
      .update({
        status: "closed",
        is_active: false,
      })
      .eq("exam_id", examId)
      .eq("status", "waiting");

    if (waitingCloseError) {
      logError("Failed to close waiting sessions", waitingCloseError, {
        path: "/api/exam/end",
      });
    }

    const { data: activeSessions, error: sessionsError } = await supabase
      .from("sessions")
      .select("id, submitted_at")
      .eq("exam_id", examId)
      .eq("status", "in_progress")
      .is("submitted_at", null);

    let sessionsForceSubmitted = 0;
    let forceSubmitFailed: string[] = [];

    if (!sessionsError && activeSessions && activeSessions.length > 0) {
      const sessionIds = activeSessions.map((s) => s.id);

      // 1차 시도: 일괄 업데이트
      const { error: batchError } = await supabase
        .from("sessions")
        .update({
          status: "submitted",
          submitted_at: now,
          auto_submitted: true,
        })
        .in("id", sessionIds);

      if (!batchError) {
        sessionsForceSubmitted = sessionIds.length;
      } else {
        // 2차 시도: 개별 업데이트로 폴백
        for (const sid of sessionIds) {
          const { error: individualError } = await supabase
            .from("sessions")
            .update({
              status: "submitted",
              submitted_at: now,
              auto_submitted: true,
            })
            .eq("id", sid);

          if (!individualError) {
            sessionsForceSubmitted++;
          } else {
            forceSubmitFailed.push(sid);
          }
        }
      }
    }

    return successJson({
      examId,
      status: "closed",
      endedAt: now,
      sessionsForceSubmitted,
      ...(forceSubmitFailed.length > 0 && {
        forceSubmitFailed,
        warning: `${forceSubmitFailed.length} session(s) failed to force-submit`,
      }),
    });
  } catch (error) {
    logError("Failed to end exam", error, { path: "/api/exam/end" });
    return errorJson("INTERNAL_ERROR", "Failed to end exam", 500);
  }
}
