// Node.js Runtime 사용
export const runtime = "nodejs";

import { NextRequest } from "next/server";

import { currentUser } from "@/lib/get-current-user";
import { successJson, errorJson } from "@/lib/api-response";
import { validateUUID } from "@/lib/validate-params";
import { checkRateLimitAsync, RATE_LIMITS } from "@/lib/rate-limit";
import { logError } from "@/lib/logger";

import { getAgentRun, patchAgentRun } from "@/lib/agent/store";

import type { AgentRun } from "@/lib/agent/types";
import type { AgentRunRecord } from "@/lib/agent/store";

/** 러너 내부 필드를 제거하고 공개 AgentRun 형태만 노출한다. */
function toPublicRun(record: AgentRunRecord): AgentRun {
  const {
    lastResponseId: _lastResponseId,
    pendingToolCalls: _pendingToolCalls,
    ...publicRun
  } = record;
  void _lastResponseId;
  void _pendingToolCalls;
  return publicRun;
}

/**
 * POST /api/agent/runs/[id]/cancel
 *
 * 진행 중인 에이전트 런의 협조적 취소(cooperative cancellation)를 요청한다.
 * cancel_requested 플래그만 세팅하고 즉시 반환한다 — 실제 중단은 러너가
 * 툴콜 루프 각 반복 시작 시 이 플래그를 다시 읽어 처리한다.
 *
 * 요청 본문 없음 — Zod 스키마 불필요.
 */
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // 2. Auth
    const user = await currentUser();
    if (!user) {
      return errorJson("UNAUTHORIZED", "Unauthorized", 401);
    }
    if (user.role !== "instructor") {
      return errorJson("FORBIDDEN", "Instructor access required", 403);
    }

    // 1. Rate limit
    const rl = await checkRateLimitAsync(
      `agent-run-cancel:${user.id}`,
      RATE_LIMITS.examControl
    );
    if (!rl.allowed) {
      return errorJson("RATE_LIMITED", "Too many requests. Please try again later.", 429);
    }

    const { id } = await params;
    const invalidId = validateUUID(id, "id");
    if (invalidId) return invalidId;

    // 4. Ownership — 미존재 / 타 소유 모두 404.
    const run = await getAgentRun(id);
    if (!run || run.actorId !== user.id) {
      return errorJson("NOT_FOUND", "Agent run not found", 404);
    }

    // 상태 체크 — 취소는 진행 중(running/queued)인 런에만 의미가 있다.
    if (run.status !== "running" && run.status !== "queued") {
      return errorJson(
        "CONFLICT",
        `Run is '${run.status}', not in progress`,
        409,
        { status: run.status }
      );
    }

    // 5. Business logic — 협조적 취소 플래그만 세팅. 러너가 루프 중 확인한다.
    const cancelledRun = await patchAgentRun(id, { cancelRequested: true });

    return successJson({ run: toPublicRun(cancelledRun) });
  } catch (error) {
    logError("Failed to cancel agent run", error, {
      path: "/api/agent/runs/[id]/cancel",
    });
    return errorJson(
      "INTERNAL_ERROR",
      "에이전트 런 중단 처리 중 오류가 발생했습니다.",
      500,
      process.env.NODE_ENV === "development"
        ? error instanceof Error
          ? error.message
          : String(error)
        : undefined
    );
  }
}
