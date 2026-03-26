import { NextRequest } from "next/server";
import { currentUser } from "@/lib/get-current-user";
import { getSupabaseServer } from "@/lib/supabase-server";
import { successJson, errorJson } from "@/lib/api-response";
import { validateUUID } from "@/lib/validate-params";
import { logError } from "@/lib/logger";
import {
  buildGateStatePayload,
  isExamStarted,
  isExamUnavailable,
  promoteSessionToInProgress,
} from "@/app/api/supa/handlers/session-handlers";

const supabase = getSupabaseServer();

/**
 * POST /api/session/[sessionId]/preflight
 * 
 * Preflight Modal 수락 처리
 * - preflight_accepted_at 설정
 * - 시험 상태에 따라 waiting 또는 in_progress로 조정
 */
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  try {
    const user = await currentUser();
    if (!user) {
      return errorJson("UNAUTHORIZED", "Unauthorized", 401);
    }

    const resolvedParams = await params;
    const sessionId = resolvedParams.sessionId;

    const invalidId = validateUUID(sessionId, "sessionId");
    if (invalidId) return invalidId;

    // 세션 확인 및 권한 검증
    const { data: session, error: sessionError } = await supabase
      .from("sessions")
      .select(
        "id, student_id, exam_id, status, started_at, attempt_timer_started_at, created_at, preflight_accepted_at, device_fingerprint"
      )
      .eq("id", sessionId)
      .single();

    if (sessionError || !session) {
      return errorJson("NOT_FOUND", "Session not found", 404);
    }

    if (session.student_id !== user.id) {
      return errorJson("FORBIDDEN", "Unauthorized", 403);
    }

    const now = new Date().toISOString();
    const nowTime = Date.now();

    const { data: exam, error: examError } = await supabase
      .from("exams")
      .select("id, status, started_at, duration, type")
      .eq("id", session.exam_id)
      .single();

    if (examError || !exam) {
      return errorJson("EXAM_NOT_FOUND", "Exam not found", 404);
    }

    if (isExamUnavailable(exam.status)) {
      return errorJson(
        "EXAM_NOT_AVAILABLE",
        "Exam not available for joining",
        403,
        {
          currentStatus: exam.status,
          message: "This exam is closed or archived",
        }
      );
    }

    let reconciledSession = session;

    // 지각 학생: 강사 승인 대기 — preflight만 기록하고 상태 유지
    if (session.status === "late_pending") {
      const { data: updatedSession, error: updateError } = await supabase
        .from("sessions")
        .update({ preflight_accepted_at: now })
        .eq("id", sessionId)
        .eq("status", "late_pending")
        .select(
          "id, student_id, exam_id, status, started_at, attempt_timer_started_at, created_at, preflight_accepted_at, device_fingerprint"
        )
        .single();

      if (updateError || !updatedSession) {
        logError("Failed to update preflight for late_pending", updateError, {
          path: "/api/session/[sessionId]/preflight",
          additionalData: { sessionId },
        });
        return errorJson("INTERNAL_ERROR", "Failed to accept preflight", 500);
      }
      reconciledSession = updatedSession;
    } else if (isExamStarted(exam.status, exam.started_at, nowTime) || exam.duration === 0 || (exam.type && exam.type !== "exam")) {
      // 시험이 이미 시작되었거나, 무제한(과제형)/비시험 유형인 경우 바로 in_progress로 전환
      reconciledSession = await promoteSessionToInProgress(session, now, {
        preflightAcceptedAt: now,
      });
    } else {
      const { data: updatedSession, error: updateError } = await supabase
        .from("sessions")
        .update({
          preflight_accepted_at: now,
          status: "waiting",
        })
        .eq("id", sessionId)
        .select(
          "id, student_id, exam_id, status, started_at, attempt_timer_started_at, created_at, preflight_accepted_at, device_fingerprint"
        )
        .single();

      if (updateError || !updatedSession) {
        logError("Failed to update preflight status", updateError, {
          path: "/api/session/preflight",
          user_id: user.id,
          additionalData: { sessionId },
        });
        return errorJson("INTERNAL_ERROR", "Failed to accept preflight", 500);
      }

      reconciledSession = updatedSession;
    }

    const gateState = buildGateStatePayload(reconciledSession, exam, nowTime);

    return successJson({
      sessionId,
      preflightAcceptedAt: now,
      status: gateState.status,
      gateStarted: gateState.gateStarted,
      sessionStartTime: gateState.sessionStartTime,
      timeRemaining: gateState.timeRemaining,
    });
  } catch (error) {
    logError("Preflight acceptance failed", error, { path: "/api/session/preflight" });
    return errorJson("INTERNAL_ERROR", "Failed to accept preflight", 500);
  }
}
