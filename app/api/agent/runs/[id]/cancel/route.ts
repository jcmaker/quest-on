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
 * 진행 중인 에이전트 런을 중단한다. 재개형(클라이언트 구동) 루프에서는
 * 클라이언트가 취소 시 루프를 멈춰 더는 서버를 재호출하지 않으므로, 이
 * 라우트가 런을 직접 cancelled 로 마무리한다.
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

    // 5. Business logic — 런을 cancelled 로 마무리한다.
    //    재개형 모델에선 클라이언트 루프가 취소 시 멈춰 더는 서버를 재호출하지
    //    않으므로, 러너가 cancelRequested 를 읽어 종료할 기회가 없다 → 여기서
    //    직접 status 를 cancelled 로 확정한다. cancelRequested 도 함께 세팅해
    //    혹시 턴이 인플라이트면 러너의 시작 체크에 잡히게 한다.
    const cancelledRun = await patchAgentRun(id, {
      status: "cancelled",
      cancelRequested: true,
      completedAt: new Date().toISOString(),
    });

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
