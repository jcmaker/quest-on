import { autoGradeSession } from "@/lib/grading";
import { logError } from "@/lib/logger";
import { enqueueGrading } from "@/lib/openai";
import { getSupabaseServer } from "@/lib/supabase-server";

type TriggerSource = "feedback" | "heartbeat" | "force_end" | "submit_exam";

/**
 * Idempotent grading trigger.
 * Skips enqueue when grading has already produced rows or status metadata.
 */
export async function triggerGradingIfNeeded(
  sessionId: string,
  source: TriggerSource
): Promise<{ queued: boolean; reason?: string }> {
  const supabase = getSupabaseServer();

  const [{ count: existingGrades, error: gradesError }, { data: sessionMeta, error: sessionError }] =
    await Promise.all([
      supabase
        .from("grades")
        .select("id", { count: "exact", head: true })
        .eq("session_id", sessionId),
      supabase
        .from("sessions")
        .select("ai_summary")
        .eq("id", sessionId)
        .maybeSingle(),
    ]);

  if (gradesError) {
    logError("[GRADING_TRIGGER] Failed to check existing grades", gradesError, {
      path: "lib/grading-trigger.ts",
      additionalData: { sessionId, source },
    });
  }

  if (sessionError) {
    logError("[GRADING_TRIGGER] Failed to check session grading metadata", sessionError, {
      path: "lib/grading-trigger.ts",
      additionalData: { sessionId, source },
    });
  }

  if ((existingGrades || 0) > 0) {
    return { queued: false, reason: "already_graded" };
  }

  const aiSummary = (sessionMeta?.ai_summary as { grading_status?: string } | null) || null;
  if (aiSummary?.grading_status) {
    return { queued: false, reason: "already_marked" };
  }

  const MAX_GRADING_RETRIES = 2;
  const gradeWithRetry = async () => {
    for (let attempt = 0; attempt <= MAX_GRADING_RETRIES; attempt++) {
      try {
        return await autoGradeSession(sessionId);
      } catch (error) {
        if (attempt === MAX_GRADING_RETRIES) throw error;
        const delay = 5000 * Math.pow(2, attempt);
        logError(`[GRADING_TRIGGER] attempt ${attempt + 1} failed, retry in ${delay}ms`, error, {
          path: "lib/grading-trigger.ts",
          additionalData: { sessionId, source, attempt },
        });
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  };

  enqueueGrading(gradeWithRetry).catch((error) => {
    logError("[GRADING_TRIGGER] Background grading failed", error, {
      path: "lib/grading-trigger.ts",
      additionalData: { sessionId, source },
    });
  });

  return { queued: true };
}
