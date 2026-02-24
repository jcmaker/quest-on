import { NextRequest, NextResponse } from "next/server";
import { currentUser } from "@clerk/nextjs/server";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  throw new Error("Missing Supabase environment variables");
}

const supabase = createClient(supabaseUrl, supabaseKey);

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
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userRole = user.unsafeMetadata?.role as string;
    if (userRole !== "instructor") {
      return NextResponse.json(
        { error: "Instructor access required" },
        { status: 403 }
      );
    }

    const resolvedParams = await params;
    const examId = resolvedParams.examId;

    // 1. 시험 정보 확인 및 권한 검증
    const { data: exam, error: examError } = await supabase
      .from("exams")
      .select("id, instructor_id, status, duration")
      .eq("id", examId)
      .single();

    if (examError || !exam) {
      return NextResponse.json(
        { error: "Exam not found" },
        { status: 404 }
      );
    }

    if (exam.instructor_id !== user.id) {
      return NextResponse.json(
        { error: "Access denied" },
        { status: 403 }
      );
    }

    // 2. 상태 검증: Running 또는 EntryClosed 상태에서만 End 가능
    const validStatuses = ["running", "entry_closed"];
    if (!validStatuses.includes(exam.status || "")) {
      return NextResponse.json(
        {
          error: "Exam cannot be ended",
          currentStatus: exam.status,
          message: "Exam must be in 'running' or 'entry_closed' status to end",
        },
        { status: 400 }
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
      console.error("[END_EXAM] Failed to update exam:", updateExamError);
      return NextResponse.json(
        { error: "Failed to end exam" },
        { status: 500 }
      );
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

    if (sessionsError) {
      console.error("[END_EXAM] Failed to fetch active sessions:", sessionsError);
    } else if (activeSessions && activeSessions.length > 0) {
      const sessionIds = activeSessions.map((s) => s.id);

      // 진행 중인 세션을 모두 제출 처리 (비상 강제 종료)
      const { error: updateSessionsError } = await supabase
        .from("sessions")
        .update({
          status: "submitted",
          submitted_at: now,
          updated_at: now,
        })
        .in("id", sessionIds);

      if (updateSessionsError) {
        console.error(
          "[END_EXAM] Failed to force submit sessions:",
          updateSessionsError
        );
      } else {
        console.log(
          `[END_EXAM] ✅ Force submitted ${sessionIds.length} active sessions`
        );
      }
    }

    console.log(`[END_EXAM] ✅ Exam ${examId} ended successfully`);

    return NextResponse.json({
      success: true,
      examId,
      status: "closed",
      endedAt: now,
      sessionsForceSubmitted: activeSessions?.length || 0,
    });
  } catch (error) {
    console.error("[END_EXAM] ❌ Error:", error);
    return NextResponse.json(
      { error: "Failed to end exam" },
      { status: 500 }
    );
  }
}
