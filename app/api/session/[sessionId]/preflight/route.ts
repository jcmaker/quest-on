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
      console.error("[PREFLIGHT] Failed to update session:", updateError);
      return errorJson("INTERNAL_ERROR", "Failed to accept preflight", 500, {
        details: updateError.message || String(updateError),
        code: updateError.code,
      });
    }

    console.log(`[PREFLIGHT] ✅ Session ${sessionId} preflight accepted`);

    return successJson({
      sessionId,
      preflightAcceptedAt: now,
      status: "waiting",
    });
  } catch (error) {
    console.error("[PREFLIGHT] ❌ Error:", error);
    return errorJson("INTERNAL_ERROR", "Failed to accept preflight", 500);
  }
}
