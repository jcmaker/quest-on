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
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
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
      return NextResponse.json(
        { error: "Session not found" },
        { status: 404 }
      );
    }

    if (session.student_id !== user.id) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 403 }
      );
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
      return NextResponse.json(
        { 
          error: "Failed to accept preflight",
          details: updateError.message || String(updateError),
          code: updateError.code,
        },
        { status: 500 }
      );
    }

    console.log(`[PREFLIGHT] ✅ Session ${sessionId} preflight accepted`);

    return NextResponse.json({
      success: true,
      sessionId,
      preflightAcceptedAt: now,
      status: "waiting",
    });
  } catch (error) {
    console.error("[PREFLIGHT] ❌ Error:", error);
    return NextResponse.json(
      { error: "Failed to accept preflight" },
      { status: 500 }
    );
  }
}
