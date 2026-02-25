import { NextRequest, NextResponse } from "next/server";
import { currentUser } from "@/lib/get-current-user";
import { getSupabaseServer } from "@/lib/supabase-server";
import { successJson, errorJson } from "@/lib/api-response";
import { validateUUID } from "@/lib/validate-params";

const supabase = getSupabaseServer();

/**
 * POST /api/session/[sessionId]/preflight
 * 
 * Preflight Modal 수락 처리
 * - preflight_accepted_at 설정
 * - 세션 상태를 "waiting"으로 변경
 */
export async function POST(
  request: NextRequest,
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
      .select("id, student_id, status")
      .eq("id", sessionId)
      .single();

    if (sessionError || !session) {
      return errorJson("NOT_FOUND", "Session not found", 404);
    }

    if (session.student_id !== user.id) {
      return errorJson("FORBIDDEN", "Unauthorized", 403);
    }

    const now = new Date().toISOString();

    // Preflight 수락 처리
    const { error: updateError } = await supabase
      .from("sessions")
      .update({
        preflight_accepted_at: now,
        status: "waiting", // Preflight 수락 후 Waiting 상태로 전환
      })
      .eq("id", sessionId);

    if (updateError) {
      return errorJson("INTERNAL_ERROR", "Failed to accept preflight", 500, {
        details: updateError.message || String(updateError),
        code: updateError.code,
      });
    }

    return successJson({
      sessionId,
      preflightAcceptedAt: now,
      status: "waiting",
    });
  } catch (error) {
    return errorJson("INTERNAL_ERROR", "Failed to accept preflight", 500);
  }
}
