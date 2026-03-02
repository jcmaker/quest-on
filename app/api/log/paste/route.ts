import { NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";
import { currentUser } from "@/lib/get-current-user";
import { successJson, errorJson } from "@/lib/api-response";

const supabase = getSupabaseServer();

export async function POST(request: Request) {
  try {
    // Authentication check
    const user = await currentUser();
    if (!user) {
      return errorJson("UNAUTHORIZED", "Unauthorized", 401);
    }

    const body = await request.json();
    const {
      length,
      pasted_text,
      paste_start,
      paste_end,
      answer_length_before,
      isInternal,
      ts,
      examCode,
      questionId,
      sessionId,
    } = body;

    if (!sessionId) {
      return errorJson("BAD_REQUEST", "sessionId is required", 400);
    }

    // Verify session ownership
    const { data: session } = await supabase
      .from("sessions")
      .select("id, student_id")
      .eq("id", sessionId)
      .single();

    if (!session || session.student_id !== user.id) {
      return errorJson("FORBIDDEN", "Access denied", 403);
    }

    const suspicious = !isInternal;
    const timestamp = new Date(ts);

    // Truncate pasted text to prevent storing sensitive data (passwords, etc.)
    const MAX_PASTE_TEXT_LENGTH = 200;
    const truncatedText = pasted_text
      ? pasted_text.length > MAX_PASTE_TEXT_LENGTH
        ? pasted_text.slice(0, MAX_PASTE_TEXT_LENGTH) + "...[truncated]"
        : pasted_text
      : null;

    const { error: insertError } = await supabase.from("paste_logs").insert({
      session_id: sessionId,
      exam_code: examCode,
      question_id: questionId,
      length: length,
      pasted_text: truncatedText,
      paste_start: paste_start ?? null,
      paste_end: paste_end ?? null,
      answer_length_before: answer_length_before ?? null,
      is_internal: isInternal,
      suspicious: suspicious,
      timestamp: timestamp.toISOString(),
    });

    if (insertError) {
      // Non-critical: paste log insert failed
    }

    return successJson();
  } catch (error) {
    return errorJson("INTERNAL_ERROR", "Failed to log event", 500);
  }
}
