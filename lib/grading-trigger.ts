import { autoGradeSession } from "@/lib/grading";
import { logError } from "@/lib/logger";
import { enqueueGrading } from "@/lib/openai";
import { getSupabaseServer } from "@/lib/supabase-server";
import { getQStash, getWorkerBaseUrl, isQStashEnabled } from "@/lib/qstash";

type TriggerSource = "feedback" | "heartbeat" | "force_end" | "submit_exam" | "manual_retry";

/**
 * Idempotent grading trigger.
 * Skips enqueue when grading has already produced rows or status metadata.
 *
 * Queueing strategy:
 * - Production / QStash configured: publishJSON to the worker endpoint
 *   (durable, auto-retry on 5xx, survives serverless restarts).
 * - Dev / QStash absent: fall back to in-process fire-and-forget with
 *   the existing p-limit gate and manual retry loop.
 */
export async function triggerGradingIfNeeded(
  sessionId: string,
  source: TriggerSource,
  options: { skipIdempotency?: boolean } = {}
): Promise<{ queued: boolean; reason?: string }> {
  const supabase = getSupabaseServer();

  if (!options.skipIdempotency) {
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
  }

  // Preferred path: durable QStash queue
  if (isQStashEnabled()) {
    const qstash = getQStash();
    const baseUrl = getWorkerBaseUrl();
    if (qstash && baseUrl) {
      try {
        await qstash.publishJSON({
          url: `${baseUrl}/api/internal/grading-worker`,
          body: { sessionId },
          // QStash default retries = 3 (exponential backoff), sufficient.
          retries: 3,
        });
        return { queued: true, reason: "qstash" };
      } catch (publishErr) {
        logError("[GRADING_TRIGGER] QStash publish failed — falling back to in-process", publishErr, {
          path: "lib/grading-trigger.ts",
          additionalData: { sessionId, source },
        });
        // fallthrough to in-process fallback below
      }
    } else if (!baseUrl) {
      logError(
        "[GRADING_TRIGGER] QSTASH_TOKEN present but worker base URL unresolved — falling back",
        null,
        { path: "lib/grading-trigger.ts", additionalData: { sessionId, source } }
      );
    }
  }

  // Fallback: in-process fire-and-forget (dev / QStash outage)
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

  return { queued: true, reason: "in_process" };
}
