import { Client } from "@upstash/qstash";
import { logError } from "@/lib/logger";
import type { GradingPhasePayload } from "@/lib/types/grading";

/**
 * QStash client for durable background job queueing.
 *
 * Used to enqueue chained grading phase jobs (grade_question,
 * question_summary, session_summary) so that grading survives
 * serverless instance restarts and gets automatic retry on 5xx.
 *
 * Returns null in dev/test when QSTASH_TOKEN is not configured —
 * callers must detect this and decide (prod → error, dev → inline).
 */
let cachedClient: Client | null | undefined = undefined;

export function getQStash(): Client | null {
  if (cachedClient !== undefined) return cachedClient;

  const token = process.env.QSTASH_TOKEN;
  if (!token) {
    cachedClient = null;
    return null;
  }

  cachedClient = new Client({ token });
  return cachedClient;
}

/**
 * Returns true when QStash is configured and should be used for queueing.
 */
export function isQStashEnabled(): boolean {
  return !!process.env.QSTASH_TOKEN;
}

/**
 * Resolves the base URL the QStash worker should POST back to.
 *
 * Priority (most → least preferred):
 *   1. `QSTASH_WORKER_BASE_URL` — explicit override, useful for local dev (ngrok)
 *      or pinning to a specific canary domain.
 *   2. `NEXT_PUBLIC_APP_URL` — stable production domain (e.g. https://quest-on.app).
 *      This is what we WANT on Vercel so QStash hits the latest production code
 *      instead of a deployment-specific preview URL.
 *   3. `VERCEL_URL` — deployment-specific preview URL (e.g. quest-xyz.vercel.app).
 *      Changes on every deploy, which means old in-flight QStash retries end up
 *      pinned to stale/paused deployments. Only used as a last-resort fallback
 *      and emits a warning so misconfiguration is visible in logs.
 *
 * Returns null when nothing is configured (dev without tunnel).
 */
let warnedVercelUrlFallback = false;
export function getWorkerBaseUrl(): string | null {
  const explicit = process.env.QSTASH_WORKER_BASE_URL;
  if (explicit) return explicit.replace(/\/$/, "");

  const appUrl = process.env.NEXT_PUBLIC_APP_URL;
  if (appUrl) return appUrl.replace(/\/$/, "");

  const vercel = process.env.VERCEL_URL;
  if (vercel) {
    if (!warnedVercelUrlFallback) {
      warnedVercelUrlFallback = true;
      logError(
        "[QSTASH] Falling back to VERCEL_URL for worker base — set QSTASH_WORKER_BASE_URL or NEXT_PUBLIC_APP_URL to a stable production domain to avoid in-flight retries hitting preview deployments",
        null,
        { path: "lib/qstash.ts", additionalData: { vercelUrl: vercel } }
      );
    }
    return `https://${vercel}`;
  }

  return null;
}

/**
 * Deterministic dedup key for each (session, phase, qIdx) triple.
 * QStash drops duplicate publishes that share this id, preventing
 * the same grading work from being queued twice (e.g. submit + heartbeat
 * racing, or sweeper overlapping with a still-pending retry).
 */
export function gradingDedupId(payload: GradingPhasePayload): string {
  if (payload.phase === "session_summary") {
    return `grading-${payload.sessionId}-session_summary`;
  }
  return `grading-${payload.sessionId}-${payload.phase}-${payload.qIdx}`;
}

export type EnqueueGradingPhaseResult =
  | { ok: true; dedupId: string; messageId: string | null }
  | { ok: false; reason: "qstash_disabled" | "no_base_url" | "publish_failed"; error?: unknown };

/**
 * Publishes one grading-phase job to QStash with idempotent dedup.
 *
 * Returns structured result so callers can surface the reason to
 * operators (rather than swallowing the failure silently).
 */
export async function enqueueGradingPhase(
  payload: GradingPhasePayload
): Promise<EnqueueGradingPhaseResult> {
  const qstash = getQStash();
  if (!qstash) {
    return { ok: false, reason: "qstash_disabled" };
  }

  const baseUrl = getWorkerBaseUrl();
  if (!baseUrl) {
    logError(
      "[QSTASH] Grading phase publish skipped — worker base URL unresolved",
      null,
      { path: "lib/qstash.ts", additionalData: { payload } }
    );
    return { ok: false, reason: "no_base_url" };
  }

  const dedupId = gradingDedupId(payload);

  try {
    const result = await qstash.publishJSON({
      url: `${baseUrl}/api/internal/grading-worker`,
      body: payload,
      retries: 3,
      // Upstash-Deduplication-Id header (custom header style)
      headers: {
        "Upstash-Deduplication-Id": dedupId,
      },
    });

    const messageId =
      (result as { messageId?: string } | undefined)?.messageId ?? null;
    return { ok: true, dedupId, messageId };
  } catch (err) {
    logError("[QSTASH] Grading phase publish failed", err, {
      path: "lib/qstash.ts",
      additionalData: { payload, dedupId },
    });
    return { ok: false, reason: "publish_failed", error: err };
  }
}
