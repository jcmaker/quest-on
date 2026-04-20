import { autoGradeSession, listQuestionsToGrade } from "@/lib/grading";
import { logError } from "@/lib/logger";
import { getSupabaseServer } from "@/lib/supabase-server";
import {
  enqueueGradingPhase,
  isQStashEnabled,
} from "@/lib/qstash";
import type { GradingProgress } from "@/lib/types/grading";

type TriggerSource =
  | "feedback"
  | "heartbeat"
  | "force_end"
  | "submit_exam"
  | "manual_retry"
  | "cron_sweeper";

async function markGradingQueued(sessionId: string): Promise<void> {
  const supabase = getSupabaseServer();
  const progress: GradingProgress = {
    status: "queued",
    total: 0,
    completed: 0,
    failed: 0,
    phase: "grade",
    updated_at: new Date().toISOString(),
  };
  const { error } = await supabase
    .from("sessions")
    .update({ grading_progress: progress })
    .eq("id", sessionId);
  if (error) {
    logError("[GRADING_TRIGGER] Failed to mark grading_progress=queued", error, {
      path: "lib/grading-trigger.ts",
      additionalData: { sessionId },
    });
  }
}

/**
 * Stale threshold: if grading_progress.updated_at is older than this, we
 * treat an existing "queued"/"running" status as abandoned and allow a
 * re-trigger. Matches the cron sweeper's policy.
 */
const STALE_THRESHOLD_MS = 10 * 60 * 1000;

type TriggerResult = {
  queued: boolean;
  reason?: string;
};

/**
 * Idempotent grading trigger. Enqueues the FIRST phase (grade_question,
 * qIdx = smallest with a submission) onto QStash. Subsequent phases are
 * chained by the worker itself.
 *
 * Production: requires QStash. If QStash is not configured, the trigger
 * returns an explicit failure reason so callers can surface the condition
 * (rather than silently dropping grading like the old in-process path).
 *
 * Dev: when QStash is not configured, falls back to an inline
 * `autoGradeSession(...)` call — blocking but correct. This only runs
 * outside Vercel serverless, since production always has QStash set.
 */
export async function triggerGradingIfNeeded(
  sessionId: string,
  source: TriggerSource,
  options: { skipIdempotency?: boolean } = {}
): Promise<TriggerResult> {
  const supabase = getSupabaseServer();

  if (!options.skipIdempotency) {
    const [{ data: existingGrades, error: gradesError }, { data: sessionMeta, error: sessionError }] =
      await Promise.all([
        supabase
          .from("grades")
          .select("grade_type")
          .eq("session_id", sessionId),
        supabase
          .from("sessions")
          .select("ai_summary, grading_progress")
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

    // Only block re-trigger if at least one non-`ai_failed` grade exists.
    // Sessions whose grades are ALL `ai_failed` need recovery — we allow
    // the trigger to enqueue a re-grade of those questions.
    const successfulGrades = (existingGrades || []).filter(
      (g) => (g as { grade_type?: string }).grade_type !== "ai_failed"
    );

    // Check if session-level summary has been produced yet.
    const aiSummary = (sessionMeta?.ai_summary as
      | { summary?: unknown; grading_status?: unknown }
      | null) || null;
    const hasRealSummary =
      !!aiSummary &&
      typeof aiSummary.summary === "string" &&
      (aiSummary.summary as string).trim().length > 0;

    if (
      successfulGrades.length > 0 &&
      hasRealSummary
    ) {
      return { queued: false, reason: "already_graded" };
    }

    const gradingProgress = (sessionMeta?.grading_progress as
      | { status?: string; updated_at?: string }
      | null) || null;

    if (
      gradingProgress?.status === "queued" ||
      gradingProgress?.status === "running"
    ) {
      const updatedAt = gradingProgress?.updated_at
        ? new Date(gradingProgress.updated_at).getTime()
        : 0;
      const isStale = Date.now() - updatedAt > STALE_THRESHOLD_MS;
      if (!isStale) {
        return { queued: false, reason: "already_in_progress" };
      }
      logError(
        "[GRADING_TRIGGER] Stale grading_progress detected — allowing re-trigger",
        null,
        {
          path: "lib/grading-trigger.ts",
          additionalData: {
            sessionId,
            status: gradingProgress.status,
            updatedAt: gradingProgress.updated_at,
            source,
          },
        }
      );
    }
  }

  // Determine the first q_idx with a submission — that's the entry point
  // for the chain. If there are zero gradable questions, fall straight
  // through to session_summary, which will record the appropriate fallback.
  let firstQIdx: number | undefined;
  try {
    const toGrade = await listQuestionsToGrade(sessionId);
    firstQIdx = toGrade[0];
  } catch (err) {
    logError("[GRADING_TRIGGER] Failed to list questions to grade", err, {
      path: "lib/grading-trigger.ts",
      additionalData: { sessionId, source },
    });
  }

  const firstPhase =
    typeof firstQIdx === "number"
      ? ({ sessionId, phase: "grade_question" as const, qIdx: firstQIdx })
      : ({ sessionId, phase: "session_summary" as const });

  if (isQStashEnabled()) {
    const publish = await enqueueGradingPhase(firstPhase);
    if (publish.ok) {
      await markGradingQueued(sessionId);
      return { queued: true, reason: "qstash" };
    }
    logError("[GRADING_TRIGGER] QStash publish failed", publish.error ?? null, {
      path: "lib/grading-trigger.ts",
      additionalData: { sessionId, source, reason: publish.reason },
    });

    // If the worker base URL is missing in production we have a config bug —
    // fall through to the dev inline path only when not on Vercel.
    if (process.env.VERCEL) {
      return { queued: false, reason: `qstash_${publish.reason}` };
    }
  }

  // Dev fallback: blocking inline execution. Never returns until all phases
  // finish (or throw). Do NOT rely on this in production.
  if (process.env.VERCEL) {
    logError(
      "[GRADING_TRIGGER] QStash not configured in production — grading will not run",
      null,
      { path: "lib/grading-trigger.ts", additionalData: { sessionId, source } }
    );
    return { queued: false, reason: "qstash_not_configured" };
  }

  await markGradingQueued(sessionId);
  try {
    await autoGradeSession(sessionId);
    return { queued: true, reason: "dev_inline" };
  } catch (err) {
    logError("[GRADING_TRIGGER] Dev inline grading failed", err, {
      path: "lib/grading-trigger.ts",
      additionalData: { sessionId, source },
    });
    return { queued: false, reason: "dev_inline_failed" };
  }
}
