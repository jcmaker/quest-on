export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";

import { sweepStaleAgentRuns } from "@/lib/agent/store";
import { logError } from "@/lib/logger";

/**
 * Agent stuck-run sweeper — last-resort recovery for stuck agent runs.
 *
 * Runs on a schedule via Vercel Cron. The agent loop (`POST /api/agent/runs`)
 * runs synchronously with `maxDuration = 300`. If the Vercel function is
 * force-killed by a timeout mid-loop, the `agent_runs` row never gets its
 * terminal `patchAgentRun` and stays stuck at `status = "running"` (or
 * `"queued"` if it died before the loop even started).
 *
 * This sweeper flips any such row older than STALE_MINUTES to `failed` via a
 * single atomic conditional UPDATE (see `sweepStaleAgentRuns`).
 *
 * Threshold rationale: the agent route's `maxDuration` is 300s (5 min), so a
 * normally-running run can never have a stale `updated_at` older than ~5 min.
 * STALE_MINUTES = 15 leaves a wide safety margin — a healthy run is never
 * swept. (Cron cadence is 10 min, so a genuinely stuck run is cleaned up
 * within ~25 min worst case.)
 *
 * Authentication: same as the grading sweeper — Vercel Cron sends a bearer
 * token `CRON_SECRET` that we validate on each invocation.
 */

// 라우트 maxDuration 이 300초(5분)이므로 15분이면 정상 동작 중인 run 은
// 절대 걸리지 않는다.
const STALE_MINUTES = 15;

function isAuthorized(request: NextRequest): boolean {
  const header = request.headers.get("authorization");
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    // 로컬/프리뷰(미설정)에서는 허용, 프로덕션(VERCEL=1)에서는 거부.
    return process.env.VERCEL !== "1";
  }
  return header === `Bearer ${secret}`;
}

export async function GET(request: NextRequest): Promise<Response> {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }

  const cutoff = new Date(Date.now() - STALE_MINUTES * 60_000).toISOString();

  try {
    const sweptRuns = await sweepStaleAgentRuns(cutoff);
    const ids = sweptRuns.map((run) => run.id);

    if (ids.length > 0) {
      // 정리된 run 이 있으면 운영자가 인지할 수 있도록 기록한다.
      logError(
        "[AGENT_SWEEPER] Swept stale agent runs",
        new Error(`Swept ${ids.length} stale agent run(s)`),
        {
          path: "/api/cron/agent-sweeper",
          additionalData: { cutoff, ids },
        }
      );
    }

    return NextResponse.json({ swept: ids.length, ids });
  } catch (error) {
    logError("[AGENT_SWEEPER] Sweep failed", error, {
      path: "/api/cron/agent-sweeper",
      additionalData: { cutoff },
    });
    return NextResponse.json({ error: "SWEEP_FAILED" }, { status: 500 });
  }
}

export const POST = GET;
