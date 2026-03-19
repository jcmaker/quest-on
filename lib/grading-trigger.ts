import { autoGradeSession } from "@/lib/grading";
import { logError } from "@/lib/logger";
import { enqueueGrading } from "@/lib/openai";
import { getSupabaseServer } from "@/lib/supabase-server";

type TriggerSource = "feedback" | "heartbeat" | "force_end" | "submit_exam";

/**
 * Idempotent grading trigger with CAS guard to prevent concurrent double-grading.
 * Skips enqueue when grading has already produced rows or status metadata.
 * Allows re-trigger when previous grading failed (grading_status === "failed").
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
  // Allow re-trigger if previous attempt failed; block if queued/completed/partial
  if (aiSummary?.grading_status && aiSummary.grading_status !== "failed") {
    return { queued: false, reason: "already_marked" };
  }

  // CAS: Set grading_status to "queued" before enqueue to prevent concurrent triggers.
  // Only succeeds if ai_summary is null OR grading_status is null/failed.
  const existingSummary = (sessionMeta?.ai_summary as Record<string, unknown> | null) || {};
  const casPayload = { ...existingSummary, grading_status: "queued" };

  const { data: casResult, error: casError } = await supabase
    .from("sessions")
    .update({ ai_summary: casPayload })
    .eq("id", sessionId)
    .or("ai_summary.is.null,ai_summary->grading_status.is.null,ai_summary->>grading_status.eq.failed")
    .select("id")
    .maybeSingle();

  if (casError) {
    logError("[GRADING_TRIGGER] CAS update failed", casError, {
      path: "lib/grading-trigger.ts",
      additionalData: { sessionId, source },
    });
    // Proceed anyway — worst case is duplicate grading (upsert is safe)
  } else if (!casResult) {
    // CAS failed — another trigger already claimed this session
    return { queued: false, reason: "cas_conflict" };
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

  enqueueGrading(gradeWithRetry).catch(async (error) => {
    logError("[GRADING_TRIGGER] Background grading failed", error, {
      path: "lib/grading-trigger.ts",
      additionalData: { sessionId, source },
    });

    // Mark grading_status as "failed" so future triggers can retry
    try {
      const { data: current } = await supabase
        .from("sessions")
        .select("ai_summary")
        .eq("id", sessionId)
        .maybeSingle();

      const currentSummary = (current?.ai_summary as Record<string, unknown> | null) || {};
      await supabase
        .from("sessions")
        .update({ ai_summary: { ...currentSummary, grading_status: "failed" } })
        .eq("id", sessionId);
    } catch (statusErr) {
      logError("[GRADING_TRIGGER] Failed to set grading_status=failed", statusErr, {
        path: "lib/grading-trigger.ts",
        additionalData: { sessionId, source },
      });
    }
  });

  return { queued: true };
}
