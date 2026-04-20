export const maxDuration = 60;
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";
import { triggerGradingIfNeeded } from "@/lib/grading-trigger";
import { logError } from "@/lib/logger";
import type { GradingProgress } from "@/lib/types/grading";

/**
 * Grading sweeper — last-resort recovery for stuck sessions.
 *
 * Runs on a schedule via Vercel Cron. For any session that:
 *   - has been submitted, AND
 *   - has `grading_progress.status` in {queued, running}, AND
 *   - `grading_progress.updated_at` is older than 15 minutes
 *
 * …we assume the QStash chain died mid-flight (QStash exhausted retries,
 * a Vercel deploy killed an in-flight function, etc.) and we re-trigger
 * via `triggerGradingIfNeeded({ skipIdempotency: true })`. Each phase
 * function is idempotent, so re-triggering an already-completed q_idx
 * is cheap.
 *
 * Sessions with `status = "failed"` are intentionally NOT swept — they
 * represent permanent failures that need operator attention via the
 * manual PUT /api/session/[sessionId]/grade retry endpoint.
 *
 * Authentication: Vercel Cron includes a bearer token `CRON_SECRET`
 * that we validate on each invocation.
 */

const STALE_THRESHOLD_MS = 15 * 60 * 1000;
const MAX_BATCH_SIZE = 25;

function isAuthorized(request: NextRequest): boolean {
  // Vercel Cron auth: https://vercel.com/docs/cron-jobs/manage-cron-jobs#securing-cron-jobs
  const header = request.headers.get("authorization");
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    // No secret configured — refuse in production but allow in dev.
    return process.env.VERCEL !== "1";
  }
  return header === `Bearer ${secret}`;
}

export async function GET(request: NextRequest): Promise<Response> {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }

  const supabase = getSupabaseServer();
  const cutoffIso = new Date(Date.now() - STALE_THRESHOLD_MS).toISOString();

  // Fetch a bounded batch of submitted sessions. Filter in memory because
  // `grading_progress` is JSONB and querying nested fields portably is
  // finicky — the batch size stays small because we only look at recently
  // submitted sessions.
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

  const stuck: string[] = [];
  for (const row of candidates || []) {
    if (stuck.length >= MAX_BATCH_SIZE) break;
    const gp = (row as { grading_progress: GradingProgress | null })
      .grading_progress;

    // No progress metadata at all — the trigger never ran or DB was wiped.
    // Count as stuck so we pick it up.
    if (!gp) {
      stuck.push(row.id as string);
      continue;
    }

    if (gp.status !== "queued" && gp.status !== "running") continue;

    const updatedAt = gp.updated_at ? new Date(gp.updated_at).getTime() : 0;
    if (updatedAt >= Date.now() - STALE_THRESHOLD_MS) continue;

    stuck.push(row.id as string);
  }

  const results: Array<{
    sessionId: string;
    ok: boolean;
    reason?: string;
  }> = [];

  for (const sessionId of stuck) {
    try {
      const res = await triggerGradingIfNeeded(sessionId, "cron_sweeper", {
        skipIdempotency: true,
      });
      results.push({ sessionId, ok: res.queued, reason: res.reason });
    } catch (err) {
      logError("[GRADING_SWEEP] Re-trigger failed", err, {
        path: "/api/cron/grading-sweep",
        additionalData: { sessionId },
      });
      results.push({
        sessionId,
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

// POST is not exposed; cron uses GET
export const POST = GET;
