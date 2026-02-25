import { NextRequest, NextResponse } from "next/server";
import { currentUser } from "@clerk/nextjs/server";
import { createClient } from "@supabase/supabase-js";
import { successJson, errorJson } from "@/lib/api-response";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  throw new Error("Missing Supabase environment variables");
}

const supabase = createClient(supabaseUrl, supabaseKey);

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

    const { error: updateExamError } = await supabase
      .from("exams")
      .update(updateData)
      .eq("id", examId);

    if (updateExamError) {
      console.error("[START_EXAM] Failed to update exam:", updateExamError);
      return errorJson("INTERNAL_ERROR", "Failed to start exam", 500);
    }

    // 5. 모든 Waiting 세션을 InProgress로 전환
    // Gate Start 신호를 받은 모든 세션의 상태를 업데이트
    const { data: waitingSessions, error: sessionsError } = await supabase
      .from("sessions")
      .select("id")
      .eq("exam_id", examId)
      .eq("status", "waiting");

    if (sessionsError) {
      console.error("[START_EXAM] Failed to fetch waiting sessions:", sessionsError);
      // 시험은 이미 시작되었으므로, 세션 업데이트 실패해도 계속 진행
    } else if (waitingSessions && waitingSessions.length > 0) {
      const sessionIds = waitingSessions.map((s) => s.id);

      // 모든 Waiting 세션을 InProgress로 전환
      const { error: updateSessionsError } = await supabase
        .from("sessions")
        .update({
          status: "in_progress",
          started_at: now, // Gate Start 신호 수신 시간
          attempt_timer_started_at: now, // 개별 타이머 시작 시간
          updated_at: now,
        })
        .in("id", sessionIds);

      if (updateSessionsError) {
        console.error(
          "[START_EXAM] Failed to update sessions:",
          updateSessionsError
        );
        // 시험은 이미 시작되었으므로, 세션 업데이트 실패해도 계속 진행
      } else {
        console.log(
          `[START_EXAM] ✅ Updated ${sessionIds.length} sessions to in_progress`
        );
      }
    }

    console.log(`[START_EXAM] ✅ Exam ${examId} started successfully`);

    return successJson({
      examId,
      startedAt: now,
      status: "running",
      sessionsUpdated: waitingSessions?.length || 0,
    });
  } catch (error) {
    console.error("[START_EXAM] ❌ Error:", error);
    return errorJson("INTERNAL_ERROR", "Failed to start exam", 500);
  }
}
