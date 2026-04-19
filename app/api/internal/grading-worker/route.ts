export const maxDuration = 300;
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { verifySignatureAppRouter } from "@upstash/qstash/nextjs";
import { z } from "zod";
import { autoGradeSession } from "@/lib/grading";
import { logError } from "@/lib/logger";

const bodySchema = z.object({
  sessionId: z.string().uuid(),
});

async function handler(request: NextRequest): Promise<Response> {
  let payload: unknown;
  try {
    payload = await request.json();
  } catch (parseErr) {
    logError("[GRADING_WORKER] Invalid JSON body", parseErr, {
      path: "/api/internal/grading-worker",
    });
    return NextResponse.json(
      { error: "INVALID_JSON" },
      { status: 400 }
    );
  }

  const parsed = bodySchema.safeParse(payload);
  if (!parsed.success) {
    logError("[GRADING_WORKER] Schema validation failed", parsed.error, {
      path: "/api/internal/grading-worker",
    });
    return NextResponse.json(
      { error: "INVALID_BODY" },
      { status: 400 }
    );
  }

  const { sessionId } = parsed.data;

  try {
    const result = await autoGradeSession(sessionId);
    return NextResponse.json({
      ok: true,
      sessionId,
      gradedCount: result.grades?.length ?? 0,
      failedCount: result.failedQuestions?.length ?? 0,
      timedOut: result.timedOut ?? false,
    });
  } catch (err) {
    // Return 5xx so QStash retries the job with its own backoff policy.
    logError("[GRADING_WORKER] autoGradeSession failed", err, {
      path: "/api/internal/grading-worker",
      additionalData: { sessionId },
    });
    return NextResponse.json(
      {
        error: "GRADING_FAILED",
        message: err instanceof Error ? err.message : String(err),
      },
      { status: 500 }
    );
  }
}

/**
 * QStash → POST here with { sessionId } to execute autoGradeSession
 * durably. Signature verification is skipped in dev/test (when the
 * signing keys are absent) so local runs can still hit the endpoint
 * directly.
 */
export const POST = process.env.QSTASH_CURRENT_SIGNING_KEY
  ? verifySignatureAppRouter(handler)
  : handler;
