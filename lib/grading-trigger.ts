import {
  autoGradeSession,
  listQuestionsToGrade,
  listCaseQuestionsForSummary,
  isAssignmentGradingSession,
  markObjectiveOnlyGradingDone,
} from "@/lib/grading";
import { logError } from "@/lib/logger";
import { getSupabaseServer } from "@/lib/supabase-server";
import {
  enqueueGradingPhase,
  isQStashEnabled,
} from "@/lib/qstash";
import { isSuccessfulGradeType } from "@/lib/grade-utils";
import type { GradingProgress } from "@/lib/types/grading";

type TriggerSource =
  | "feedback"
  | "heartbeat"
  | "force_end"
  | "submit_exam"
  | "submit_assignment"
  | "manual_retry"
  | "cron_sweeper";

async function markGradingQueued(sessionId: string): Promise<void> {
  const supabase = getSupabaseServer();

  // Preserve prior counts/phase/sweep_attempts — only bump status + updated_at.
  // The old behaviour of wiping {total, completed, failed} to 0 caused the UI
  // to briefly show "0/N" in the middle of re-triggers and also dropped the
  // sweep_attempts counter (defeating the sweeper cap).
  const { data } = await supabase
    .from("sessions")
    .select("grading_progress")
    .eq("id", sessionId)
    .maybeSingle();

  const existing = (data?.grading_progress as GradingProgress | null) || null;

  const progress: GradingProgress = {
    status: "queued",
    total: existing?.total ?? 0,
    completed: existing?.completed ?? 0,
    failed: existing?.failed ?? 0,
    phase: "grade",
    current_q_idx: existing?.current_q_idx,
    last_error: existing?.last_error,
    last_swept_at: existing?.last_swept_at,
    sweep_attempts: existing?.sweep_attempts,
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

    // Only block re-trigger if at least one real grade exists. Placeholder
    // `ai_summary` rows only store per-question summaries and must not mark
    // the session as graded.
    const successfulGrades = (existingGrades || []).filter(
      (g) => isSuccessfulGradeType((g as { grade_type?: string }).grade_type)
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
      | { status?: string; phase?: string; updated_at?: string }
      | null) || null;

    if (
      gradingProgress?.status === "completed" &&
      gradingProgress.phase === "objective_only_done"
    ) {
      return { queued: false, reason: "already_graded" };
    }

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

  // Determine the first objective q_idx with a submission — that's the entry
  // point for the chain. If there are zero objective questions, complete the
  // objective-only pipeline immediately without queuing summary phases.
  let firstQIdx: number | undefined;
  let objectiveTotal = 0;
  try {
    const toGrade = await listQuestionsToGrade(sessionId);
    objectiveTotal = toGrade.length;
    firstQIdx = toGrade[0];
  } catch (err) {
    logError("[GRADING_TRIGGER] Failed to list questions to grade", err, {
      path: "lib/grading-trigger.ts",
      additionalData: { sessionId, source },
    });
  }

  let firstPhase:
    | { sessionId: string; phase: "grade_question"; qIdx: number }
    | { sessionId: string; phase: "question_summary"; qIdx: number }
    | { sessionId: string; phase: "session_summary" };

  if (typeof firstQIdx === "number") {
    firstPhase = { sessionId, phase: "grade_question", qIdx: firstQIdx };
  } else {
    const isAssignment = await isAssignmentGradingSession(sessionId);
    if (isAssignment) {
      await markObjectiveOnlyGradingDone(sessionId, {
        total: objectiveTotal,
        completed: 0,
        failed: 0,
      });
      return { queued: false, reason: "objective_only_done" };
    }

    const caseIdxs = await listCaseQuestionsForSummary(sessionId);
    if (caseIdxs.length === 0) {
      await markObjectiveOnlyGradingDone(sessionId, {
        total: objectiveTotal,
        completed: 0,
        failed: 0,
      });
      return { queued: false, reason: "objective_only_done" };
    }
    if (caseIdxs.length === 1) {
      firstPhase = { sessionId, phase: "session_summary" };
    } else {
      firstPhase = { sessionId, phase: "question_summary", qIdx: caseIdxs[0] };
    }
  }

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
