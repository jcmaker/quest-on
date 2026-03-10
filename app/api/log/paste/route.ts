import { getSupabaseServer } from "@/lib/supabase-server";
import { currentUser } from "@/lib/get-current-user";
import { successJson, errorJson } from "@/lib/api-response";
import { logError } from "@/lib/logger";
import { checkRateLimitAsync, RATE_LIMITS } from "@/lib/rate-limit";

const supabase = getSupabaseServer();

export async function POST(request: Request) {
  try {
    // Authentication check
    const user = await currentUser();
    if (!user) {
      return errorJson("UNAUTHORIZED", "Unauthorized", 401);
    }

    // Rate limit: prevent paste log spam
    const rl = await checkRateLimitAsync(`paste-log:${user.id}`, RATE_LIMITS.general);
    if (!rl.allowed) {
      return errorJson("RATE_LIMITED", "Too many paste log requests", 429);
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

    const { error: insertError } = await supabase.from("paste_logs").insert({
      session_id: sessionId,
      exam_code: examCode,
      question_id: questionId,
      length: length,
      // Store raw pasted text without mutation so downstream regex/highlight
      // logic can match against the exact original content.
      pasted_text: pasted_text ?? null,
      paste_start: paste_start ?? null,
      paste_end: paste_end ?? null,
      answer_length_before: answer_length_before ?? null,
      is_internal: isInternal,
      suspicious: suspicious,
      timestamp: timestamp.toISOString(),
    });

    if (insertError) {
      logError("[paste-log] Failed to insert paste log — cheating detection data lost", insertError, {
        path: "/api/log/paste",
        additionalData: { sessionId, examCode, questionId },
      });
      // Fallback: attempt to record in error_logs so the failure is traceable
      try {
        await supabase.from("error_logs").insert({
          error_type: "paste_log_failure",
          message: insertError.message,
          context: { sessionId, examCode, questionId, timestamp: timestamp.toISOString() },
        });
      } catch {
        // Last resort already logged above
      }
    }

    return successJson();
  } catch (error) {
    logError("[paste-log] Unhandled error in paste log handler", error, {
      path: "/api/log/paste",
    });
    return errorJson("INTERNAL_ERROR", "Failed to log event", 500);
  }
}
