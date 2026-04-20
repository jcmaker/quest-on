export const maxDuration = 60;
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";
import { triggerGradingIfNeeded } from "@/lib/grading-trigger";
import { listQuestionsToGrade } from "@/lib/grading";
import { logError } from "@/lib/logger";
import type { GradingProgress } from "@/lib/types/grading";

/**
 * Grading sweeper — last-resort recovery for stuck sessions.
 *
 * Runs on a schedule via Vercel Cron. For any session that:
 *   - has been submitted, AND
 *   - has `grading_progress.status` in {queued, running}, AND
 *   - `grading_progress.updated_at` is older than STALE_THRESHOLD_MS
 *
 * …we take one of three actions (in priority order):
 *
 *   1. AUTO-HEAL: the session already has a real AI summary AND every
 *      submitted question has a successful grade row. In this case we
 *      simply flip `grading_progress.status` to `completed` without
 *      re-enqueuing the chain. This is the common case — the chain
 *      succeeded but a late hiccup prevented the final progress flip.
 *
 *   2. RE-TRIGGER: the session still has missing work. We bump
 *      `sweep_attempts`, stamp `last_swept_at`, and re-trigger via
 *      `triggerGradingIfNeeded({ skipIdempotency: true })`.
 *
 *   3. GIVE UP: once `sweep_attempts` exceeds SWEEP_ATTEMPT_LIMIT, we
 *      force-mark the session as `failed` with a clear `last_error`.
 *      No more sweeps. Operator must use the manual retry endpoint
 *      (`PUT /api/session/[sessionId]/grade`) to try again.
 *
 * Per-session cooldown: a session swept within SWEEP_COOLDOWN_MS is
 * skipped regardless of `updated_at`. This prevents hot-looping on a
 * session where some phase keeps bumping `updated_at` faster than the
 * stale threshold.
 *
 * Kill switch: set `GRADING_SWEEP_DISABLED=1` to disable the sweeper
 * without redeploying (Vercel env var flip only).
 *
 * Sessions with `status = "failed"` are NOT swept — they represent
 * permanent failures that need operator attention.
 *
 * Authentication: Vercel Cron includes a bearer token `CRON_SECRET`
 * that we validate on each invocation.
 */

const STALE_THRESHOLD_MS = 15 * 60 * 1000;
const SWEEP_COOLDOWN_MS = 60 * 60 * 1000;
const SWEEP_ATTEMPT_LIMIT = 3;
const MAX_SESSIONS_PER_RUN = 10;

function isAuthorized(request: NextRequest): boolean {
  const header = request.headers.get("authorization");
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return process.env.VERCEL !== "1";
  }
  return header === `Bearer ${secret}`;
}

type SweepAction =
  | { kind: "heal"; sessionId: string }
  | { kind: "retrigger"; sessionId: string; nextAttempt: number }
  | { kind: "give_up"; sessionId: string; reason: string }
  | { kind: "skip"; sessionId: string; reason: string };

/**
 * Decide what to do with a candidate session. All DB reads happen here
 * so the main handler stays small and the decision is unit-testable.
 */
async function decideAction(
  sessionId: string,
  gp: GradingProgress
): Promise<SweepAction> {
  if (gp.last_swept_at) {
    const sweptAt = new Date(gp.last_swept_at).getTime();
    if (Number.isFinite(sweptAt) && Date.now() - sweptAt < SWEEP_COOLDOWN_MS) {
      return {
        kind: "skip",
        sessionId,
        reason: "cooldown_active",
      };
    }
  }

  const attempts = gp.sweep_attempts ?? 0;
  if (attempts >= SWEEP_ATTEMPT_LIMIT) {
    return {
      kind: "give_up",
      sessionId,
      reason: `sweep_attempts_exceeded (${attempts}/${SWEEP_ATTEMPT_LIMIT})`,
    };
  }

  const supabase = getSupabaseServer();
  const [{ data: sessionRow }, questionIdxs] = await Promise.all([
    supabase
      .from("sessions")
      .select("ai_summary")
      .eq("id", sessionId)
      .maybeSingle(),
    listQuestionsToGrade(sessionId).catch(() => [] as number[]),
  ]);

  const aiSummary = (sessionRow?.ai_summary as
    | { summary?: unknown }
    | null) || null;
  const hasRealSummary =
    !!aiSummary &&
    typeof aiSummary.summary === "string" &&
    aiSummary.summary.trim().length > 0;

  const { data: gradeRows } = await supabase
    .from("grades")
    .select("q_idx, grade_type")
    .eq("session_id", sessionId);

  const successfulGradedIdxs = new Set<number>(
    (gradeRows || [])
      .filter(
        (g) => (g as { grade_type?: string }).grade_type !== "ai_failed"
      )
      .map((g) => (g as { q_idx: number }).q_idx)
  );

  const allGradedSuccessfully =
    questionIdxs.length > 0 &&
    questionIdxs.every((idx) => successfulGradedIdxs.has(idx));

  if (hasRealSummary && allGradedSuccessfully) {
    return { kind: "heal", sessionId };
  }

  return { kind: "retrigger", sessionId, nextAttempt: attempts + 1 };
}

async function applyHeal(sessionId: string, gp: GradingProgress): Promise<void> {
  const supabase = getSupabaseServer();
  const patched: GradingProgress = {
    ...gp,
    status: "completed",
    phase: "done",
    last_swept_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  await supabase
    .from("sessions")
    .update({ grading_progress: patched })
    .eq("id", sessionId);
}

async function applyGiveUp(
  sessionId: string,
  gp: GradingProgress,
  reason: string
): Promise<void> {
  const supabase = getSupabaseServer();
  const patched: GradingProgress = {
    ...gp,
    status: "failed",
    phase: "done",
    last_error: `Sweeper gave up: ${reason}`,
    last_swept_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  await supabase
    .from("sessions")
    .update({ grading_progress: patched })
    .eq("id", sessionId);
}

async function applyRetrigger(
  sessionId: string,
  gp: GradingProgress,
  nextAttempt: number
): Promise<{ ok: boolean; reason?: string }> {
  const supabase = getSupabaseServer();

  // Stamp cooldown + attempt counter BEFORE triggering so even if the
  // trigger itself crashes, we won't hot-loop on the next cron tick.
  const patched: GradingProgress = {
    ...gp,
    last_swept_at: new Date().toISOString(),
    sweep_attempts: nextAttempt,
    updated_at: new Date().toISOString(),
  };
  await supabase
    .from("sessions")
    .update({ grading_progress: patched })
    .eq("id", sessionId);

  try {
    const res = await triggerGradingIfNeeded(sessionId, "cron_sweeper", {
      skipIdempotency: true,
    });
    return { ok: res.queued, reason: res.reason };
  } catch (err) {
    logError("[GRADING_SWEEP] Re-trigger threw", err, {
      path: "/api/cron/grading-sweep",
      additionalData: { sessionId, nextAttempt },
    });
    return {
      ok: false,
      reason: err instanceof Error ? err.message : String(err),
    };
  }
}

export async function GET(request: NextRequest): Promise<Response> {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }

  if (process.env.GRADING_SWEEP_DISABLED === "1") {
    return NextResponse.json({
      disabled: true,
      message: "Sweeper disabled via GRADING_SWEEP_DISABLED env",
    });
  }

  const supabase = getSupabaseServer();
  const cutoffIso = new Date(Date.now() - STALE_THRESHOLD_MS).toISOString();

  const { data: candidates, error } = await supabase
    .from("sessions")
    .select("id, submitted_at, grading_progress")
    .not("submitted_at", "is", null)
    .order("submitted_at", { ascending: false })
    .limit(500);

  if (error) {
    logError("[GRADING_SWEEP] Failed to query submitted sessions", error, {
      path: "/api/cron/grading-sweep",
    });
    return NextResponse.json({ error: "QUERY_FAILED" }, { status: 500 });
  }

  type Candidate = { id: string; gp: GradingProgress };
  const stuck: Candidate[] = [];
  for (const row of candidates || []) {
    if (stuck.length >= MAX_SESSIONS_PER_RUN) break;
    const gp = (row as { grading_progress: GradingProgress | null })
      .grading_progress;
    if (!gp) continue;
    if (gp.status !== "queued" && gp.status !== "running") continue;

    const updatedAt = gp.updated_at ? new Date(gp.updated_at).getTime() : 0;
    if (updatedAt >= Date.now() - STALE_THRESHOLD_MS) continue;

    stuck.push({ id: row.id as string, gp });
  }

  const results: Array<{
    sessionId: string;
    action: SweepAction["kind"];
    reason?: string;
    ok?: boolean;
  }> = [];

  for (const { id: sessionId, gp } of stuck) {
    try {
      const action = await decideAction(sessionId, gp);

      if (action.kind === "skip") {
        results.push({
          sessionId,
          action: "skip",
          reason: action.reason,
          ok: true,
        });
        continue;
      }

      if (action.kind === "heal") {
        await applyHeal(sessionId, gp);
        results.push({ sessionId, action: "heal", ok: true });
        continue;
      }

      if (action.kind === "give_up") {
        await applyGiveUp(sessionId, gp, action.reason);
        results.push({
          sessionId,
          action: "give_up",
          reason: action.reason,
          ok: true,
        });
        continue;
      }

      const res = await applyRetrigger(sessionId, gp, action.nextAttempt);
      results.push({
        sessionId,
        action: "retrigger",
        ok: res.ok,
        reason: res.reason,
      });
    } catch (err) {
      logError("[GRADING_SWEEP] Per-session sweep failed", err, {
        path: "/api/cron/grading-sweep",
        additionalData: { sessionId },
      });
      results.push({
        sessionId,
        action: "retrigger",
        ok: false,
        reason: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return NextResponse.json({
    swept: stuck.length,
    cutoff: cutoffIso,
    results,
  });
}

export const POST = GET;
